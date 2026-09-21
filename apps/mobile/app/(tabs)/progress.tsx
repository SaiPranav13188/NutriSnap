import { useCallback, useMemo, useState } from 'react';
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
import {
  PROGRESS_RANGES,
  bmi,
  daysUntilNextWeighIn,
  formatNumber,
  periodChanges,
  weekBucket,
  type ProgressRange,
} from '@nutrisnap/core';
import { api, ApiError, type ProgressResponse } from '../../src/lib/api';
import { AnimatedNumber, Button, Card, ErrorNote, Screen } from '../../src/components/ui';
import { WeightChart } from '../../src/components/WeightChart';
import { ChangeTable } from '../../src/components/ChangeTable';
import { WeekBars } from '../../src/components/WeekBars';
import { BmiScale } from '../../src/components/BmiScale';
import { useColors } from '../../src/lib/theme';

export default function Progress() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<ProgressRange>('90d');
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Which week the calorie chart is showing: 0 is the current one. */
  const [weeksAgo, setWeeksAgo] = useState(0);

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

  // Derived values live above the loading early-return: a hook that runs
  // only once data has arrived changes the hook count between renders,
  // which React rejects outright. Each one already tolerates null data.
  const weight = data?.weight;
  const calories = data?.calories;
  const wow = calories?.week_over_week;

  /** The seven days the calorie chart draws, for the selected week. */
  const week = useMemo(
    () => weekBucket(calories?.series ?? [], weeksAgo),
    [calories?.series, weeksAgo],
  );

  /**
   * Macro averages over the same week. Divided by elapsed days rather than
   * seven, so a Tuesday does not report a five-sevenths-sized average.
   */
  const macroAverage = useMemo(() => {
    const byDate = new Map((calories?.macro_series ?? []).map((m) => [m.date, m]));
    const elapsed = week.days.filter((d) => d.elapsed);
    const divisor = Math.max(1, elapsed.length);

    const sum = elapsed.reduce(
      (acc, day) => {
        const m = byDate.get(day.date);
        return {
          protein: acc.protein + (m?.protein_g ?? 0),
          carbs: acc.carbs + (m?.carbs_g ?? 0),
          fat: acc.fat + (m?.fat_g ?? 0),
        };
      },
      { protein: 0, carbs: 0, fat: 0 },
    );

    return {
      protein: sum.protein / divisor,
      carbs: sum.carbs / divisor,
      fat: sum.fat / divisor,
    };
  }, [calories?.macro_series, week]);

  // Weight moves in tenths; expenditure moves in tens, so the two tables need
  // different ideas of what counts as "no change".
  const weightChanges = useMemo(
    () => periodChanges(weight?.series ?? [], { flatThreshold: 0.1 }),
    [weight?.series],
  );

  const expenditureChanges = useMemo(
    () => periodChanges(data?.expenditure.series ?? [], { flatThreshold: 25 }),
    [data?.expenditure.series],
  );

  const bmiValue = bmi(weight?.current_kg ?? null, data?.profile.height_cm ?? null);
  const weighInDays = daysUntilNextWeighIn(weight?.last_logged_on ?? null);

  /**
   * Energy in against energy out for the selected week. "Burned" is the TDEE
   * estimate over elapsed days, not a measurement — nothing here tracks
   * exercise, so it is what the plan assumes rather than what a watch saw.
   */
  const energy = useMemo(() => {
    const elapsed = week.days.filter((d) => d.elapsed).length;
    const burned = (calories?.tdee ?? 0) * elapsed;
    return { consumed: week.total, burned, net: week.total - burned };
  }, [week, calories?.tdee]);

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent.lime} />
        </View>
      </Screen>
    );
  }

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
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Text style={{ color: c.text.secondary, fontSize: 13 }}>Current weight</Text>

                {/* Weekly cadence: weight moves too slowly for a daily reading
                    to mean much, and water swings make one discouraging. */}
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: c.glass.DEFAULT,
                  }}
                >
                  <Text
                    style={{
                      color: weighInDays === 0 ? c.accent.lime : c.text.tertiary,
                      fontSize: 10,
                      fontWeight: '600',
                    }}
                  >
                    {weighInDays === 0 ? 'Weigh in' : `${weighInDays}d`}
                  </Text>
                </View>
              </View>

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

          {/* Daily average calories, by weekday, with a week picker. */}
          <Card style={{ padding: 18, gap: 16 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Daily Average Calories
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <AnimatedNumber
                value={Math.round(week.average)}
                style={{ color: c.text.primary, fontSize: 34, fontWeight: '700' }}
              />
              <Text style={{ color: c.text.secondary, fontSize: 15, marginBottom: 5 }}>cals</Text>

              {wow && wow.lastWeekAvg > 0 && weeksAgo === 0 && (
                <View
                  style={{
                    marginBottom: 6,
                    marginLeft: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: c.glass.DEFAULT,
                  }}
                >
                  <Text
                    style={{
                      color: wow.percentChange > 0 ? c.state.warning : c.state.success,
                      fontSize: 11,
                      fontWeight: '600',
                    }}
                  >
                    {wow.percentChange > 0 ? '\u2191' : '\u2193'} {Math.abs(wow.percentChange)}% vs
                    last week
                  </Text>
                </View>
              )}
            </View>

            <WeekBars
              week={week}
              weeksAgo={weeksAgo}
              onWeeksAgo={setWeeksAgo}
              color={c.accent.cyan}
              target={calories?.target}
            />

            {/* Averages rather than a chart legend: the bars encode total
                calories, so labelling them by macro would claim a breakdown
                the chart does not actually draw. */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(
                [
                  { icon: '\uD83C\uDF57', label: 'Protein', value: macroAverage.protein, color: c.macro.protein },
                  { icon: '\uD83C\uDF3E', label: 'Carbs', value: macroAverage.carbs, color: c.macro.carbs },
                  { icon: '\uD83E\uDD51', label: 'Fats', value: macroAverage.fat, color: c.macro.fat },
                ] as const
              ).map((macro) => (
                <View
                  key={macro.label}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: 3,
                    paddingVertical: 10,
                    borderRadius: 16,
                    backgroundColor: c.glass.DEFAULT,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{macro.icon}</Text>
                  <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '700' }}>
                    {Math.round(macro.value)}g
                  </Text>
                  <Text style={{ color: macro.color, fontSize: 11, fontWeight: '600' }}>
                    {macro.label}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Weekly energy: in, out, and the gap between them. */}
          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Weekly Energy
            </Text>

            <View style={{ flexDirection: 'row' }}>
              {(
                [
                  { label: 'Consumed', value: energy.consumed, color: c.macro.protein },
                  { label: 'Burned', value: energy.burned, color: c.state.success },
                  { label: 'Energy', value: energy.net, color: c.text.primary },
                ] as const
              ).map((entry) => (
                <View key={entry.label} style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: c.text.tertiary, fontSize: 13 }}>{entry.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={{ color: entry.color, fontSize: 22, fontWeight: '700' }}
                    >
                      {entry.value < 0 ? '-' : ''}
                      {formatNumber(Math.abs(Math.round(entry.value)))}
                    </Text>
                    <Text
                      style={{ color: c.text.tertiary, fontSize: 12, marginLeft: 3, marginBottom: 3 }}
                    >
                      cals
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
              {calories?.tdee
                ? `Burned is your estimated daily burn of ${Math.round(calories.tdee)} cals across the days elapsed this week, not a measurement.`
                : 'Finish onboarding so we can estimate what you burn.'}
            </Text>
          </Card>

          {/* Weight changes over the standard windows. */}
          <Card style={{ padding: 18, gap: 6 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Weight Changes
            </Text>
            <ChangeTable rows={weightChanges} unit="kg" color={c.accent.cyan} decimals={1} />
          </Card>

          {/* The same table, for how the burn estimate has moved. */}
          <Card style={{ padding: 18, gap: 6 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Expenditure Changes
            </Text>
            <ChangeTable
              rows={expenditureChanges}
              unit="Kcal"
              color={c.macro.protein}
              decimals={0}
            />
            <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
              This moves when your weight or your logging history shifts the estimate, so it
              holds steady until there is reason to change it.
            </Text>
          </Card>

          {/* BMI. */}
          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Your BMI
            </Text>

            {bmiValue != null ? (
              <BmiScale value={bmiValue} />
            ) : (
              <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 20 }}>
                We need your height and a weigh-in to work this out. Add them in Settings.
              </Text>
            )}
          </Card>

        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
