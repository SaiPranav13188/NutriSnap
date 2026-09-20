import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '../env.js';
import { HttpError } from '../auth.js';
import {
  foodAnalysisSchema,
  labelAnalysisSchema,
  type FoodAnalysisResult,
  type LabelAnalysisResult,
} from './schemas.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const MODEL = env.ANTHROPIC_VISION_MODEL;

/**
 * These are user-facing scans — someone is watching a spinner — so we trade a
 * little depth for latency. Raise `effort` to "high" if portion estimates come
 * back weaker than you want; the cost/quality knob is here and nowhere else.
 */
const IMAGE_EFFORT = 'medium' as const;
const TEXT_EFFORT = 'low' as const;

const SYSTEM_PROMPT = `You are the nutrition estimation engine behind a calorie tracking app.

Estimate nutrition from what you are shown, using standard USDA nutrition data for the
ingredients you identify and the portion size you estimate.

How to judge portion size:
- Use visual references in the frame — plate and bowl diameters, cutlery, hands, cans and
  bottles — to anchor your gram estimate. A dinner plate is about 27cm, a fork about 19cm.
- Estimate the weight of each component separately, then let the totals follow from those
  components. Do not estimate a total first and split it afterwards.
- Account for cooking method. Fried food carries oil the photograph does not show; sauces
  and dressings are calorie-dense and easy to miss.

On confidence: report it honestly. A clearly lit single dish on a plain plate deserves high
confidence. A dim photo, a mixed dish where components are hidden, or an unfamiliar cuisine
deserves low confidence. Users are shown this number and can correct the portion, so an
honest low score is more useful than a confident wrong one.

Return values for the whole portion shown, not per 100g. Never return zero for every macro —
if you genuinely cannot identify food in the image, say so in notes and give your best
estimate for what you can see.`;

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const SUPPORTED_MEDIA_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function assertSupportedMediaType(mediaType: string): ImageMediaType {
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
    throw new HttpError(
      415,
      `Unsupported image type "${mediaType}". Use JPEG, PNG, WebP or GIF.`,
      'unsupported_media_type',
    );
  }
  return mediaType as ImageMediaType;
}

/** Turn an SDK failure into something the client can act on. */
function rethrowAsHttp(error: unknown, what: string): never {
  if (error instanceof Anthropic.RateLimitError) {
    throw new HttpError(429, 'The nutrition service is busy. Try again in a moment.', 'ai_rate_limited');
  }
  if (error instanceof Anthropic.AuthenticationError) {
    throw new HttpError(500, 'Nutrition service is misconfigured.', 'ai_unauthenticated');
  }
  if (error instanceof Anthropic.APIError) {
    throw new HttpError(502, `Could not ${what} right now.`, 'ai_unavailable');
  }
  throw error;
}

/**
 * The headline call: a food photo in, structured macros out.
 * `correction` carries the user's "Fix Results" note on a re-analysis.
 */
export async function analyzeFoodImage(params: {
  base64: string;
  mediaType: string;
  correction?: string;
  previous?: FoodAnalysisResult;
}): Promise<FoodAnalysisResult> {
  const mediaType = assertSupportedMediaType(params.mediaType);

  const instruction = params.correction
    ? `Here is the meal photo again. Your previous estimate was:

${JSON.stringify(params.previous ?? {}, null, 2)}

The user corrected you: "${params.correction}"

Take the correction as true and re-estimate the whole dish accordingly. If the correction is
about portion size, scale the components rather than re-identifying the food.`
    : 'Identify the food in this image and estimate its nutrition.';

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: IMAGE_EFFORT,
        format: zodOutputFormat(foodAnalysisSchema),
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: params.base64 } },
            { type: 'text', text: instruction },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'That image could not be analyzed.', 'ai_refused');
    }
    if (!response.parsed_output) {
      throw new HttpError(502, 'The nutrition service returned an unreadable result.', 'ai_unparseable');
    }

    return response.parsed_output;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return rethrowAsHttp(error, 'analyze that photo');
  }
}

/** Natural-language logging: "fried rice and two eggs" in, macros out. */
export async function analyzeFoodText(description: string): Promise<FoodAnalysisResult> {
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: TEXT_EFFORT,
        format: zodOutputFormat(foodAnalysisSchema),
      },
      messages: [
        {
          role: 'user',
          content:
            `Estimate the nutrition for this meal described in the user's own words:\n\n"${description}"\n\n` +
            'Where the description does not specify a portion, assume a typical single serving ' +
            'and say so in notes.',
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'That description could not be analyzed.', 'ai_refused');
    }
    if (!response.parsed_output) {
      throw new HttpError(502, 'The nutrition service returned an unreadable result.', 'ai_unparseable');
    }

    return response.parsed_output;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return rethrowAsHttp(error, 'analyze that description');
  }
}

/** OCR a nutrition-facts panel straight off the packaging. */
export async function analyzeNutritionLabel(params: {
  base64: string;
  mediaType: string;
}): Promise<LabelAnalysisResult> {
  const mediaType = assertSupportedMediaType(params.mediaType);

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      system:
        'You read nutrition facts panels off packaging for a calorie tracking app. Transcribe ' +
        'the printed values exactly rather than estimating them. If the panel lists values per ' +
        '100g and per serving, use the per-serving column. If a value is not printed, return 0 ' +
        'for it rather than guessing.',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: IMAGE_EFFORT,
        format: zodOutputFormat(labelAnalysisSchema),
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: params.base64 } },
            { type: 'text', text: 'Read this nutrition label.' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'That label could not be read.', 'ai_refused');
    }
    if (!response.parsed_output) {
      throw new HttpError(502, 'The nutrition service returned an unreadable result.', 'ai_unparseable');
    }

    return response.parsed_output;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return rethrowAsHttp(error, 'read that label');
  }
}
