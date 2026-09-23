import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  CYCLING_TIERS,
  EXERCISE_INTENSITIES,
  EXERCISE_KINDS,
  ageInYears,
  cardioProfile,
  describeTrackedSession,
  estimateCaloriesBurned,
  formatNumber,
  isTrackableKind,
  type CyclingTier,
  type ExerciseIntensity,
  type ExerciseKind,
} from '@nutrisnap/core';
import { api, ApiError, type ExerciseLog } from '../src/lib/api';
import { Button, Card, ErrorNote, Screen } from '../src/components/ui';
import {
  TrackedSessionSheet,
  type FinishedSession,
} from '../src/components/TrackedSessionSheet';
import { RideSheet, type FinishedRide } from '../src/components/RideSheet';
import {
  StrengthSessionSheet,
  type FinishedStrengthSession,
} from '../src/components/StrengthSessionSheet';
import { StrengthSummaryCard } from '../src/components/StrengthSummaryCard';
import { CardioSessionSheet, type FinishedCardio } from '../src/components/CardioSessionSheet';
import { CardioSummaryCard } from '../src/components/CardioSummaryCard';
import { useColors } from '../src/lib/theme';

/**
 * Log a workout.
 *
 * This is what turns "Burned" on the Progress tab from an assumption into
 * something recorded. The calorie figure is still an estimate — MET times body
 * weight times duration — and the screen says so rather than letting a number
 * that came from a formula pass for one that came from a sensor.
 */

/** Quick picks. Not defaults — nothing is selected until the user chooses. */
const DURATIONS = [1, 5, 10, 20, 30, 45];

/** Mirrors the duration_min check constraint on exercise_logs. */
const MAX_DURATION_MIN = 1440;

/** The cycling ride screen's calorie target, before the rider changes it. */
const DEFAULT_RIDE_GOAL_KCAL = 500;

const RIDE_GOALS = [250, 500, 750, 1000];

/** Cycling gets a live ride screen of its own; nothing else does. */
const isRideKind = (kind: ExerciseKind): boolean => kind === 'cycle';

/** Strength gets a set-by-set session screen; nothing else does. */
const isLiftKind = (kind: ExerciseKind): boolean => kind === 'strength';

/** Cardio gets a live zone-and-pace screen; nothing else does. */
const isCardioKind = (kind: ExerciseKind): boolean => kind === 'cardio';

const clampDuration = (minutes: number): number =>
  Math.min(MAX_DURATION_MIN, Math.max(1, Math.round(minutes)));

