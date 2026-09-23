import { describe, expect, it } from 'vitest';
import {
  CYCLING_TIERS,
  EXERCISE_KINDS,
  cyclingBurnPerMinute,
  cyclingTierForSpeed,
  haversineMeters,
  mpsToMph,
  nextCyclingTier,
  metForCyclingTier,
  milestonesCrossed,
  accelerationMagnitude,
  createStepDetector,
  feedStepDetector,
  GLASS_ML,
  MAX_SESSION_BURN_KCAL,
  MAX_WATER_ML,
  MIN_WATER_ML,
  describeTrackedSession,
  estimateCaloriesBurned,
  flOzToMl,
  formatWater,
  intensityForPace,
  isTrackableKind,
  metFor,
  metForPace,
  mlToFlOz,
  strideLengthM,
  summariseTrackedSession,
  waterTarget,
} from './activity.js';

describe('waterTarget', () => {
  it('scales with body weight', () => {
    expect(waterTarget(64)).toBe(2250); // 64 * 35 = 2240, rounded to the nearest 50
    expect(waterTarget(90)).toBe(3150);
  });

  it('never drops below the floor for a very light person', () => {
    expect(waterTarget(30)).toBe(MIN_WATER_ML);
  });

  it('never exceeds the ceiling for a very heavy one', () => {
    expect(waterTarget(200)).toBe(MAX_WATER_ML);
  });

  it('falls back to two litres with no weight on file', () => {
    expect(waterTarget(null)).toBe(2000);
    expect(waterTarget(0)).toBe(2000);
  });

  it('lands on a round number, so the goal does not read as 2243 ml', () => {
    for (const kg of [45, 52, 61, 73, 88, 104]) {
      expect(waterTarget(kg) % 50).toBe(0);
    }
  });
});

describe('water units', () => {
  it('round-trips millilitres through fluid ounces', () => {
    expect(flOzToMl(mlToFlOz(1000))).toBeCloseTo(1000, 6);
  });

  it('shows litres once past a litre, millilitres below', () => {
    expect(formatWater(1800, 'metric')).toBe('1.8 L');
    expect(formatWater(750, 'metric')).toBe('750 ml');
  });

  it('shows fluid ounces in imperial', () => {
    expect(formatWater(1000, 'imperial')).toBe('34 fl oz');
  });

  it('uses a sane glass size', () => {
    expect(GLASS_ML).toBe(250);
    expect(formatWater(GLASS_ML * 8, 'metric')).toBe('2.0 L');
  });
});

describe('metFor', () => {
  it('rises with intensity within a kind', () => {
    expect(metFor('run', 'light')).toBeLessThan(metFor('run', 'moderate'));
    expect(metFor('run', 'moderate')).toBeLessThan(metFor('run', 'vigorous'));
  });

  it('ranks running above walking at the same intensity', () => {
    expect(metFor('run', 'moderate')).toBeGreaterThan(metFor('walk', 'moderate'));
  });

  it('has a value for every kind the picker offers', () => {
    for (const kind of EXERCISE_KINDS) {
      for (const intensity of ['light', 'moderate', 'vigorous'] as const) {
        expect(metFor(kind.value, intensity)).toBeGreaterThan(0);
      }
    }
  });
});

