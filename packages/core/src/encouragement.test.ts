import { describe, expect, it } from 'vitest';
import {
  ENCOURAGEMENTS,
  ENCOURAGEMENT_EVERY,
  encouragementAfter,
  stepsFor,
  type StepDefinition,
} from './onboarding.js';

/** A quiz of n questions followed by two informational screens. */
const quiz = (questions: number): StepDefinition[] => [
  ...Array.from({ length: questions }, (_, i) => ({
    id: `q${i}` as unknown as StepDefinition['id'],
    title: `Question ${i + 1}`,
  })),
  { id: 'crafting', title: 'Crafting', informational: true },
  { id: 'reveal', title: 'Reveal', informational: true },
];

describe('encouragementAfter', () => {
  const steps = quiz(12);

  it('appears after every third question', () => {
    expect(encouragementAfter(2, steps)).not.toBeNull(); // after Q3
    expect(encouragementAfter(5, steps)).not.toBeNull(); // after Q6
    expect(encouragementAfter(8, steps)).not.toBeNull(); // after Q9
  });

  it('stays out of the way in between', () => {
    expect(encouragementAfter(0, steps)).toBeNull();
    expect(encouragementAfter(1, steps)).toBeNull();
    expect(encouragementAfter(3, steps)).toBeNull();
    expect(encouragementAfter(4, steps)).toBeNull();
  });

  it('does not interrupt the informational screens', () => {
    const last = steps.length - 1;
    expect(encouragementAfter(last, steps)).toBeNull();
    expect(encouragementAfter(last - 1, steps)).toBeNull();
  });

  it('says nothing after the final question', () => {
    // Nine questions: the ninth is the last, so no encouragement follows it.
    const short = quiz(9);
    expect(encouragementAfter(8, short)).toBeNull();
    expect(encouragementAfter(5, short)).not.toBeNull();
  });

  it('gives a different quote each time within a run', () => {
    const seen = [2, 5, 8].map((i) => encouragementAfter(i, steps)?.quote);
    expect(new Set(seen).size).toBe(3);
  });

  it('cycles rather than running out', () => {
    const long = quiz(ENCOURAGEMENTS.length * ENCOURAGEMENT_EVERY + 6);
    const indices = Array.from(
      { length: ENCOURAGEMENTS.length + 1 },
      (_, n) => (n + 1) * ENCOURAGEMENT_EVERY - 1,
    );

    for (const i of indices) {
      expect(encouragementAfter(i, long)).not.toBeNull();
    }
  });

  it('refuses an index outside the quiz', () => {
    expect(encouragementAfter(-1, steps)).toBeNull();
    expect(encouragementAfter(999, steps)).toBeNull();
  });

  it('handles a quiz with no questions at all', () => {
    expect(encouragementAfter(0, [{ id: 'reveal', title: 'R', informational: true }])).toBeNull();
  });

  it('fires somewhere in the middle of the real quiz', () => {
    const real = stepsFor({ goal: 'lose' });
    const hits = real
      .map((_, i) => (encouragementAfter(i, real) ? i : null))
      .filter((i): i is number => i !== null);

    expect(hits.length).toBeGreaterThanOrEqual(2);
    // None of them lands on an informational screen.
    for (const i of hits) expect(real[i]!.informational).toBeFalsy();
  });
});

describe('ENCOURAGEMENTS', () => {
  it('are all non-empty and sensibly short', () => {
    for (const entry of ENCOURAGEMENTS) {
      expect(entry.quote.trim().length).toBeGreaterThan(10);
      expect(entry.quote.length).toBeLessThan(120);
    }
  });
});
