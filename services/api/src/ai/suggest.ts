import { z } from 'zod';
import { FOOD_ILLUSTRATIONS, type MealSlot } from '@nutrisnap/core';
import { generateStructured, jsonSchemaFor, LIGHT_MODEL } from './vision.js';

/**
 * What the model must return.
 *
 * The illustration is an enum rather than free text so every suggestion
 * arrives with a drawing that exists in the app. Asking for a description of
 * a picture would mean either shipping nothing or fetching something.
 */
export const mealSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().describe('The dish, as someone would say it. No brand names.'),
        note: z
          .string()
          .describe('One short sentence: what it is, and why it suits the calories left.'),
        illustration: z
          .enum(FOOD_ILLUSTRATIONS as unknown as [string, ...string[]])
          .describe('The closest match from this fixed set of drawings.'),
        calories: z.number().describe('Calories for the whole dish as described'),
        protein_g: z.number(),
        carbs_g: z.number(),
        fat_g: z.number(),
        fiber_g: z.number(),
        items: z
          .array(
            z.object({
              name: z.string().describe('One component, e.g. "Paneer" or "Wholemeal roti"'),
              amount: z
                .string()
                .describe('How much of it, as it would be measured: "80 g", "2 rotis", "1 cup"'),
              calories: z.number(),
              protein_g: z.number(),
              carbs_g: z.number(),
              fat_g: z.number(),
              fiber_g: z.number(),
            }),
          )
          .describe('What goes into it. The parts must add up to the totals above.'),
      }),
    )
    .describe('Five options, each genuinely different from the others'),
});

export type MealSuggestionsResult = z.infer<typeof mealSuggestionsSchema>;

const SCHEMA = jsonSchemaFor(mealSuggestionsSchema);

const SYSTEM_PROMPT = `You suggest meals for a calorie tracking app.

You are given a calorie range, the macros the person still has left for the
day, any dietary rules they follow, and a handful of cuisines to draw from.
Return five dishes that fit.

Rules, in order of importance:
1. Respect the dietary preference absolutely. Vegetarian means no meat, no fish,
   no gelatin. Vegan additionally means no dairy, no eggs, no honey. If you are
   unsure whether something qualifies, choose something else.
2. Never include a listed allergen, in any quantity or form.
3. Stay inside the calorie range. A dish outside it is not a suggestion, it is
   a mistake — adjust the portion until it fits, and describe that portion.
4. Favour whole meals someone could actually make or order, not ingredients.
   "Paneer tikka with two rotis" is a suggestion; "paneer" is not.
5. Vary them, and mean it. Across the five:
   - use a different cuisine for each, from the ones you are given;
   - use a different main protein for each — not tofu five ways;
   - use different formats: a bowl, a wrap, a curry, something baked, a
     handheld. Five bowls is one idea repeated.
   A set where three dishes share an ingredient and a format is a failure
   even if each is individually fine.
6. Break every dish into its components with an amount for each, and make the
   parts add up to the totals. "How much?" is the first thing anyone asks.
7. You are given today's date. Treat it as a seed: someone opening this every
   morning should not be shown the same dishes they saw yesterday.
8. If you are given dishes to avoid, none of your five may be one of them, nor
   a near-variant of one. A different name for the same plate does not count.

Where the person still needs protein, lean towards options that supply it.
Keep every note to one sentence. Respond with JSON matching the schema.`;

export async function suggestMeals(params: {
  slot: MealSlot;
  minKcal: number;
  maxKcal: number;
  proteinLeftG: number;
  carbsLeftG: number;
  fatLeftG: number;
  dietaryPreference: string | null;
  allergies: readonly string[];
  /** The caller's local date, which seeds the day-to-day variation. */
  today: string;
  /** Cuisines to draw from, rotated by day so the set moves on its own. */
  cuisines: readonly string[];
  /** Dishes already shown, which a "more ideas" request must not repeat. */
  exclude?: readonly string[];
}): Promise<MealSuggestionsResult> {
  const diet = params.dietaryPreference?.trim();
  const allergies = params.allergies.filter((entry) => entry.trim().length > 0);
  const exclude = (params.exclude ?? []).filter((entry) => entry.trim().length > 0);

  const brief = [
    `Today is ${params.today}.`,
    `Meal: ${params.slot}.`,
    `Cuisines to draw from, one per dish: ${params.cuisines.join(', ')}.`,
    `Calorie range: ${Math.round(params.minKcal)} to ${Math.round(params.maxKcal)} kcal.`,
    `Macros still available today: ${Math.round(params.proteinLeftG)}g protein, ${Math.round(
      params.carbsLeftG,
    )}g carbs, ${Math.round(params.fatLeftG)}g fat.`,
    diet ? `Dietary preference: ${diet}.` : 'Dietary preference: none stated.',
    allergies.length > 0
      ? `Allergies, which must be avoided entirely: ${allergies.join(', ')}.`
      : 'No known allergies.',
    exclude.length > 0
      ? `Already suggested, so do not offer these or variants of them: ${exclude.join('; ')}.`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return generateStructured({
    schema: mealSuggestionsSchema,
    jsonSchema: SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text: brief }],
    what: 'suggest a meal',
    // Unlike reading a label, the job here is to come up with something. At
    // the repeatable setting the same profile gets the same four dishes every
    // morning, which is the opposite of what a suggestion is for.
    temperature: 1.0,
    // Text only, so it runs on the light model rather than spending the
    // vision model's small daily allowance.
    model: LIGHT_MODEL,
  });
}
