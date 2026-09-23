/**
 * How wrong today's number probably is.
 *
 * Every log already carries the two facts needed to say so: how it was
 * entered, and — for the ones a model estimated — how sure it was. Until now
 * `ai_confidence` was rendered as a badge on the scan screen and then
 * forgotten, so a day built from four confident barcode scans and a day built
 * from four dim photographs of mixed curries showed the same flat total with
 * the same air of precision.
 *
 * This turns those facts into a band, and the band into a decision: which
 * single meal is worth a second look, because correcting that one would
 * actually narrow the day and correcting any of the others would not.
 *
 * Nothing here is a measurement. It is a stated assumption about how much
 * each way of logging food tends to be out by, applied consistently, and
 * every sentence it produces says "about".
 */

import type { FoodLog, LogSource } from './types.js';
import { formatNumber } from './units.js';

/**
 * How far out each way of logging a meal typically is, as a fraction of that
 * meal's calories.
 *
 * `floor` is the error that remains even when everything went well, and
 * `span` is how much worse it gets as the model's confidence falls away. A
 * source with no span is one where confidence does not apply: nobody reports
 * a confidence for a number the user typed in themselves.
 *
 * The ordering is the part that matters and the part that is defensible. A
 * barcode is a printed number; a photograph is an inference about a portion;
 * a sentence is an inference about a portion nobody even looked at. The
 * magnitudes are rules of thumb, set so a careful photo day lands near ±10%
 * and a hesitant one near ±40%, which is roughly the range published for
 * photo-estimated intake.
 */
const SOURCE_ERROR: Readonly<Record<LogSource, { floor: number; span: number }>> = {
  /** Printed label data fetched by code. What is left is package versus portion. */
  barcode: { floor: 0.05, span: 0 },
  /** The same printed numbers, but read off a photograph, so the reading can slip. */
  label: { floor: 0.07, span: 0.08 },
  /** The food was seen. The portion was inferred from it. */
  photo: { floor: 0.1, span: 0.3 },
  /** A sentence. Nothing was seen, so the portion is whatever is typical. */
  text: { floor: 0.15, span: 0.3 },
  /** Typed in, usually off a packet or a recipe the user had in front of them. */
  manual: { floor: 0.1, span: 0 },
  /** A past log repeated, plus the assumption that this time matched last time. */
  favorite: { floor: 0.12, span: 0 },
};

/**
 * What a log with no confidence recorded is treated as.
 *
 * Middling rather than certain. Assuming 1 would let an old row with a null
 * column quietly shrink the day's band, and that is the one direction this
 * must never be wrong in.
 */
export const ASSUMED_CONFIDENCE = 0.5;

/**
 * Where a log lands once the user has confirmed it.
 *
 * Better than a fresh estimate, because a person looked at the plate and
 * agreed. Not zero, because they were eyeballing it too.
 */
export const CONFIRMED_RELATIVE_SE = 0.08;

/** Below this the band is narrower than the rounding on the numbers inside it. */
export const MARGIN_WORTH_SHOWING_KCAL = 25;

/** A second look has to buy at least this much, or it is not worth asking for. */
export const RECHECK_MIN_SAVING_KCAL = 40;

/** The fields this module needs. Anything log-shaped satisfies it. */
export type UncertainLog = Pick<FoodLog, 'id' | 'name' | 'calories' | 'source' | 'ai_confidence'>;

export interface LogUncertainty {
  id: string;
  name: string;
  calories: number;
  source: LogSource;
  confidence: number | null;
  /** One standard error on this log's calories. */
  sigmaKcal: number;
  /** This log's share of the day's total variance, 0..1. */
  share: number;
  /** Whether looking again could actually improve it. */
  recheckable: boolean;
}

