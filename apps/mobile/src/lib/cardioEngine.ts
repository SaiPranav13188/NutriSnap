import {
  cardioProfile,
  emptyZoneTotals,
  keytelCaloriesPerMinute,
  metForCardio,
  paceFromDistance,
  zoneForHeartRate,
  type CardioActivity,
  type ZoneTotals,
} from '@nutrisnap/core';

/** Where a calorie figure came from, which the screen states rather than implies. */
export type CalorieSource = 'heart-rate' | 'met';

export interface IntervalPlan {
  workSec: number;
  restSec: number;
}

export interface CardioSnapshot {
  running: boolean;
  elapsedSec: number;
  kcal: number;
  source: CalorieSource;

  heartRate: number | null;
  zone: 1 | 2 | 3 | 4 | 5 | null;
  maxHr: number;

  distanceM: number;
  paceMinPerKm: number | null;

  /** Seconds and calories accumulated in each zone, for the summary. */
  zoneSeconds: ZoneTotals;
  zoneKcal: ZoneTotals;

  /** Null when interval mode is off. */
  interval: {
    phase: 'work' | 'rest';
    secondsLeft: number;
    round: number;
    /** Calories burned inside work phases only, kept apart from the total. */
    workKcal: number;
  } | null;
}

interface CardioOptions {
  activity: CardioActivity;
  weightKg: number | null;
  age: number | null;
  gender: 'male' | 'female' | 'other';
  maxHr: number;
  onIntervalChange: (phase: 'work' | 'rest', round: number) => void;
}

const TICK_MS = 1000;
const DEFAULT_WEIGHT_KG = 70;
const DEFAULT_AGE = 30;

/**
 * A cardio session, kept outside React.
 *
 * Same reasoning as the ride screen: one number changing every second for
 * forty minutes should not re-render a tree. Components subscribe to the
 * slice they draw, so the counter re-renders when its rounded value moves,
 * the zone bar only when the zone changes, and the interval bar is driven
 * straight into a Reanimated value.
 *
 * It also owns the choice between the two calorie models. A heart rate, when
 * there is one, measures the effort; a MET assumes it. The engine switches
 * the moment a reading arrives and reports which one it used, because a
 * figure that silently changed basis mid-session would be worse than either.
 */
export class CardioEngine {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private startedAt: number | null = null;
  private bankedSec = 0;
  private kcal = 0;

  private activity: CardioActivity;
  private weightKg: number | null;
  private age: number | null;
  private gender: 'male' | 'female' | 'other';
  private maxHr: number;

  private heartRate: number | null = null;
  private distanceM = 0;

  private zoneSeconds = emptyZoneTotals();
  private zoneKcal = emptyZoneTotals();

  private plan: IntervalPlan | null = null;
  private phase: 'work' | 'rest' = 'work';
  private phaseLeft = 0;
  private round = 1;
  private workKcal = 0;

  private readonly onIntervalChange: (phase: 'work' | 'rest', round: number) => void;

  private snapshot: CardioSnapshot;

  constructor(options: CardioOptions) {
    this.activity = options.activity;
    this.weightKg = options.weightKg;
    this.age = options.age;
    this.gender = options.gender;
    this.maxHr = options.maxHr;
    this.onIntervalChange = options.onIntervalChange;

    this.snapshot = this.build();
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): CardioSnapshot {
    return this.snapshot;
  }

  get running(): boolean {
    return this.startedAt !== null;
  }

  setActivity(activity: CardioActivity): void {
    this.activity = activity;
    this.publish();
  }

  /** Null clears the reading, which drops the session back to MET. */
  setHeartRate(bpm: number | null): void {
    this.heartRate = bpm && bpm > 0 ? bpm : null;
    this.publish();
  }

  setMaxHr(maxHr: number): void {
    this.maxHr = maxHr;
    this.publish();
  }

  /** Metres covered, from GPS or a machine. Monotonic. */
  setDistance(metres: number): void {
    this.distanceM = Math.max(this.distanceM, metres);
    this.publish();
  }

  setIntervals(plan: IntervalPlan | null): void {
    this.plan = plan;
    if (plan) {
      this.phase = 'work';
      this.phaseLeft = plan.workSec;
      this.round = 1;
    }
    this.publish();
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

  stop(): CardioSnapshot {
    this.pause();
    return this.snapshot;
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

  private pace(): number | null {
    return paceFromDistance(this.distanceM, this.elapsed());
  }

  /** kcal per minute right now, and which model produced it. */
  private rate(): { perMin: number; source: CalorieSource } {
    const kg = this.weightKg && this.weightKg > 0 ? this.weightKg : DEFAULT_WEIGHT_KG;

    if (this.heartRate) {
      return {
        perMin: keytelCaloriesPerMinute({
          heartRate: this.heartRate,
          weightKg: kg,
          age: this.age && this.age > 0 ? this.age : DEFAULT_AGE,
          gender: this.gender,
        }),
        source: 'heart-rate',
      };
    }

    const met = metForCardio(this.activity, { paceMinPerKm: this.pace() });
    return { perMin: (met * kg) / 60, source: 'met' };
  }

  private tick(): void {
    const sec = this.elapsed();
    const previous = this.bankedSecAtLastTick;
    const deltaSec = Math.max(0, sec - previous);
    this.bankedSecAtLastTick = sec;

    const { perMin } = this.rate();
    const burned = (perMin / 60) * deltaSec;
    this.kcal += burned;

    // Time and calories in zone, which is what the summary is made of.
    if (this.heartRate) {
      const zone = zoneForHeartRate(this.heartRate, this.maxHr);
      this.zoneSeconds[zone] += deltaSec;
      this.zoneKcal[zone] += burned;
    }

    if (this.plan) {
      // Work calories are banked separately so the summary can say what the
      // efforts cost as against the whole session.
      if (this.phase === 'work') this.workKcal += burned;

      this.phaseLeft -= deltaSec;
      if (this.phaseLeft <= 0) {
        if (this.phase === 'work') {
          this.phase = 'rest';
          this.phaseLeft = this.plan.restSec;
        } else {
          this.phase = 'work';
          this.phaseLeft = this.plan.workSec;
          this.round += 1;
        }
        this.onIntervalChange(this.phase, this.round);
      }
    }

    this.publish();
  }

  /** Where the integrator got to, so a dropped tick cannot lose a second. */
  private bankedSecAtLastTick = 0;

  private build(): CardioSnapshot {
    const { source } = this.rate();

    return {
      running: this.running,
      elapsedSec: this.elapsed(),
      kcal: this.kcal,
      source,
      heartRate: this.heartRate,
      zone: this.heartRate ? zoneForHeartRate(this.heartRate, this.maxHr) : null,
      maxHr: this.maxHr,
      distanceM: this.distanceM,
      paceMinPerKm: this.pace(),
      zoneSeconds: { ...this.zoneSeconds },
      zoneKcal: { ...this.zoneKcal },
      interval: this.plan
        ? {
            phase: this.phase,
            secondsLeft: Math.max(0, this.phaseLeft),
            round: this.round,
            workKcal: this.workKcal,
          }
        : null,
    };
  }

  private publish(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }

  /** The profile, for anything the screen needs to label. */
  get profile() {
    return cardioProfile(this.activity);
  }
}
