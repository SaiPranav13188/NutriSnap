import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { PROGRESS_RANGES, type ProgressRange } from '@nutrisnap/core';
import { api, ApiError, type ProgressResponse } from '../../src/lib/api';
import { AnimatedNumber, Button, Card, ErrorNote, Screen } from '../../src/components/ui';
import { WeightChart } from '../../src/components/WeightChart';
import { useColors } from '../../src/lib/theme';

export default function Progress() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<ProgressRange>('90d');
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weightInput, setWeightInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [logging, setLogging] = useState(false);

  const load = useCallback(
    async (nextRange: ProgressRange) => {
      setError(null);
      try {
        setData(await api.getProgress(nextRange));
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not load your progress.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void load(range);
    }, [load, range]),
  );

  async function logWeight() {
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value < 25 || value > 400) {
      setError('Enter a weight between 25 and 400 kg.');
      return;
    }

    setLogging(true);
    try {
      await api.logWeight(value);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWeightInput('');
      setShowForm(false);
      await load(range);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that weigh-in.');
    } finally {
      setLogging(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent.lime} />
        </View>
      </Screen>
    );
  }

  const weight = data?.weight;
  const calories = data?.calories;
  const wow = calories?.week_over_week;
  const chartWidth = width - 40 - 36; // screen padding + card padding

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(range);
              }}
              tintColor={c.accent.lime}
            />
          }
        >
          <View>
            <Text style={{ color: c.text.primary, fontSize: 26, fontWeight: '700' }}>Progress</Text>
            <Text style={{ color: c.text.secondary, fontSize: 15, marginTop: 4 }}>
              The long view on where you&apos;re heading.
            </Text>
          </View>

          {error && <ErrorNote message={error} />}

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1, padding: 16 }}>
              <Text style={{ color: c.text.secondary, fontSize: 13 }}>Current weight</Text>
              {weight?.current_kg != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
                  <AnimatedNumber
                    value={weight.current_kg}
                    decimals={1}
                    style={{ color: c.text.primary, fontSize: 30, fontWeight: '700' }}
                  />
                  <Text style={{ color: c.text.secondary, fontSize: 15, marginLeft: 5, marginBottom: 4 }}>
                    kg
                  </Text>
                </View>
              ) : (
                <Text style={{ color: c.text.tertiary, fontSize: 15, marginTop: 10 }}>
                  Not logged yet
                </Text>
              )}

              {weight?.goal_progress != null && weight.goal_kg != null && (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                      Goal {weight.goal_kg} kg
                    </Text>
                    <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                      {Math.round(weight.goal_progress * 100)}%
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: c.glass.DEFAULT,
                      marginTop: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round(weight.goal_progress * 100)}%`,
                        height: '100%',
                        backgroundColor: c.accent.lime,
                      }}
                    />
                  </View>
                </View>
              )}
            </Card>

            <Card style={{ flex: 1, padding: 16 }}>
              <Text style={{ color: c.text.secondary, fontSize: 13 }}>Logging streak</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
                <AnimatedNumber
                  value={data?.streak.current_streak ?? 0}
                  style={{ color: c.text.primary, fontSize: 30, fontWeight: '700' }}
                />
                <Text style={{ color: c.text.secondary, fontSize: 15, marginLeft: 5, marginBottom: 4 }}>
                  {data?.streak.current_streak === 1 ? 'day' : 'days'}
                </Text>
              </View>
              <Text style={{ color: c.text.secondary, fontSize: 12, marginTop: 6 }}>
                Longest: {data?.streak.longest_streak ?? 0} days
              </Text>

              <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
                {Array.from({ length: 7 }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor:
                        i < Math.min(data?.streak.current_streak ?? 0, 7)
                          ? c.accent.lime
                          : c.glass.DEFAULT,
                    }}
                  />
                ))}
              </View>
            </Card>
          </View>

          {showForm ? (
            <Card style={{ padding: 16, gap: 10 }}>
              <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '600' }}>
                Log today&apos;s weight
              </Text>
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder="kg"
                placeholderTextColor={c.text.tertiary}
                autoFocus
                style={{
                  height: 52,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: c.glass.border,
                  backgroundColor: c.glass.DEFAULT,
                  color: c.text.primary,
                  fontSize: 20,
                  textAlign: 'center',
                }}
              />
              <Button onPress={logWeight} loading={logging}>
                Save
              </Button>
              <Button variant="ghost" onPress={() => setShowForm(false)}>
                Cancel
              </Button>
            </Card>
          ) : (
            <Button variant="glass" onPress={() => setShowForm(true)}>
              Log weight
            </Button>
          )}

          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Weight progress
            </Text>

            <View style={{ flexDirection: 'row', gap: 4 }}>
              {PROGRESS_RANGES.map((option) => {
                const active = range === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setRange(option.value);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 999,
                      alignItems: 'center',
                      backgroundColor: active ? c.accent.lime : c.glass.DEFAULT,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? c.base['900'] : c.text.secondary,
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

            <WeightChart
              series={weight?.series ?? []}
              trendLine={weight?.trend_line ?? []}
              goalKg={weight?.goal_kg ?? null}
              width={chartWidth}
            />

            {weight?.message && (
              <View style={{ backgroundColor: c.glass.DEFAULT, borderRadius: 16, padding: 14 }}>
                <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
                  {weight.message}
                </Text>
              </View>
            )}

            {weight?.plateau.plateaued && weight.plateau.message && (
              <View style={{ backgroundColor: 'rgba(255,194,75,0.10)', borderRadius: 16, padding: 14 }}>
                <Text style={{ color: c.state.warning, fontSize: 13, lineHeight: 19 }}>
                  {weight.plateau.message}
                </Text>
              </View>
            )}
          </Card>

          <Card style={{ padding: 18 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Daily average calories
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 12 }}>
              <AnimatedNumber
                value={wow?.thisWeekAvg ?? 0}
                style={{ color: c.text.primary, fontSize: 32, fontWeight: '700' }}
              />
              <Text style={{ color: c.text.secondary, fontSize: 15, marginBottom: 5 }}>kcal</Text>

              {wow && wow.lastWeekAvg > 0 && (
                <View
                  style={{
                    marginBottom: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor:
                      wow.percentChange > 0 ? 'rgba(255,194,75,0.12)' : 'rgba(67,230,160,0.12)',
                  }}
                >
                  <Text
                    style={{
                      color: wow.percentChange > 0 ? c.state.warning : c.state.success,
                      fontSize: 11,
                      fontWeight: '600',
                    }}
                  >
                    {wow.percentChange > 0 ? '↑' : '↓'} {Math.abs(wow.percentChange)}% vs last week
                  </Text>
                </View>
              )}
            </View>

            <Text style={{ color: c.text.secondary, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              {calories?.target
                ? `Your target is ${Math.round(calories.target)} kcal a day.`
                : 'Finish onboarding to set a target.'}
              {calories?.tdee ? ` We estimate you burn about ${Math.round(calories.tdee)}.` : ''}
            </Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