export interface DayUncertainty {
  /** The day's total, untouched — this module never changes a number. */
  calories: number;
  /** One standard error on that total. */
  sigmaKcal: number;
  /** The ± figure, rounded to something a person can read. */
  marginKcal: number;
  low: number;
  high: number;
  /** True when the band is wide enough to be worth putting on screen. */
  worthShowing: boolean;
  /** Every log, widest contribution first. */
  contributors: LogUncertainty[];
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Margins are reported to the nearest ten. See `dayUncertainty`. */
const roundMargin = (sigma: number): number => Math.round(sigma / 10) * 10;

/**
 * Only the ways of logging that a second look can improve.
 *
 * A barcode is already a printed number and a manual entry is already the
 * user's own, so asking for either again is asking someone to re-type what
 * they typed. A photograph can be corrected by the plate-diff flow or a "Fix
 * results" note, and a description can be made more specific.
 */
function isRecheckable(source: LogSource): boolean {
  return source === 'photo' || source === 'text';
}

/** The relative standard error for one log, before it is scaled by calories. */
export function relativeError(log: Pick<UncertainLog, 'source' | 'ai_confidence'>): number {
  const profile = SOURCE_ERROR[log.source] ?? SOURCE_ERROR.manual;
  const confidence =
    typeof log.ai_confidence === 'number' ? clamp01(log.ai_confidence) : ASSUMED_CONFIDENCE;

  return profile.floor + profile.span * (1 - confidence);
}

/** One standard error on a single log's calories. */
export function logSigma(log: UncertainLog): number {
  const calories = Number.isFinite(log.calories) ? Math.max(0, log.calories) : 0;
  return calories * relativeError(log);
}

/**
 * Combine the logs into a band for the whole day.
 *
 * Added in quadrature, which assumes the errors are independent — one meal
 * being over-read says nothing about the next. That is not quite true: a
 * model that reads rice heavy reads it heavy at lunch and at dinner both, and
 * to the extent that happens the real band is wider than this one. The
 * alternative is inventing a correlation coefficient, which would be a number
 * with nothing behind it but a preference, so the assumption is stated here
 * instead and the band is understood as a floor rather than a promise.
 */
export function dayUncertainty(logs: readonly UncertainLog[]): DayUncertainty {
  const sigmas = logs.map((log) => ({ log, sigma: logSigma(log) }));
  const variance = sigmas.reduce((sum, entry) => sum + entry.sigma * entry.sigma, 0);
  const sigmaKcal = Math.sqrt(variance);

  const contributors: LogUncertainty[] = sigmas
    .map(({ log, sigma }) => ({
      id: log.id,
      name: log.name,
      calories: log.calories,
      source: log.source,
      confidence: log.ai_confidence,
      sigmaKcal: sigma,
      share: variance > 0 ? (sigma * sigma) / variance : 0,
      recheckable: isRecheckable(log.source),
    }))
    .sort((a, b) => b.sigmaKcal - a.sigmaKcal);

  const calories = logs.reduce(
    (sum, log) => sum + (Number.isFinite(log.calories) ? log.calories : 0),
    0,
  );

  // Rounded to ten, because a band reported to the nearest calorie makes
  // exactly the claim to precision it exists to withdraw.
  const marginKcal = roundMargin(sigmaKcal);

  return {
    calories,
    sigmaKcal,
    marginKcal,
    low: Math.max(0, Math.round(calories - marginKcal)),
    high: Math.round(calories + marginKcal),
    worthShowing: marginKcal >= MARGIN_WORTH_SHOWING_KCAL,
    contributors,
  };
}

export interface Recheck {
  /** The log to look at again. */
  log: LogUncertainty;
  /** The day's margin as things stand. */
  marginKcal: number;
  /** What it would be once this one is confirmed. */
  improvedMarginKcal: number;
  /** How much narrower that is — what the user buys by bothering. */
  savingKcal: number;
}

/**
 * Which single meal is worth looking at again.
 *
 * This is the whole reason for carrying a band rather than a flat number.
 * Variance adds as squares, so one bad estimate among five good ones
 * dominates the day, and correcting any of the other four would change
 * nothing the user could see. A tracker that nags about every meal equally is
 * asking for work it cannot justify; this asks once, for the one that pays.
 *
 * It answers with the biggest *saving*, not the biggest meal. A large, well
 * identified barcode lunch carries less doubt than a small, hesitant
 * photograph, and doubt is what is being bought back.
 */
export function bestRecheck(day: DayUncertainty): Recheck | null {
  if (!day.worthShowing) return null;

  const variance = day.sigmaKcal * day.sigmaKcal;
  let best: Recheck | null = null;

  for (const log of day.contributors) {
    if (!log.recheckable) continue;

    const confirmed = Math.max(0, log.calories) * CONFIRMED_RELATIVE_SE;
    // Already at least as good as a confirmation would leave it.
    if (confirmed >= log.sigmaKcal) continue;

    const improved = Math.sqrt(
      Math.max(0, variance - log.sigmaKcal * log.sigmaKcal + confirmed * confirmed),
    );

    const improvedMarginKcal = roundMargin(improved);
    const savingKcal = day.marginKcal - improvedMarginKcal;

    if (savingKcal < RECHECK_MIN_SAVING_KCAL) continue;
    if (!best || savingKcal > best.savingKcal) {
      best = { log, marginKcal: day.marginKcal, improvedMarginKcal, savingKcal };
    }
  }

  return best;
}

/** "1,840 ± 210 kcal" */
export function describeRange(day: DayUncertainty): string {
  return `${formatNumber(Math.round(day.calories))} ± ${formatNumber(day.marginKcal)} kcal`;
}

/** The line under the ring, naming what the band is worth doing about. */
export function describeRecheck(recheck: Recheck): string {
  return `Checking ${recheck.log.name} again would narrow today by about ${formatNumber(
    recheck.savingKcal,
  )} kcal.`;
}
