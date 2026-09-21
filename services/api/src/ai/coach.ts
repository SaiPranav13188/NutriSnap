import { ApiError as GenAiApiError, GoogleGenAI } from '@google/genai';
import { env } from '../env.js';
import { HttpError } from '../auth.js';

/**
 * The coach: questions about the user's own logged data, answered from it.
 *
 * Deliberately not a general chatbot. Every answer is grounded in a summary
 * assembled server-side from the user's rows, and the prompt forbids inventing
 * numbers that are not in it — a nutrition app that confidently makes up a
 * calorie figure is worse than one with no chat at all.
 *
 * The summary is built from the caller's own data under their own row-level
 * security, so there is no path by which one user's history reaches another's
 * answer.
 */

const MODEL = env.GEMINI_COACH_MODEL;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(
      503,
      'The coach is not set up yet. Add GEMINI_API_KEY to services/api/.env and restart the API.',
      'ai_not_configured',
    );
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are the in-app coach for NutriSnap, a calorie and nutrition tracker.

You are given a factual summary of ONE user's own logged data. Answer their question using
only that summary.

Rules you must follow:
- Never invent a number. If the summary does not contain what you need, say plainly what is
  missing and what they would have to log for you to answer it.
- Distinguish measured from estimated. Calories burned is an estimate from body weight and
  activity, not a measurement. Say so whenever you lean on it.
- Keep it to two or three short paragraphs, or a short list. This is read on a phone.
- Be concrete and specific to their numbers. "Your protein averaged 96g against a 141g goal"
  is useful; "try to eat more protein" on its own is not.
- One suggestion at a time. A list of eight things is a list nobody acts on.
- No medical advice, no diagnosis, and no comment on whether their goal weight is right for
  them. If they ask something clinical, tell them it is a question for a doctor or dietitian.
- A few days of data is a few days of data. Do not read a trend into noise, and say when it
  is too early to tell.

Write in plain, warm, direct language. No emoji, no exclamation marks, no flattery.`;

export interface CoachContext {
  summary: string;
}

/** Answer a question about the user's own data. */
export async function askCoach(params: {
  question: string;
  context: CoachContext;
}): Promise<string> {
  const { question, context } = params;

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Here is the user's data:\n\n${context.summary}` },
            { text: `Their question: ${question}` },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        // Higher than the vision path: this is prose, and repeating the same
        // sentence every time reads like a canned response.
        temperature: 0.6,
        maxOutputTokens: 800,
      },
    });

    if (response.promptFeedback?.blockReason) {
      throw new HttpError(
        422,
        'That question could not be answered. Try rephrasing it.',
        'ai_refused',
      );
    }

    const text = response.text?.trim();
    if (!text) {
      throw new HttpError(502, 'The coach did not answer. Try again.', 'ai_empty_response');
    }

    return text;
  } catch (error) {
    if (error instanceof HttpError) throw error;

    if (error instanceof GenAiApiError) {
      const status = typeof error.status === 'number' ? error.status : 502;
      if (status === 429) {
        throw new HttpError(
          429,
          'The coach is rate limited right now. Try again in a minute.',
          'ai_rate_limited',
        );
      }
      throw new HttpError(502, 'The coach is unavailable right now.', 'ai_unavailable');
    }

    throw new HttpError(502, 'The coach is unavailable right now.', 'ai_unavailable');
  }
}
