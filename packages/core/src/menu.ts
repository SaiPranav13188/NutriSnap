/**
 * Reading a restaurant menu against what is left of the day.
 *
 * The problem this solves is the one every tracker gives up on. Searching a
 * food database works for a chain, because somebody published the numbers;
 * it is useless at the independent place the user is actually sitting in,
 * where the only nutrition information in the building is a laminated card
 * of dish names. So the card gets photographed, the model reads the dishes
 * off it and estimates each one, and the choosing happens here.
 *
 * The split is the same one `suggest.ts` makes, for the same reason: a model
 * asked to both estimate the food and work out what fits will get the
 * arithmetic wrong first. It is asked only what is on the menu and roughly
 * what each dish costs. Which of them to order is arithmetic, and arithmetic
 * belongs where it can be tested.
 */

import type { MealBudget } from './suggest.js';
import { formatNumber } from './units.js';

/** One dish as the model read it off the menu. */
export interface MenuDish {
  name: string;
  /** What the menu says about it, or what the model inferred. One line. */
  description: string;
  /** The heading it was listed under, when the menu has them. */
  section: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  /**
   * Anything in the dish that breaks the user's stated rules — an allergen,
   * or meat for a vegetarian.
   *
   * The model fills this in, because deciding whether ghee counts as vegan
   * needs to know what ghee is, and this module has no business owning a food
   * ontology. All it does is respect the answer absolutely.
   */
  conflicts: string[];
  /** How sure the model is about the numbers, 0..1. */
  confidence: number;
}

export type DishVerdict = 'fits' | 'light' | 'over' | 'excluded';

export interface RankedDish {
  dish: MenuDish;
  verdict: DishVerdict;
  /** 0..1. What the ordering is built from. */
  score: number;
  /** One line on why it placed where it did. */
  reason: string;
}

export interface MenuContext {
  /** The calorie range a meal should land in, from `mealCalorieBudget`. */
  budget: MealBudget;
  /** Protein still owed today, which breaks ties between dishes that fit. */
  proteinLeftG: number;
}

/**
 * How far over budget a dish has to be to score half, once the day is
 * already spent and nothing can fit. Roughly a large side.
 */
export const OVERSHOOT_HALF_KCAL = 250;

/**
 * How much of the score protein is allowed to move.
 *
 * Calories decide whether a dish is orderable at all, so they carry the
 * ordering. Protein breaks ties between dishes that are equally orderable,
 * which is the case this exists for: on a menu, two mains inside the budget
 * are common and the one that covers the protein is the better order.
 */
const PROTEIN_WEIGHT = 0.25;

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

const kcal = (dish: MenuDish): number =>
  Number.isFinite(dish.calories) ? Math.max(0, dish.calories) : 0;

/**
 * How well a dish's calories fit the budget.
 *
 * Going over is penalised about twice as steeply as coming in light, and
 * deliberately so: a light dish leaves the user with calories to spend later,
 * which is a choice, while an over-budget one has already broken the day,
 * which is not.
 */
function calorieFit(calories: number, budget: MealBudget): number {
  if (calories > budget.max) {
    const excess = calories - budget.max;
    // Half the ceiling over is a write-off, not a near miss.
    return clamp01(1 - excess / Math.max(1, budget.max * 0.5));
  }
  if (calories < budget.min) {
    return budget.min > 0 ? clamp01(calories / budget.min) : 1;
  }
  return 1;
}

function proteinFit(dish: MenuDish, proteinLeftG: number): number {
  if (!(proteinLeftG > 0)) return 1;
  return clamp01((dish.protein_g || 0) / proteinLeftG);
}

function verdictFor(calories: number, budget: MealBudget): DishVerdict {
  if (calories > budget.max) return 'over';
  if (calories < budget.min) return 'light';
  return 'fits';
}

