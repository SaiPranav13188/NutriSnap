import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import {
  SET_CATEGORIES,
  caloriesForSet,
  formatNumber,
  type LoggedSet,
  type SetCategory,
} from '@nutrisnap/core';
import { useColors } from '../lib/theme';

/** How long the per-set toast stays up, per the brief. */
const TOAST_MS = 3000;

/** Offered when a rest period starts; the rider can still cut it short. */
const REST_SECONDS = 90;

const clock = (totalSec: number): string => {
  const whole = Math.max(0, Math.round(totalSec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** A logged set, plus the moment it finished — which is what orders them. */
export type TimedSet = LoggedSet & { endedAt: string };

export interface FinishedStrengthSession {
  sets: TimedSet[];
  activeSeconds: number;
  totalSeconds: number;
  startedAt: string;
}

/**
 * A strength workout, set by set.
 *
 * The screen shows three things and no more: the running total, what the
 * last set added, and — once a rest starts — the countdown. Everything else
 * is either below the fold or behind the rest overlay, because a phone
 * propped against a rack is read in glances.
 *
 * The clock that matters here is the working one. A set is timed from "start
 * set" to "done", and rest is excluded entirely: timing a session end to end
 * would count the two minutes between sets as effort and roughly treble the
 * figure.
 */
export function StrengthSessionSheet({
  visible,
  bodyWeightKg,
  onClose,
  onFinish,
}: {
  visible: boolean;
  bodyWeightKg: number | null;
  onClose: () => void;
  onFinish: (session: FinishedStrengthSession) => void;
}) {
  const c = useColors();

  const [exercise, setExercise] = useState('');
  const [category, setCategory] = useState<SetCategory>('strength');
  const [reps, setReps] = useState('');
  const [load, setLoad] = useState('');

  const [sets, setSets] = useState<TimedSet[]>([]);
  const [setRunning, setSetRunning] = useState(false);
  const [setSeconds, setSetSeconds] = useState(0);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const startedAt = useRef(new Date().toISOString());
  const sessionStart = useRef(Date.now());
  const setStartedAt = useRef<number | null>(null);

  useKeepAwake();

  const total = sets.reduce((sum, set) => sum + set.calories, 0);
  const activeSeconds = sets.reduce((sum, set) => sum + set.activeSeconds, 0);

  // The working clock for the set in progress.
  useEffect(() => {
    if (!setRunning) return;
    const tick = () => {
      setSetSeconds(setStartedAt.current ? (Date.now() - setStartedAt.current) / 1000 : 0);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [setRunning]);

  // The rest countdown.
  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRestLeft(null);
      return;
    }
    const timer = setTimeout(() => setRestLeft((left) => (left === null ? null : left - 1)), 1000);
    return () => clearTimeout(timer);
  }, [restLeft]);

  // The toast fades itself out.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Sets counted per exercise, so each one numbers its own sets. */
  const setNumberFor = useCallback(
    (name: string) => sets.filter((set) => set.exercise === name).length + 1,
    [sets],
  );

  function beginSet() {
    if (!exercise.trim()) return;
    setStartedAt.current = Date.now();
    setSetSeconds(0);
    setSetRunning(true);
    setRestLeft(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function endSet() {
    if (!setRunning || setStartedAt.current === null) return;

    const seconds = Math.max(1, Math.round((Date.now() - setStartedAt.current) / 1000));
    const name = exercise.trim();
    const setNumber = setNumberFor(name);
    const calories = caloriesForSet({ category, activeSeconds: seconds, bodyWeightKg });

    const logged: TimedSet = {
      endedAt: new Date().toISOString(),
      exercise: name,
      category,
      setNumber,
      reps: reps ? Number(reps) : null,
      weightKg: load ? Number(load) : null,
      activeSeconds: seconds,
      calories,
    };

    setSets((current) => [...current, logged]);
    setSetRunning(false);
    setStartedAt.current = null;
    setSetSeconds(0);
    setToast(`+${calories.toFixed(1)} kcal — ${name}, Set ${setNumber}`);

    // A finished set is the start of a rest, which is the whole reason the
    // rest timer does not need a button of its own.
    setRestLeft(REST_SECONDS);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const resting = restLeft !== null;

  /** Requirement five: the total dims behind the countdown rather than going. */
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(resting ? 1 : 0, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [resting, dim]);

  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - dim.value * 0.75 }));

  const loaded = useMemo(
    () => SET_CATEGORIES.find((option) => option.value === category)?.loaded ?? false,
    [category],
  );

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
          <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>Strength</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Abandon this session"
            hitSlop={12}
          >
            <Text style={{ color: c.text.tertiary, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        {/* Session total, pinned. */}
        <Animated.View style={[{ alignItems: 'center', paddingTop: 10 }, dimStyle]}>
          <Text style={{ color: c.text.tertiary, fontSize: 12, letterSpacing: 2 }}>
            SESSION TOTAL
          </Text>
          <Text
            style={{ color: c.accent.lime, fontSize: 56, fontWeight: '900', letterSpacing: -1 }}
            accessibilityLiveRegion="polite"
          >
            {formatNumber(Math.round(total))}
            <Text style={{ color: c.text.tertiary, fontSize: 18, fontWeight: '600' }}> kcal</Text>
          </Text>
          <Text style={{ color: c.text.tertiary, fontSize: 12 }}>
            {sets.length} set{sets.length === 1 ? '' : 's'} · {Math.round(activeSeconds / 60)} min
            working
          </Text>
        </Animated.View>

        {resting ? (
          <RestPanel
            left={restLeft ?? 0}
            onSkip={() => setRestLeft(null)}
            onAdd={() => setRestLeft((left) => (left ?? 0) + 30)}
          />
        ) : (
          <>
            <SetForm
              exercise={exercise}
              onExercise={setExercise}
              category={category}
              onCategory={setCategory}
              reps={reps}
              onReps={setReps}
              load={load}
              onLoad={setLoad}
              loaded={loaded}
              running={setRunning}
              seconds={setSeconds}
              onBegin={beginSet}
              onEnd={endSet}
            />

            <SetList sets={sets} />
          </>
        )}

        {toast && (
          <Animated.View
            entering={FadeInDown.springify().damping(16)}
            exiting={FadeOut.duration(400)}
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: 96,
              paddingVertical: 13,
              paddingHorizontal: 18,
              borderRadius: 18,
              backgroundColor: c.accent.lime,
            }}
            pointerEvents="none"
            accessibilityLiveRegion="polite"
          >
            <Text style={{ color: c.base['900'], fontSize: 14, fontWeight: '700' }}>{toast}</Text>
          </Animated.View>
        )}

        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Pressable
            onPress={() =>
              onFinish({
                sets,
                activeSeconds: Math.round(activeSeconds),
                totalSeconds: Math.round((Date.now() - sessionStart.current) / 1000),
                startedAt: startedAt.current,
              })
            }
            disabled={sets.length === 0}
            accessibilityRole="button"
            style={{
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.glass.strong,
              borderWidth: 1,
              borderColor: c.glass.border,
              opacity: sets.length === 0 ? 0.4 : 1,
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>
              Finish workout
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** The countdown, which owns the screen while it runs. */
function RestPanel({
  left,
  onSkip,
  onAdd,
}: {
  left: number;
  onSkip: () => void;
  onAdd: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <Text style={{ color: c.text.secondary, fontSize: 13, letterSpacing: 3 }}>REST</Text>
      <Text
        style={{
          color: c.text.primary,
          fontSize: 92,
          fontWeight: '900',
          fontVariant: ['tabular-nums'],
        }}
      >
        {clock(left)}
      </Text>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          style={{
            paddingHorizontal: 22,
            paddingVertical: 13,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.glass.border,
          }}
        >
          <Text style={{ color: c.text.secondary, fontSize: 15, fontWeight: '600' }}>+30s</Text>
        </Pressable>

        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          style={{
            paddingHorizontal: 26,
            paddingVertical: 13,
            borderRadius: 999,
            backgroundColor: c.accent.lime,
          }}
        >
          <Text style={{ color: c.base['900'], fontSize: 15, fontWeight: '700' }}>
            Skip rest
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SetForm({
  exercise,
  onExercise,
  category,
  onCategory,
  reps,
  onReps,
  load,
  onLoad,
  loaded,
  running,
  seconds,
  onBegin,
  onEnd,
}: {
  exercise: string;
  onExercise: (value: string) => void;
  category: SetCategory;
  onCategory: (value: SetCategory) => void;
  reps: string;
  onReps: (value: string) => void;
  load: string;
  onLoad: (value: string) => void;
  loaded: boolean;
  running: boolean;
  seconds: number;
  onBegin: () => void;
  onEnd: () => void;
}) {
  const c = useColors();

  const field = {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.glass.border,
    backgroundColor: c.glass.DEFAULT,
    color: c.text.primary,
    fontSize: 15,
    paddingHorizontal: 14,
  } as const;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 10 }}>
      <TextInput
        value={exercise}
        onChangeText={onExercise}
        editable={!running}
        placeholder="Exercise — e.g. Bench press"
        placeholderTextColor={c.text.tertiary}
        maxLength={120}
        style={field}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SET_CATEGORIES.map((option) => {
          const selected = option.value === category;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                void Haptics.selectionAsync();
                onCategory(option.value);
              }}
              disabled={running}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 9,
                borderRadius: 12,
                backgroundColor: selected ? c.accent.lime : c.glass.DEFAULT,
                opacity: running ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: selected ? c.base['900'] : c.text.secondary,
                  fontSize: 12,
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
          value={reps}
          onChangeText={(text) => onReps(text.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder="Reps"
          placeholderTextColor={c.text.tertiary}
          keyboardType="number-pad"
          style={[field, { flex: 1 }]}
        />
        {/* Requirement eight: a load is asked for only where there is one to
            give, and never required — the category carries the intensity. */}
        <TextInput
          value={load}
          onChangeText={(text) => onLoad(text.replace(/[^0-9.]/g, '').slice(0, 6))}
          placeholder={loaded ? 'kg (optional)' : 'Bodyweight'}
          placeholderTextColor={c.text.tertiary}
          keyboardType="decimal-pad"
          editable={loaded}
          style={[field, { flex: 1, opacity: loaded ? 1 : 0.5 }]}
        />
      </View>

      <Pressable
        onPress={running ? onEnd : onBegin}
        disabled={!running && !exercise.trim()}
        accessibilityRole="button"
        style={{
          height: 58,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: running ? c.state.danger : c.accent.lime,
          opacity: !running && !exercise.trim() ? 0.4 : 1,
        }}
      >
        <Text
          style={{
            color: running ? '#FFFFFF' : c.base['900'],
            fontSize: 17,
            fontWeight: '800',
          }}
        >
          {running ? `Done — ${clock(seconds)}` : 'Start set'}
        </Text>
      </Pressable>
    </View>
  );
}

/** Everything logged so far, newest at the top. */
function SetList({ sets }: { sets: TimedSet[] }) {
  const c = useColors();

  if (sets.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20 }}>
        <Text style={{ color: c.text.tertiary, fontSize: 13, textAlign: 'center' }}>
          Name a movement and start your first set.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, marginTop: 14 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 8 }}
    >
      {[...sets].reverse().map((set, i) => (
        <Animated.View
          key={`${set.exercise}-${set.setNumber}-${i}`}
          entering={FadeInDown.duration(220)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 13,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.glass.border,
            backgroundColor: c.glass.DEFAULT,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: c.text.primary, fontSize: 14, fontWeight: '600' }}>
              {set.exercise}
            </Text>
            <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 2 }}>
              Set {set.setNumber}
              {set.reps ? ` · ${set.reps} reps` : ''}
              {set.weightKg ? ` · ${set.weightKg} kg` : ''}
              {` · ${clock(set.activeSeconds)}`}
            </Text>
          </View>

          <Text style={{ color: c.state.success, fontSize: 14, fontWeight: '700' }}>
            {set.calories.toFixed(1)}
          </Text>
        </Animated.View>
      ))}
    </ScrollView>
  );
}
