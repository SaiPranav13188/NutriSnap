import { describe, expect, it } from 'vitest';
import { RING_LEGEND, isRingComplete, ringState } from './rings.js';

const grade = (consumed: number, target = 2000, hasLogs = true) =>
  ringState({ consumed, target, hasLogs });

describe('ringState', () => {
  it('reads an untouched day as empty, whatever the target', () => {
    expect(grade(0, 2000, false)).toBe('empty');
    expect(grade(0, 0, false)).toBe('empty');
  });

  it('does not mistake a logged zero-calorie day for an untouched one', () => {
    // A black coffee is a log.
    expect(grade(0, 2000, true)).toBe('under');
  });

  it('calls the target hit from 100 under to 99 over', () => {
    expect(grade(1900)).toBe('onTarget');
    expect(grade(2000)).toBe('onTarget');
    expect(grade(2099)).toBe('onTarget');
  });

  it('turns yellow at exactly 100 over and stays yellow to 199', () => {
    expect(grade(2100)).toBe('close');
    expect(grade(2199)).toBe('close');
  });

  it('turns red at exactly 200 over', () => {
    expect(grade(2200)).toBe('over');
    expect(grade(3000)).toBe('over');
  });

  it('reads a day still in progress as under rather than as a failure', () => {
    expect(grade(400)).toBe('under');
    expect(grade(1899)).toBe('under');
  });

  it('will not grade a day with no target', () => {
    expect(grade(1500, 0)).toBe('under');
  });

  it('survives rubbish numbers without throwing', () => {
    expect(grade(Number.NaN)).toBe('under');
    expect(ringState({ consumed: 2000, target: Number.NaN, hasLogs: true })).toBe('under');
  });
});

describe('RING_LEGEND', () => {
  it('explains every state the strip can draw', () => {
    const explained = new Set(RING_LEGEND.map((entry) => entry.state));
    for (const state of ['empty', 'under', 'onTarget', 'close', 'over'] as const) {
      expect(explained.has(state)).toBe(true);
    }
  });

  it('quotes the same thresholds the grading uses', () => {
    const yellow = RING_LEGEND.find((entry) => entry.state === 'close')!;
    expect(yellow.detail).toContain('100');
    expect(yellow.detail).toContain('199');

    const red = RING_LEGEND.find((entry) => entry.state === 'over')!;
    expect(red.detail).toContain('200');
  });
});

describe('isRingComplete', () => {
  it('celebrates hitting the target and nothing else', () => {
    expect(isRingComplete('onTarget')).toBe(true);
    expect(isRingComplete('close')).toBe(false);
    expect(isRingComplete('over')).toBe(false);
    expect(isRingComplete('under')).toBe(false);
    expect(isRingComplete('empty')).toBe(false);
  });
});
