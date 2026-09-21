import { useCallback, useEffect, useRef } from 'react';
import {
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as RNScrollView,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useColors } from '../lib/theme';

/**
 * A spinning selection wheel, the control iOS made standard for dates and the
 * one the onboarding quiz now uses for birth date and height.
 *
 * It is a snapping ScrollView rather than a list of tappable rows: the row
 * under the centre line is the selection, so there is no separate "choose"
 * gesture, and neighbours stay visible so the scale you are moving along is
 * legible. Rows fade and shrink with distance from the centre, which is what
 * makes a flat list read as a curved wheel.
 *
 * Values are strings so one component serves months, days, years, feet,
 * inches and centimetres; the caller maps back to whatever it stores.
 */

export const WHEEL_ITEM_HEIGHT = 48;
const VISIBLE_ROWS = 7;
export const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * VISIBLE_ROWS;
const EDGE_PADDING = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;

export interface WheelItem {
  value: string;
  label: string;
}

interface WheelColumnProps {
  items: WheelItem[];
  value: string;
  onChange: (value: string) => void;
  /** Share of the row's width. Equal columns unless told otherwise. */
  flex?: number;
  accessibilityLabel: string;
}

function WheelRow({
  index,
  label,
  scrollY,
}: {
  index: number;
  label: string;
  scrollY: SharedValue<number>;
}) {
  const c = useColors();

  const style = useAnimatedStyle(() => {
    // How many rows this one sits from whichever row is centred.
    const distance = Math.abs(index - scrollY.value / WHEEL_ITEM_HEIGHT);
    return {
      opacity: interpolate(distance, [0, 1, 2, 3], [1, 0.4, 0.2, 0.08], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(distance, [0, 1, 2], [1, 0.86, 0.76], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{ color: c.text.primary, fontSize: 22, fontWeight: '600' }}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

export function WheelColumn({
  items,
  value,
  onChange,
  flex = 1,
  accessibilityLabel,
}: WheelColumnProps) {
  const scrollRef = useRef<RNScrollView>(null);
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // Re-seat the wheel only when the set of rows changes — on mount, and when
  // a unit switch or a shorter month rebuilds the column. Following `value`
  // itself would yank the wheel out from under a finger mid-scroll.
  const itemsKey = `${items.length}:${items[0]?.value ?? ''}:${items[items.length - 1]?.value ?? ''}`;

  useEffect(() => {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) return;
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: false });
    scrollY.value = index * WHEEL_ITEM_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  const commit = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
      const index = Math.min(items.length - 1, Math.max(0, raw));
      const next = items[index];
      if (next && next.value !== value) onChange(next.value);
    },
    [items, value, onChange],
  );

  return (
    <View style={{ flex, height: WHEEL_HEIGHT }}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        // Land on a row rather than between two.
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        // A flick ends in momentum; a slow drag-and-release does not, and on
        // Android only the second fires. Both have to commit or the selection
        // silently disagrees with what is on screen.
        onMomentumScrollEnd={commit}
        onScrollEndDrag={commit}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: EDGE_PADDING }}
        accessibilityLabel={accessibilityLabel}
      >
        {items.map((item, index) => (
          <WheelRow key={item.value} index={index} label={item.label} scrollY={scrollY} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * Lays out one or more columns behind a single centred highlight, so the
 * selected row of every column reads as one horizontal band.
 */
export function WheelGroup({ children }: { children: React.ReactNode }) {
  const c = useColors();

  return (
    <View style={{ height: WHEEL_HEIGHT, justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: EDGE_PADDING,
          height: WHEEL_ITEM_HEIGHT,
          borderRadius: 16,
          backgroundColor: c.glass.DEFAULT,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>
    </View>
  );
}
