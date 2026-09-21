import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { kgToLb, lbToKg, type Units } from '@nutrisnap/core';
import { useColors } from '../lib/theme';
import { UnitToggle } from './UnitToggle';

/**
 * A weight dial: a ruler that slides under a fixed centre marker, with the
 * reading shown large above it.
 *
 * It replaces a pair of ± buttons, which needed sixty taps to cross thirty
 * kilos. Dragging a scale covers that in one gesture while still resolving to
 * a tenth, and the surrounding ticks give the number a sense of scale that a
 * bare readout does not.
 *
 * Weight is stored in kilograms whatever is displayed. Everything here works
 * in tenths of a display unit held as integers, because stepping a float by
 * 0.1 two thousand times does not land on the numbers you would expect.
 */

const TICK_SPACING = 10;
/** Tenths of a unit per tick. */
const TICKS_PER_UNIT = 10;
const RULER_HEIGHT = 64;

const BOUNDS = {
  metric: { min: 30, max: 250, label: 'kg' },
  imperial: { min: 66, max: 551, label: 'lbs' },
} as const;

interface RulerPickerProps {
  /** Kilograms. */
  value: number;
  onChange: (kg: number) => void;
  units: Units;
  onUnits: (units: Units) => void;
  /** Sits above the reading, e.g. "Current Weight". */
  caption: string;
  /**
   * Horizontal padding to cancel out, so the ruler runs to both screen edges
   * while the text above it stays inset with the rest of the step.
   */
  bleed?: number;
}

const Tick = memo(function Tick({
  tenths,
  colors,
}: {
  tenths: number;
  colors: { major: string; minor: string; label: string };
}) {
  const isUnit = tenths % TICKS_PER_UNIT === 0;
  const isLabelled = tenths % (TICKS_PER_UNIT * 5) === 0;

  return (
    <View style={{ width: TICK_SPACING, height: RULER_HEIGHT, alignItems: 'center' }}>
      <View
        style={{
          width: isUnit ? 2 : 1,
          height: isLabelled ? 40 : isUnit ? 28 : 16,
          borderRadius: 1,
          backgroundColor: isUnit ? colors.major : colors.minor,
        }}
      />
      {isLabelled && (
        <Text style={{ color: colors.label, fontSize: 11, marginTop: 6 }}>
          {tenths / TICKS_PER_UNIT}
        </Text>
      )}
    </View>
  );
});

export function RulerPicker({
  value,
  onChange,
  units,
  onUnits,
  caption,
  bleed = 0,
}: RulerPickerProps) {
  const c = useColors();
  const listRef = useRef<FlatList<number>>(null);

  // Measured rather than taken from the window, because the step body is
  // inset: padding the content by half the wrong width puts every reading
  // slightly off the marker it is supposed to line up with.
  const [railWidth, setRailWidth] = useState(0);

  const imperial = units === 'imperial';
  const { min, max, label } = BOUNDS[imperial ? 'imperial' : 'metric'];

  // Every position is an integer number of tenths, so the arithmetic is exact.
  const minTenths = min * TICKS_PER_UNIT;
  const count = (max - min) * TICKS_PER_UNIT + 1;

  const toDisplay = useCallback((kg: number) => (imperial ? kgToLb(kg) : kg), [imperial]);

  const indexOfKg = useCallback(
    (kg: number) =>
      Math.min(count - 1, Math.max(0, Math.round(toDisplay(kg) * TICKS_PER_UNIT) - minTenths)),
    [count, minTenths, toDisplay],
  );

  const displayAt = useCallback(
    (index: number) => (minTenths + index) / TICKS_PER_UNIT,
    [minTenths],
  );

  // Tracks the ruler while it moves, so the big number stays live under the
  // finger; the parent is only told once the scroll settles.
  const [reading, setReading] = useState(() => toDisplay(value));

  // Re-seat once measured, and again whenever a unit switch rescales the
  // ruler. Not on every `value` change, which would fight the finger.
  useEffect(() => {
    if (railWidth <= 0) return;
    const index = indexOfKg(value);
    setReading(displayAt(index));
    listRef.current?.scrollToOffset({ offset: index * TICK_SPACING, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, railWidth]);

  const indexAt = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.min(
      count - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.x / TICK_SPACING)),
    );

  const track = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setReading(displayAt(indexAt(event)));

  const commit = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const display = displayAt(indexAt(event));
    setReading(display);
    const kg = imperial ? lbToKg(display) : display;
    onChange(Number(kg.toFixed(2)));
  };

  // The readout re-renders on every scroll frame. Both of these have to keep
  // their identity across those renders or the list rebuilds thousands of
  // ticks per second instead of reusing them.
  const ticks = useMemo(
    () => Array.from({ length: count }, (_, i) => minTenths + i),
    [count, minTenths],
  );

  const tickColors = useMemo(
    () => ({ major: c.text.primary, minor: c.text.tertiary, label: c.text.tertiary }),
    [c.text.primary, c.text.tertiary],
  );

  const renderItem = useCallback(
    ({ item }: { item: number }) => <Tick tenths={item} colors={tickColors} />,
    [tickColors],
  );

  return (
    <View style={{ gap: 36 }}>
      <UnitToggle value={units} onChange={onUnits} imperialLabel="lbs" metricLabel="kg" />

      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: c.text.secondary, fontSize: 15 }}>{caption}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={{ color: c.text.primary, fontSize: 46, fontWeight: '700' }}>
            {reading.toFixed(1)}
          </Text>
          <Text
            style={{ color: c.text.secondary, fontSize: 18, marginLeft: 6, marginBottom: 8 }}
          >
            {label}
          </Text>
        </View>
      </View>

      <View
        onLayout={(event: LayoutChangeEvent) => setRailWidth(event.nativeEvent.layout.width)}
        style={{
          height: RULER_HEIGHT,
          justifyContent: 'flex-start',
          marginHorizontal: -bleed,
        }}
      >
        <FlatList
          ref={listRef}
          horizontal
          data={ticks}
          keyExtractor={(item) => String(item)}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          // Thousands of ticks only stay smooth because the row is a fixed
          // width, which lets the list virtualise and jump to an index.
          getItemLayout={(_, index) => ({
            length: TICK_SPACING,
            offset: index * TICK_SPACING,
            index,
          })}
          snapToInterval={TICK_SPACING}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={track}
          onMomentumScrollEnd={commit}
          onScrollEndDrag={commit}
          // Half a screen of padding on each side lets the first and last
          // ticks reach the centre marker.
          contentContainerStyle={{ paddingHorizontal: railWidth / 2 }}
          accessibilityLabel={caption}
        />

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: railWidth / 2 - 1.5,
            top: 0,
            width: 3,
            height: 46,
            borderRadius: 2,
            backgroundColor: c.accent.lime,
          }}
        />
      </View>
    </View>
  );
}
