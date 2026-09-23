import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  interpolateColor,
  useAnimatedProps,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { CYCLING_TIERS, formatNumber, type CyclingTier } from '@nutrisnap/core';
import { RideEngine, type RideSnapshot } from '../lib/rideEngine';
import { useRideSpeed, type GpsState } from '../lib/useRideSpeed';
import { useColors } from '../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface FinishedRide {
  elapsedSec: number;
  kcal: number;
  tier: CyclingTier;
}

/**
 * The workout palette.
 *
 * Deliberately not a theme token and deliberately not the app's dark theme:
 * this is a screen read at arm's length in daylight, from a moving bike. Pure
 * black behind neon carries further outdoors than the charcoal-and-lime the
 * rest of the app uses, and it only applies while a ride is actually running
 * — stopped, the sheet goes back to the ordinary theme.
 */
const WORKOUT = {
  bg: '#000000',
  primary: '#39FF14',
  accent: '#FF9500',
  dim: '#9AA0A6',
  track: '#1C1C1E',
} as const;

/** Blue while there is a long way to go, red as the goal is passed. */
const RING_STOPS = ['#2F6BFF', '#FF9500', '#FF2D2D'] as const;

const RING_SIZE = 268;
const RING_STROKE = 18;
const RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const clock = (totalSec: number): string => {
  const whole = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = whole % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, '0')}`
    : `${mm}:${String(sec).padStart(2, '0')}`;
};

/**
 * Subscribe to one slice of the ride.
 *
 * The selector is what keeps this cheap: the store notifies every second, but
 * a component only re-renders when the value it actually draws changes. The
 * calorie figure moves every few seconds, the rate every five, and the tier
 * picker never.
 */
function useRide<T>(engine: RideEngine, select: (snapshot: RideSnapshot) => T): T {
  return useSyncExternalStore(
    engine.subscribe,
    () => select(engine.getSnapshot()),
    () => select(engine.getSnapshot()),
  );
}

/** The headline. Re-renders only when the whole number of kcal changes. */
function CalorieCounter({ engine, active }: { engine: RideEngine; active: boolean }) {
  const c = useColors();
  const kcal = useRide(engine, (s) => Math.floor(s.kcal));

  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        // Tabular figures would be better still, but a fixed width keeps the
        // number from shifting the layout as it grows a digit.
        style={{
          color: active ? WORKOUT.primary : c.text.primary,
          fontSize: 72,
          lineHeight: 80,
          fontWeight: '900',
          letterSpacing: -2,
        }}
        accessibilityLiveRegion="polite"
      >
        {formatNumber(kcal)}
      </Text>
      <Text
        style={{
          color: active ? WORKOUT.dim : c.text.tertiary,
          fontSize: 14,
          fontWeight: '700',
          letterSpacing: 4,
        }}
      >
        KCAL
      </Text>
    </View>
  );
}

/** The clock. The only thing here that really does change every second. */
function Elapsed({ engine, active }: { engine: RideEngine; active: boolean }) {
  const c = useColors();
  const seconds = useRide(engine, (s) => Math.floor(s.elapsedSec));
  return (
    <Text
      style={{
        color: active ? WORKOUT.dim : c.text.tertiary,
        fontSize: 15,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
      }}
    >
      {clock(seconds)}
    </Text>
  );
}

/**
 * Burn rate, against the last minute of riding.
 *
 * The arrow is the point: a bare kcal/min says nothing about whether the
 * rider is working harder or easing off, and that is the one thing they can
 * act on mid-ride.
 */
function BurnRate({ engine, active }: { engine: RideEngine; active: boolean }) {
  const c = useColors();
  const rate = useRide(engine, (s) => Math.round(s.ratePerMin * 10) / 10);
  const average = useRide(engine, (s) => Math.round(s.avgRatePerMin * 10) / 10);

  // A tenth either way is noise, not a trend.
  const delta = rate - average;
  const direction = Math.abs(delta) < 0.15 ? 'level' : delta > 0 ? 'up' : 'down';
  const tint =
    direction === 'level'
      ? active
        ? WORKOUT.dim
        : c.text.tertiary
      : direction === 'up'
        ? active
          ? WORKOUT.primary
          : c.state.success
        : active
          ? WORKOUT.accent
          : c.state.warning;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
      <Text
        style={{
          color: active ? '#FFFFFF' : c.text.primary,
          fontSize: 26,
          fontWeight: '800',
          fontVariant: ['tabular-nums'],
        }}
      >
        {rate.toFixed(1)}
      </Text>
      <Text style={{ color: active ? WORKOUT.dim : c.text.tertiary, fontSize: 14 }}>kcal/min</Text>
      <Text
        style={{ color: tint, fontSize: 16, fontWeight: '800' }}
        accessibilityLabel={
          direction === 'level'
            ? 'Holding steady against the last minute'
            : direction === 'up'
              ? 'Above the last minute'
              : 'Below the last minute'
        }
      >
        {direction === 'level' ? '–' : direction === 'up' ? '▲' : '▼'}
      </Text>
    </View>
  );
}

/**
 * Measured speed, and what it is doing to the band.
 *
 * Shown only while the GPS is feeding the ride: a speed the rider cannot see
 * the provenance of is worse than no speed, because the MET behind their
 * calorie count is riding on it.
 */
function SpeedReadout({
  engine,
  gps,
  active,
  onDisable,
}: {
  engine: RideEngine;
  gps: GpsState;
  active: boolean;
  onDisable: () => void;
}) {
  const c = useColors();
  const speed = useRide(engine, (s) =>
    s.speedMph === null ? null : Math.round(s.speedMph * 10) / 10,
  );
  const auto = useRide(engine, (s) => s.auto);

  const dim = active ? WORKOUT.dim : c.text.tertiary;

  if (gps === 'denied') {
    return (
      <Pressable onPress={onDisable} accessibilityRole="button" hitSlop={8}>
        <Text style={{ color: dim, fontSize: 12, textAlign: 'center' }}>
          No location access — set the band by hand below.
        </Text>
      </Pressable>
    );
  }

  if (gps === 'off') {
    return <Text style={{ color: dim, fontSize: 12 }}>Band set by hand</Text>;
  }

  if (speed === null) {
    return <Text style={{ color: dim, fontSize: 12 }}>Finding you…</Text>;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Text
        style={{
          color: active ? WORKOUT.accent : c.text.secondary,
          fontSize: 17,
          fontWeight: '800',
          fontVariant: ['tabular-nums'],
        }}
      >
        {speed.toFixed(1)}
      </Text>
      <Text style={{ color: dim, fontSize: 12 }}>mph{auto ? ' · auto band' : ''}</Text>
    </View>
  );
}

/**
 * The ring.
 *
 * Never re-renders. The engine pushes progress straight into a shared value
 * and Reanimated carries both the sweep and the colour on the UI thread, so a
 * ride an hour long costs React nothing at all after mount.
 */
function GoalRing({
  engine,
  goalKcal,
  glow,
  active,
  children,
}: {
  engine: RideEngine;
  goalKcal: number;
  glow: SharedValue<number>;
  active: boolean;
  children: React.ReactNode;
}) {
  const c = useColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    const push = () => {
      const ratio = goalKcal > 0 ? engine.getSnapshot().kcal / goalKcal : 0;
      progress.value = withTiming(Math.min(1, Math.max(0, ratio)), {
        // Matched to the tick, so the sweep is continuous rather than steppy.
        duration: 1000,
        easing: Easing.linear,
      });
    };
    push();
    return engine.subscribe(push);
  }, [engine, goalKcal, progress]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
    stroke: interpolateColor(progress.value, [0, 0.6, 1], [...RING_STOPS]),
  }));

  const glowProps = useAnimatedProps(() => ({
    opacity: glow.value * 0.55,
    strokeWidth: RING_STROKE + glow.value * 14,
  }));

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={active ? WORKOUT.track : c.glass.border}
          strokeWidth={RING_STROKE}
        />

        {/* The milestone halo, sitting under the arc so it reads as light
            coming off it rather than a second ring. */}
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={WORKOUT.primary}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={glowProps}
        />

        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={arcProps}
        />
      </Svg>

      <View style={{ position: 'absolute', alignItems: 'center' }}>{children}</View>
    </View>
  );
}

/**
 * The four bands.
 *
 * Subscribes to the engine rather than holding the selection itself, because
 * the GPS can move it too — two sources of truth would show a rider one band
 * while their calories accrued at another.
 */
function TierPicker({ engine, active }: { engine: RideEngine; active: boolean }) {
  const c = useColors();
  const tier = useRide(engine, (s) => s.tier);

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {CYCLING_TIERS.map((band) => {
        const selected = band.value === tier;
        return (
          <Pressable
            key={band.value}
            onPress={() => {
              void Haptics.selectionAsync();
              engine.setTier(band.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${band.label} miles per hour`}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: selected
                ? active
                  ? WORKOUT.primary
                  : c.accent.lime
                : active
                  ? WORKOUT.track
                  : c.glass.border,
              backgroundColor: selected
                ? active
                  ? 'rgba(57,255,20,0.14)'
                  : c.glass.strong
                : 'transparent',
            }}
          >
            <Text
              style={{
                color: selected
                  ? active
                    ? WORKOUT.primary
                    : c.text.primary
                  : active
                    ? WORKOUT.dim
                    : c.text.secondary,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              {band.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RideSheet({
  visible,
  weightKg,
  goalKcal,
  initialTier,
  onClose,
  onFinish,
}: {
  visible: boolean;
  weightKg: number | null;
  goalKcal: number;
  initialTier: CyclingTier;
  onClose: () => void;
  onFinish: (ride: FinishedRide) => void;
}) {
  const c = useColors();
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [voice, setVoice] = useState(false);

  const glow = useSharedValue(0);

  // Held awake for the same reason the walk screen is: a dark screen is a
  // screen nobody can read from a bike.
  useKeepAwake();

  /**
   * Milestones and callouts come through refs.
   *
   * The engine outlives any one render, so handing it a closure over state
   * would leave it announcing a stale figure an hour into a ride.
   */
  const milestone = useRef((kcal: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    glow.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 620, easing: Easing.in(Easing.quad) }),
    );
    void kcal;
  });

  const callout = useRef((kcal: number) => {
    void Speech.speak(`You've burned ${Math.round(kcal)} calories`, { rate: 1.0 });
  });

  const engine = useMemo(
    () =>
      new RideEngine({
        weightKg,
        tier: initialTier,
        onMilestone: (kcal) => milestone.current(kcal),
        onCallout: (kcal) => callout.current(kcal),
      }),
    // The parent mounts this only for the length of a ride, so one engine per
    // mount is one engine per ride.
    [weightKg, initialTier],
  );

  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => engine.setCallouts(voice), [engine, voice]);

  const [wantGps, setWantGps] = useState(true);
  const gps = useRideSpeed(engine, wantGps);

  // The moment the GPS is off or refused, the band goes back to being the
  // rider's to set.
  useEffect(() => {
    engine.setAuto(gps === 'live' || gps === 'searching');
  }, [engine, gps]);

  // Nothing should still be talking after the rider has left.
  useEffect(() => () => void Speech.stop(), []);

  const toggle = useCallback(() => {
    if (engine.running) {
      engine.pause();
      setRunning(false);
    } else {
      engine.start();
      setRunning(true);
      setStarted(true);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [engine]);

  const stop = useCallback(() => {
    const ride = engine.stop();
    void Speech.stop();
    setRunning(false);
    onFinish({ ...ride, tier: engine.getSnapshot().tier });
  }, [engine, onFinish]);

  // Requirement six: the high-contrast palette is on only while riding.
  const active = running;
  const background = active ? WORKOUT.bg : c.base['900'];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={['top', 'bottom']}>
        {/* Minimal chrome: what it is, how long, and a way out. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 22,
            paddingTop: 6,
          }}
        >
          <Elapsed engine={engine} active={active} />

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close without saving"
            hitSlop={12}
          >
            <Text style={{ color: active ? WORKOUT.dim : c.text.tertiary, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 }}>
          <GoalRing engine={engine} goalKcal={goalKcal} glow={glow} active={active}>
            <CalorieCounter engine={engine} active={active} />
          </GoalRing>

          <BurnRate engine={engine} active={active} />

          <SpeedReadout
            engine={engine}
            gps={gps}
            active={active}
            onDisable={() => setWantGps(false)}
          />

          <Text style={{ color: active ? WORKOUT.dim : c.text.tertiary, fontSize: 13 }}>
            Goal {formatNumber(goalKcal)} kcal
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 14, paddingBottom: 10 }}>
          {/* Speed band. Follows the GPS when there is one, and a tap takes
              it back — a ride is not one intensity, and the MET band is what
              the whole calorie count turns on. */}
          <TierPicker engine={engine} active={active} />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 4,
            }}
          >
            <Text
              style={{
                color: active ? WORKOUT.dim : c.text.secondary,
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              Voice callouts
            </Text>
            <Switch
              value={voice}
              onValueChange={setVoice}
              accessibilityLabel="Speak your total every five minutes or hundred calories"
              trackColor={{ true: active ? WORKOUT.primary : c.accent.lime, false: WORKOUT.track }}
            />
          </View>

          {/* Pinned to the bottom, where a thumb already is. */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={toggle}
              accessibilityRole="button"
              style={{
                flex: 2,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? WORKOUT.primary : c.accent.lime,
              }}
            >
              <Text style={{ color: '#000000', fontSize: 19, fontWeight: '800' }}>
                {running ? 'Pause' : started ? 'Resume' : 'Start'}
              </Text>
            </Pressable>

            <Pressable
              onPress={stop}
              disabled={!started}
              accessibilityRole="button"
              accessibilityLabel="Stop and log this ride"
              style={{
                flex: 1,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: active ? WORKOUT.accent : c.glass.borderStrong,
                opacity: started ? 1 : 0.4,
              }}
            >
              <Text
                style={{
                  color: active ? WORKOUT.accent : c.text.primary,
                  fontSize: 17,
                  fontWeight: '800',
                }}
              >
                Stop
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