describe('estimateCaloriesBurned', () => {
  it('applies kcal = MET x kg x hours', () => {
    // 9.8 MET x 64 kg x 0.5 h = 313.6
    expect(
      estimateCaloriesBurned({
        kind: 'run',
        intensity: 'moderate',
        durationMin: 30,
        weightKg: 64,
      }),
    ).toBe(314);
  });

  it('scales linearly with duration', () => {
    const half = estimateCaloriesBurned({
      kind: 'cycle',
      intensity: 'moderate',
      durationMin: 30,
      weightKg: 70,
    });
    const full = estimateCaloriesBurned({
      kind: 'cycle',
      intensity: 'moderate',
      durationMin: 60,
      weightKg: 70,
    });
    expect(full).toBeCloseTo(half * 2, 0);
  });

  it('scales with body weight', () => {
    const light = estimateCaloriesBurned({
      kind: 'walk',
      intensity: 'moderate',
      durationMin: 60,
      weightKg: 50,
    });
    const heavy = estimateCaloriesBurned({
      kind: 'walk',
      intensity: 'moderate',
      durationMin: 60,
      weightKg: 100,
    });
    expect(heavy).toBeCloseTo(light * 2, 0);
  });

  it('assumes a mid-range adult rather than refusing with no weight on file', () => {
    const guess = estimateCaloriesBurned({
      kind: 'run',
      intensity: 'moderate',
      durationMin: 30,
      weightKg: null,
    });
    expect(guess).toBeGreaterThan(0);
    // 9.8 x 70 x 0.5
    expect(guess).toBe(343);
  });

  it('returns zero for a zero or negative duration', () => {
    expect(
      estimateCaloriesBurned({ kind: 'run', intensity: 'moderate', durationMin: 0, weightKg: 70 }),
    ).toBe(0);
    expect(
      estimateCaloriesBurned({ kind: 'run', intensity: 'moderate', durationMin: -5, weightKg: 70 }),
    ).toBe(0);
  });

  it('stays within the range the database will accept', () => {
    const extreme = estimateCaloriesBurned({
      kind: 'run',
      intensity: 'vigorous',
      durationMin: 1440,
      weightKg: 400,
    });
    // The column caps at 20000; a full day of hard running by a 400 kg person
    // is the worst case the form can produce.
    expect(extreme).toBe(MAX_SESSION_BURN_KCAL);
  });
});

describe('isTrackableKind', () => {
  it('accepts only the kinds a pedometer can measure', () => {
    expect(isTrackableKind('walk')).toBe(true);
    expect(isTrackableKind('run')).toBe(true);
    expect(isTrackableKind('cycle')).toBe(false);
    expect(isTrackableKind('swim')).toBe(false);
  });
});

describe('strideLengthM', () => {
  it('scales with height', () => {
    expect(strideLengthM('walk', 180)).toBeCloseTo(0.743, 3);
    expect(strideLengthM('walk', 160)).toBeCloseTo(0.661, 3);
  });

  it('gives a running stride the flight phase', () => {
    expect(strideLengthM('run', 180)).toBeGreaterThan(strideLengthM('walk', 180));
  });

  it('falls back to a median adult rather than returning zero', () => {
    expect(strideLengthM('walk', null)).toBeCloseTo(strideLengthM('walk', 168), 6);
    expect(strideLengthM('walk', 0)).toBeCloseTo(strideLengthM('walk', 168), 6);
  });
});

describe('metForPace', () => {
  it('rises with speed', () => {
    const speeds = [2, 4, 5, 6, 7];
    const mets = speeds.map((speed) => metForPace('walk', speed));
    for (let i = 1; i < mets.length; i += 1) {
      expect(mets[i]).toBeGreaterThanOrEqual(mets[i - 1]!);
    }
  });

  it('separates a stroll from a march', () => {
    expect(metForPace('walk', 3)).toBeLessThan(metForPace('walk', 6.5));
  });

  it('costs more to run a pace than to walk it', () => {
    expect(metForPace('run', 8.5)).toBeGreaterThan(metForPace('walk', 7.5));
  });
});

