import { describe, expect, it } from 'vitest';
import {
  ASSUMED_CONFIDENCE,
  MARGIN_WORTH_SHOWING_KCAL,
  bestRecheck,
  dayUncertainty,
  describeRange,
  describeRecheck,
  logSigma,
  relativeError,
  type UncertainLog,
} from './uncertainty.js';

const log = (over: Partial<UncertainLog> = {}): UncertainLog => ({
  id: 'a',
  name: 'Chicken curry',
  calories: 500,
  source: 'photo',
  ai_confidence: 0.8,
  ...over,
});

describe('relativeError', () => {
  it('trusts a printed barcode more than a photograph', () => {
    expect(relativeError({ source: 'barcode', ai_confidence: null })).toBeLessThan(
      relativeError({ source: 'photo', ai_confidence: 1 }),
    );
  });

  it('trusts a photograph more than a sentence at the same confidence', () => {
    expect(relativeError({ source: 'photo', ai_confidence: 0.7 })).toBeLessThan(
      relativeError({ source: 'text', ai_confidence: 0.7 }),
    );
  });

  it('never claims a perfectly confident photo is exact', () => {
    expect(relativeError({ source: 'photo', ai_confidence: 1 })).toBeCloseTo(0.1);
  });

  it('widens as confidence falls', () => {
    expect(relativeError({ source: 'photo', ai_confidence: 0 })).toBeCloseTo(0.4);
  });

  it('treats a missing confidence as middling, not as certainty', () => {
    expect(relativeError({ source: 'photo', ai_confidence: null })).toBeCloseTo(
      relativeError({ source: 'photo', ai_confidence: ASSUMED_CONFIDENCE }),
    );
  });

  it('ignores a confidence outside 0..1 rather than inverting the band', () => {
    expect(relativeError({ source: 'photo', ai_confidence: 4 })).toBeCloseTo(0.1);
  });
});

describe('logSigma', () => {
  it('scales with the size of the meal', () => {
    // 0.1 + 0.3 x 0.2 = 0.16 of 500 kcal.
    expect(logSigma(log())).toBeCloseTo(80);
    expect(logSigma(log({ calories: 1000 }))).toBeCloseTo(160);
  });

  it('has nothing to be unsure about at zero calories', () => {
    expect(logSigma(log({ calories: 0 }))).toBe(0);
  });
});

describe('dayUncertainty', () => {
  it('adds the logs in quadrature rather than straight', () => {
    const day = dayUncertainty([log({ id: 'a' }), log({ id: 'b' })]);

    // Two meals of sigma 80: sqrt(80^2 + 80^2) = 113, not 160.
    expect(day.sigmaKcal).toBeCloseTo(113.14, 1);
    expect(day.marginKcal).toBe(110);
    expect(day.calories).toBe(1000);
    expect(day.low).toBe(890);
    expect(day.high).toBe(1110);
  });

  it('leaves the day total exactly as it found it', () => {
    const day = dayUncertainty([log({ calories: 317 }), log({ calories: 44 })]);
    expect(day.calories).toBe(361);
  });

  it('ranks the contributors by how much doubt each carries', () => {
    const day = dayUncertainty([
      log({ id: 'small', calories: 200, source: 'barcode', ai_confidence: null }),
      log({ id: 'vague', calories: 400, source: 'photo', ai_confidence: 0.2 }),
    ]);

    expect(day.contributors[0]!.id).toBe('vague');
    expect(day.contributors.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it('stays quiet about a band narrower than the numbers inside it', () => {
    const day = dayUncertainty([log({ calories: 200, source: 'barcode', ai_confidence: null })]);

    expect(day.marginKcal).toBeLessThan(MARGIN_WORTH_SHOWING_KCAL);
    expect(day.worthShowing).toBe(false);
  });

  it('survives a day with nothing in it', () => {
    const day = dayUncertainty([]);

    expect(day.sigmaKcal).toBe(0);
    expect(day.marginKcal).toBe(0);
    expect(day.worthShowing).toBe(false);
    expect(day.contributors).toEqual([]);
  });

  it('never reports a negative floor for the band', () => {
    const day = dayUncertainty([log({ calories: 100, source: 'text', ai_confidence: 0 })]);
    expect(day.low).toBeGreaterThanOrEqual(0);
  });
});

describe('bestRecheck', () => {
  it('names the hesitant small meal over the confident large one', () => {
    const day = dayUncertainty([
      log({ id: 'big', name: 'Protein bar', calories: 900, source: 'barcode', ai_confidence: null }),
      log({ id: 'vague', name: 'Thali', calories: 400, source: 'photo', ai_confidence: 0.2 }),
    ]);

    const recheck = bestRecheck(day);

    expect(recheck?.log.id).toBe('vague');
    expect(recheck!.improvedMarginKcal).toBeLessThan(recheck!.marginKcal);
    expect(recheck!.savingKcal).toBe(recheck!.marginKcal - recheck!.improvedMarginKcal);
  });

  it('asks for nothing when no log can be improved by looking again', () => {
    const day = dayUncertainty([
      log({ calories: 3000, source: 'barcode', ai_confidence: null }),
    ]);

    expect(day.worthShowing).toBe(true);
    expect(bestRecheck(day)).toBeNull();
  });

  it('asks for nothing when the doubt is spread too thin to be worth it', () => {
    // Five equal photos: correcting any one barely moves the day.
    const day = dayUncertainty(
      Array.from({ length: 5 }, (_, i) =>
        log({ id: `m${i}`, calories: 200, ai_confidence: 0.9 }),
      ),
    );

    expect(bestRecheck(day)).toBeNull();
  });

  it('asks for nothing on a day too tight to bother with', () => {
    expect(bestRecheck(dayUncertainty([log({ calories: 40 })]))).toBeNull();
  });
});

describe('copy', () => {
  it('reports the band with a thousands separator', () => {
    const day = dayUncertainty([log({ calories: 1800, source: 'photo', ai_confidence: 0.8 })]);
    expect(describeRange(day)).toBe('1,800 ± 290 kcal');
  });

  it('names the meal it wants a second look at', () => {
    const day = dayUncertainty([
      log({ id: 'big', calories: 900, source: 'barcode', ai_confidence: null }),
      log({ id: 'vague', name: 'Thali', calories: 400, source: 'photo', ai_confidence: 0.2 }),
    ]);

    expect(describeRecheck(bestRecheck(day)!)).toContain('Thali');
  });
});
