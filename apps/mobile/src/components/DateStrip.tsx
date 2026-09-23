import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { buildDateStrip, indexOfDate, isRingComplete, ringState, type RingState } from '@nutrisnap/core';
import { useColors } from '../lib/theme';
import { ringColorFor } from '../lib/ringColors';
import { ProgressRing } from './ProgressRing';

interface DateStripProps {
  selected: string;
  onSelect: (date: string) => void;
  /** Calories logged per day, keyed by YYYY-MM-DD, for the completion rings. */
  caloriesByDay: Record<string, number>;
  /**
   * Meals logged per day, same keys.
   *
   * Needed as well as the calories because the day totals come back for every
   * date in the window, zeroed where nothing was logged — so a zero here is
   * ambiguous on its own, and a day nobody told us about would otherwise be
   * graded as a day that ate nothing.
   */
  logCountByDay: Record<string, number>;
  targetCalories: number;
}

const ITEM_WIDTH = 52;
const RING_SIZE = 36;

/**
 * Where each star sits relative to the ring's box, and the slice of the
 * twinkle loop it reads. Staggering the slices keeps the three from pulsing
 * as one blob.
 */
const STARS = [
  { top: -5, left: -6, slice: 0 },
  { top: -7, left: RING_SIZE - 5, slice: 0.33 },
  { top: RING_SIZE - 6, left: RING_SIZE - 2, slice: 0.66 },
] as const;

/**
 * The stars a completed day wears.
 *
 * A green ring alone is easy to miss in a strip of fourteen; the movement is
 * what makes a finished day findable at a glance while scrolling.
 */
function CompletionStars() {
  const twinkle = useSharedValue(0);

  useEffect(() => {
    twinkle.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [twinkle]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      {STARS.map((star) => (
        <Star key={star.slice} star={star} twinkle={twinkle} />
      ))}
    </View>
  );
}

function Star({
  star,
  twinkle,
}: {
  star: (typeof STARS)[number];
  twinkle: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    // Offset each star along the loop, wrapping so the last one leads the
    // next cycle rather than stalling at the end.
    const t = (twinkle.value + star.slice) % 1;
    const swell = interpolate(t, [0, 0.5, 1], [0.65, 1.1, 0.65]);
    return {
      opacity: interpolate(t, [0, 0.5, 1], [0.45, 1, 0.45]),
      transform: [{ scale: swell }],
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', top: star.top, left: star.left }, style]}>
      <Text style={{ fontSize: 9 }}>{'⭐'}</Text>
    </Animated.View>
  );
}

/**
 * Horizontally scrollable date picker.
 *
 * Replaces the fixed seven-day row, which could only ever show the current
 * week and was not tappable. This runs 90 days back so history is reachable by
 * scrolling, and auto-scrolls to keep the selected day in view.
 *
 * Future days render disabled rather than hidden — seeing the week end makes
 * the strip easier to orient in than a list that stops at today.
 */
export function DateStrip({
  selected,
  onSelect,
  caloriesByDay,
  logCountByDay,
  targetCalories,
}: DateStripProps) {
  const c = useColors();
  const scrollRef = useRef<ScrollView>(null);

  const days = useMemo(() => buildDateStrip({ daysBack: 90, daysForward: 3 }), []);

  // Keep the selection on screen, including on first render where the
  // interesting end of the strip is the far right.
  useEffect(() => {
    const index = indexOfDate(days, selected);
    const x = Math.max(0, index * ITEM_WIDTH - ITEM_WIDTH * 2.5);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x, animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [selected, days]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 8, gap: 2 }}
      // Land cleanly on a day rather than between two.
      snapToInterval={ITEM_WIDTH}
      decelerationRate="fast"
    >
      {days.map((day) => {
        const isSelected = day.date === selected;
        const eaten = caloriesByDay[day.date] ?? 0;
        const ratio = targetCalories > 0 ? Math.min(1, eaten / targetCalories) : 0;

        /**
         * A day that has not happened yet is not an unlogged day — it is a
         * day with nothing to say. It gets a plain track rather than the
         * broken circle that means "you did not log this one".
         */
        const state: RingState = ringState({
          consumed: eaten,
          target: targetCalories,
          hasLogs: (logCountByDay[day.date] ?? 0) > 0,
        });
        const complete = !day.isFuture && isRingComplete(state);
        const dashed = !day.isFuture && state === 'empty';
        const ringColor = day.isFuture ? c.glass.borderStrong : ringColorFor(state, c);

        return (
          <View key={day.date} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {day.isMonthStart && (
              <View style={{ alignItems: 'center', paddingHorizontal: 6 }}>
                <Text
                  style={{
                    color: c.text.tertiary,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                  }}
                >
                  {day.monthLabel.toUpperCase()}
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => {
                if (day.isFuture) return;
                void Haptics.selectionAsync();
                onSelect(day.date);
              }}
              disabled={day.isFuture}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: day.isFuture }}
              accessibilityLabel={`${day.monthLabel} ${day.dayOfMonth}${day.isToday ? ', today' : ''}`}
              style={{
                width: ITEM_WIDTH,
                alignItems: 'center',
                gap: 5,
                paddingVertical: 8,
                borderRadius: 16,
                opacity: day.isFuture ? 0.3 : 1,
                backgroundColor: isSelected ? c.glass.DEFAULT : 'transparent',
              }}
            >
              <Text
                style={{
                  color: day.isToday ? c.accent.lime : c.text.tertiary,
                  fontSize: 11,
                  fontWeight: day.isToday ? '700' : '500',
                }}
              >
                {day.weekdayLetter}
              </Text>

              {/* The stars sit outside the ring, so they need a box of the
                  ring's own size to hang off rather than the padded column. */}
              <View style={{ width: RING_SIZE, height: RING_SIZE }}>
                <ProgressRing
                  ratio={ratio}
                  size={RING_SIZE}
                  strokeWidth={3}
                  from={ringColor}
                  to={ringColor}
                  gradientId={`strip-${day.date}`}
                  dashed={dashed}
                  // An over day has already filled the ring, so a grey track
                  // behind it is never seen; a graded day wants its colour on
                  // the arc alone, with the usual faint track behind.
                  trackColor={dashed ? ringColor : undefined}
                >
                  <Text
                    style={{
                      color: isSelected ? c.text.primary : c.text.secondary,
                      fontSize: 11,
                      fontWeight: isSelected ? '700' : '500',
                    }}
                  >
                    {day.dayOfMonth}
                  </Text>
                </ProgressRing>

                {complete && !day.isFuture && <CompletionStars />}
              </View>

              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: isSelected ? c.accent.lime : 'transparent',
                }}
              />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