export default function Exercise() {
  const c = useColors();

  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [totals, setTotals] = useState({ calories: 0, minutes: 0 });
  const [weightKg, setWeightKg] = useState<number | null>(null);
  // Stride length comes off height, so a tracked walk needs it to turn steps
  // into distance.
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [riding, setRiding] = useState(false);
  const [rideGoal, setRideGoal] = useState(DEFAULT_RIDE_GOAL_KCAL);
  const [rideTier, setRideTier] = useState<CyclingTier>('steady');

  const [lifting, setLifting] = useState(false);
  /** The finished session, held while its summary card is up. */
  const [summary, setSummary] = useState<FinishedStrengthSession | null>(null);
  /** Totals of the last five sessions, for the card's rolling comparison. */
  const [recentSessions, setRecentSessions] = useState<number[]>([]);

  const [doingCardio, setDoingCardio] = useState(false);
  const [cardioSummary, setCardioSummary] = useState<FinishedCardio | null>(null);
  /** The heart-rate formula needs both; neither is on the exercise screen otherwise. */
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ExerciseKind>('walk');
  const [intensity, setIntensity] = useState<ExerciseIntensity>('moderate');
  /**
   * Null until the user sets it.
   *
   * There is no sensible default here: a preset thirty minutes is a number
   * the app made up, and for a tracked session it is the length of the timer
   * the user is about to run. Better to have them say.
   */
  const [duration, setDuration] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Settled rather than all: the body weight drives the burn estimate, and
      // losing it because the workout list failed would quietly swap the user
      // for a 70kg stranger in every calculation on this screen.
      const [day, profile] = await Promise.allSettled([api.getExercise(), api.getProfile()]);

      if (profile.status === 'fulfilled') {
        const row = profile.value.profile;
        setWeightKg(row.current_weight_kg ?? null);
        setHeightCm(row.height_cm ?? null);
        setAge(row.date_of_birth ? ageInYears(new Date(row.date_of_birth)) : null);
        setGender(row.gender ?? 'other');
      }

      if (day.status === 'fulfilled') {
        setLogs(day.value.logs);
        setTotals({ calories: day.value.total_calories, minutes: day.value.total_minutes });
      } else {
        const caught = day.reason;
        setError(
          caught instanceof ApiError ? caught.message : 'Could not load your workouts.',
        );
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your workouts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Shown live as the form changes, so the effect of picking "vigorous" over
  // "light" is visible before saving rather than after.
  const estimate = estimateCaloriesBurned({
    kind,
    intensity,
    durationMin: duration ?? 0,
    weightKg,
  });

  function pickDuration(minutes: number | null) {
    void Haptics.selectionAsync();
    setDuration(minutes === null ? null : clampDuration(minutes));
  }

  /** A minute at a time, from whatever is set — or from one if nothing is. */
  function nudgeDuration(delta: number) {
    void Haptics.selectionAsync();
    setDuration((current) => clampDuration((current ?? 0) + delta));
  }

  function typeDuration(text: string) {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
    const minutes = Number(digits);
    // An empty field is "not set yet" rather than zero, so the button stays
    // disabled instead of offering a workout of no length.
    setDuration(digits && minutes >= 1 ? clampDuration(minutes) : null);
  }

  const kindMeta = EXERCISE_KINDS.find((k) => k.value === kind);

  async function save() {
    if (duration === null) return;
    setSaving(true);
    setError(null);
    try {
      await api.addExercise({
        name: name.trim() || (kindMeta?.label ?? 'Workout'),
        kind,
        intensity,
        duration_min: duration,
      });
      setDuration(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that workout.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Save what the pedometer counted.
   *
   * The calorie figure goes with the request rather than being left for the
   * server to estimate: the route stores a supplied value verbatim, which is
   * the point of having measured the pace instead of guessing at it.
   */
  async function saveTracked(session: FinishedSession) {
    setTracking(false);
    setSaving(true);
    setError(null);
    try {
      await api.addExercise({
        name: name.trim() || (kindMeta?.label ?? 'Workout'),
        kind,
        intensity: session.intensity,
        // The column is a whole number of minutes with a floor of one, so a
        // session cut short after forty seconds still records as a minute
        // rather than failing a constraint the user never saw.
        duration_min: Math.max(1, Math.round(session.elapsedSec / 60)),
        calories_burned: session.calories,
        notes: describeTrackedSession(session.steps, session),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that workout.');
    } finally {
      setSaving(false);
    }
  }

  /** Save a finished ride. Same contract as a tracked walk: measured, not estimated. */
  async function saveRide(ride: FinishedRide) {
    setRiding(false);
    if (ride.elapsedSec < 30) {
      // Under half a minute there is nothing worth a row in the log, and the
      // column would round it to a minute that was never ridden.
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const band = CYCLING_TIERS.find((option) => option.value === ride.tier);
      await api.addExercise({
        name: name.trim() || 'Cycling',
        kind: 'cycle',
        duration_min: Math.max(1, Math.round(ride.elapsedSec / 60)),
        calories_burned: Math.round(ride.kcal),
        notes: band ? `${band.label} mph · ${band.met} MET` : null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that ride.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Save a finished strength session.
   *
   * The sets go to their own tables so the session can be read back set by
   * set later, and the API writes the matching exercise_logs row itself —
   * "Burned today" and the calorie budget read from there and should not have
   * to learn about a second source.
   */
  async function saveStrength(session: FinishedStrengthSession) {
    setLifting(false);
    setSaving(true);
    setError(null);
    try {
      await api.saveStrengthSession({
        active_seconds: session.activeSeconds,
        total_seconds: session.totalSeconds,
        started_at: session.startedAt,
        sets: session.sets.map((set) => ({
          exercise: set.exercise,
          category: set.category,
          set_number: set.setNumber,
          reps: set.reps,
          weight_kg: set.weightKg,
          active_seconds: set.activeSeconds,
          // Stored to two places, so a session keeps the figure it was
          // logged with rather than drifting if the MET table is retuned.
          calories: Math.round(set.calories * 100) / 100,
          logged_at: set.endedAt,
        })),
      });

      // Read the comparison window back after saving, and drop the session
      // just written so the card measures against what came before it.
      try {
        const { sessions } = await api.getStrengthSessions(6);
        setRecentSessions(sessions.slice(1).map((row) => row.total_kcal));
      } catch {
        // No comparison is better than a wrong one; the card says so.
        setRecentSessions([]);
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSummary(session);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that session.');
    } finally {
      setSaving(false);
    }
  }

  /** Save a finished cardio session. Measured, so the figure travels with it. */
  async function saveCardio(result: FinishedCardio) {
    setDoingCardio(false);
    if (result.snapshot.elapsedSec < 30) return;

    setSaving(true);
    setError(null);
    try {
      const { snapshot } = result;
      const profile = cardioProfile(result.activity);
      const parts = [
        profile.label,
        snapshot.source === 'heart-rate' ? 'heart rate' : 'estimated',
        snapshot.distanceM > 0 ? `${(snapshot.distanceM / 1000).toFixed(2)} km` : null,
      ].filter(Boolean);

      await api.addExercise({
        name: name.trim() || profile.label,
        kind: 'cardio',
        duration_min: Math.max(1, Math.round(snapshot.elapsedSec / 60)),
        calories_burned: Math.round(snapshot.kcal),
        notes: parts.join(' · '),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName('');
      setCardioSummary(result);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that session.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteExercise(id);
      await load();
    } catch {
      setError('Could not delete that workout.');
    }
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 20,
            paddingTop: 8,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: c.glass.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 18, lineHeight: 20 }}>‹</Text>
          </Pressable>

          <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '700' }}>Movement</Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.accent.lime} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {error && <ErrorNote message={error} />}

            <Card style={{ padding: 20, flexDirection: 'row' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.text.tertiary, fontSize: 13 }}>Burned today</Text>
                <Text style={{ color: c.state.success, fontSize: 26, fontWeight: '700' }}>
                  {formatNumber(totals.calories)}
                  <Text style={{ color: c.text.tertiary, fontSize: 13, fontWeight: '500' }}>
                    {' '}
                    kcal
                  </Text>
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.text.tertiary, fontSize: 13 }}>Active minutes</Text>
                <Text style={{ color: c.text.primary, fontSize: 26, fontWeight: '700' }}>
                  {totals.minutes}
                </Text>
              </View>
            </Card>

            <Card style={{ padding: 20, gap: 16 }}>
              <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
                Add a workout
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {EXERCISE_KINDS.map((option) => {
                  const selected = option.value === kind;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setKind(option.value);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 13,
                        paddingVertical: 9,
                        borderRadius: 999,
                        backgroundColor: selected ? c.accent.lime : c.glass.DEFAULT,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{option.icon}</Text>
                      <Text
                        style={{
                          color: selected ? c.base['900'] : c.text.secondary,
                          fontSize: 13,
                          fontWeight: '600',
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={`Name (optional) — e.g. "${kindMeta?.label ?? 'Workout'}"`}
                placeholderTextColor={c.text.tertiary}
                maxLength={200}
                style={{
                  height: 50,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: c.glass.border,
                  backgroundColor: c.glass.DEFAULT,
                  color: c.text.primary,
                  fontSize: 15,
                  paddingHorizontal: 15,
                }}
              />

              {/* A tracked walk or run works its intensity out from the pace
                  it measures, and cycling reads it off the speed band, so
                  neither has anything to ask the user here. */}
              {!isTrackableKind(kind) && !isRideKind(kind) && !isLiftKind(kind) && !isCardioKind(kind) && (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: c.text.secondary, fontSize: 13 }}>Intensity</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {EXERCISE_INTENSITIES.map((option) => {
                      const selected = option.value === intensity;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setIntensity(option.value);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={{
                            flex: 1,
                            alignItems: 'center',
                            paddingVertical: 10,
                            borderRadius: 14,
                            backgroundColor: selected ? c.glass.strong : c.glass.DEFAULT,
                            borderWidth: 1,
                            borderColor: selected ? c.accent.lime : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              color: selected ? c.text.primary : c.text.secondary,
                              fontSize: 13,
                              fontWeight: selected ? '700' : '500',
                            }}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {isLiftKind(kind) || isCardioKind(kind) ? null : isRideKind(kind) ? (
                <View style={{ gap: 10 }}>
                  <Text style={{ color: c.text.secondary, fontSize: 13 }}>Calorie goal</Text>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {RIDE_GOALS.map((goal) => {
                      const selected = goal === rideGoal;
                      return (
                        <Pressable
                          key={goal}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setRideGoal(goal);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={{
                            flex: 1,
                            alignItems: 'center',
                            paddingVertical: 10,
                            borderRadius: 14,
                            backgroundColor: selected ? c.accent.lime : c.glass.DEFAULT,
                          }}
                        >
                          <Text
                            style={{
                              color: selected ? c.base['900'] : c.text.secondary,
                              fontSize: 13,
                              fontWeight: '600',
                            }}
                          >
                            {goal}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={{ color: c.text.secondary, fontSize: 13, marginTop: 4 }}>
                    Starting pace
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {CYCLING_TIERS.map((band) => {
                      const selected = band.value === rideTier;
                      return (
                        <Pressable
                          key={band.value}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setRideTier(band.value);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${band.label} miles per hour`}
                          style={{
                            flex: 1,
                            alignItems: 'center',
                            gap: 2,
                            paddingVertical: 9,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: selected ? c.accent.lime : c.glass.border,
                            backgroundColor: selected ? c.glass.strong : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              color: selected ? c.text.primary : c.text.secondary,
                              fontSize: 13,
                              fontWeight: '700',
                            }}
                          >
                            {band.label}
                          </Text>
                          <Text style={{ color: c.text.tertiary, fontSize: 10 }}>
                            {band.met} MET
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={{ color: c.text.tertiary, fontSize: 11, lineHeight: 16 }}>
                    mph. You can change band while riding — calories follow whichever
                    one is set at the time.
                  </Text>
                </View>
              ) : (
              <View style={{ gap: 10 }}>
                <Text style={{ color: c.text.secondary, fontSize: 13 }}>
                  {isTrackableKind(kind) ? 'Set the timer' : 'Duration'}
                </Text>

                {/* A minute at a time either side of a field you can type
                    into. The chips below are shortcuts, not the range — a
                    one-minute session is two taps from here. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable
                    onPress={() => nudgeDuration(-1)}
                    disabled={duration === null || duration <= 1}
                    accessibilityRole="button"
                    accessibilityLabel="One minute less"
                    hitSlop={6}
                    style={{
                      ...stepperStyle(c.glass.border),
                      opacity: duration === null || duration <= 1 ? 0.35 : 1,
                    }}
                  >
                    <Text style={{ color: c.text.primary, fontSize: 22, lineHeight: 26 }}>
                      −
                    </Text>
                  </Pressable>

                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput
                      value={duration === null ? '' : String(duration)}
                      onChangeText={typeDuration}
                      placeholder="—"
                      placeholderTextColor={c.text.tertiary}
                      keyboardType="number-pad"
                      maxLength={4}
                      textAlign="center"
                      selectTextOnFocus
                      accessibilityLabel="Duration in minutes"
                      style={{
                        alignSelf: 'stretch',
                        height: 54,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: duration === null ? c.glass.border : c.accent.lime,
                        backgroundColor: c.glass.DEFAULT,
                        color: c.text.primary,
                        fontSize: 24,
                        fontWeight: '700',
                      }}
                    />
                    <Text style={{ color: c.text.tertiary, fontSize: 11, marginTop: 4 }}>
                      minutes
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => nudgeDuration(1)}
                    accessibilityRole="button"
                    accessibilityLabel="One minute more"
                    hitSlop={6}
                    style={stepperStyle(c.glass.border)}
                  >
                    <Text style={{ color: c.text.primary, fontSize: 20, lineHeight: 24 }}>+</Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {DURATIONS.map((minutes) => {
                    const selected = minutes === duration;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => pickDuration(minutes)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          paddingVertical: 9,
                          borderRadius: 14,
                          backgroundColor: selected ? c.accent.lime : c.glass.DEFAULT,
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? c.base['900'] : c.text.secondary,
                            fontSize: 13,
                            fontWeight: '600',
                          }}
                        >
                          {minutes}m
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              )}

              <View
                style={{
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 12,
                  borderRadius: 16,
                  backgroundColor: c.glass.DEFAULT,
                }}
              >
                {isTrackableKind(kind) || isRideKind(kind) || isLiftKind(kind) || isCardioKind(kind) ? (
                  <Text
                    style={{
                      color: c.text.tertiary,
                      fontSize: 12,
                      lineHeight: 17,
                      textAlign: 'center',
                      paddingHorizontal: 12,
                    }}
                  >
                    {isCardioKind(kind)
                      ? 'A heart rate makes this a measurement rather than an estimate; without one it falls back to the activity and your weight.'
                      : isLiftKind(kind)
                      ? 'Each set is timed and counted on its own, and rest is left out of the maths — so there is nothing to estimate up front.'
                      : isRideKind(kind)
                        ? 'Calories build up a second at a time from the speed band you are in, so there is nothing to estimate up front.'
                        : 'Calories are worked out from the steps and the pace the session measures, so there is nothing to estimate up front.'}
                  </Text>
                ) : (
                  <>
                    <Text style={{ color: c.state.success, fontSize: 26, fontWeight: '700' }}>
                      {duration === null ? '—' : `~${formatNumber(estimate)} kcal`}
                    </Text>
                    <Text style={{ color: c.text.tertiary, fontSize: 11, textAlign: 'center' }}>
                      {duration === null
                        ? 'Set a duration to see the estimate.'
                        : 'Estimated from your weight and the effort — not a measurement.'}
                    </Text>
                  </>
                )}
              </View>

              {/* A walk or a run is only ever logged by running the timer out
                  — there is no typed-in version of a measured session, and a
                  ride is the same. */}
              {isCardioKind(kind) ? (
                <Button onPress={() => setDoingCardio(true)} disabled={saving}>
                  {saving ? 'Saving…' : 'Start session'}
                </Button>
              ) : isLiftKind(kind) ? (
                <Button onPress={() => setLifting(true)} disabled={saving}>
                  {saving ? 'Saving…' : 'Start workout'}
                </Button>
              ) : isRideKind(kind) ? (
                <Button onPress={() => setRiding(true)} disabled={saving}>
                  Start ride
                </Button>
              ) : isTrackableKind(kind) ? (
                <Button onPress={() => setTracking(true)} disabled={saving || duration === null}>
                  {duration === null
                    ? 'Set a timer to start'
                    : `Start a ${duration} min ${kindMeta?.label.toLowerCase() ?? 'session'}`}
                </Button>
              ) : (
                <Button onPress={save} disabled={saving || duration === null}>
                  {saving ? 'Saving…' : 'Log this workout'}
                </Button>
              )}
            </Card>

            {logs.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    color: c.text.secondary,
                    fontSize: 12,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 1.2,
                  }}
                >
                  Today
                </Text>

                {logs.map((log, i) => (
                  <Animated.View key={log.id} entering={FadeInDown.delay(i * 50)}>
                    <Pressable
                      onLongPress={() => void remove(log.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${log.name}, ${log.duration_min} minutes`}
                      accessibilityHint="Long press to delete"
                    >
                      <Card
                        style={{
                          padding: 14,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>
                          {EXERCISE_KINDS.find((k) => k.value === log.kind)?.icon ?? '🔥'}
                        </Text>

                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{ color: c.text.primary, fontSize: 15, fontWeight: '500' }}
                          >
                            {log.name}
                          </Text>
                          <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 3 }}>
                            {log.duration_min} min
                            {log.intensity ? ` · ${log.intensity}` : ''}
                            {log.source === 'estimated' ? ' · estimated' : ''}
                          </Text>
                          {log.notes && (
                            <Text
                              numberOfLines={1}
                              style={{ color: c.accent.cyan, fontSize: 11, marginTop: 2 }}
                            >
                              {log.notes}
                            </Text>
                          )}
                        </View>

                        <Text style={{ color: c.state.success, fontSize: 14, fontWeight: '700' }}>
                          {formatNumber(log.calories_burned)}
                        </Text>
                      </Card>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {isTrackableKind(kind) && (
        <TrackedSessionSheet
          visible={tracking}
          kind={kind}
          targetMin={duration ?? 0}
          heightCm={heightCm}
          weightKg={weightKg}
          onClose={() => setTracking(false)}
          onFinish={(session) => void saveTracked(session)}
        />
      )}

      {isRideKind(kind) && riding && (
        <RideSheet
          visible
          weightKg={weightKg}
          goalKcal={rideGoal}
          initialTier={rideTier}
          onClose={() => setRiding(false)}
          onFinish={(ride) => void saveRide(ride)}
        />
      )}

      {isLiftKind(kind) && lifting && (
        <StrengthSessionSheet
          visible
          bodyWeightKg={weightKg}
          onClose={() => setLifting(false)}
          onFinish={(session) => void saveStrength(session)}
        />
      )}

      {isCardioKind(kind) && doingCardio && (
        <CardioSessionSheet
          visible
          weightKg={weightKg}
          age={age}
          gender={gender}
          onClose={() => setDoingCardio(false)}
          onFinish={(result) => void saveCardio(result)}
        />
      )}

      {cardioSummary && (
        <CardioSummaryCard result={cardioSummary} onClose={() => setCardioSummary(null)} />
      )}

      {summary && (
        <StrengthSummaryCard
          visible
          sets={summary.sets}
          totalSeconds={summary.totalSeconds}
          activeSeconds={summary.activeSeconds}
          previousSessionKcal={recentSessions}
          onClose={() => setSummary(null)}
        />
      )}
    </Screen>
  );
}

/** The round − and + either side of the timer field. */
const stepperStyle = (borderColor: string) =>
  ({
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  }) as const;
