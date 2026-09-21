import { useMemo } from 'react';
import { View } from 'react-native';
import { cmToFeetInches, feetInchesToCm, type Units } from '@nutrisnap/core';
import { WheelColumn, WheelGroup, type WheelItem } from './WheelPicker';
import { UnitToggle } from './UnitToggle';

/**
 * Height wheels, in feet-and-inches or centimetres.
 *
 * Two columns in imperial and one in metric, because that is how each system
 * is actually spoken — nobody reads their height as 68 inches. The value is
 * always stored in centimetres; the unit only decides which wheels are shown.
 *
 * The bounds match the 80–260 cm the API accepts, so no reachable selection
 * can be rejected on submit.
 */

const MIN_CM = 80;
const MAX_CM = 260;

interface HeightPickerProps {
  /** Centimetres. */
  value: number;
  onChange: (cm: number) => void;
  units: Units;
  onUnits: (units: Units) => void;
}

export function HeightPicker({ value, onChange, units, onUnits }: HeightPickerProps) {
  const imperial = units === 'imperial';
  const clamped = Math.min(MAX_CM, Math.max(MIN_CM, value));

  const centimetres = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: MAX_CM - MIN_CM + 1 }, (_, i) => ({
        value: String(MIN_CM + i),
        label: `${MIN_CM + i} cm`,
      })),
    [],
  );

  // 80 cm is 2'7" and 260 cm is 8'6", so these are the feet that can appear.
  const feetItems = useMemo<WheelItem[]>(
    () => Array.from({ length: 7 }, (_, i) => ({ value: String(i + 2), label: `${i + 2} ft` })),
    [],
  );

  const inchItems = useMemo<WheelItem[]>(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: `${i} in` })),
    [],
  );

  const { feet, inches } = cmToFeetInches(clamped);

  const setImperial = (nextFeet: number, nextInches: number) => {
    const cm = feetInchesToCm(nextFeet, nextInches);
    onChange(Math.round(Math.min(MAX_CM, Math.max(MIN_CM, cm))));
  };

  return (
    <View style={{ gap: 40 }}>
      <UnitToggle value={units} onChange={onUnits} imperialLabel="ft, in" metricLabel="cm" />

      {imperial ? (
        <WheelGroup>
          <WheelColumn
            items={feetItems}
            value={String(feet)}
            onChange={(v) => setImperial(Number(v), inches)}
            accessibilityLabel="Height in feet"
          />
          <WheelColumn
            items={inchItems}
            value={String(inches)}
            onChange={(v) => setImperial(feet, Number(v))}
            accessibilityLabel="Height in inches"
          />
        </WheelGroup>
      ) : (
        <WheelGroup>
          <WheelColumn
            items={centimetres}
            value={String(Math.round(clamped))}
            onChange={(v) => onChange(Number(v))}
            accessibilityLabel="Height in centimetres"
          />
        </WheelGroup>
      )}
    </View>
  );
}
