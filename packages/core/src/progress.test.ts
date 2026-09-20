import { describe, expect, it } from 'vitest';
import {
  bucketSeries,
  computeTrend,
  encouragementMessage,
  goalProgress,
  isProgressRange,
  movingAverage,
  rangeStartDate,
  weekOverWeekChange,
} from './progress.js';
import { ringProgress, sumTotals, scaleTotals, inferMealType } from './nutrition.js';
import { computeAdaptiveTarget, detectPlateau, estimateTdeeFromHistory } from './adaptive.js';
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from './units.js';
import { isOnboardingComplete, stepsFor, validateStep } from './onboarding.js';

const NOW = new Date('2024-06-15T12:00:00Z');

describe('rangeStartDate', () => {
  it('walks back 90 days for 90d', () => {
    const start = rangeStartDate('90d', NOW)!;
    expect(Math.round((NOW.getTime() - start.getTime()) / 86_400_000)).toBe(90);
  });

  it('walks back one calendar month for 1m', () => {
    expect(rangeStartDate('1m', NOW)!.toISOString().slice(0, 10)).toBe('2024-05-15');
  });

  it('walks back one calendar year for 1y', () => {
    expect(rangeStartDate('1y', NOW)!.toISOString().slice(0, 10)).toBe('2023-06-15');
  });

  it('has no lower bound for all', () => {
    expect(rangeStartDate('all', NOW)).toBeNull();
  });
});

describe('isProgressRange', () => {
  it('accepts the five documented ranges and nothing else', () => {
    for (const r of ['90d', '1m', '6m', '1y', 'all']) expect(isProgressRange(r)).toBe(true);
    expect(isProgressRange('7d')).toBe(false);
    expect(isProgressRange(null)).toBe(false);
  });
});

describe('bucketSeries', () => {
  const series = Array.from({ length: 365 }, (_, i) => ({
    date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    value: i,
  }));

  it('leaves a short series untouched', () => {
    const short = series.slice(0, 10);
    expect(bucketSeries(short, 60)).toBe(short);
  });

  it('collapses a long series to at most maxPoints', () => {
    expect(bucketSeries(series, 60).length).toBeLessThanOrEqual(60);
  });

  it('keeps the final bucket labelled with the last real date', () => {
    const out = bucketSeries(series, 60);
    expect(out[out.length - 1]!.date).toBe(series[series.length - 1]!.date);
  });
});

describe('movingAverage', () => {
  it('smooths day-to-day noise', () => {
    const points = [
      { date: 'd1', value: 80 },
      { date: 'd2', value: 82 },
      { date: 'd3', value: 78 },
    ];
    const out = movingAverage(points, 3);
    expect(out[0]!.value).toBe(80);
    expect(out[2]!.value).toBe(80); // (80 + 82 + 78) / 3
  });
});

describe('computeTrend', () => {
  it('reports a downward trend', () => {
    const t = computeTrend([
      { date: 'd1', value: 82 },
      { date: 'd2', value: 80 },
    ]);
    expect(t.direction).toBe('down');
    expect(t.change).toBe(-2);
  });

  it('treats tiny movement as flat', () => {
    expect(
      computeTrend([
        { date: 'd1', value: 80 },
        { date: 'd2', value: 80.1 },
      ]).direction,
    ).toBe('flat');
  });

  it('reports insufficient data for a single point', () => {
    expect(computeTrend([{ date: 'd1', value: 80 }]).direction).toBe('insufficient');
  });
});

describe('encouragementMessage', () => {
  it('congratulates a cutting user who is losing', () => {
    const trend = computeTrend([
      { date: 'd1', value: 82 },
      { date: 'd2', value: 80 },
    ]);
    expect(encouragementMessage(trend, 'lose')).toMatch(/Great job/);
  });

  it('does not congratulate a bulking user who is losing', () => {
    const trend = computeTrend([
      { date: 'd1', value: 82 },
      { date: 'd2', value: 80 },
    ]);
    expect(encouragementMessage(trend, 'gain')).not.toMatch(/Great job/);
  });
});

describe('weekOverWeekChange', () => {
  it('compares the last seven days against the seven before them', () => {
    const points = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: `a${i}`, value: 2000 })),
      ...Array.from({ length: 7 }, (_, i) => ({ date: `b${i}`, value: 2200 })),
    ];
    const out = weekOverWeekChange(points);
    expect(out.lastWeekAvg).toBe(2000);
    expect(out.thisWeekAvg).toBe(2200);
    expect(out.percentChange).toBe(10);
  });
});