function joinConflicts(conflicts: readonly string[]): string {
  const items = conflicts.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (items.length === 0) return 'something you avoid';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function reasonFor(params: {
  dish: MenuDish;
  verdict: DishVerdict;
  budget: MealBudget;
  proteinLeftG: number;
}): string {
  const { dish, verdict, budget, proteinLeftG } = params;
  const calories = kcal(dish);

  if (verdict === 'excluded') {
    return `Contains ${joinConflicts(dish.conflicts)}.`;
  }

  if (verdict === 'over') {
    const over = Math.round(calories - budget.max);
    return budget.overspent
      ? `Today is already spent — this adds ${formatNumber(over)} kcal on top.`
      : `About ${formatNumber(over)} kcal more than you have room for.`;
  }

  if (verdict === 'light') {
    const spare = Math.round(budget.max - calories);
    return `Comfortably inside today, with about ${formatNumber(spare)} kcal still spare.`;
  }

  const protein = Math.round(dish.protein_g || 0);
  if (proteinLeftG > 0 && protein > 0) {
    const covers = Math.min(100, Math.round((protein / proteinLeftG) * 100));
    return `Fits what is left, and covers ${covers}% of the protein you still owe.`;
  }
  return 'Fits what is left of today.';
}

/**
 * Order the menu.
 *
 * Anything that breaks a dietary rule is ranked last whatever it scores,
 * rather than being dropped: a vegetarian shown four dishes out of a menu of
 * twenty has no way to tell whether the app read the menu badly or the
 * kitchen really has nothing, and the second is worth knowing before sitting
 * down. They are ordered last, marked, and given the reason.
 */
export function rankMenu(dishes: readonly MenuDish[], context: MenuContext): RankedDish[] {
  const { budget, proteinLeftG } = context;

  const ranked: RankedDish[] = dishes.map((dish) => {
    const calories = kcal(dish);

    if (dish.conflicts.length > 0) {
      return {
        dish,
        verdict: 'excluded' as const,
        score: 0,
        reason: reasonFor({ dish, verdict: 'excluded', budget, proteinLeftG }),
      };
    }

    const verdict = verdictFor(calories, budget);

    /**
     * With the day already spent there is no fit to measure, so the only
     * useful question left is which dish does least damage. The score becomes
     * how small the overshoot is, and every verdict stays honest about being
     * over.
     */
    const score = budget.overspent
      ? 1 / (1 + Math.max(0, calories - budget.max) / OVERSHOOT_HALF_KCAL)
      : calorieFit(calories, budget) *
        (1 - PROTEIN_WEIGHT + PROTEIN_WEIGHT * proteinFit(dish, proteinLeftG));

    return { dish, verdict, score, reason: reasonFor({ dish, verdict, budget, proteinLeftG }) };
  });

  // Excluded dishes sort below everything, however well they would have fitted.
  return ranked.sort((a, b) => {
    const aOut = a.verdict === 'excluded';
    const bOut = b.verdict === 'excluded';
    if (aOut !== bOut) return aOut ? 1 : -1;
    return b.score - a.score;
  });
}

/** How many of the ranked dishes are worth putting at the top of the screen. */
export const SHORTLIST_SIZE = 3;

/**
 * The headline above the list.
 *
 * Says what was found rather than what was wanted, because a menu photograph
 * that caught three dishes out of thirty should read as a bad photograph, not
 * as a restaurant with three dishes.
 */
export function describeMenu(ranked: readonly RankedDish[]): string {
  if (ranked.length === 0) return 'Nothing readable on that photo.';

  const fits = ranked.filter((entry) => entry.verdict === 'fits').length;
  const excluded = ranked.filter((entry) => entry.verdict === 'excluded').length;
  const read = `Read ${ranked.length} ${ranked.length === 1 ? 'dish' : 'dishes'}.`;

  if (fits === 0) {
    return excluded > 0
      ? `${read} None fit today, and ${excluded} ${excluded === 1 ? 'is' : 'are'} off your list.`
      : `${read} None of them fit what is left of today.`;
  }

  const fitting = `${fits} ${fits === 1 ? 'fits' : 'fit'} what is left`;
  return excluded > 0
    ? `${read} ${fitting}, and ${excluded} ${excluded === 1 ? 'is' : 'are'} off your list.`
    : `${read} ${fitting}.`;
}
