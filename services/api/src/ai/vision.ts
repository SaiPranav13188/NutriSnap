import { ApiError as GenAiApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from '../env.js';
import { HttpError } from '../auth.js';
import {
  foodAnalysisSchema,
  labelAnalysisSchema,
  type FoodAnalysisResult,
  type LabelAnalysisResult,
} from './schemas.js';

/**
 * Food analysis, powered by Google Gemini's free tier.
 *
 * Get a key at https://aistudio.google.com/apikey — no card required.
 *
 * Note on the free tier: Google may use prompts and images sent through it to
 * improve their models, and it is rate limited (roughly 15 requests a minute).
 * Both are acceptable for development; if this ever holds real users' meal
 * photos, move to a paid tier or a provider that does not train on input.
 */

const MODEL = env.GEMINI_VISION_MODEL;

/**
 * Built on first use rather than at import, so the API can start and serve
 * every other route without a Gemini key configured.
 */
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(
      503,
      'Food analysis is not set up yet. Add GEMINI_API_KEY to services/api/.env and restart the API.',
      'ai_not_configured',
    );
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

/**
 * Gemini accepts plain JSON Schema for structured output, and Zod 4 emits
 * exactly that — so the same schema that types the result also constrains the
 * model. One definition, no drift.
 *
 * `$schema` is stripped because the API rejects unknown top-level keys.
 */
function jsonSchemaFor(schema: z.ZodType): unknown {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  return rest;
}

const FOOD_SCHEMA = jsonSchemaFor(foodAnalysisSchema);
const LABEL_SCHEMA = jsonSchemaFor(labelAnalysisSchema);

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
estimate for what you can see.

Respond with JSON matching the provided schema and nothing else.`;

const LABEL_SYSTEM_PROMPT =
  'You read nutrition facts panels off packaging for a calorie tracking app. Transcribe ' +
  'the printed values exactly rather than estimating them. If the panel lists values per ' +
  '100g and per serving, use the per-serving column. If a value is not printed, return 0 ' +
  'for it rather than guessing. Respond with JSON matching the provided schema and nothing else.';

const SUPPORTED_MEDIA_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export function assertSupportedMediaType(mediaType: string): string {
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
    throw new HttpError(
      415,
      `Unsupported image type "${mediaType}". Use JPEG, PNG, WebP or HEIC.`,
      'unsupported_media_type',
    );
  }
  return mediaType;
}

/** Turn an SDK failure into something the client can act on. */
function rethrowAsHttp(error: unknown, what: string): never {
  if (error instanceof GenAiApiError) {
    // 429 is the one users on the free tier will actually hit.
    if (error.status === 429) {
      throw new HttpError(
        429,
        'The free nutrition service is rate limited right now. Wait a few seconds and try again.',
        'ai_rate_limited',
      );
    }
    if (error.status === 401 || error.status === 403) {
      throw new HttpError(500, 'Nutrition service is misconfigured.', 'ai_unauthenticated');
    }
    throw new HttpError(502, `Could not ${what} right now.`, 'ai_unavailable');
  }
  throw error;
}

/**
 * Run a request and parse the result back through the Zod schema.
 *
 * Gemini is constrained by the schema, but it is still a model returning text,
 * so we validate rather than trust. A response that does not parse is treated
 * as a service failure, not silently passed to the user as nutrition data.
 */
async function generateStructured<T>(params: {
  schema: z.ZodType<T>;
  jsonSchema: unknown;
  systemPrompt: string;
  parts: Array<Record<string, unknown>>;
  what: string;
}): Promise<T> {
  let raw: string | undefined;

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: params.parts }],
      config: {
        systemInstruction: params.systemPrompt,
        responseMimeType: 'application/json',
        responseJsonSchema: params.jsonSchema,
        // Nutrition estimation should be repeatable: the same photo should not
        // produce a different calorie count on each scan.
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new HttpError(422, 'That image could not be analyzed.', 'ai_refused');
    }

    raw = response.text;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return rethrowAsHttp(error, params.what);
  }

  if (!raw) {
    throw new HttpError(502, 'The nutrition service returned an empty result.', 'ai_empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(502, 'The nutrition service returned unreadable data.', 'ai_unparseable');
  }

  const result = params.schema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(
      502,
      'The nutrition service returned data in an unexpected shape.',
      'ai_invalid_shape',
    );
  }

  return result.data;
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

  return generateStructured({
    schema: foodAnalysisSchema,
    jsonSchema: FOOD_SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    parts: [
      { inlineData: { mimeType: mediaType, data: params.base64 } },
      { text: instruction },
    ],
    what: 'analyze that photo',
  });
}

/** Natural-language logging: "fried rice and two eggs" in, macros out. */
export async function analyzeFoodText(description: string): Promise<FoodAnalysisResult> {
  return generateStructured({
    schema: foodAnalysisSchema,
    jsonSchema: FOOD_SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    parts: [
      {
        text:
          `Estimate the nutrition for this meal described in the user's own words:\n\n"${description}"\n\n` +
          'Where the description does not specify a portion, assume a typical single serving ' +
          'and say so in notes.',
      },
    ],
    what: 'analyze that description',
  });
}

/** OCR a nutrition-facts panel straight off the packaging. */
export async function analyzeNutritionLabel(params: {
  base64: string;
  mediaType: string;
}): Promise<LabelAnalysisResult> {
  const mediaType = assertSupportedMediaType(params.mediaType);

  return generateStructured({
    schema: labelAnalysisSchema,
    jsonSchema: LABEL_SCHEMA,
    systemPrompt: LABEL_SYSTEM_PROMPT,
    parts: [
      { inlineData: { mimeType: mediaType, data: params.base64 } },
      { text: 'Read this nutrition label.' },
    ],
    what: 'read that label',
  });
}
