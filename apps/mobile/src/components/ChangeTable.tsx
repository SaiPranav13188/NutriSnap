import { Text, View } from 'react-native';
import { describeChange, type PeriodChange } from '@nutrisnap/core';
import { useColors } from '../lib/theme';

/**
 * "3 day / 7 day / … / All Time" with how much a number moved over each.
 *
 * One table serves weight and expenditure alike — they differ only in unit,
 * tint and how many decimals are worth showing, so a shared component keeps
 * the two rows identical rather than merely similar.
 */

interface ChangeTableProps {
  rows: PeriodChange[];
  unit: string;
  /** Tint for the dash and the arrow. */
  color: string;
  decimals?: number;
}

export function ChangeTable({ rows, unit, color, decimals = 1 }: ChangeTableProps) {
  const c = useColors();

  return (
    <View style={{ gap: 2 }}>
      {rows.map((row) => {
        const flat = row.direction === 'flat';
        // Down is good for weight and neutral for expenditure, so neither
        // direction is coloured as success or failure here — that judgement
        // belongs to the card's own copy, not to an arrow.
        const arrow = flat ? '→' : row.direction === 'up' ? '↑' : '↓';

        return (
          <View
            key={row.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 11,
              gap: 12,
            }}
            accessible
            accessibilityLabel={`${row.label}: ${describeChange(row, unit, decimals)}`}
          >
            <Text style={{ color: c.text.tertiary, fontSize: 14, width: 62 }}>{row.label}</Text>

            {/* A short rule stands in for a sparkline: with one or two
                weigh-ins there is no shape to draw, and an empty chart reads
                as broken where a rule reads as "nothing yet". */}
            <View style={{ width: 34, height: 2, borderRadius: 1, backgroundColor: color }} />

            <Text
              style={{
                color: c.text.primary,
                fontSize: 15,
                fontWeight: '600',
                flex: 1,
                textAlign: 'right',
              }}
            >
              {Math.abs(row.delta).toFixed(decimals)} {unit}
            </Text>

            <Text style={{ color, fontSize: 15 }}>{arrow}</Text>

            <Text
              style={{ color: c.text.tertiary, fontSize: 14, width: 96 }}
              numberOfLines={1}
            >
              {flat ? 'No change' : describeChange(row, unit, decimals)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
