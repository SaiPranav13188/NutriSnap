import { describe, expect, it } from 'vitest';
import {
  CARDIO_ACTIVITIES,
  DIVERGENCE_THRESHOLD,
  HR_ZONES,
  cardioProfile,
  compareCalorieSources,
  emptyZoneTotals,
  formatPace,
  keytelCaloriesPerMinute,
  maxHeartRate,
  metForCardio,
  paceFromDistance,
  zoneBreakdown,
  zoneForHeartRate,
} from './cardio.js';

describe('maxHeartRate', () => {
  it('is 220 minus age', () => {
    expect(maxHeartRate(30)).toBe(190);
    expect(maxHeartRate(52)).toBe(168);
  });

  it('lets a measured value win', () => {
    expect(maxHeartRate(30, 201)).toBe(201);
  });

  it('assumes rather than refusing when age is unknown', () => {
    expect(maxHeartRate(null)).toBe(190);
    expect(maxHeartRate(null, 175)).toBe(175);
  });
});

describe('zoneForHeartRate', () => {
  const max = 200;

  it('places each zone by percentage of maximum', () => {
    expect(zoneForHeartRate(105, max)).toBe(1); // 52%
    expect(zoneForHeartRate(125, max)).toBe(2); // 62%
    expect(zoneForHeartRate(145, max)).toBe(3); // 72%
    expect(zoneForHeartRate(165, max)).toBe(4); // 82%
    expect(zoneForHeartRate(185, max)).toBe(5); // 92%
  });

  it('puts a boundary in the zone it opens', () => {
    expect(zoneForHeartRate(120, max)).toBe(2); // exactly 60%
    expect(zoneForHeartRate(180, max)).toBe(5); // exactly 90%
  });

  it('has nowhere below zone one to put a gentle effort', () => {
    expect(zoneForHeartRate(70, max)).toBe(1);
    expect(zoneForHeartRate(0, max)).toBe(1);
  });

  it('never exceeds zone five', () => {
    expect(zoneForHeartRate(230, max)).toBe(5);
  });
});

describe('keytelCaloriesPerMinute', () => {
  it('rises with heart rate', () => {
    const base = { weightKg: 75, age: 30, gender: 'male' as const };
    const easy = keytelCaloriesPerMinute({ ...base, heartRate: 120 });
    const hard = keytelCaloriesPerMinute({ ...base, heartRate: 170 });
    expect(hard).toBeGreaterThan(easy);
  });

  it('matches the published equation', () => {
    const expected = (-55.0969 + 0.6309 * 150 + 0.1988 * 75 + 0.2017 * 30) / 4.184;
    expect(
      keytelCaloriesPerMinute({ heartRate: 150, weightKg: 75, age: 30, gender: 'male' }),
    ).toBeCloseTo(expected, 6);
  });

  it('uses the female coefficients where given', () => {
    const male = keytelCaloriesPerMinute({
      heartRate: 150,
      weightKg: 70,
      age: 30,
      gender: 'male',
    });
    const female = keytelCaloriesPerMinute({
      heartRate: 150,
      weightKg: 70,
      age: 30,
      gender: 'female',
    });
    expect(female).not.toBeCloseTo(male, 3);
  });

  it('never subtracts from the session at rest', () => {
    // The equation goes negative at a resting heart rate; it must not.
    expect(keytelCaloriesPerMinute({ heartRate: 55, weightKg: 70, age: 30, gender: 'male' })).toBe(
      0,
    );
    expect(keytelCaloriesPerMinute({ heartRate: 0, weightKg: 70, age: 30, gender: 'male' })).toBe(
      0,
    );
  });
});

describe('metForCardio', () => {
  it('uses each machine baseline', () => {
    expect(metForCardio('row')).toBe(7);
    expect(metForCardio('elliptical')).toBe(5);
    expect(metForCardio('stairs')).toBe(9);
  });

  it('refines running by pace', () => {
    const quick = metForCardio('run', { paceMinPerKm: 3.5 });
    const steady = metForCardio('run', { paceMinPerKm: 5.5 });
    const jog = metForCardio('run', { paceMinPerKm: 9 });

    expect(quick).toBeGreaterThan(steady);
    expect(steady).toBeGreaterThan(jog);
    expect(quick).toBe(12);
  });

  it('ignores a pace for machines that do not have one', () => {
    expect(metForCardio('row', { paceMinPerKm: 3 })).toBe(7);
  });

  it('falls back to the baseline with no pace yet', () => {
    expect(metForCardio('run', { paceMinPerKm: null })).toBe(cardioProfile('run').met);
  });
});