describe('summariseTrackedSession', () => {
  it('turns steps and time into distance, pace and calories', () => {
    // 4000 walking steps at 175cm ≈ 2.89 km, covered in half an hour.
    const session = summariseTrackedSession({
      kind: 'walk',
      steps: 4000,
      elapsedSec: 1800,
      heightCm: 175,
      weightKg: 70,
    });

    expect(session.distanceM).toBeCloseTo(2891, 0);
    expect(session.speedKmh).toBeCloseTo(5.78, 2);
    expect(session.intensity).toBe('vigorous'); // 6.3 MET, a brisk march
    expect(session.calories).toBe(Math.round(session.met * 70 * 0.5));
  });

  it('reports the same steps taken faster as the harder session', () => {
    const base = { kind: 'walk' as const, steps: 4000, heightCm: 175, weightKg: 70 };
    const brisk = summariseTrackedSession({ ...base, elapsedSec: 1800 });
    const amble = summariseTrackedSession({ ...base, elapsedSec: 3600 });

    expect(brisk.speedKmh).toBeGreaterThan(amble.speedKmh);
    expect(brisk.met).toBeGreaterThan(amble.met);
    // Same distance, but the slower one is twice as long, so it still burns
    // more overall — the pace shows up in the rate, not the total.
    expect(amble.calories).toBeGreaterThan(0);
  });

  it('does not divide by a clock that has not started', () => {
    const session = summariseTrackedSession({
      kind: 'run',
      steps: 0,
      elapsedSec: 0,
      heightCm: 175,
      weightKg: 70,
    });

    expect(Number.isFinite(session.speedKmh)).toBe(true);
    expect(session.speedKmh).toBe(0);
    expect(session.calories).toBe(0);
  });

  it('assumes a mid-range adult when the profile is empty', () => {
    const known = summariseTrackedSession({
      kind: 'walk',
      steps: 3000,
      elapsedSec: 1800,
      heightCm: 168,
      weightKg: 70,
    });
    const unknown = summariseTrackedSession({
      kind: 'walk',
      steps: 3000,
      elapsedSec: 1800,
      heightCm: null,
      weightKg: null,
    });

    expect(unknown.calories).toBe(known.calories);
  });

  it('stays within the range the database will accept', () => {
    const extreme = summariseTrackedSession({
      kind: 'run',
      steps: 200000,
      elapsedSec: 86400,
      heightCm: 200,
      weightKg: 400,
    });

    expect(extreme.calories).toBeLessThanOrEqual(MAX_SESSION_BURN_KCAL);
  });
});

describe('intensityForPace', () => {
  it('maps a measured pace back onto the stored label', () => {
    expect(intensityForPace('walk', 2)).toBe('light');
    expect(intensityForPace('run', 15)).toBe('vigorous');
  });
});

describe('describeTrackedSession', () => {
  it('reads as one line of notes', () => {
    const session = summariseTrackedSession({
      kind: 'walk',
      steps: 4182,
      elapsedSec: 1800,
      heightCm: 175,
      weightKg: 70,
    });

    expect(describeTrackedSession(4182, session)).toBe('4,182 steps · 3.02 km · 6.0 km/h');
  });
});

