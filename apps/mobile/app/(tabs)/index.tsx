import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  EMPTY_TOTALS,
  describeDate,
  healthScore,
  microTargets,
  resolveWaterTarget,
  ringProgress,
  todayKey,
  type DailyTarget,
  type FoodLog,
  type MacroTotals,
} from '@nutrisnap/core';
import { macroGradientsFor, microGradientsFor } from '@nutrisnap/ui';
import { api, ApiError, type DayRollover, type DayTotals } from '../../src/lib/api';
import {
  AnimatedNumber,
  Button,
  Card,
  ErrorNote,
  PagerDots,
  Screen,
} from '../../src/components/ui';
import { ProgressRing } from '../../src/components/ProgressRing';
import { DateStrip } from '../../src/components/DateStrip';
import { WaterCard } from '../../src/components/WaterCard';
import { FavouritesStrip } from '../../src/components/FavouritesStrip';
import { RolloverBox } from '../../src/components/RolloverBox';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { AppLogo } from '../../src/components/AppLogo';
import { GoalCelebration } from '../../src/components/GoalCelebration';
import { MealThumb } from '../../src/components/MealThumb';
import { UncertaintyNote } from '../../src/components/UncertaintyNote';
import { PendingLogsBanner } from '../../src/components/PendingLogsBanner';
import { useColors } from '../../src/lib/theme';
import { clearStoredAnswers, readStoredAnswers } from '../../src/lib/session';

/**
 * One labelled ring: what has been eaten, against its goal, with the
 * remainder underneath.
 *
 * Shared by both summary pages so the macro row and the fibre/sugar/sodium
 * row read as the same control seen twice, rather than two that merely
 * resemble each other.
 */