describe('compareCalorieSources', () => {
  it('is quiet while the two agree', () => {
    expect(compareCalorieSources(200, 210).diverged).toBe(false);
  });

  it('flags a gap wider than the threshold', () => {
    const result = compareCalorieSources(200, 260);
    expect(result.ratio).toBeCloseTo(60 / 260, 6);
    expect(result.diverged).toBe(true);
  });

  it('reads the same gap the same way round either way', () => {
    expect(compareCalorieSources(200, 300).ratio).toBeCloseTo(
      compareCalorieSources(300, 200).ratio,
      9,
    );
  });

  it('takes a threshold of its own', () => {
    expect(compareCalorieSources(100, 120, 0.25).diverged).toBe(false);
    expect(compareCalorieSources(100, 120, 0.05).diverged).toBe(true);
    expect(DIVERGENCE_THRESHOLD).toBe(0.15);
  });

  it('does not divide by two empty sources', () => {
    expect(compareCalorieSources(0, 0)).toEqual({ ratio: 0, diverged: false });
  });
});

describe('zoneBreakdown', () => {
  it('reports minutes and calories per zone', () => {
    const seconds = { ...emptyZoneTotals(), 2: 300, 3: 600, 4: 300 };
    const kcal = { ...emptyZoneTotals(), 2: 40, 3: 110, 4: 70 };
    const rows = zoneBreakdown(seconds, kcal);

    expect(rows).toHaveLength(5);
    expect(rows[2]).toMatchObject({ zone: 3, seconds: 600, kcal: 110 });
    expect(rows[2]!.share).toBeCloseTo(0.5, 6);
  });

  it('shares add up to the whole session', () => {
    const seconds = { ...emptyZoneTotals(), 1: 120, 5: 60 };
    const rows = zoneBreakdown(seconds, emptyZoneTotals());
    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 6);
  });

  it('does not divide by a session that has not started', () => {
    const rows = zoneBreakdown(emptyZoneTotals(), emptyZoneTotals());
    expect(rows.every((row) => row.share === 0)).toBe(true);
  });

  it('keeps the zones in order', () => {
    expect(zoneBreakdown(emptyZoneTotals(), emptyZoneTotals()).map((r) => r.zone)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(HR_ZONES).toHaveLength(5);
  });
});

describe('pace', () => {
  it('works minutes per kilometre out of distance and time', () => {
    // 2 km in 10 minutes is 5:00 per km.
    expect(paceFromDistance(2000, 600)).toBeCloseTo(5, 6);
  });

  it('has no pace before anybody has moved', () => {
    expect(paceFromDistance(0, 60)).toBeNull();
    expect(paceFromDistance(500, 0)).toBeNull();
  });

  it('formats as minutes and seconds', () => {
    expect(formatPace(5.5)).toBe('5:30');
    expect(formatPace(4)).toBe('4:00');
    expect(formatPace(null)).toBe('—');
  });

  it('carries a rounded 60 seconds into the next minute', () => {
    expect(formatPace(5.999)).toBe('6:00');
  });
});

describe('CARDIO_ACTIVITIES', () => {
  it('gives every activity exactly two secondary stats', () => {
    for (const profile of CARDIO_ACTIVITIES) {
      expect(profile.stats).toHaveLength(2);
      expect(profile.met).toBeGreaterThan(0);
    }
  });

  it('maps each machine to the readings that make sense for it', () => {
    expect(cardioProfile('row').stats).toEqual(['strokeRate', 'distance']);
    expect(cardioProfile('stairs').stats).toEqual(['incline', 'floors']);
    expect(cardioProfile('run').stats).toEqual(['pace', 'distance']);
  });
});
