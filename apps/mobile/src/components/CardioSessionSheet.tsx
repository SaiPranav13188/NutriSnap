import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import {
  CARDIO_ACTIVITIES,
  CARDIO_STAT_LABELS,
  cardioProfile,
  compareCalorieSources,
  formatNumber,
  formatPace,
  maxHeartRate,
  type CardioActivity,
  type CardioStat,
} from '@nutrisnap/core';
import { CardioEngine, type CardioSnapshot } from '../lib/cardioEngine';
import { useCardioDistance } from '../lib/useCardioDistance';
import { useColors } from '../lib/theme';

/**
 * Zone colours, blue through red.
 *
 * Fixed rather than themed: a zone bar whose colours moved with the theme
 * would stop being a shared language, and these five are what every other
 * piece of training kit uses.
 */
export const ZONE_COLORS = ['#2F6BFF', '#22C55E', '#EAB308', '#F97316', '#EF4444'] as const;

const clock = (totalSec: number): string => {
  const whole = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
};

export interface FinishedCardio {
  activity: CardioActivity;
  snapshot: CardioSnapshot;
  machineKcal: number | null;
}

function useCardio<T>(engine: CardioEngine, select: (snapshot: CardioSnapshot) => T): T {
  return useSyncExternalStore(
    engine.subscribe,
    () => select(engine.getSnapshot()),
    () => select(engine.getSnapshot()),
  );
}

/** Focal point one. Re-renders only when the whole number changes. */
function CalorieCounter({ engine }: { engine: CardioEngine }) {
  const c = useColors();
  const kcal = useCardio(engine, (s) => Math.floor(s.kcal));
  const source = useCardio(engine, (s) => s.source);

  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={{
          color: c.text.primary,
          fontSize: 78,
          lineHeight: 86,
          fontWeight: '900',
          letterSpacing: -2,
        }}
        accessibilityLiveRegion="polite"
      >
        {formatNumber(kcal)}
      </Text>
      <Text style={{ color: c.text.tertiary, fontSize: 13, fontWeight: '700', letterSpacing: 4 }}>
        KCAL
      </Text>
      {/* Which model produced that number. A figure that quietly changed
          basis mid-session would be worse than either one alone. */}
      <Text style={{ color: c.text.tertiary, fontSize: 11, marginTop: 4 }}>
        {source === 'heart-rate' ? 'from heart rate' : 'estimated from effort'}
      </Text>
    </View>
  );
}

/**
 * Focal point two, and only when there is a heart rate to draw it from.
 *
 * Requirement two: with no sensor the bar is hidden outright rather than
 * shown empty, because an empty zone bar reads as "zone 1" at a glance.
 */