function NutrientRing({
  label,
  icon,
  eaten,
  target,
  color,
  gradient,
  gradientId,
  delay,
  unit = 'g',
}: {
  label: string;
  /** Sits inside the ring, where the reading used to be. */
  icon: string;
  eaten: number;
  target: number;
  color: string;
  gradient: { from: string; to: string };
  gradientId: string;
  delay: number;
  unit?: 'g' | 'mg';
}) {
  const c = useColors();
  const progress = ringProgress(eaten, target);

  return (
    // Each nutrient carries its own surface rather than sharing one with the
    // other two. Three tiles read as three separate readings; one card split
    // into three columns reads as a table the eye has to parse first.
    <Card
      style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 14, paddingHorizontal: 6 }}
      accessible
      accessibilityLabel={`${label}, ${Math.round(eaten)} of ${Math.round(target)} ${unit}`}
    >
      {/* The reading sits above the ring rather than inside it, which frees the
          centre for an icon that identifies the nutrient at a glance. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        {/* Sodium reads in the thousands against a four-digit goal. Shrinking
            to fit keeps it on one line without making the other five smaller
            to match a case that only affects one of them. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ color: c.text.primary, fontSize: 15, fontWeight: '700' }}
        >
          {Math.round(eaten)}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ color: c.text.tertiary, fontSize: 10, marginLeft: 2 }}
        >
          /{Math.round(target)}
          {unit}
        </Text>
      </View>

      <Text style={{ color, fontSize: 10, fontWeight: '600' }}>{label}</Text>

      <ProgressRing
        ratio={progress.ratio}
        size={54}
        strokeWidth={5}
        from={gradient.from}
        to={gradient.to}
        delay={delay}
        gradientId={gradientId}
      >
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </ProgressRing>

      <Text style={{ color: c.text.tertiary, fontSize: 10 }}>
        {Math.max(0, Math.round(progress.remaining))}
        {unit} left
      </Text>
    </Card>
  );
}

export default function Dashboard() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const macroGradients = macroGradientsFor(c);
  const microGradients = microGradientsFor(c);

  const [date, setDate] = useState(() => todayKey());
  /** Which summary page is showing: 0 macros, 1 micros and the score. */
  const [page, setPage] = useState(0);
  const [totals, setTotals] = useState<MacroTotals>(EMPTY_TOTALS);
  const [targets, setTargets] = useState<DailyTarget | null>(null);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [rollover, setRollover] = useState<DayRollover>({
    carried_in_kcal: 0,
    pushed_out_kcal: 0,
    already_pushed: false,
  });
  const [week, setWeek] = useState<DayTotals[]>([]);
  const [streak, setStreak] = useState(0);
  const [waterMl, setWaterMl] = useState(0);
  /** Drives the water goal, which scales with body weight. */
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null);
  /** An explicit goal set in Preferences, which overrides the derived one. */
  const [waterGoalOverrideMl, setWaterGoalOverrideMl] = useState<number | null>(null);
  const [favourites, setFavourites] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (forDate: string) => {
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

        // The day is the screen; the strip rings and the streak badge only
        // decorate it. Loading all three together meant one failing extra
        // blanked the plan and sent the user back to the quiz, so the day is
        // awaited on its own and the rest are allowed to fail quietly.
        const day = await api.getDay(forDate);

        setTotals(day.totals);
        setTargets(day.targets);
        setLogs(day.logs);
        setRollover(day.rollover);

        // 90 days of history feeds the scrollable strip's completion rings.
        // All of these decorate the day rather than constituting it, so they
        // are allowed to fail without taking the screen down.
        const [history, streakData, water, favs, profile] = await Promise.allSettled([
          api.getWeek(90),
          api.getStreak(),
          api.getWater(forDate),
          api.getFavorites(12),
          api.getProfile(),
        ]);

        if (history.status === 'fulfilled') setWeek(history.value.days);
        if (streakData.status === 'fulfilled') {
          setStreak(streakData.value.streak.current_streak);
        }
        if (water.status === 'fulfilled') setWaterMl(water.value.total_ml);
        if (favs.status === 'fulfilled') setFavourites(favs.value.logs);
        if (profile.status === 'fulfilled') {
          setProfileWeightKg(profile.value.profile.current_weight_kg ?? null);
          setWaterGoalOverrideMl(profile.value.profile.water_goal_ml ?? null);
        }
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not load your day.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  // Reload whenever the tab regains focus, so a meal logged on the Scan tab
  // shows up immediately.
  useFocusEffect(
    useCallback(() => {
      void load(date);
    }, [load, date]),
  );

  const caloriesByDay = Object.fromEntries(week.map((d) => [d.day, d.calories]));
  // The totals come back for every date in the window, zeroed where nothing
  // was logged, so the strip needs the counts to tell an empty day from a day
  // that genuinely ate nothing.
  const logCountByDay = Object.fromEntries(week.map((d) => [d.day, d.log_count]));

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent.lime} />
        </View>
      </Screen>
    );
  }

  // Calories carried in from yesterday are part of today's allowance, so the
  // ring has to measure against the total. Leaving them out would show a day
  // as over target while the box above it said there was room.
  const effectiveTarget = (targets?.calories ?? 0) + rollover.carried_in_kcal;
  const calories = ringProgress(totals.calories, effectiveTarget);

  // Fibre, sugar and sodium have no stored goals — they are derived from the
  // calorie target, so they stay correct after a plan change.
  const micro = microTargets(targets?.calories ?? 0);
  const waterGoalMl = resolveWaterTarget(waterGoalOverrideMl, profileWeightKg);
  // The arc closing is the moment the screen exists for, so that is what
  // the celebration keys off rather than a threshold of its own.
  const goalMet = effectiveTarget > 0 && calories.ratio >= 1;
  const health = healthScore(totals, targets);
  const scoreColor =
    health.score >= 8 ? c.state.success : health.score >= 5 ? c.state.warning : c.state.danger;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingVertical: 20, gap: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(date);
              }}
              tintColor={c.accent.lime}
            />
          }
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
            }}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AppLogo size={38} />

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: c.text.primary,
                    fontSize: 21,
                    fontWeight: '700',
                    letterSpacing: -0.3,
                  }}
                >
                  NutriSnap
                </Text>
                {/* The day being shown is demoted rather than dropped: the
                    strip below marks the selection with a dot, which does not
                    say whether that day is today. */}
                <Text style={{ color: c.text.tertiary, fontSize: 12 }}>{describeDate(date)}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Card
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                }}
              >
                <Text style={{ fontSize: 14 }}>🔥</Text>
                <Text style={{ color: c.text.primary, fontWeight: '700' }}>{streak}</Text>
              </Card>

              <ThemeToggle />
            </View>
          </View>

          {error && (
            <View style={{ paddingHorizontal: 20 }}>
              <ErrorNote message={error} />
            </View>
          )}

          {/* Anything logged without a signal, and whether it has gone up. */}
          <PendingLogsBanner onSynced={() => void load(date)} />

          {!targets ? (
            <View style={{ paddingHorizontal: 20 }}>
              <Card style={{ padding: 24, gap: 14, alignItems: 'center' }}>
                <Text
                  style={{
                    color: c.text.primary,
                    fontSize: 19,
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  Let&apos;s build your plan
                </Text>
                <Text
                  style={{
                    color: c.text.secondary,
                    fontSize: 14,
                    textAlign: 'center',
                    lineHeight: 20,
                  }}
                >
                  Answer a few questions and we&apos;ll set your daily calorie and macro targets.
                </Text>
                <Button onPress={() => router.push('/onboarding')} style={{ alignSelf: 'stretch' }}>
                  Start the quiz
                </Button>
              </Card>
            </View>
          ) : (
            <>
              <DateStrip
                selected={date}
                onSelect={setDate}
                caloriesByDay={caloriesByDay}
                logCountByDay={logCountByDay}
                targetCalories={targets.calories}
              />

              <View>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={(event) =>
                    setPage(Math.round(event.nativeEvent.contentOffset.x / width))
                  }
                >
                  {/* Page one: the day at a glance. */}
                  <View style={{ width, paddingHorizontal: 20, gap: 14 }}>
                    <Card style={{ padding: 20, alignItems: 'center', gap: 18 }}>
                      <ProgressRing
                        ratio={calories.ratio}
                        size={152}
                        strokeWidth={12}
                        from={c.accent.lime}
                        to={c.accent.cyan}
                        gradientId="calorieRing"
                      >
                        <View style={{ alignItems: 'center' }}>
                          <AnimatedNumber
                            value={Math.abs(Math.round(calories.remaining))}
                            style={{
                              color: calories.over ? c.state.danger : c.text.primary,
                              fontSize: 34,
                              fontWeight: '700',
                            }}
                          />
                          <Text
                            style={{
                              color: c.text.secondary,
                              fontSize: 10,
                              letterSpacing: 2,
                              textTransform: 'uppercase',
                              marginTop: 5,
                            }}
                          >
                            {calories.over ? 'over' : 'remaining'}
                          </Text>
                          <Text style={{ color: c.text.tertiary, fontSize: 11, marginTop: 5 }}>
                            {Math.round(totals.calories)} / {Math.round(effectiveTarget)} kcal
                          </Text>
                        </View>
                      </ProgressRing>

                      {/* What that single figure is worth. Hides itself on a
                          day whose band is narrower than its own rounding. */}
                      <UncertaintyNote logs={logs} />

                      {goalMet && <GoalCelebration isToday={date === todayKey()} />}
                    </Card>

                    <RolloverBox
                      date={date}
                      consumed={totals.calories}
                      target={targets.calories}
                      rollover={rollover}
                      onChange={() => void load(date)}
                      onError={setError}
                    />

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <NutrientRing
                        label="Protein"
                        icon={'\uD83C\uDF57'}
                        eaten={totals.protein_g}
                        target={targets.protein_g}
                        color={c.macro.protein}
                        gradient={macroGradients.protein}
                        gradientId="macro-protein"
                        delay={140}
                      />
                      <NutrientRing
                        label="Carbs"
                        icon={'\uD83C\uDF3E'}
                        eaten={totals.carbs_g}
                        target={targets.carbs_g}
                        color={c.macro.carbs}
                        gradient={macroGradients.carbs}
                        gradientId="macro-carbs"
                        delay={230}
                      />
                      <NutrientRing
                        label="Fat"
                        icon={'\uD83E\uDD51'}
                        eaten={totals.fat_g}
                        target={targets.fat_g}
                        color={c.macro.fat}
                        gradient={macroGradients.fat}
                        gradientId="macro-fat"
                        delay={320}
                      />
                    </View>
                  </View>

                  {/* Page two: what the headline numbers leave out. */}
                  <View style={{ width, paddingHorizontal: 20, gap: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <NutrientRing
                        label="Fiber"
                        icon={'\uD83E\uDD66'}
                        eaten={totals.fiber_g}
                        target={micro.fiber_g}
                        color={c.micro.fiber}
                        gradient={microGradients.fiber}
                        gradientId="micro-fiber"
                        delay={140}
                      />
                      <NutrientRing
                        label="Sugar"
                        icon={'\uD83C\uDF6C'}
                        eaten={totals.sugar_g}
                        target={micro.sugar_g}
                        color={c.micro.sugar}
                        gradient={microGradients.sugar}
                        gradientId="micro-sugar"
                        delay={230}
                      />
                      <NutrientRing
                        label="Sodium"
                        icon={'\uD83E\uDDC2'}
                        eaten={totals.sodium_mg}
                        target={micro.sodium_mg}
                        color={c.micro.sodium}
                        gradient={microGradients.sodium}
                        gradientId="micro-sodium"
                        delay={320}
                        unit="mg"
                      />
                    </View>

                    {/* The score is a verdict on the three rings above, so it gets a
                        surface of its own rather than sharing theirs. */}
                    <Card style={{ padding: 20, gap: 12 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text style={{ color: c.text.primary, fontSize: 17, fontWeight: '700' }}>
                          Health score
                        </Text>
                        <Text style={{ color: scoreColor, fontSize: 17, fontWeight: '700' }}>
                          {health.score}/10
                        </Text>
                      </View>

                      <View
                        style={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: c.glass.DEFAULT,
                          overflow: 'hidden',
                        }}
                        accessibilityRole="progressbar"
                        accessibilityValue={{ min: 0, max: 10, now: health.score }}
                      >
                        <View
                          style={{
                            width: `${health.score * 10}%`,
                            height: '100%',
                            borderRadius: 4,
                            backgroundColor: scoreColor,
                          }}
                        />
                      </View>

                      <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
                        {health.summary}
                      </Text>
                    </Card>
                  </View>

                  {/* Page three: water. */}
                  <View style={{ width, paddingHorizontal: 20 }}>
                    <WaterCard
                      totalMl={waterMl}
                      targetMl={waterGoalMl}
                      units="metric"
                      onChange={() => void load(date)}
                      onError={setError}
                    />
                  </View>
                </ScrollView>

                <PagerDots count={3} active={page} />
              </View>
            </>
          )}

          {date === todayKey() && (
            <FavouritesStrip
              favourites={favourites}
              onLogged={() => void load(date)}
              onError={setError}
            />
          )}

          <Text
            style={{
              color: c.text.secondary,
              fontSize: 12,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginTop: 8,
              paddingHorizontal: 20,
            }}
          >
            {date === todayKey() ? 'Recently uploaded' : 'Logged this day'}
          </Text>

          <View style={{ paddingHorizontal: 20, gap: 10 }}>
            {logs.length === 0 ? (
              <Card style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: c.text.secondary }}>Nothing logged yet.</Text>
                <Text style={{ color: c.text.tertiary, fontSize: 13, marginTop: 4 }}>
                  Snap your next meal and it will show up here.
                </Text>
              </Card>
            ) : (
              logs.map((log, i) => (
                <Animated.View key={log.id} entering={FadeInDown.delay(i * 60)}>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/log/[id]', params: { id: log.id } })
                    }
                    onLongPress={async () => {
                      try {
                        await api.deleteLog(log.id);
                        void load(date);
                      } catch {
                        setError('Could not delete that meal.');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${log.name}, ${Math.round(log.calories)} calories`}
                    accessibilityHint="Opens the full report. Long press to delete."
                  >
                    <Card
                      style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    >
                      <MealThumb path={log.photo_url} name={log.name} />

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ color: c.text.primary, fontSize: 15, fontWeight: '500' }}
                          numberOfLines={1}
                        >
                          {log.name}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                          <Text
                            style={{ color: c.accent.lime, fontSize: 13, fontWeight: '700' }}
                          >
                            {Math.round(log.calories)} kcal
                          </Text>
                          <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                            P {Math.round(log.protein_g)}g
                          </Text>
                          <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                            C {Math.round(log.carbs_g)}g
                          </Text>
                          <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                            F {Math.round(log.fat_g)}g
                          </Text>
                        </View>
                      </View>

                      <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
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
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
