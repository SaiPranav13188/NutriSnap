/**
 * Meal suggestions: what is left in the budget, and what to spend it on.
 *
 * The arithmetic lives here rather than in the prompt because a model asked
 * to both do the sums and pick the food will get the sums wrong first. It is
 * handed a calorie range and told to stay inside it.
 */

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

/**
 * The drawings a suggestion can carry.
 *
 * A closed set on purpose: the model picks one rather than describing a
 * picture, so every suggestion arrives with an illustration that exists and
 * nothing has to be fetched over the network to render a card.
 */
export type FoodIllustration =
  | 'bowl'
  | 'salad'
  | 'curry'
  | 'sandwich'
  | 'smoothie'
  | 'eggs'
  | 'pasta'
  | 'soup'
  | 'oats'
  | 'wrap';

export const FOOD_ILLUSTRATIONS: readonly FoodIllustration[] = [
  'bowl',
  'salad',
  'curry',
  'sandwich',
  'smoothie',
  'eggs',
  'pasta',
  'soup',
  'oats',
  'wrap',
];

/**
 * The three meals, each with the drawing that stands for it.
 *
 * Reusing the suggestion artwork rather than adding a second set: the picture
 * on the button and the pictures on the cards below it then read as the same
 * language, which is the point of having a fixed set at all.
 */
export const MEAL_SLOTS: ReadonlyArray<{
  value: MealSlot;
  label: string;
  illustration: FoodIllustration;
}> = [
  { value: 'breakfast', label: 'Breakfast', illustration: 'eggs' },
  { value: 'lunch', label: 'Lunch', illustration: 'sandwich' },
  { value: 'dinner', label: 'Dinner', illustration: 'curry' },
];

/**
 * Roughly what each meal is worth across a day.
 *
 * Not a rule, a starting point: the budget below only uses these to stop a
 * single meal being offered the whole day's allowance because nothing has
 * been logged yet.
 */
export const MEAL_SHARE: Readonly<Record<MealSlot, number>> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
};

/** Below this there is no meal worth suggesting, only a snack. */
export const MIN_MEAL_KCAL = 150;

export interface MealBudget {
  min: number;
  max: number;
  /** True when the day's allowance is already spent. */
  overspent: boolean;
}

/**
 * The calorie range a suggestion should land in.
 *
 * Two things bound it. The slot's usual share stops breakfast being handed
 * two thousand calories just because the day has not started, and what is
 * actually left stops dinner being suggested on a budget that has already
 * gone. Whichever is smaller wins.
 */
export function mealCalorieBudget(params: {
  slot: MealSlot;
  remainingKcal: number;
  targetKcal: number;
}): MealBudget {
  const { slot, remainingKcal, targetKcal } = params;

  if (remainingKcal < MIN_MEAL_KCAL) {
    return { min: 0, max: Math.max(0, remainingKcal), overspent: true };
  }

  const share = MEAL_SHARE[slot] * Math.max(0, targetKcal);
  const ceiling = Math.min(remainingKcal, share * 1.25);
  const floor = Math.max(MIN_MEAL_KCAL, ceiling * 0.7);

  return { min: Math.round(floor), max: Math.round(Math.max(floor, ceiling)), overspent: false };
}

