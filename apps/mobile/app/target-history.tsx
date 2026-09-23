import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { formatNumber } from '@nutrisnap/core';
import { api, ApiError, type AdaptiveOutcome, type TargetAdjustment } from '../src/lib/api';
import { Button, Card, ErrorNote, Screen, ScreenHeader } from '../src/components/ui';
import { useColors } from '../src/lib/theme';

/**
 * Why your target is what it is.
 *
 * Mifflin-St Jeor is a regression over a population, and the person using it
 * is not a population. After a fortnight of logged intake measured against
 * real weight change there is a better number available — their own — and
 * this is where the app offers it and says where it came from.
 *
 * Nothing moves on its own. The verdict is fetched read-only and shown with
 * its reasoning; the button is the user's. A calorie target that changed
 * overnight without being asked would stop being a target and start being a
 * thing done to somebody.
 */
export default function TargetHistory() {
  const c = useColors();

  const [adaptive, setAdaptive] = useState<AdaptiveOutcome | null>(null);
  const [adjustments, setAdjustments] = useState<TargetAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    // The verdict and the history fail independently: a user with no history
    // yet should still be told what the engine currently thinks.
    const [verdict, history] = await Promise.allSettled([
      api.getAdaptive(),
      api.getTargetAdjustments(),
    ]);

    if (verdict.status === 'fulfilled') {
      setAdaptive(verdict.value.adaptive);
    } else {
      setError(
        verdict.reason instanceof ApiError
          ? verdict.reason.message
          : 'Could not work out your target.',
      );
    }

    if (history.status === 'fulfilled') setAdjustments(history.value.adjustments);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const { adaptive: result } = await api.applyAdaptive();
      setAdaptive(result);
      setNotice(`Your target is now ${formatNumber(Math.round(result.newCalories))} kcal a day.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update your target.');
    } finally {
      setApplying(false);
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

  const up = adaptive ? adaptive.newCalories > adaptive.previousCalories : false;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScreenHeader title="Your target" />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
          {error && <ErrorNote message={error} />}
          {notice && (
            <View style={{ backgroundColor: `${c.state.success}1A`, borderRadius: 18, padding: 14 }}>
              <Text style={{ color: c.state.success, fontSize: 14, lineHeight: 20 }}>{notice}</Text>
            </View>
          )}

          {adaptive && (
            <Card style={{ padding: 20, gap: 14 }}>
              <Text style={{ color: c.text.primary, fontSize: 17, fontWeight: '700' }}>
                {adaptive.shouldAdjust ? 'Your data suggests a change' : 'No change needed'}
              </Text>

              {adaptive.shouldAdjust && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: c.text.tertiary, fontSize: 22, fontWeight: '700' }}>
                    {formatNumber(Math.round(adaptive.previousCalories))}
                  </Text>
                  <Text style={{ color: c.text.tertiary, fontSize: 18 }}>→</Text>
                  <Text
                    style={{
                      color: up ? c.state.success : c.accent.cyan,
                      fontSize: 26,
                      fontWeight: '800',
                    }}
                  >
                    {formatNumber(Math.round(adaptive.newCalories))}
                  </Text>
                  <Text style={{ color: c.text.tertiary, fontSize: 13 }}>kcal/day</Text>
                </View>
              )}

              <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 21 }}>
                {adaptive.reason}
              </Text>

              {adaptive.estimatedTdee !== null && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: c.glass.DEFAULT,
                  }}
                >
                  <Stat
                    label="Measured burn"
                    value={`${formatNumber(Math.round(adaptive.estimatedTdee))} kcal`}
                  />
                  <Stat label="Days analysed" value={`${adaptive.daysAnalyzed}`} />
                </View>
              )}

              {adaptive.shouldAdjust && (
                <Button onPress={() => void apply()} loading={applying}>
                  Use this target
                </Button>
              )}
            </Card>
          )}

          <Text
            style={{
              color: c.text.secondary,
              fontSize: 12,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 1.1,
              marginTop: 6,
              paddingHorizontal: 4,
            }}
          >
            Past changes
          </Text>

          {adjustments.length === 0 ? (
            <Card style={{ padding: 22, gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 30 }}>📈</Text>
              <Text
                style={{
                  color: c.text.secondary,
                  fontSize: 14,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                Your target has not moved yet. Keep logging and weighing in, and it will start
                following what your body actually does rather than what the formula assumed.
              </Text>
            </Card>
          ) : (
            adjustments.map((entry, i) => {
              const rose = Number(entry.new_calories) > Number(entry.previous_calories);
              return (
                <Animated.View key={entry.id} entering={FadeInDown.delay(Math.min(i, 8) * 60)}>
                  <Card style={{ padding: 16, gap: 8 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ color: c.text.tertiary, fontSize: 15 }}>
                          {formatNumber(Math.round(Number(entry.previous_calories)))}
                        </Text>
                        <Text style={{ color: c.text.tertiary, fontSize: 13 }}>→</Text>
                        <Text
                          style={{
                            color: rose ? c.state.success : c.accent.cyan,
                            fontSize: 18,
                            fontWeight: '800',
                          }}
                        >
                          {formatNumber(Math.round(Number(entry.new_calories)))}
                        </Text>
                      </View>

                      <Text style={{ color: c.text.tertiary, fontSize: 12 }}>
                        {new Date(entry.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>

                    <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
                      {entry.reason}
                    </Text>
                  </Card>
                </Animated.View>
              );
            })
          )}

          <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
            Adjustments are capped at 250 kcal at a time and never go below the safe floor for
            your sex. A fortnight of history and two weigh-ins are the minimum before anything
            moves.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View>
      <Text
        style={{
          color: c.text.tertiary,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '700', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}
