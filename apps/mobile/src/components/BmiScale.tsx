import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BMI_BANDS, bmiCategory, bmiScalePosition, type BmiCategory } from '@nutrisnap/core';
import { useColors } from '../lib/theme';

/**
 * BMI with the band it falls in, marked on a continuous scale.
 *
 * The gradient runs cool to warm across the whole 15-to-40 range rather than
 * drawing four hard blocks: the cut-offs are conventions, not cliffs, and a
 * marker sitting a tenth either side of 25 should not look like a different
 * diagnosis.
 */

const BAND_COLORS: Record<BmiCategory, (c: ReturnType<typeof useColors>) => string> = {
  underweight: (c) => c.macro.carbs,
  healthy: (c) => c.state.success,
  overweight: (c) => c.state.warning,
  obese: (c) => c.state.danger,
};

export function BmiScale({ value }: { value: number }) {
  const c = useColors();
  const band = bmiCategory(value);
  const position = bmiScalePosition(value);
  const bandColor = BAND_COLORS[band.key](c);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text style={{ color: c.text.primary, fontSize: 34, fontWeight: '700' }}>
          {value.toFixed(2)}
        </Text>
        <Text style={{ color: c.text.secondary, fontSize: 14 }}>Your weight is</Text>
        <View
          style={{
            backgroundColor: bandColor,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 5,
          }}
        >
          <Text style={{ color: c.base['900'], fontSize: 13, fontWeight: '700' }}>
            {band.label}
          </Text>
        </View>
      </View>

      <View>
        <LinearGradient
          colors={[c.macro.carbs, c.state.success, c.state.warning, c.state.danger]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 10, borderRadius: 5 }}
        />

        {/* The marker rides above the bar rather than inside it, so it stays
            visible against every colour the gradient passes through. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${position * 100}%`,
            top: -4,
            width: 3,
            height: 18,
            marginLeft: -1.5,
            borderRadius: 2,
            backgroundColor: c.text.primary,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {BMI_BANDS.map((entry) => (
          <View key={entry.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: BAND_COLORS[entry.key](c),
              }}
            />
            <Text
              style={{
                color: entry.key === band.key ? c.text.primary : c.text.tertiary,
                fontSize: 12,
                fontWeight: entry.key === band.key ? '700' : '500',
              }}
            >
              {entry.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
