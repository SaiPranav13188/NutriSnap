import { z } from 'zod';
import type { Ingredient } from '@nutrisnap/core';
import {
  assertSupportedMediaType,
  generateStructured,
  jsonSchemaFor,
  LIGHT_MODEL,
} from './vision.js';

/**
 * Reading a plate after the meal.
 *
 * The model is shown the leftovers and told what was served, and reports how
 * much of each thing is still there. It is deliberately not asked to
 * re-estimate the meal: the original analysis stands, and this only measures
 * what came off it. Re-estimating would let a blurry second photo overwrite a
 * good first one.
 */
export const leftoverSchema = z.object({
  empty_plate: z
    .boolean()
    .describe('True if the plate is clean — nothing of the meal is left on it.'),
  leftovers: z
    .array(
      z.object({
        name: z
          .string()
          .describe('The ingredient still on the plate, named exactly as it was given to you.'),
        remaining: z
          .number()
          .describe('How much of that ingredient is left, 0 to 1. 0.5 means half of it.'),
      }),
    )
    .describe('Only the things still on the plate. Leave out anything that has gone.'),
  note: z.string().describe('One short sentence on what you can see. Empty string if nothing to add.'),
});

export type LeftoverResult = z.infer<typeof leftoverSchema>;

const SCHEMA = jsonSchemaFor(leftoverSchema);

const SYSTEM_PROMPT = `You compare a photograph of a plate after a meal against a list of what was
served on it, for a calorie tracking app.

Report only what is still on the plate, and for each, the fraction of the
original portion that remains.

Rules:
1. You are measuring, not re-estimating. Do not question the original list or
   its portions — only say how much of each item is left.
2. Use the names you were given, exactly. A name you invent cannot be matched
   back to the meal and will be ignored.
3. Leave an item out entirely if none of it remains. Do not list it as zero.
4. A clean plate means empty_plate is true and the list is empty.
5. Be conservative. Sauce smears, crumbs and a few grains of rice are a
   finished plate, not five percent of a portion. Report a fraction only when
   a real, countable amount is left.
6. If the photo is too dark or too blurred to judge, treat the plate as empty
   rather than guessing — an unchanged log is better than a wrong correction.

Respond with JSON matching the schema.`;

export async function readLeftovers(params: {
  base64: string;
  mediaType: string;
  served: readonly Ingredient[];
  mealName: string;
}): Promise<LeftoverResult> {
  const mediaType = assertSupportedMediaType(params.mediaType);

  const served =
    params.served.length > 0
      ? params.served
          .map((item) => `- ${item.name}: ${Math.round(item.grams)}g, ${Math.round(item.calories)} kcal`)
          .join('\n')
      : '(not itemised — treat the whole meal as one item)';

  return generateStructured({
    schema: leftoverSchema,
    jsonSchema: SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    parts: [
      { inlineData: { mimeType: mediaType, data: params.base64 } },
      {
        text: `This plate was served as "${params.mealName}", containing:\n${served}\n\nWhat is still on it?`,
      },
    ],
    what: 'read that plate',
    /**
     * The light model, not the flagship.
     *
     * "How much of this is left" is a far simpler question than "what is
     * this and what is in it", and it answers it correctly. More to the
     * point, plate-diff doubles the photo calls per meal, and the flagship's
     * free tier allows twenty a day in total — spending them here would
     * starve the analysis that actually needs them.
     */
    model: LIGHT_MODEL,
  });
}