describe('goalProgress', () => {
  it('reports the fraction of the way to the goal', () => {
    expect(goalProgress(80, 77.5, 75)).toBe(0.5);
  });

  it('clamps past the goal and before the start', () => {
    expect(goalProgress(80, 70, 75)).toBe(1);
    expect(goalProgress(80, 85, 75)).toBe(0);
  });
});

describe('ringProgress', () => {
  it('clamps the drawn arc but reports the true percentage when over', () => {
    const r = ringProgress(2400, 2000);
    expect(r.ratio).toBe(1);
    expect(r.percent).toBe(120);
    expect(r.over).toBe(true);
    expect(r.remaining).toBe(-400);
  });

  it('handles a zero target without dividing by zero', () => {
    const r = ringProgress(500, 0);
    expect(r.ratio).toBe(0);
    expect(r.percent).toBe(0);
  });
});

describe('sumTotals / scaleTotals', () => {
  it('adds logs into one totals object', () => {
    const totals = sumTotals([
      { calories: 500, protein_g: 30 },
      { calories: 250, protein_g: 10, sugar_g: 5 },
    ]);
    expect(totals.calories).toBe(750);
    expect(totals.protein_g).toBe(40);
    expect(totals.sugar_g).toBe(5);
  });

  it('scales every field by the serving multiplier', () => {
    const scaled = scaleTotals(
      { calories: 100, protein_g: 10, carbs_g: 5, fat_g: 2, sugar_g: 1, fiber_g: 1, sodium_mg: 50 },
      2,
    );
    expect(scaled.calories).toBe(200);
    expect(scaled.sodium_mg).toBe(100);
  });

  it('falls back to 1x for a non-positive multiplier', () => {
    const base = {
      calories: 100,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      sugar_g: 0,
      fiber_g: 0,
      sodium_mg: 0,
    };
    expect(scaleTotals(base, 0).calories).toBe(100);
  });
});

describe('inferMealType', () => {
  it('buckets by hour of day', () => {
    expect(inferMealType(new Date('2024-06-15T08:00:00'))).toBe('breakfast');
    expect(inferMealType(new Date('2024-06-15T13:00:00'))).toBe('lunch');
    expect(inferMealType(new Date('2024-06-15T19:00:00'))).toBe('dinner');
    expect(inferMealType(new Date('2024-06-15T23:00:00'))).toBe('snack');
  });
});

describe('unit conversion', () => {
  it('round-trips kg and lb', () => {
    expect(kgToLb(lbToKg(180))).toBeCloseTo(180, 9);
  });

  it('converts a known height', () => {
    expect(feetInchesToCm(5, 11)).toBeCloseTo(180.34, 2);
    expect(cmToFeetInches(180.34)).toEqual({ feet: 5, inches: 11 });
  });
});

describe('estimateTdeeFromHistory', () => {
  it('infers a higher TDEE when weight did not fall as predicted', () => {
    // 14 days at 2000 kcal, no weight change → maintenance is 2000.
    const tdee = estimateTdeeFromHistory({
      dailyIntakes: Array(14).fill(2000),
      daysElapsed: 14,
      weightStartKg: 80,
      weightEndKg: 80,
    });
    expect(tdee).toBeCloseTo(2000, 6);
  });

  it('accounts for weight actually lost', () => {
    // Lost 1 kg over 14 days on 2000 kcal → burned 7700/14 = 550 more per day.
    const tdee = estimateTdeeFromHistory({
      dailyIntakes: Array(14).fill(2000),
      daysElapsed: 14,
      weightStartKg: 80,
      weightEndKg: 79,
    });
    expect(tdee).toBeCloseTo(2550, 6);
  });
});

