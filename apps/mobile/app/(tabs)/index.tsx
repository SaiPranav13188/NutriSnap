import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EMPTY_TOTALS, ringProgress, type DailyTarget, type FoodLog, type MacroTotals } from '@nutrisnap/core';
import { colors, macroGradients } from '@nutrisnap/ui';
import { api, ApiError, type DayTotals } from '../../src/lib/api';
import { AnimatedNumber, Button, Card, ErrorNote, Screen } from '../../src/components/ui';
import { ProgressRing } from '../../src/components/ProgressRing';
import { clearStoredAnswers, readStoredAnswers } from '../../src/lib/session';

export default function Dashboard() {
  const [totals, setTotals] = useState<MacroTotals>(EMPTY_TOTALS);
  const [targets, setTargets] = useState<DailyTarget | null>(null);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [week, setWeek] = useState<DayTotals[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Flush a quiz completed before sign-up, if one is waiting.
      const pending = await readStoredAnswers();
      if (pending) {
        try {
          await api.completeOnboarding(pending as Record<string, unknown>);
          await clearStoredAnswers();
        } catch {
          // Retried on the next load rather than lost.
        }
      }

      const [day, weekData, streakData] = await Promise.all([
        api.getDay(),
        api.getWeek(7),
        api.getStreak(),
      ]);

      setTotals(day.totals);
      setTargets(day.targets);
      setLogs(day.logs);
      setWeek(weekData.days);
      setStreak(streakData.streak.current_streak);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your day.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the tab regains focus, so a meal logged on the Scan tab
  // shows up immediately.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.lime} />
        </View>
      </Screen>
    );
  }

  const calories = ringProgress(totals.calories, targets?.calories ?? 0);

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={colors.accent.lime}
            />
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: colors.text.secondary, fontSize: 14 }}>Today</Text>
              <Text style={{ color: colors.text.primary, fontSize: 26, fontWeight: '700' }}>Your day</Text>
            </View>

            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 }}>
              <Text style={{ fontSize: 15 }}>🔥</Text>
              <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{streak}</Text>
            </Card>
          </View>

          {error && <ErrorNote message={error} />}

          {!targets ? (
            <Card style={{ padding: 24, gap: 14, alignItems: 'center' }}>
              <Text style={{ color: colors.text.primary, fontSize: 19, fontWeight: '600', textAlign: 'center' }}>
                Let&apos;s build your plan
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Answer a few questions and we&apos;ll set your daily calorie and macro targets.
              </Text>
              <Button onPress={() => router.push('/onboarding')} style={{ alignSelf: 'stretch' }}>
                Start the quiz
              </Button>
            </Card>
          ) : (
            <>
              <Card style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {week.map((day) => {
                    const date = new Date(`${day.day}T12:00:00Z`);
                    const ratio =
                      targets.calories > 0 ? Math.min(1, day.calories / targets.calories) : 0;
                    return (
                      <View key={day.day} style={{ alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getUTCDay()]}
                        </Text>
                        <ProgressRing
                          ratio={ratio}
                          size={34}
                          strokeWidth={3}
                          from={ratio >= 1 ? colors.accent.lime : colors.accent.cyan}
                          to={ratio >= 1 ? colors.accent.lime : colors.accent.cyan}
                          gradientId={`week-${day.day}`}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '600' }}>
                            {date.getUTCDate()}
                          </Text>
                        </ProgressRing>
                      </View>
                    );
                  })}
                </View>
              </Card>

              <Card style={{ padding: 24, alignItems: 'center', gap: 28 }}>
                <ProgressRing
                  ratio={calories.ratio}
                  size={230}
                  strokeWidth={17}
                  from={colors.accent.lime}
                  to={colors.accent.cyan}
                  gradientId="calorieRing"
                >
                  <View style={{ alignItems: 'center' }}>
                    <AnimatedNumber
                      value={Math.abs(Math.round(calories.remaining))}
                      style={{
                        color: calories.over ? colors.state.danger : colors.text.primary,
                        fontSize: 50,
                        fontWeight: '700',
                      }}
                    />
                    <Text
                      style={{
                        color: colors.text.secondary,
                        fontSize: 11,
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                        marginTop: 6,
                      }}
                    >
                      {calories.over ? 'over' : 'remaining'}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 8 }}>
                      {Math.round(totals.calories)} / {Math.round(targets.calories)} kcal
                    </Text>
                  </View>
                </ProgressRing>

                <View style={{ flexDirection: 'row', gap: 20 }}>
                  {(
                    [
                      { key: 'protein', label: 'Protein', eaten: totals.protein_g, target: targets.protein_g },
                      { key: 'carbs', label: 'Carbs', eaten: totals.carbs_g, target: targets.carbs_g },
                      { key: 'fat', label: 'Fat', eaten: totals.fat_g, target: targets.fat_g },
                    ] as const
                  ).map((macro, i) => {
                    const progress = ringProgress(macro.eaten, macro.target);
                    return (
                      <View key={macro.key} style={{ alignItems: 'center', gap: 6 }}>
                        <ProgressRing
                          ratio={progress.ratio}
                          size={72}
                          strokeWidth={6}
                          from={macroGradients[macro.key].from}
                          to={macroGradients[macro.key].to}
                          delay={140 + i * 90}
                          gradientId={`macro-${macro.key}`}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                            {Math.round(macro.eaten)}g
                          </Text>
                        </ProgressRing>
                        <Text style={{ color: colors.macro[macro.key], fontSize: 11, fontWeight: '600' }}>
                          {macro.label}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 10 }}>
                          {Math.max(0, Math.round(progress.remaining))}g left
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>

              <Button onPress={() => router.push('/(tabs)/scan')}>Scan a meal</Button>
            </>
          )}

          <Text
            style={{
              color: colors.text.secondary,
              fontSize: 12,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginTop: 8,
            }}
          >
            Recently uploaded
          </Text>

          {logs.length === 0 ? (
            <Card style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: colors.text.secondary }}>Nothing logged yet.</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 4 }}>
                Snap your next meal and it will show up here.
              </Text>
            </Card>
          ) : (
            logs.map((log, i) => (
              <Animated.View key={log.id} entering={FadeInDown.delay(i * 60)}>
                <Pressable
                  onLongPress={async () => {
                    try {
                      await api.deleteLog(log.id);
                      void load();
                    } catch {
                      setError('Could not delete that meal.');
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityHint="Long press to delete this meal"
                >
                  <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                        {log.name}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                        <Text style={{ color: colors.accent.lime, fontSize: 13, fontWeight: '700' }}>
                          {Math.round(log.calories)} kcal
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                          P {Math.round(log.protein_g)}g
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                          C {Math.round(log.carbs_g)}g
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                          F {Math.round(log.fat_g)}g
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                      {new Date(log.logged_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </Card>
                </Pressable>
              </Animated.View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
