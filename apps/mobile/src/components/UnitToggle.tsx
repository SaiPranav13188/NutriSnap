import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Units } from '@nutrisnap/core';
import { useColors } from '../lib/theme';

/**
 * The metric/imperial segmented control that sits above the height and weight
 * pickers.
 *
 * The labels differ per measure — "ft, in / cm" over a height, "lbs / kg" over
 * a weight — but both drive the one `units` answer, because the profile stores
 * a single display preference and showing height in feet while weighing in
 * kilograms is not a state it can represent.
 */

interface UnitToggleProps {
  value: Units;
  onChange: (units: Units) => void;
  imperialLabel: string;
  metricLabel: string;
}

export function UnitToggle({ value, onChange, imperialLabel, metricLabel }: UnitToggleProps) {
  const c = useColors();

  const options: { units: Units; label: string }[] = [
    { units: 'imperial', label: imperialLabel },
    { units: 'metric', label: metricLabel },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'center',
        borderRadius: 999,
        backgroundColor: c.glass.DEFAULT,
        padding: 4,
      }}
    >
      {options.map((option) => {
        const selected = value === option.units;
        return (
          <Pressable
            key={option.units}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(option.units);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              minWidth: 96,
              alignItems: 'center',
              paddingHorizontal: 22,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: selected ? c.accent.lime : 'transparent',
            }}
          >
            <Text
              style={{
                color: selected ? c.base['900'] : c.text.secondary,
                fontSize: 15,
                fontWeight: '600',
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