describe('computeAdaptiveTarget', () => {
  const base = {
    daysElapsed: 14,
    weightStartKg: 80,
    weightEndKg: 80,
    currentTargetCalories: 2200,
    formulaTdee: 2759,
    gender: 'male' as const,
    goal: 'lose' as const,
    rateKgPerWeek: 0.5,
    weightKg: 80,
  };

  it('refuses to adjust on too little history', () => {
    const r = computeAdaptiveTarget({ ...base, daysElapsed: 7, dailyIntakes: Array(7).fill(2200) });
    expect(r.shouldAdjust).toBe(false);
    expect(r.reason).toMatch(/at least 14 days/);
  });

  it('refuses to adjust when logging is too patchy', () => {
    const r = computeAdaptiveTarget({ ...base, dailyIntakes: Array(5).fill(2200) });
    expect(r.shouldAdjust).toBe(false);
    expect(r.reason).toMatch(/logged/);
  });

  it('lowers the target when weight is not moving on a deficit', () => {
    // Ate 2200 for 14 days, weight unchanged → true TDEE ≈ 2200, so a 0.5 kg/wk
    // cut needs 1650. The step is capped at 250, landing on 1950.
    const r = computeAdaptiveTarget({ ...base, dailyIntakes: Array(14).fill(2200) });
    expect(r.shouldAdjust).toBe(true);
    expect(r.estimatedTdee).toBe(2200);
    expect(r.newCalories).toBe(1950);
  });

  it('never moves the target by more than the cap in one step', () => {
    const r = computeAdaptiveTarget({ ...base, dailyIntakes: Array(14).fill(2200) });
    expect(Math.abs(r.newCalories - r.previousCalories)).toBeLessThanOrEqual(250);
  });

  it('ignores an outlier weigh-in far outside the plausible range', () => {
    const r = computeAdaptiveTarget({
      ...base,
      dailyIntakes: Array(14).fill(2200),
      weightEndKg: 74, // 6 kg in two weeks — a bad scale reading, not biology
    });
    expect(r.shouldAdjust).toBe(false);
    expect(r.reason).toMatch(/outlier/);
  });

  it('leaves a well-calibrated target alone', () => {
    // Losing exactly 0.5 kg/week on 2200 → estimated TDEE 2750, desired 2200.
    const r = computeAdaptiveTarget({
      ...base,
      dailyIntakes: Array(14).fill(2200),
      weightEndKg: 79,
    });
    expect(r.shouldAdjust).toBe(false);
    expect(r.newCalories).toBe(2200);
  });
});

describe('detectPlateau', () => {
  it('flags a stalled cut', () => {
    const weights = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return { date: d.toISOString(), value: 80 };
    });
    expect(detectPlateau({ weights, goal: 'lose' }).plateaued).toBe(true);
  });

  it('never flags a maintenance user', () => {
    const weights = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return { date: d.toISOString(), value: 80 };
    });
    expect(detectPlateau({ weights, goal: 'maintain' }).plateaued).toBe(false);
  });
});

describe('onboarding', () => {
  it('branches the step list by goal', () => {
    const lose = stepsFor({ goal: 'lose' }).map((s) => s.id);
    const maintain = stepsFor({ goal: 'maintain' }).map((s) => s.id);
    expect(lose).toContain('rate');
    expect(lose).toContain('target_date');
    expect(maintain).not.toContain('rate');
    expect(maintain).toContain('focus_area');
    expect(stepsFor({ goal: 'gain' }).map((s) => s.id)).toContain('training_focus');
  });

  it('rejects a goal weight pointing the wrong way', () => {
    expect(
      validateStep('goal_weight', { goal: 'lose', current_weight_kg: 80, goal_weight_kg: 85 }),
    ).toMatch(/below/);
    expect(
      validateStep('goal_weight', { goal: 'gain', current_weight_kg: 80, goal_weight_kg: 75 }),
    ).toMatch(/above/);
    expect(
      validateStep('goal_weight', { goal: 'lose', current_weight_kg: 80, goal_weight_kg: 75 }),
    ).toBeNull();
  });

  it('enforces a minimum age', () => {
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 10);
    expect(validateStep('date_of_birth', { date_of_birth: recent.toISOString() })).toMatch(/13/);
  });

  it('only reports complete once every required step is answered', () => {
    const answers = {
      gender: 'female',
      goal: 'lose',
      date_of_birth: '1994-01-01',
      height_cm: 165,
      current_weight_kg: 65,
      activity_level: 'light',
      workouts_per_week: '1-3',
      goal_weight_kg: 60,
      rate_kg_per_week: 0.5,
    } as const;
    expect(isOnboardingComplete(answers)).toBe(true);
    expect(isOnboardingComplete({ ...answers, height_cm: undefined })).toBe(false);
  });
});