function ZoneBar({ engine }: { engine: CardioEngine }) {
  const c = useColors();
  const zone = useCardio(engine, (s) => s.zone);
  const hr = useCardio(engine, (s) => s.heartRate);
  const maxHr = useCardio(engine, (s) => s.maxHr);

  if (zone === null || hr === null) return null;

  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
        <Text
          style={{
            color: ZONE_COLORS[zone - 1],
            fontSize: 30,
            fontWeight: '900',
            fontVariant: ['tabular-nums'],
          }}
        >
          {hr}
        </Text>
        <Text style={{ color: c.text.tertiary, fontSize: 13 }}>
          bpm · zone {zone} · {Math.round((hr / maxHr) * 100)}% max
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Heart rate zone ${zone}`}>
        {ZONE_COLORS.map((color, i) => {
          const active = i + 1 === zone;
          return (
            <View
              key={color}
              style={{
                flex: 1,
                height: active ? 14 : 8,
                borderRadius: 7,
                backgroundColor: color,
                opacity: active ? 1 : 0.25,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Focal point three: whichever two readings this machine actually has. */
function SecondaryStats({
  engine,
  activity,
  manual,
}: {
  engine: CardioEngine;
  activity: CardioActivity;
  /** Readings a machine reports that the phone cannot work out itself. */
  manual: Partial<Record<CardioStat, string>>;
}) {
  const c = useColors();
  const distanceM = useCardio(engine, (s) => Math.round(s.distanceM));
  const pace = useCardio(engine, (s) => s.paceMinPerKm);

  const profile = cardioProfile(activity);

  const read = (stat: CardioStat): string => {
    switch (stat) {
      case 'pace':
        return formatPace(pace);
      case 'distance':
        return (distanceM / 1000).toFixed(2);
      default:
        return manual[stat] || '—';
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignSelf: 'stretch', gap: 12 }}>
      {profile.stats.map((stat) => (
        <View
          key={stat}
          style={{
            flex: 1,
            alignItems: 'center',
            gap: 2,
            paddingVertical: 14,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: c.glass.border,
            backgroundColor: c.glass.DEFAULT,
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              color: c.text.primary,
              fontSize: 26,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
            }}
          >
            {read(stat)}
          </Text>
          <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
            {CARDIO_STAT_LABELS[stat].label}
            {CARDIO_STAT_LABELS[stat].unit ? ` ${CARDIO_STAT_LABELS[stat].unit}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The work/rest bar, pinned above everything while interval mode is on.
 *
 * Driven straight into a shared value: it is the one element that has to move
 * smoothly rather than step once a second.
 */
function IntervalBar({ engine, plan }: { engine: CardioEngine; plan: { workSec: number; restSec: number } }) {
  const c = useColors();
  const phase = useCardio(engine, (s) => s.interval?.phase ?? 'work');
  const left = useCardio(engine, (s) => Math.ceil(s.interval?.secondsLeft ?? 0));
  const round = useCardio(engine, (s) => s.interval?.round ?? 1);
  const workKcal = useCardio(engine, (s) => Math.round(s.interval?.workKcal ?? 0));

  const progress = useSharedValue(1);
  const total = phase === 'work' ? plan.workSec : plan.restSec;

  useEffect(() => {
    progress.value = withTiming(total > 0 ? left / total : 0, {
      duration: 1000,
      easing: Easing.linear,
    });
  }, [left, total, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, progress.value) * 100}%` }));
  const tint = phase === 'work' ? c.accent.lime : c.accent.cyan;

  return (
    <View style={{ paddingHorizontal: 20, gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: tint, fontSize: 13, fontWeight: '800', letterSpacing: 2 }}>
          {phase === 'work' ? 'WORK' : 'REST'} · ROUND {round}
        </Text>
        <Text style={{ color: c.text.tertiary, fontSize: 13, fontWeight: '600' }}>
          {left}s · {formatNumber(workKcal)} kcal working
        </Text>
      </View>

      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.glass.DEFAULT, overflow: 'hidden' }}>
        <Animated.View style={[{ height: '100%', borderRadius: 5, backgroundColor: tint }, fill]} />
      </View>
    </View>
  );
}

export function CardioSessionSheet({
  visible,
  weightKg,
  age,
  gender,
  onClose,
  onFinish,
}: {
  visible: boolean;
  weightKg: number | null;
  age: number | null;
  gender: 'male' | 'female' | 'other';
  onClose: () => void;
  onFinish: (result: FinishedCardio) => void;
}) {
  const c = useColors();

  const [activity, setActivity] = useState<CardioActivity>('run');
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [showSetup, setShowSetup] = useState(true);

  const [hrText, setHrText] = useState('');
  const [maxHrText, setMaxHrText] = useState('');
  const [machineText, setMachineText] = useState('');
  const [manual, setManual] = useState<Partial<Record<CardioStat, string>>>({});

  const [intervals, setIntervals] = useState(false);
  const plan = useMemo(() => ({ workSec: 30, restSec: 15 }), []);

  useKeepAwake();

  const onIntervalChange = useRef((phase: 'work' | 'rest') => {
    void Haptics.notificationAsync(
      phase === 'work'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
  });

  const engine = useMemo(
    () =>
      new CardioEngine({
        activity: 'run',
        weightKg,
        age,
        gender,
        maxHr: maxHeartRate(age),
        onIntervalChange: (phase) => onIntervalChange.current(phase),
      }),
    [weightKg, age, gender],
  );

  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => engine.setActivity(activity), [engine, activity]);
  useEffect(() => engine.setIntervals(intervals ? plan : null), [engine, intervals, plan]);

  // Requirement two's fallback: with no sensor, a typed reading still drives
  // the zones and the heart-rate formula. A strap needs Bluetooth, which is
  // the one thing Expo Go cannot reach.
  useEffect(() => {
    const bpm = Number(hrText);
    engine.setHeartRate(hrText && bpm > 0 ? bpm : null);
  }, [engine, hrText]);

  useEffect(() => {
    const entered = Number(maxHrText);
    engine.setMaxHr(maxHeartRate(age, maxHrText && entered > 0 ? entered : null));
  }, [engine, maxHrText, age]);

  // Distance and pace come from GPS only where the activity actually moves
  // through the world; a treadmill goes nowhere, so its figures are typed.
  const outdoors = cardioProfile(activity).outdoors;
  const gps = useCardioDistance(engine, outdoors && running);

  const machineKcal = machineText ? Number(machineText) : null;
  const ourKcal = useCardio(engine, (s) => Math.round(s.kcal));
  const divergence =
    machineKcal !== null && machineKcal > 0 ? compareCalorieSources(ourKcal, machineKcal) : null;

  const toggle = useCallback(() => {
    if (engine.running) {
      engine.pause();
      setRunning(false);
    } else {
      engine.start();
      setRunning(true);
      setStarted(true);
      setShowSetup(false);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [engine]);

  const stop = useCallback(() => {
    const snapshot = engine.stop();
    setRunning(false);
    onFinish({ activity, snapshot, machineKcal });
  }, [engine, activity, machineKcal, onFinish]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.base['900'] }} edges={['top', 'bottom']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 6,
          }}
        >
          <Elapsed engine={engine} />
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
            <Text style={{ color: c.text.tertiary, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        {intervals && <IntervalBar engine={engine} plan={plan} />}

        {/* Three focal points and nothing else competing with them. */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 26, paddingHorizontal: 20 }}>
          <CalorieCounter engine={engine} />
          <ZoneBar engine={engine} />
          <SecondaryStats engine={engine} activity={activity} manual={manual} />

          {outdoors && started && gps !== 'live' && (
            <Text style={{ color: c.text.tertiary, fontSize: 12, textAlign: 'center' }}>
              {gps === 'denied'
                ? 'No location access — distance and pace will stay blank.'
                : 'Finding you…'}
            </Text>
          )}

          {divergence?.diverged && (
            <Text
              style={{ color: c.state.warning, fontSize: 12, textAlign: 'center', lineHeight: 17 }}
            >
              The machine says {formatNumber(machineKcal!)} kcal —{' '}
              {Math.round(divergence.ratio * 100)}% apart from this estimate.
            </Text>
          )}
        </View>

        {showSetup && !started && (
          <SetupPanel
            activity={activity}
            onActivity={setActivity}
            hrText={hrText}
            onHr={setHrText}
            maxHrText={maxHrText}
            onMaxHr={setMaxHrText}
            machineText={machineText}
            onMachine={setMachineText}
            manual={manual}
            onManual={setManual}
            intervals={intervals}
            onIntervals={setIntervals}
            outdoors={outdoors}
          />
        )}

        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 14 }}>
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            style={{
              flex: 2,
              height: 62,
              borderRadius: 31,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent.lime,
            }}
          >
            <Text style={{ color: c.base['900'], fontSize: 18, fontWeight: '800' }}>
              {running ? 'Pause' : started ? 'Resume' : 'Start'}
            </Text>
          </Pressable>

          <Pressable
            onPress={stop}
            disabled={!started}
            accessibilityRole="button"
            accessibilityLabel="Finish and log this session"
            style={{
              flex: 1,
              height: 62,
              borderRadius: 31,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: c.glass.borderStrong,
              opacity: started ? 1 : 0.4,
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '800' }}>Finish</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Elapsed({ engine }: { engine: CardioEngine }) {
  const c = useColors();
  const seconds = useCardio(engine, (s) => Math.floor(s.elapsedSec));
  return (
    <Text
      style={{
        color: c.text.tertiary,
        fontSize: 15,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
      }}
    >
      {clock(seconds)}
    </Text>
  );
}

/** Everything that is set before starting, and hidden the moment it does. */
function SetupPanel({
  activity,
  onActivity,
  hrText,
  onHr,
  maxHrText,
  onMaxHr,
  machineText,
  onMachine,
  manual,
  onManual,
  intervals,
  onIntervals,
  outdoors,
}: {
  activity: CardioActivity;
  onActivity: (value: CardioActivity) => void;
  hrText: string;
  onHr: (value: string) => void;
  maxHrText: string;
  onMaxHr: (value: string) => void;
  machineText: string;
  onMachine: (value: string) => void;
  manual: Partial<Record<CardioStat, string>>;
  onManual: (value: Partial<Record<CardioStat, string>>) => void;
  intervals: boolean;
  onIntervals: (value: boolean) => void;
  outdoors: boolean;
}) {
  const c = useColors();

  const field = {
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: c.glass.border,
    backgroundColor: c.glass.DEFAULT,
    color: c.text.primary,
    fontSize: 15,
    paddingHorizontal: 13,
  } as const;

  const digits = (text: string): string => text.replace(/[^0-9.]/g, '').slice(0, 5);
  const profile = cardioProfile(activity);
  const typedStats = profile.stats.filter((stat) => stat !== 'pace' && stat !== 'distance');

  return (
    <View style={{ paddingHorizontal: 20, gap: 10, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CARDIO_ACTIVITIES.map((option) => {
          const selected = option.value === activity;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                void Haptics.selectionAsync();
                onActivity(option.value);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: selected ? c.accent.lime : c.glass.DEFAULT,
              }}
            >
              <Text
                style={{
                  color: selected ? c.base['900'] : c.text.secondary,
                  fontSize: 13,
                  fontWeight: '700',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          value={hrText}
          onChangeText={(t) => onHr(digits(t))}
          placeholder="Heart rate"
          placeholderTextColor={c.text.tertiary}
          keyboardType="number-pad"
          style={[field, { flex: 1 }]}
        />
        <TextInput
          value={maxHrText}
          onChangeText={(t) => onMaxHr(digits(t))}
          placeholder="Max HR"
          placeholderTextColor={c.text.tertiary}
          keyboardType="number-pad"
          style={[field, { flex: 1 }]}
        />
      </View>

      {typedStats.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {typedStats.map((stat) => (
            <TextInput
              key={stat}
              value={manual[stat] ?? ''}
              onChangeText={(t) => onManual({ ...manual, [stat]: digits(t) })}
              placeholder={CARDIO_STAT_LABELS[stat].label}
              placeholderTextColor={c.text.tertiary}
              keyboardType="number-pad"
              style={[field, { flex: 1 }]}
            />
          ))}
        </View>
      )}

      <TextInput
        value={machineText}
        onChangeText={(t) => onMachine(digits(t))}
        placeholder="Machine kcal (optional) — compared against ours"
        placeholderTextColor={c.text.tertiary}
        keyboardType="number-pad"
        style={field}
      />

      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Text style={{ color: c.text.secondary, fontSize: 14, fontWeight: '600' }}>
          Intervals — 30s work / 15s rest
        </Text>
        <Switch value={intervals} onValueChange={onIntervals} trackColor={{ true: c.accent.lime }} />
      </View>

      {!outdoors && (
        <Text style={{ color: c.text.tertiary, fontSize: 11, lineHeight: 16 }}>
          Indoors, so pace and distance come from what you type rather than GPS. A heart rate
          switches the calorie maths from an estimate to a measurement.
        </Text>
      )}
    </View>
  );
}
