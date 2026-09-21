import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { WEEK_OPTIONS, type WeekBucket } from '@nutrisnap/core';
import { useColors } from '../lib/theme';

/**
 * A week of daily bars with a week picker beneath.
 *
 * Bars rather than a line: the underlying thing is seven discrete days, and a
 * line implies a continuous quantity moving between them. Days still to come
 * are drawn as empty tracks so the shape of the week stays readable instead of
 * the chart appearing to collapse mid-week.
 */

const CHART_HEIGHT = 132;

interface WeekBarsProps {
  week: WeekBucket;
  weeksAgo: number;
  onWeeksAgo: (weeksAgo: number) => void;
  color: string;
  /** Drawn as a dashed rule across the chart, when there is one. */
  target?: number | null;
}

export function WeekBars({ week, weeksAgo, onWeeksAgo, color, target }: WeekBarsProps) {
  const c = useColors();

  // Scale to the tallest of the week and the target, so a day that overshoots
  // is visibly over the line rather than pinned to the top with it.
  const peak = Math.max(...week.days.map((d) => d.value), target ?? 0, 1);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {week.days.map((day, i) => {
          const height = Math.max(2, (day.value / peak) * CHART_HEIGHT);
          return (
            <View key={day.date} style={{ flex: 1, alignItems: 'center', height: '100%' }}>
              <View style={{ flex: 1, justifyContent: 'flex-end', width: '100%' }}>
                <Animated.View
                  entering={FadeIn.delay(i * 45)}
                  style={{
                    height: day.value > 0 ? height : 3,
                    borderRadius: 7,
                    backgroundColor: day.value > 0 ? color : c.glass.border,
                    opacity: day.elapsed ? 1 : 0.35,
                  }}
                  accessibilityLabel={`${day.weekday}: ${Math.round(day.value)}`}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {week.days.map((day) => (
          <Text
            key={day.date}
            style={{
              flex: 1,
              textAlign: 'center',
              color: c.text.tertiary,
              fontSize: 11,
            }}
          >
            {day.weekday}
          </Text>
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: c.glass.DEFAULT,
          borderRadius: 999,
          padding: 4,
        }}
      >
        {WEEK_OPTIONS.map((option) => {
          const selected = option.weeksAgo === weeksAgo;
          return (
            <Pressable
              key={option.weeksAgo}
              onPress={() => {
                if (selected) return;
                void Haptics.selectionAsync();
                onWeeksAgo(option.weeksAgo);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: selected ? c.glass.strong : 'transparent',
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: selected ? c.text.primary : c.text.tertiary,
                  fontSize: 12,
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
  );
}