describe('feedStepDetector', () => {
  /**
   * A walker, as the accelerometer sees one: gravity plus a bounce at the
   * cadence, sampled at 50 Hz.
   */
  function walk(options: {
    seconds: number;
    cadenceHz: number;
    amplitudeG: number;
    sampleHz?: number;
  }): number {
    const { seconds, cadenceHz, amplitudeG, sampleHz = 50 } = options;
    const detector = createStepDetector();
    const samples = Math.round(seconds * sampleHz);

    for (let i = 0; i < samples; i += 1) {
      const t = (i / sampleHz) * 1000;
      const magnitude = 1 + amplitudeG * Math.sin(2 * Math.PI * cadenceHz * (t / 1000));
      feedStepDetector(detector, magnitude, t);
    }

    return detector.steps;
  }

  /**
   * The baseline needs a cycle or so to find gravity, so the first footfall
   * of a session can go uncounted. One step in twenty is well inside what a
   * step counter is worth arguing about, and insisting on an exact match
   * would be a test of the warm-up rather than of the counting.
   */
  const TOLERANCE = 1;

  it('counts one step per footfall at walking cadence', () => {
    // 2 Hz for 10 seconds is 20 footfalls.
    const counted = walk({ seconds: 10, cadenceHz: 2, amplitudeG: 0.35 });
    expect(counted).toBeGreaterThanOrEqual(20 - TOLERANCE);
    expect(counted).toBeLessThanOrEqual(20);
  });

  it('keeps up with a running cadence', () => {
    // 3 Hz for 10 seconds is 30 footfalls, 180 steps a minute.
    const counted = walk({ seconds: 10, cadenceHz: 3, amplitudeG: 0.5 });
    expect(counted).toBeGreaterThanOrEqual(30 - TOLERANCE);
    expect(counted).toBeLessThanOrEqual(30);
  });

  it('does not drift over a long session', () => {
    // Five minutes at 2 Hz is 600 footfalls; a detector that double-counted
    // or skipped would be obvious by now.
    const counted = walk({ seconds: 300, cadenceHz: 2, amplitudeG: 0.35 });
    expect(counted).toBeGreaterThanOrEqual(595);
    expect(counted).toBeLessThanOrEqual(600);
  });

  it('counts nothing from a phone sitting still', () => {
    expect(walk({ seconds: 20, cadenceHz: 2, amplitudeG: 0 })).toBe(0);
  });

  it('ignores a tremor too small to be a footfall', () => {
    expect(walk({ seconds: 20, cadenceHz: 2, amplitudeG: 0.03 })).toBe(0);
  });

  it('is not fooled by which way up the phone is', () => {
    // Gravity reads negative on a flipped axis, but magnitude does not care.
    const upright = createStepDetector();
    const flipped = createStepDetector();

    for (let i = 0; i < 500; i += 1) {
      const t = i * 20;
      const bounce = 0.35 * Math.sin(2 * Math.PI * 2 * (t / 1000));
      feedStepDetector(upright, accelerationMagnitude(0, 1 + bounce, 0), t);
      feedStepDetector(flipped, accelerationMagnitude(0, -(1 + bounce), 0), t);
    }

    expect(flipped.steps).toBe(upright.steps);
  });

  it('does not count a burst faster than a human can step', () => {
    const detector = createStepDetector();
    // 20 spikes 50ms apart — a jolt, not a sprint.
    for (let i = 0; i < 40; i += 1) {
      const t = i * 25;
      feedStepDetector(detector, i % 2 === 0 ? 1.9 : 1.0, t);
    }
    expect(detector.steps).toBeLessThanOrEqual(Math.ceil((40 * 25) / 260) + 1);
  });
});

describe('cyclingTierForSpeed', () => {
  it('puts each speed in its Compendium band', () => {
    expect(cyclingTierForSpeed(8)).toBe('easy');
    expect(cyclingTierForSpeed(12)).toBe('steady');
    expect(cyclingTierForSpeed(15)).toBe('brisk');
    expect(cyclingTierForSpeed(20)).toBe('fast');
  });

  it('gives a boundary speed to the band above it', () => {
    expect(cyclingTierForSpeed(10)).toBe('steady');
    expect(cyclingTierForSpeed(14)).toBe('brisk');
    expect(cyclingTierForSpeed(16)).toBe('fast');
  });

  it('does not fall off the bottom', () => {
    expect(cyclingTierForSpeed(0)).toBe('easy');
  });
});

describe('metForCyclingTier', () => {
  it('matches the published values', () => {
    expect(metForCyclingTier('easy')).toBe(6);
    expect(metForCyclingTier('steady')).toBe(8);
    expect(metForCyclingTier('brisk')).toBe(10);
    expect(metForCyclingTier('fast')).toBe(12);
  });

  it('rises with every band', () => {
    const mets = CYCLING_TIERS.map((band) => band.met);
    for (let i = 1; i < mets.length; i += 1) {
      expect(mets[i]).toBeGreaterThan(mets[i - 1]!);
    }
  });
});

