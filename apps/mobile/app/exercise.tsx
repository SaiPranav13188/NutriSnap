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
  EXERCISE_INTENSITIES,
  EXERCISE_KINDS,
  estimateCaloriesBurned,
  formatNumber,
  type ExerciseIntensity,
  type ExerciseKind,
} from '@nutrisnap/core';
import { api, ApiError, type ExerciseLog } from '../src/lib/api';
import { Button, Card, ErrorNote, Screen } from '../src/components/ui';
import { useColors } from '../src/lib/theme';

/**
 * Log a workout.
 *
 * This is what turns "Burned" on the Progress tab from an assumption into
 * something recorded. The calorie figure is still an estimate — MET times body
 * weight times duration — and the screen says so rather than letting a number
 * that came from a formula pass for one that came from a sensor.
 */

const DURATIONS = [15, 30, 45, 60, 90];

export default function Exercise() {
  const c = useColors();

  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [totals, setTotals] = useState({ calories: 0, minutes: 0 });
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ExerciseKind>('walk');
  const [intensity, setIntensity] = useState<ExerciseIntensity>('moderate');
  const [duration, setDuration] = useState(30);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [day, profile] = await Promise.all([api.getExercise(), api.getProfile()]);
      setLogs(day.logs);
      setTotals({ calories: day.total_calories, minutes: day.total_minutes });
      setWeightKg(profile.profile.current_weight_kg ?? null);
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
  const estimate = estimateCaloriesBurned({ kind, intensity, durationMin: duration, weightKg });

  const kindMeta = EXERCISE_KINDS.find((k) => k.value === kind);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.addExercise({
        name: name.trim() || (kindMeta?.label ?? 'Workout'),
        kind,
        intensity,
        duration_min: duration,
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

              <View style={{ gap: 8 }}>
                <Text style={{ color: c.text.secondary, fontSize: 13 }}>Duration</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {DURATIONS.map((minutes) => {
                    const selected = minutes === duration;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setDuration(minutes);
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
                          {minutes}m
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View
                style={{
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 12,
                  borderRadius: 16,
                  backgroundColor: c.glass.DEFAULT,
                }}
              >
                <Text style={{ color: c.state.success, fontSize: 26, fontWeight: '700' }}>
                  ~{formatNumber(estimate)} kcal
                </Text>
                <Text style={{ color: c.text.tertiary, fontSize: 11, textAlign: 'center' }}>
                  Estimated from your weight and the effort — not a measurement.
                </Text>
              </View>

              <Button onPress={save} disabled={saving}>
                {saving ? 'Saving…' : 'Log this workout'}
              </Button>
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
    </Screen>
  );
}
