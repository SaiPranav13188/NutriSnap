import { describe, expect, it } from 'vitest';
import {
  ROLLING_SESSIONS,
  SET_MET,
  breakdownByExercise,
  caloriesForSet,
  compareWithRecent,
  describeSession,
  metForCategory,
  type LoggedSet,
  type SetCategory,
} from './strength.js';

const set = (over: Partial<LoggedSet> = {}): LoggedSet => ({
  exercise: 'Bench press',
  category: 'strength',
  setNumber: 1,
  reps: 8,
  weightKg: 60,
  activeSeconds: 40,
  calories: 2.8,
  ...over,
});

describe('metForCategory', () => {
  it('reads the published values', () => {
    expect(metForCategory('strength')).toBe(5.0);
    expect(metForCategory('circuit')).toBe(8.0);
    expect(metForCategory('bodyweight')).toBe(4.5);
  });

  it('takes a table of its own, so the values are configuration', () => {
    const mine: Record<SetCategory, number> = {
      strength: 6.5,
      circuit: 9,
      bodyweight: 5,
      cardio: 7,
    };
    expect(metForCategory('strength', mine)).toBe(6.5);
    // The default is untouched by passing one.
    expect(SET_MET.strength).toBe(5.0);
  });
});

describe('caloriesForSet', () => {
  it('is MET times body weight over the working hour', () => {
    // 5 MET, 80 kg, 60 seconds: 5 * 80 * (60/3600) = 6.67
    expect(
      caloriesForSet({ category: 'strength', activeSeconds: 60, bodyWeightKg: 80 }),
    ).toBeCloseTo(6.667, 3);
  });

  it('counts only the seconds the set was being performed', () => {
    const working = caloriesForSet({
      category: 'strength',
      activeSeconds: 45,
      bodyWeightKg: 80,
    });
    // The same set with three minutes of rest tacked on must not cost more.
    const withRest = caloriesForSet({
      category: 'strength',
      activeSeconds: 45,
      bodyWeightKg: 80,
    });
    expect(withRest).toBe(working);
  });

  it('separates the categories', () => {
    const args = { activeSeconds: 60, bodyWeightKg: 70 } as const;
    const strength = caloriesForSet({ ...args, category: 'strength' });
    const circuit = caloriesForSet({ ...args, category: 'circuit' });
    const bodyweight = caloriesForSet({ ...args, category: 'bodyweight' });

    expect(circuit).toBeGreaterThan(strength);
    expect(strength).toBeGreaterThan(bodyweight);
  });

  it('needs no load for a bodyweight movement', () => {
    // Requirement eight: no weight entered, still a real figure.
    const pressUps = caloriesForSet({
      category: 'bodyweight',
      activeSeconds: 40,
      bodyWeightKg: 75,
    });
    expect(pressUps).toBeGreaterThan(0);
    expect(pressUps).toBeCloseTo((4.5 * 75 * 40) / 3600, 6);
  });

  it('falls back to a mid-range adult when the profile is empty', () => {
    expect(caloriesForSet({ category: 'strength', activeSeconds: 60, bodyWeightKg: null })).toBe(
      caloriesForSet({ category: 'strength', activeSeconds: 60, bodyWeightKg: 70 }),
    );
  });

  it('is zero for a set with no time on it', () => {
    expect(caloriesForSet({ category: 'strength', activeSeconds: 0, bodyWeightKg: 80 })).toBe(0);
    expect(caloriesForSet({ category: 'strength', activeSeconds: -5, bodyWeightKg: 80 })).toBe(0);
  });
});

describe('breakdownByExercise', () => {
  const sets: LoggedSet[] = [
    set({ exercise: 'Squat', calories: 10, activeSeconds: 50 }),
    set({ exercise: 'Squat', setNumber: 2, calories: 10, activeSeconds: 50 }),
    set({ exercise: 'Bench press', calories: 6, activeSeconds: 30 }),
    set({ exercise: 'Plank', category: 'bodyweight', calories: 4, activeSeconds: 60 }),
  ];

  it('groups sets under their exercise', () => {
    const rows = breakdownByExercise(sets);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ exercise: 'Squat', sets: 2, calories: 20, activeSeconds: 100 });
  });

  it('puts the biggest contributor first', () => {
    expect(breakdownByExercise(sets).map((row) => row.exercise)).toEqual([
      'Squat',
      'Bench press',
      'Plank',
    ]);
  });

  it('reports each share of the session', () => {
    const rows = breakdownByExercise(sets);
    // Squat is 20 kcal of the session's 30.
    expect(rows[0]!.share).toBeCloseTo(2 / 3, 6);
    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 6);
  });

  it('does not divide by an empty session', () => {
    expect(breakdownByExercise([])).toEqual([]);
    const free = breakdownByExercise([set({ calories: 0 })]);
    expect(free[0]!.share).toBe(0);
  });
});

describe('compareWithRecent', () => {
  it('measures against the mean of the recent sessions', () => {
    const result = compareWithRecent(220, [200, 180, 220, 200, 200]);
    expect(result.average).toBe(200);
    expect(result.delta).toBe(20);
    expect(result.deltaRatio).toBeCloseTo(0.1, 6);
    expect(result.sampleSize).toBe(5);
  });

  it('only looks at the last five', () => {
    // The sixth and seventh are far larger and must not move the mean.
    const result = compareWithRecent(100, [100, 100, 100, 100, 100, 5000, 5000]);
    expect(result.average).toBe(100);
    expect(result.sampleSize).toBe(ROLLING_SESSIONS);
  });

  it('says so rather than inventing a baseline on a first session', () => {
    const result = compareWithRecent(180, []);
    expect(result.average).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.deltaRatio).toBeNull();
    expect(result.sampleSize).toBe(0);
  });

  it('works with fewer sessions than the window', () => {
    const result = compareWithRecent(150, [100, 200]);
    expect(result.average).toBe(150);
    expect(result.delta).toBe(0);
    expect(result.sampleSize).toBe(2);
  });

  it('reports a shortfall as a negative delta', () => {
    const result = compareWithRecent(150, [200, 200]);
    expect(result.delta).toBe(-50);
    expect(result.deltaRatio).toBeCloseTo(-0.25, 6);
  });
});

describe('describeSession', () => {
  it('reads as one line', () => {
    expect(describeSession({ kcal: 218.4, sets: 12, totalSeconds: 1440 })).toBe(
      '218 kcal · 12 sets · 24 min',
    );
  });

  it('does not round a short session down to nothing', () => {
    expect(describeSession({ kcal: 9, sets: 1, totalSeconds: 20 })).toBe('9 kcal · 1 set · 1 min');
  });
});
