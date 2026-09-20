import { z } from 'zod';

/**
 * The contract the vision model must satisfy. This schema is handed to the
 * Messages API as a structured-output format, so the model is constrained to
 * produce exactly this shape rather than us hoping it returns valid JSON.
 */

export const ingredientSchema = z.object({
  name: z.string().describe('Short name of the ingredient, e.g. "Grilled chicken breast"'),
  grams: z.number().describe('Estimated weight of this ingredient in grams'),
  calories: z.number().describe('Calories contributed by this ingredient alone'),
});

export const macroTotalsSchema = z.object({
  calories: z.number().describe('Total kilocalories for the whole portion shown'),
  protein_g: z.number().describe('Total protein in grams'),
  carbs_g: z.number().describe('Total carbohydrates in grams'),
  fat_g: z.number().describe('Total fat in grams'),
  sugar_g: z.number().describe('Total sugars in grams'),
  fiber_g: z.number().describe('Total dietary fiber in grams'),
  sodium_mg: z.number().describe('Total sodium in milligrams'),
});

export const foodAnalysisSchema = z.object({
  name: z.string().describe('The name of the dish, e.g. "Caesar salad with grilled chicken"'),
  confidence: z
    .number()
    .describe(
      'How confident you are in this estimate, from 0 to 1. Be honest — low confidence is useful to the user.',
    ),
  estimated_grams: z.number().describe('Total estimated weight of the food shown, in grams'),
  ingredients: z
    .array(ingredientSchema)
    .describe('Each distinguishable component of the dish, with its own gram weight and calories'),
  totals: macroTotalsSchema,
  notes: z
    .string()
    .describe(
      'One short sentence on what drove the portion estimate, or what you were unsure about. Empty string if nothing notable.',
    ),
});

export type FoodAnalysisResult = z.infer<typeof foodAnalysisSchema>;

/** Nutrition facts read off a packaging label. */
export const labelAnalysisSchema = z.object({
  name: z.string().describe('Product name if visible on the label, otherwise a generic description'),
  serving_size_g: z.number().describe('Serving size in grams as printed on the label'),
  servings_consumed: z
    .number()
    .describe('How many servings the user is logging. Use 1 unless the image makes it clear.'),
  totals: macroTotalsSchema.describe('Nutrition for the servings being logged, not per 100g'),
  confidence: z.number().describe('Confidence in the reading, 0 to 1'),
});

export type LabelAnalysisResult = z.infer<typeof labelAnalysisSchema>;
