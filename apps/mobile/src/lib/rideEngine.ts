import {
  cyclingBurnPerMinute,
  metForCyclingTier,
  milestonesCrossed,
  nextCyclingTier,
} from '@nutrisnap/core';
import type { CyclingTier } from '@nutrisnap/core';

export interface RideSnapshot {
  running: boolean;
  elapsedSec: number;
  /** Accumulated kcal, unrounded. */
  kcal: number;
  met: number;
  /** kcal per minute, resampled on a slow cadence so the figure can be read. */
  ratePerMin: number;
  /** kcal per minute averaged over the last minute of riding. */
  avgRatePerMin: number;
  tier: CyclingTier;
  /** Null until a usable fix arrives, or while the rider is setting bands by hand. */
  speedMph: number | null;
  /** Whether the band is following the GPS rather than the rider's thumb. */
  auto: boolean;
}

interface RideOptions {
  weightKg: number | null;
  tier: CyclingTier;
  /** Crossed a whole hundred kcal. */
  onMilestone: (kcal: number) => void;
  /** Time for a spoken callout, if they are switched on. */
  onCallout: (kcal: number) => void;
}

/** The display is specified at one second; nothing is gained by ticking faster. */
const TICK_MS = 1000;

/** How often the headline burn rate is resampled, per the brief. */
const RATE_SAMPLE_MS = 5000;

/** The window the rate is compared against. */
const AVERAGE_WINDOW_SEC = 60;

const CALLOUT_INTERVAL_SEC = 300;
const CALLOUT_KCAL_STEP = 100;

/**
 * The ride, kept outside React.
 *
 * A cycling screen updates once a second for an hour, and every one of those
 * updates would otherwise re-render the whole tree — ring, buttons, tier
 * picker and all — to change one number. So the state lives here and
 * components subscribe to the slice they draw: the clock re-renders every
 * second, the calorie figure only when its rounded value moves, the rate only
 * every five seconds, and the ring not at all, because it is driven straight
 * into a Reanimated value on the UI thread.
 *
 * It also owns the things that must not be missed if a render is skipped —
 * the hundred-kcal milestones and the spoken callouts — and reports them
 * through callbacks rather than leaving them to be spotted in a snapshot.
 */
export class RideEngine {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private startedAt: number | null = null;
  private bankedSec = 0;
  private kcal = 0;
  private tier: CyclingTier;
  private weightKg: number | null;

  /** (elapsedSec, kcal) pairs covering the last minute, for the average. */
  private samples: Array<{ sec: number; kcal: number }> = [{ sec: 0, kcal: 0 }];

  private displayedRate = 0;
  private lastRateSampleMs = 0;

  private speedMph: number | null = null;
  private auto = false;

  private milestones = 0;
  private lastCalloutSec = 0;
  private lastCalloutKcal = 0;
  private calloutsOn = false;

  private readonly onMilestone: (kcal: number) => void;
  private readonly onCallout: (kcal: number) => void;

  /** Cached so `getSnapshot` is referentially stable between changes. */
  private snapshot: RideSnapshot;

  constructor(options: RideOptions) {
    this.weightKg = options.weightKg;
    this.tier = options.tier;
    this.onMilestone = options.onMilestone;
    this.onCallout = options.onCallout;
    this.snapshot = this.build();

    // Bound once: useSyncExternalStore requires a stable subscribe.
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): RideSnapshot {
    return this.snapshot;
  }

  get running(): boolean {
    return this.startedAt !== null;
  }

  /** A deliberate choice, so it takes the band off the GPS. */
  setTier(tier: CyclingTier): void {
    this.tier = tier;
    this.auto = false;
    this.publish();
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) this.speedMph = null;
    this.publish();
  }

  /**
   * A speed from the GPS, in mph, or null when there is no usable fix.
   *
   * Only moves the band when the rider has asked it to, and even then through
   * the hysteresis in core — a band that flipped on every wobble would change
   * the MET the calories are accumulating at several times a minute.
   */
  setSpeed(mph: number | null): void {
    this.speedMph = mph;
    if (this.auto && mph !== null) {
      this.tier = nextCyclingTier(this.tier, mph);
    }
    this.publish();
  }

  setWeight(weightKg: number | null): void {
    this.weightKg = weightKg;
    this.publish();
  }

  setCallouts(on: boolean): void {
    this.calloutsOn = on;
    if (on) {
      // Start the clock from now rather than announcing a backlog.
      this.lastCalloutSec = this.elapsed();
      this.lastCalloutKcal = this.kcal;
    }
  }

  start(): void {
    if (this.timer) return;
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.publish();
  }

  pause(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.bankedSec = this.elapsed();
    this.startedAt = null;
    this.publish();
  }

  /** Stops the clock for good and hands back the finished ride. */
  stop(): { elapsedSec: number; kcal: number } {
    this.pause();
    return { elapsedSec: this.bankedSec, kcal: this.kcal };
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private elapsed(): number {
    const leg = this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    return this.bankedSec + leg;
  }

  private tick(): void {
    const sec = this.elapsed();
    const met = metForCyclingTier(this.tier);
    const perMin = cyclingBurnPerMinute(met, this.weightKg);

    // Integrate against the gap actually elapsed rather than assuming the
    // interval fired on time — a second lost to a slow frame is a second of
    // riding that still happened.
    const previous = this.samples[this.samples.length - 1];
    const deltaSec = previous ? Math.max(0, sec - previous.sec) : 0;
    this.kcal += (perMin / 60) * deltaSec;

    this.samples.push({ sec, kcal: this.kcal });
    while (this.samples.length > 1 && sec - this.samples[0]!.sec > AVERAGE_WINDOW_SEC) {
      this.samples.shift();
    }

    const now = Date.now();
    if (now - this.lastRateSampleMs >= RATE_SAMPLE_MS) {
      this.displayedRate = perMin;
      this.lastRateSampleMs = now;
    }

    const crossed = milestonesCrossed(this.kcal);
    if (crossed > this.milestones) {
      this.milestones = crossed;
      this.onMilestone(crossed * 100);
    }

    if (this.calloutsOn) {
      const dueByTime = sec - this.lastCalloutSec >= CALLOUT_INTERVAL_SEC;
      const dueByBurn = this.kcal - this.lastCalloutKcal >= CALLOUT_KCAL_STEP;
      if (dueByTime || dueByBurn) {
        // Whichever arrived first resets both, so a callout is never followed
        // a second later by its twin.
        this.lastCalloutSec = sec;
        this.lastCalloutKcal = this.kcal;
        this.onCallout(this.kcal);
      }
    }

    this.publish();
  }

  /**
   * kcal per minute over the last minute.
   *
   * Taken from the ends of the window rather than by averaging the samples,
   * so it stays right when the buffer is not yet a full minute long.
   */
  private average(): number {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last) return 0;
    const span = last.sec - first.sec;
    if (span <= 0) return 0;
    return ((last.kcal - first.kcal) / span) * 60;
  }

  private build(): RideSnapshot {
    return {
      running: this.running,
      elapsedSec: this.elapsed(),
      kcal: this.kcal,
      met: metForCyclingTier(this.tier),
      ratePerMin: this.displayedRate,
      avgRatePerMin: this.average(),
      tier: this.tier,
      speedMph: this.speedMph,
      auto: this.auto,
    };
  }

  private publish(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }
}
