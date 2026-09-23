import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Accelerometer, Pedometer } from 'expo-sensors';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import {
  accelerationMagnitude,
  createStepDetector,
  feedStepDetector,
  formatNumber,
  summariseTrackedSession,
  type ExerciseIntensity,
  type TrackableKind,
} from '@nutrisnap/core';
import { ProgressRing } from './ProgressRing';
import { useColors } from '../lib/theme';

export interface FinishedSession {
  steps: number;
  elapsedSec: number;
  distanceM: number;
  speedKmh: number;
  intensity: ExerciseIntensity;
  calories: number;
}

/** Where the session is in its life, which is what the sheet renders from. */
type Phase = 'ready' | 'running' | 'paused' | 'review';

/**
 * Which sensor is doing the counting.
 *
 * `pedometer` is the phone's own hardware counter, and the better of the two
 * when it can be had. `motion` counts footfalls out of the raw accelerometer,
 * which needs no permission and therefore always works.
 */
type Counter = 'pedometer' | 'motion';

/** 50 Hz. Fast enough to resolve a sprinter's footfalls, cheap enough to run for an hour. */
const MOTION_INTERVAL_MS = 20;

const clock = (totalSec: number): string => {
  const whole = Math.max(0, Math.round(totalSec));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * A walk or a run, counted rather than typed.
 *
 * The manual form asks the user to pick an intensity, which is a guess at
 * their own effort made before they have made it. The phone's step counter
 * knows better: steps over elapsed time is a pace, and a pace is an intensity
 * that was measured. That is the whole reason this screen exists.
 *
 * Steps come from the phone's own counter where that is possible. It is not
 * always: Android guards the hardware counter behind ACTIVITY_RECOGNITION,
 * and a host like Expo Go cannot grant it. Rather than refuse to run, the
 * session falls back to counting footfalls out of the accelerometer, which
 * needs no permission anywhere. The screen says which one it is using.
 *
 * The limit that remains, and that the sheet states out loud: neither sensor
 * is delivered while the app is in the background, so the screen is held
 * awake for the duration and a pocketed phone with a dark screen stops
 * counting.
 */
export function TrackedSessionSheet({
  visible,
  kind,
  targetMin,
  heightCm,
  weightKg,
  onClose,
  onFinish,
}: {
  visible: boolean;
  kind: TrackableKind;
  targetMin: number;
  heightCm: number | null;
  weightKg: number | null;
  onClose: () => void;
  onFinish: (session: FinishedSession) => void;
}) {
  const c = useColors();

  const [phase, setPhase] = useState<Phase>('ready');
  const [steps, setSteps] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  /**
   * Null until the sensors have been checked.
   *
   * There is no blocked state any more: if the hardware counter cannot be
   * used, motion counting takes over, so a session always has some way to
   * count steps.
   */
  const [counter, setCounter] = useState<Counter | null>(null);

  /**
   * A session runs in legs, one per start or resume.
   *
   * `watchStepCount` counts from the moment it is subscribed, so a pause has
   * to bank what the leg produced and the next leg starts again from zero.
   * The same goes for the clock, which is measured from wall time per leg
   * rather than by counting ticks — an interval that misses a beat would
   * otherwise quietly shorten the workout.
   */
  const bankedSteps = useRef(0);
  const bankedSec = useRef(0);
  const legStartedAt = useRef<number | null>(null);
  const subscription = useRef<{ remove: () => void } | null>(null);
  /** Survives a pause, so a resumed session does not re-learn gravity. */
  const detector = useRef(createStepDetector());

  // Android stops delivering steps the moment the app leaves the foreground,
  // so the screen stays on for as long as the session is live.
  useKeepAwake();

  /**
   * Pick a counter.
   *
   * The hardware pedometer is tried first and asked for if it can be: it is
   * the more accurate of the two and costs no battery to speak of. Everything
   * else — refused, refused for good, no sensor, or a host like Expo Go that
   * cannot hold ACTIVITY_RECOGNITION at all — falls through to motion
   * counting rather than stopping the session.
   */
  const chooseCounter = useCallback(async (): Promise<Counter> => {
    try {
      if (await Pedometer.isAvailableAsync()) {
        let permission = await Pedometer.getPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) {
          permission = await Pedometer.requestPermissionsAsync();
        }
        if (permission.granted) return 'pedometer';
      }
    } catch {
      // A host that cannot answer for the pedometer at all is just another
      // reason to use the accelerometer.
    }
    return 'motion';
  }, []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    void chooseCounter().then((chosen) => {
      if (!cancelled) setCounter(chosen);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, chooseCounter]);

  // If the user granted activity access while away, take the better sensor
  // for the next session rather than staying on motion out of habit.
  useEffect(() => {
    if (!visible || counter !== 'motion' || phase !== 'ready') return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void Pedometer.getPermissionsAsync()
        .then((permission) => {
          if (permission.granted) setCounter('pedometer');
        })
        .catch(() => {
          // Still no pedometer; motion counting carries on.
        });
    });

    return () => sub.remove();
  }, [visible, counter, phase]);

  const stopCounting = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
  }, []);

  // Reset for the next time, once the sheet is closed.
  useEffect(() => {
    if (visible) return;
    stopCounting();
    setPhase('ready');
    setCounter(null);
    setSteps(0);
    setElapsedSec(0);
    bankedSteps.current = 0;
    bankedSec.current = 0;
    legStartedAt.current = null;
    detector.current = createStepDetector();
  }, [visible, stopCounting]);

  // Tear the subscription down if the sheet is unmounted mid-session.
  useEffect(() => stopCounting, [stopCounting]);

  const targetSec = targetMin * 60;
  const live = phase === 'running';

  // The clock. Wall time per leg, so a dropped tick cannot lose a second.
  useEffect(() => {
    if (!live) return;

    const tick = () => {
      const legSec = legStartedAt.current ? (Date.now() - legStartedAt.current) / 1000 : 0;
      setElapsedSec(bankedSec.current + legSec);
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [live]);

  const session = summariseTrackedSession({ kind, steps, elapsedSec, heightCm, weightKg });

  const pace = `${session.speedKmh.toFixed(1)} km/h · ${session.intensity}`;

  /**
   * The one line under the tiles.
   *
   * Before the session starts it says which sensor is counting, because that
   * is the only moment the answer is actionable. After that it is the pace,
   * which is the number the calories are coming from.
   */
  const status =
    phase === 'ready'
      ? counter === 'motion'
        ? 'Counting footfalls from the motion sensor, since this phone will not hand over its own step counter. Keep the phone on you with the screen on.'
        : 'Using your phone’s step counter. Keep the phone on you with the screen on.'
      : phase === 'review'
        ? `Timer complete · ${pace}`
        : pace;

  /**
   * Only the clock running out finishes a session.
   *
   * A workout is logged when the timer the user set has actually been
   * served, so there is no "finish early" that banks a partial one. Leaving
   * before then abandons it, which the close button says.
   */
  const finish = useCallback(
    () => {
      stopCounting();
      const legSec = legStartedAt.current ? (Date.now() - legStartedAt.current) / 1000 : 0;
      const total = bankedSec.current + legSec;
      bankedSec.current = total;
      bankedSteps.current = steps;
      legStartedAt.current = null;
      setElapsedSec(total);
      setPhase('review');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [steps, stopCounting],
  );

  // The user does not have to watch the clock for the last second.
  useEffect(() => {
    if (live && elapsedSec >= targetSec) finish();
  }, [live, elapsedSec, targetSec, finish]);

  function startLeg() {
    legStartedAt.current = Date.now();

    if (counter === 'pedometer') {
      // Counts from the moment it is subscribed, so the leg starts at zero
      // and the previous legs are added back on.
      subscription.current = Pedometer.watchStepCount(({ steps: legSteps }) => {
        setSteps(bankedSteps.current + legSteps);
      });
    } else {
      Accelerometer.setUpdateInterval(MOTION_INTERVAL_MS);
      subscription.current = Accelerometer.addListener(({ x, y, z }) => {
        // The detector keeps its own running total across legs, so unlike
        // the pedometer there is nothing to add back on.
        const total = feedStepDetector(
          detector.current,
          accelerationMagnitude(x, y, z),
          Date.now(),
        );
        setSteps(total);
      });
    }

    setPhase('running');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function pause() {
    stopCounting();
    const legSec = legStartedAt.current ? (Date.now() - legStartedAt.current) / 1000 : 0;
    bankedSec.current += legSec;
    bankedSteps.current = steps;
    legStartedAt.current = null;
    setPhase('paused');
    void Haptics.selectionAsync();
  }



  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.base['900'] }} edges={['top', 'bottom']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
          }}
        >
          <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: '700' }}>
            {kind === 'run' ? 'Run' : 'Walk'}
          </Text>

          <Pressable
            onPress={() => {
              stopCounting();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close"
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
            <Text style={{ color: c.text.primary, fontSize: 16, lineHeight: 19 }}>✕</Text>
          </Pressable>
        </View>

        {counter === null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.accent.lime} />
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 20 }}>
            <View style={{ alignItems: 'center', marginTop: 24, gap: 20 }}>
              <ProgressRing
                ratio={targetSec > 0 ? elapsedSec / targetSec : 0}
                size={228}
                strokeWidth={16}
                from={c.accent.lime}
                to={c.accent.cyan}
                gradientId="sessionRing"
              >
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: c.text.primary, fontSize: 46, fontWeight: '700' }}>
                    {clock(Math.max(0, targetSec - elapsedSec))}
                  </Text>
                  <Text
                    style={{
                      color: c.text.tertiary,
                      fontSize: 10,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      marginTop: 4,
                    }}
                  >
                    {phase === 'review' ? 'done' : 'left'}
                  </Text>
                  <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 8 }}>
                    of {targetMin} min
                  </Text>
                </View>
              </ProgressRing>

              <View style={{ flexDirection: 'row', alignSelf: 'stretch', gap: 10 }}>
                <Stat label="Steps" value={formatNumber(steps)} />
                <Stat label="Distance" value={`${(session.distanceM / 1000).toFixed(2)} km`} />
                <Stat
                  label="Burned"
                  value={formatNumber(session.calories)}
                  suffix="kcal"
                  tint={c.state.success}
                />
              </View>

              <Text
                style={{
                  color: c.text.tertiary,
                  fontSize: 12,
                  lineHeight: 17,
                  textAlign: 'center',
                }}
              >
                {status}
              </Text>
            </View>

            <View style={{ gap: 10, paddingBottom: 20 }}>
              {phase === 'ready' && (
                <PrimaryButton label="Start" onPress={startLeg} tint={c.accent.lime} />
              )}

              {phase === 'running' && (
                <>
                  <PrimaryButton label="Pause" onPress={pause} tint={c.accent.lime} />
                  <GhostButton label="Abandon" onPress={onClose} />
                </>
              )}

              {phase === 'paused' && (
                <>
                  <PrimaryButton label="Resume" onPress={startLeg} tint={c.accent.lime} />
                  <GhostButton label="Abandon" onPress={onClose} />
                </>
              )}

              {phase === 'review' && (
                <>
                  <PrimaryButton
                    label={`Log ${formatNumber(session.calories)} kcal`}
                    onPress={() => onFinish({ ...session, steps, elapsedSec })}
                    tint={c.accent.lime}
                  />
                  <GhostButton label="Discard" onPress={onClose} />
                </>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Stat({
  label,
  value,
  suffix,
  tint,
}: {
  label: string;
  value: string;
  suffix?: string;
  tint?: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 3,
        paddingVertical: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.glass.border,
        backgroundColor: c.glass.DEFAULT,
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ color: tint ?? c.text.primary, fontSize: 19, fontWeight: '700' }}
      >
        {value}
      </Text>
      <Text style={{ color: c.text.tertiary, fontSize: 11 }}>{suffix ?? label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  tint,
}: {
  label: string;
  onPress: () => void;
  tint: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        height: 54,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint,
      }}
    >
      <Text style={{ color: c.base['900'], fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        height: 50,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: c.glass.border,
      }}
    >
      <Text style={{ color: c.text.secondary, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