/** One component of a suggested meal, with the amount to use. */
export interface SuggestionItem {
  name: string;
  /** As it would be measured out: "80 g", "2 rotis", "1 medium banana". */
  amount: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface MealSuggestion {
  name: string;
  /** One line on what it is and why it fits. */
  note: string;
  illustration: FoodIllustration;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  /** What goes into it, and how much of each. */
  items: SuggestionItem[];
}

/** The nutrients the detail view calls out a source for. */
export type LeadNutrient = 'protein' | 'fiber' | 'carbs' | 'fat';

export const LEAD_NUTRIENTS: ReadonlyArray<{ key: LeadNutrient; label: string }> = [
  { key: 'protein', label: 'Protein' },
  { key: 'fiber', label: 'Fibre' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
];

const FIELD: Record<LeadNutrient, keyof SuggestionItem> = {
  protein: 'protein_g',
  fiber: 'fiber_g',
  carbs: 'carbs_g',
  fat: 'fat_g',
};

/**
 * Which item supplies most of each nutrient.
 *
 * Worked out here rather than asked of the model: the model already reports
 * the numbers, and having it also label them invites the two to disagree.
 * An item has to carry at least a third of the meal's total to be called the
 * source of it — otherwise "the protein" would be whichever of four roughly
 * equal parts happened to edge the others.
 */
export function nutrientLeaders(
  items: readonly SuggestionItem[],
): Partial<Record<LeadNutrient, string>> {
  const leaders: Partial<Record<LeadNutrient, string>> = {};
  if (items.length === 0) return leaders;

  for (const { key } of LEAD_NUTRIENTS) {
    const field = FIELD[key];
    const total = items.reduce((sum, item) => sum + Number(item[field] ?? 0), 0);
    if (total <= 0) continue;

    const best = items.reduce((top, item) =>
      Number(item[field] ?? 0) > Number(top[field] ?? 0) ? item : top,
    );

    if (Number(best[field] ?? 0) / total >= 1 / 3) leaders[key] = best.name;
  }

  return leaders;
}

/** Totals from the parts, so the card and the log agree with the breakdown. */
export function totalsFromItems(items: readonly SuggestionItem[]): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
} {
  return items.reduce(
    (sum, item) => ({
      calories: sum.calories + Number(item.calories ?? 0),
      protein_g: sum.protein_g + Number(item.protein_g ?? 0),
      carbs_g: sum.carbs_g + Number(item.carbs_g ?? 0),
      fat_g: sum.fat_g + Number(item.fat_g ?? 0),
      fiber_g: sum.fiber_g + Number(item.fiber_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );
}

/**
 * Make a suggestion's totals agree with its own breakdown.
 *
 * The model reports both the totals and the parts, and the two do not always
 * match — drifts of a couple of hundred calories have been seen. The parts
 * win, because they are what the user can see and check: a card claiming 750
 * kcal above a list of amounts that add to 517 is not a number anyone should
 * be asked to trust, and whichever figure gets logged has to be the one that
 * was on screen.
 *
 * A suggestion with no breakdown keeps the totals it came with.
 */
export function reconcileSuggestion(suggestion: MealSuggestion): MealSuggestion {
  if (!suggestion.items || suggestion.items.length === 0) return suggestion;

  const totals = totalsFromItems(suggestion.items);
  return {
    ...suggestion,
    calories: totals.calories,
    protein_g: totals.protein_g,
    carbs_g: totals.carbs_g,
    fat_g: totals.fat_g,
    fiber_g: totals.fiber_g,
  };
}

/** Anything the model invents outside the set falls back to a plain bowl. */
export function safeIllustration(value: string): FoodIllustration {
  return (FOOD_ILLUSTRATIONS as readonly string[]).includes(value)
    ? (value as FoodIllustration)
    : 'bowl';
}

/** "420–530 kcal", for the header above the cards. */
export function describeBudget(budget: MealBudget): string {
  if (budget.overspent) return 'Nothing left in today’s budget';
  return `${Math.round(budget.min)}–${Math.round(budget.max)} kcal`;
}

// ---------------------------------------------------------------------------
// Variety
// ---------------------------------------------------------------------------

/**
 * Cuisines to draw from.
 *
 * Left broad on purpose. The point is not to be exhaustive but to give the
 * model somewhere different to start each day — asked with no steer at all it
 * converges on the same protein bowls and overnight oats whatever the date.
 */
export const CUISINES: readonly string[] = [
  'Indian',
  'Mediterranean',
  'East Asian',
  'Middle Eastern',
  'Mexican',
  'Italian',
  'Thai',
  'Japanese',
  'Korean',
  'North African',
  'British',
  'Vietnamese',
  'Greek',
  'Caribbean',
  'Spanish',
  'Turkish',
];

/** How many cuisines a single request is pointed at. */
export const CUISINES_PER_REQUEST = 5;

/**
 * A stable hash of a string.
 *
 * Deterministic so the same day and meal always produce the same starting
 * point: asking twice in a morning should not reshuffle the whole world, and
 * the caller controls freshness by excluding what it has already seen.
 */
function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

/**
 * Which cuisines today's suggestions should lean on.
 *
 * Walks the list with a stride rather than taking a contiguous slice, so a
 * day gets five spread across the list instead of five neighbours — and
 * because the stride is coprime with the length, it never repeats one before
 * it has taken them all.
 */
export function cuisinesForDay(
  dateKey: string,
  slot: MealSlot,
  count = CUISINES_PER_REQUEST,
): string[] {
  const total = CUISINES.length;
  const wanted = Math.max(1, Math.min(count, total));

  const seed = hash(`${dateKey}:${slot}`);
  const start = seed % total;
  // 7 shares no factor with 16, so stepping by it visits every entry.
  const stride = 7;

  const picked: string[] = [];
  for (let i = 0; i < wanted; i += 1) {
    picked.push(CUISINES[(start + i * stride) % total]!);
  }
  return picked;
}