describe('cyclingBurnPerMinute', () => {
  it('is MET times weight over the hour', () => {
    // 8 MET at 70 kg is 560 kcal/h, which is 9.33 a minute.
    expect(cyclingBurnPerMinute(8, 70)).toBeCloseTo(9.333, 3);
  });

  it('integrates back to the plain MET formula', () => {
    // Half an hour at 10 MET and 80 kg: 10 * 80 * 0.5 = 400 kcal.
    expect(cyclingBurnPerMinute(10, 80) * 30).toBeCloseTo(400, 6);
  });

  it('assumes a mid-range adult when no weight is on file', () => {
    expect(cyclingBurnPerMinute(8, null)).toBe(cyclingBurnPerMinute(8, 70));
  });
});

describe('milestonesCrossed', () => {
  it('counts whole hundreds', () => {
    expect(milestonesCrossed(0)).toBe(0);
    expect(milestonesCrossed(99.9)).toBe(0);
    expect(milestonesCrossed(100)).toBe(1);
    expect(milestonesCrossed(342)).toBe(3);
  });
});

describe('mpsToMph', () => {
  it('converts a GPS speed', () => {
    expect(mpsToMph(0)).toBe(0);
    expect(mpsToMph(10)).toBeCloseTo(22.37, 2);
    // A steady 15 km/h ride is about 9.3 mph, the top of the easy band.
    expect(mpsToMph(15000 / 3600)).toBeCloseTo(9.32, 2);
  });
});

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    const point = { latitude: 51.5007, longitude: -0.1246 };
    expect(haversineMeters(point, point)).toBe(0);
  });

  it('measures a known separation', () => {
    // A tenth of a degree of latitude is about 11.1 km anywhere on earth.
    const metres = haversineMeters(
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 51.6, longitude: -0.12 },
    );
    expect(metres).toBeGreaterThan(11000);
    expect(metres).toBeLessThan(11200);
  });

  it('does not care which way round the two points are', () => {
    const a = { latitude: 40.7128, longitude: -74.006 };
    const b = { latitude: 40.73, longitude: -73.99 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 9);
  });
});

describe('nextCyclingTier', () => {
  it('stays put while the speed is in the current band', () => {
    expect(nextCyclingTier('steady', 12)).toBe('steady');
  });

  it('will not upshift until the new band is cleared by the margin', () => {
    // 14.0 is nominally 'brisk', but not yet by enough.
    expect(nextCyclingTier('steady', 14.0)).toBe('steady');
    expect(nextCyclingTier('steady', 14.3)).toBe('steady');
    expect(nextCyclingTier('steady', 14.8)).toBe('brisk');
  });

  it('will not downshift until the old band is left by the margin', () => {
    expect(nextCyclingTier('brisk', 13.9)).toBe('brisk');
    expect(nextCyclingTier('brisk', 13.5)).toBe('brisk');
    expect(nextCyclingTier('brisk', 13.3)).toBe('steady');
  });

  it('does not flap when a rider sits on a boundary', () => {
    // GPS noise of a few tenths either side of 14 mph.
    const wobble = [13.8, 14.1, 13.9, 14.2, 14.0, 13.7, 14.3];
    let tier: ReturnType<typeof nextCyclingTier> = 'steady';
    const seen = new Set([tier]);

    for (const mph of wobble) {
      tier = nextCyclingTier(tier, mph);
      seen.add(tier);
    }

    expect(seen.size).toBe(1);
    expect(tier).toBe('steady');
  });

  it('still climbs through the bands as the rider speeds up', () => {
    let tier: ReturnType<typeof nextCyclingTier> = 'easy';
    for (const mph of [5, 11, 15, 18]) tier = nextCyclingTier(tier, mph);
    expect(tier).toBe('fast');
  });

  it('comes all the way back down', () => {
    let tier: ReturnType<typeof nextCyclingTier> = 'fast';
    for (const mph of [15, 12, 8, 2]) tier = nextCyclingTier(tier, mph);
    expect(tier).toBe('easy');
  });
});
