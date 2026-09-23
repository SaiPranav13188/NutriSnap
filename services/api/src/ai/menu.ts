import { z } from 'zod';
import { env } from '../env.js';
import { assertSupportedMediaType, generateStructured, jsonSchemaFor, LIGHT_MODEL } from './vision.js';

/**
 * Reading a restaurant menu.
 *
 * The model is asked for two things and nothing else: what dishes are printed
 * on the card, and roughly what each one costs. It is not asked which to
 * order — that is arithmetic against the day's remaining budget, and it
 * happens in `@nutrisnap/core`'s `rankMenu` where it can be tested. Asking a
 * model to do both means it picks a dish first and justifies the numbers
 * afterwards.
 *
 * It is also not asked whether a dish suits the diet in the abstract. It is
 * given the user's actual rules and asked to name what breaks them, because
 * knowing that a korma has cream in it is exactly the kind of thing a model
 * is for and exactly the kind of thing a lookup table is not.
 */

export const menuAnalysisSchema = z.object({
  venue: z
    .string()
    .describe('The restaurant name if it is printed on the menu, otherwise an empty string'),
  dishes: z
    .array(
      z.object({
        name: z.string().describe('The dish exactly as the menu names it'),
        description: z
          .string()
          .describe(
            'One short line on what it is — the menu\'s own wording where there is any, ' +
              'otherwise your own. Empty string if there is nothing to add.',
          ),
        section: z
          .string()
          .describe('The heading it is listed under, e.g. "Starters". Empty string if none.'),
        calories: z.number().describe('Calories for one restaurant portion of this dish'),
        protein_g: z.number(),
        carbs_g: z.number(),
        fat_g: z.number(),
        fiber_g: z.number(),
        conflicts: z
          .array(z.string())
          .describe(
            'Ingredients in this dish that break the diner\'s stated rules, named plainly ' +
              '("cream", "shellfish"). Empty array when the dish is fine for them.',
          ),
        confidence: z
          .number()
          .describe('How sure you are of the numbers for this dish, 0 to 1. Be honest.'),
      }),
    )
    .describe('Every food dish legible on the menu, in the order they are printed'),
});

export type MenuAnalysisResult = z.infer<typeof menuAnalysisSchema>;

const SCHEMA = jsonSchemaFor(menuAnalysisSchema);

/**
 * Deliberately not the vision model by default — see `GEMINI_MENU_MODEL` in
 * env.ts. A menu read must not be able to spend the daily allowance that
 * logging a meal depends on.
 */
const MODEL = env.GEMINI_MENU_MODEL ?? LIGHT_MODEL;

/**
 * Cap on how much of a menu is read in one pass.
 *
 * Long enough for a normal card, short enough that the answer fits in the
 * output budget. A menu longer than this is nearly always a photograph taken
 * too far back to read anyway.
 */
export const MAX_DISHES = 30;

const SYSTEM_PROMPT = `You read restaurant menus for a calorie tracking app. Somebody is sitting in
the restaurant holding their phone, deciding what to order.

Transcribe, then estimate. Two separate jobs:

1. Read the dishes off the menu. Use the menu's own name for each one, exactly as printed.
   Never invent a dish that is not there, and never merge two into one. If part of the photo
   is unreadable, leave those dishes out rather than guessing at them — a short honest list
   beats a long invented one. Skip drinks. Include starters, mains, sides and desserts.
   Read at most ${MAX_DISHES} dishes; if the menu is longer, take the substantial dishes first.

2. Estimate what one portion of each costs, as that restaurant would serve it. This is where
   people go wrong, so be deliberate about it:
   - Restaurant portions are larger than home portions, usually by a lot.
   - Restaurant cooking uses far more fat than home cooking. Butter in the sauce, oil in the
     pan, cream in the curry. A dish that reads lean on the menu often is not.
   - Anything described as crispy, creamy, buttered, glazed, battered or smothered carries
     calories the description does not spell out.
   - Where the menu gives no detail, estimate the common version of that dish.

On the diner's rules: you are told their dietary preference and their allergies. For each
dish, list in "conflicts" the ingredients that break those rules, named plainly. Include
ingredients that are not in the dish's name but are in the dish as normally made — ghee in
a dal, fish sauce in a Thai curry, anchovy in a Caesar dressing, egg in fresh pasta. When
in doubt, say it: a missed allergen is far worse than a cautious flag. Leave the array empty
only when you are confident the dish is fine for them.

Report confidence per dish, honestly. A plainly described grilled dish deserves a high one.
"Chef's special" deserves a low one.

Respond with JSON matching the provided schema and nothing else.`;

export async function readMenu(params: {
  base64: string;
  mediaType: string;
  dietaryPreference: string | null;
  allergies: readonly string[];
}): Promise<MenuAnalysisResult> {
  const mediaType = assertSupportedMediaType(params.mediaType);

  const diet = params.dietaryPreference?.trim();
  const allergies = params.allergies.filter((entry) => entry.trim().length > 0);

  const brief = [
    diet ? `The diner's dietary preference: ${diet}.` : 'The diner states no dietary preference.',
    allergies.length > 0
      ? `They must avoid entirely: ${allergies.join(', ')}.`
      : 'They have no stated allergies.',
    'Read this menu.',
  ].join('\n');

  return generateStructured({
    schema: menuAnalysisSchema,
    jsonSchema: SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ inlineData: { mimeType: mediaType, data: params.base64 } }, { text: brief }],
    what: 'read that menu',
    model: MODEL,
  });
}
