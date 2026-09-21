import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { buildDateStrip, indexOfDate } from '@nutrisnap/core';
import { useColors } from '../lib/theme';
import { ProgressRing } from './ProgressRing';

interface DateStripProps {
  selected: string;
  onSelect: (date: string) => void;
  /** Calories logged per day, keyed by YYYY-MM-DD, for the completion rings. */
  caloriesByDay: Record<string, number>;
  targetCalories: number;
}

const ITEM_WIDTH = 52;

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
        const complete = ratio >= 0.95;

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

              <ProgressRing
                ratio={ratio}
                size={36}
                strokeWidth={3}
                from={complete ? c.accent.lime : c.accent.cyan}
                to={complete ? c.accent.lime : c.accent.cyan}
                gradientId={`strip-${day.date}`}
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
