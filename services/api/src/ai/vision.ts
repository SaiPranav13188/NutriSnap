import { ApiError as GenAiApiError, FinishReason, GoogleGenAI } from '@google/genai';
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

/** For the calls that do not need the flagship. */
export const LIGHT_MODEL = env.GEMINI_LIGHT_MODEL;

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
export function jsonSchemaFor(schema: z.ZodType): unknown {
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
/**
 * Room for the answer.
 *
 * Raised from 4096 because the newer models think before they answer, and
 * `thoughtsTokenCount` comes out of the same allowance as the reply — a
 * request seen spending 1,967 tokens reasoning had barely half the budget
 * left for the JSON, so long structured answers were cut off mid-object and
 * arrived here as unparseable rather than as the truncation they were.
 *
 * Deliberately generous rather than capped by a thinking setting: the
 * `thinkingLevel` control only exists on 3.5 and newer, and pinning it here
 * would break the older models this same helper has to serve.
 */
const MAX_OUTPUT_TOKENS = 12288;

/** Gemini's own "try again in a moment": the model is momentarily overloaded. */
const OVERLOADED = 503;

/** Quota. Sometimes this minute's worth, sometimes the whole day's. */
const RATE_LIMITED = 429;

/** How many times a transient overload is retried before giving up. */
const RETRIES = 2;

/**
 * The longest we will sit on a request waiting out a quota bounce.
 *
 * Somebody is holding a phone at a restaurant table while this happens, so
 * there is a point past which waiting is worse than saying so. Under this,
 * absorbing the wait beats making them tap the button again; over it, they
 * get told how long it actually is.
 */
const MAX_QUOTA_WAIT_MS = 12_000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isOverloaded(error: unknown): boolean {
  return error instanceof GenAiApiError && error.status === OVERLOADED;
}

interface QuotaBounce {
  /** How long Google asked us to wait. Null when it did not say. */
  retryAfterMs: number | null;
  /** True when the exhausted quota resets daily, so waiting will not help. */
  daily: boolean;
}

/**
 * What a 429 actually means this time.
 *
 * The free tier bounces requests for two quite different reasons and uses the
 * same status code for both. Going over the per-minute allowance clears
 * itself in seconds; running out the daily allowance does not clear until
 * tomorrow. Telling someone to "wait a few seconds and try again" when the
 * day's quota is gone sends them round a loop that cannot succeed.
 *
 * The SDK stringifies Google's whole JSON error body into `message`, which
 * carries both answers: a RetryInfo detail with the delay, and a QuotaFailure
 * detail naming the quota that was violated. Neither is guaranteed to be
 * there, so every step of the read is defensive and an unreadable body simply
 * means "no idea, use the default backoff".
 */
function readQuotaBounce(error: GenAiApiError): QuotaBounce {
  const bounce: QuotaBounce = { retryAfterMs: null, daily: false };

  let body: unknown;
  try {
    body = JSON.parse(error.message);
  } catch {
    return bounce;
  }

  const details = (body as { error?: { details?: unknown } })?.error?.details;
  if (!Array.isArray(details)) return bounce;

  for (const detail of details) {
    const type = String((detail as { '@type'?: unknown })?.['@type'] ?? '');

    if (type.endsWith('RetryInfo')) {
      // Protobuf durations arrive as "37s" or "1.5s".
      const seconds = Number(
        /^([\d.]+)s$/.exec(String((detail as { retryDelay?: unknown }).retryDelay ?? ''))?.[1],
      );
      if (Number.isFinite(seconds) && seconds >= 0) bounce.retryAfterMs = seconds * 1000;
    }

    if (type.endsWith('QuotaFailure')) {
      const violations = (detail as { violations?: unknown }).violations;
      if (Array.isArray(violations)) {
        // e.g. "GenerateRequestsPerDayPerProjectPerModel".
        bounce.daily = violations.some((violation) =>
          /perday/i.test(String((violation as { quotaId?: unknown })?.quotaId ?? '')),
        );
      }
    }
  }

  return bounce;
}

function rethrowAsHttp(error: unknown, what: string): never {
  if (error instanceof GenAiApiError) {
    // A 503 is the model being busy, not anything wrong with the request, and
    // it is worth saying so — "could not" reads as a dead end when the honest
    // answer is "try that again".
    if (error.status === OVERLOADED) {
      throw new HttpError(
        503,
        `The nutrition service is busy. Try again in a moment.`,
        'ai_overloaded',
      );
    }

    // 429 is the one users on the free tier will actually hit. By the time it
    // reaches here the retry loop has already waited out anything short, so
    // this is the case that genuinely could not be absorbed — and it says
    // which of the two it was rather than offering the same advice to both.
    if (error.status === RATE_LIMITED) {
      const bounce = readQuotaBounce(error);

      if (bounce.daily) {
        throw new HttpError(
          429,
          "The free nutrition service has used up today's quota. It resets tomorrow.",
          'ai_quota_exhausted',
        );
      }

      const seconds = bounce.retryAfterMs === null ? null : Math.ceil(bounce.retryAfterMs / 1000);
      throw new HttpError(
        429,
        seconds === null
          ? 'The free nutrition service is rate limited right now. Wait a few seconds and try again.'
          : `The free nutrition service is rate limited right now. Try again in about ${seconds} seconds.`,
        'ai_rate_limited',
      );
    }
    if (error.status === 401 || error.status === 403) {
      throw new HttpError(500, 'Nutrition service is misconfigured.', 'ai_unauthenticated');
    }

    // A 400 means we sent something malformed — a bad schema, or an image
    // that never got built. Reporting that as "unavailable" points whoever
    // is debugging it at the service instead of at the request.
    if (error.status === 400) {
      throw new HttpError(
        500,
        `Could not ${what}: the request was rejected as malformed.`,
        'ai_bad_request',
      );
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
export async function generateStructured<T>(params: {
  schema: z.ZodType<T>;
  jsonSchema: unknown;
  systemPrompt: string;
  parts: Array<Record<string, unknown>>;
  what: string;
  /**
   * Defaults to the repeatable setting nutrition estimation needs. Only
   * callers whose job is to come up with something new should raise it.
   */
  temperature?: number;
  /**
   * Room for the answer, in tokens. Raise it for anything that returns a
   * long structured result — see the note on MAX_OUTPUT_TOKENS below.
   */
  maxOutputTokens?: number;
  /** Defaults to the vision model; text-only callers should pass their own. */
  model?: string;
}): Promise<T> {
  let raw: string | undefined;

  /**
   * Being told to wait is retried; being told no is not.
   *
   * A 503 means the model was busy and the same request a second later
   * usually succeeds. A 429 over the per-minute allowance is the same shape
   * of problem, and Google even says how long to wait — so the wait happens
   * here rather than being handed to the user as an error they can do nothing
   * about except tap the button again themselves.
   *
   * The day's quota running out is not that, and neither is a bad request or
   * a refusal: all three would fail identically on every attempt, so they go
   * straight out.
   */
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await getClient().models.generateContent({
        model: params.model ?? MODEL,
        contents: [{ role: 'user', parts: params.parts }],
        config: {
          systemInstruction: params.systemPrompt,
          responseMimeType: 'application/json',
          responseJsonSchema: params.jsonSchema,
          // Nutrition estimation should be repeatable: the same photo should
          // not produce a different calorie count on each scan.
          temperature: params.temperature ?? 0.2,
          maxOutputTokens: params.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
        },
      });

      const blockReason = response.promptFeedback?.blockReason;
      if (blockReason) {
        throw new HttpError(422, 'That image could not be analyzed.', 'ai_refused');
      }

      // Truncation produces JSON that stops mid-object. Catching it here
      // names the real problem instead of blaming the data.
      if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
        throw new HttpError(
          502,
          'That answer was longer than expected. Try again.',
          'ai_truncated',
        );
      }

      raw = response.text;
      break;
    } catch (error) {
      if (error instanceof HttpError) throw error;

      if (attempt < RETRIES && isOverloaded(error)) {
        // Backing off rather than hammering: the spike clears on its own.
        await wait(700 * (attempt + 1));
        continue;
      }

      if (attempt < RETRIES && error instanceof GenAiApiError && error.status === RATE_LIMITED) {
        const bounce = readQuotaBounce(error);
        // Google's own figure where it gave one, our backoff where it did
        // not. A wait it will not honour is not a wait worth taking.
        const delay = bounce.retryAfterMs ?? 700 * (attempt + 1);

        if (!bounce.daily && delay <= MAX_QUOTA_WAIT_MS) {
          await wait(delay);
          continue;
        }
      }

      return rethrowAsHttp(error, params.what);
    }
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
    // No image in this one, so it goes to the light model and its own quota.
    model: LIGHT_MODEL,
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
