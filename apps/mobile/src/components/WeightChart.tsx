import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { SeriesPoint } from '../lib/api';
import { useColors } from '../lib/theme';

interface WeightChartProps {
  series: SeriesPoint[];
  trendLine: SeriesPoint[];
  goalKg: number | null;
  width: number;
  height?: number;
}

/**
 * The Progress chart, drawn directly with react-native-svg.
 *
 * The plan suggests Victory Native or Gifted Charts. Both pull native
 * dependencies (Skia, react-native-linear-gradient) that are not guaranteed
 * inside Expo Go, and Expo Go is how this app is meant to be tested. Plain
 * SVG is already bundled in Expo Go, so this renders on a physical phone with
 * no custom dev client — and it gives exact control over the bio-glass look.
 */
export function WeightChart({ series, trendLine, goalKg, width, height = 210 }: WeightChartProps) {
  const c = useColors();
  const [active, setActive] = useState<number | null>(null);

  if (series.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.text.secondary, fontSize: 14 }}>No weigh-ins yet.</Text>
        <Text style={{ color: c.text.tertiary, fontSize: 13, marginTop: 4 }}>
          Log your weight and your trend will start here.
        </Text>
      </View>
    );
  }

  const padding = { top: 16, right: 14, bottom: 26, left: 38 };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);

  const values = series.map((p) => p.value);
  const candidates = goalKg !== null ? [...values, goalKg] : values;
  const rawMin = Math.min(...candidates);
  const rawMax = Math.max(...candidates);
  // Guard the flat-line case, where min === max would divide by zero.
  const pad = Math.max(0.6, (rawMax - rawMin) * 0.18);
  const min = rawMin - pad;
  const max = rawMax + pad;

  const x = (i: number): number =>
    padding.left + (series.length === 1 ? plotWidth / 2 : (i / (series.length - 1)) * plotWidth);
  const y = (value: number): number =>
    padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  const linePath = series
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(point.value).toFixed(2)}`)
    .join(' ');

  const areaPath =
    `${linePath} L${x(series.length - 1).toFixed(2)},${(padding.top + plotHeight).toFixed(2)}` +
    ` L${x(0).toFixed(2)},${(padding.top + plotHeight).toFixed(2)} Z`;

  const trendPath = trendLine
    .slice(0, series.length)
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(point.value).toFixed(2)}`)
    .join(' ');

  // Four horizontal guides, labelled with their weight.
  const gridValues = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);

  const activePoint = active !== null ? series[active] : null;

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={c.accent.lime} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={c.accent.cyan} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {gridValues.map((value) => (
          <G key={value}>
            <Line
              x1={padding.left}
              y1={y(value)}
              x2={width - padding.right}
              y2={y(value)}
              stroke={c.glass.border}
              strokeWidth={1}
            />
            <SvgText
              x={padding.left - 8}
              y={y(value) + 4}
              fill={c.text.tertiary}
              fontSize={10}
              textAnchor="end"
            >
              {value.toFixed(0)}
            </SvgText>
          </G>
        ))}

        {goalKg !== null && (
          <G>
            <Line
              x1={padding.left}
              y1={y(goalKg)}
              x2={width - padding.right}
              y2={y(goalKg)}
              stroke={c.accent.cyan}
              strokeWidth={1.4}
              strokeDasharray="5,5"
              strokeOpacity={0.8}
            />
            <SvgText
              x={width - padding.right}
              y={y(goalKg) - 6}
              fill={c.accent.cyan}
              fontSize={10}
              textAnchor="end"
            >
              {`Goal ${goalKg} kg`}
            </SvgText>
          </G>
        )}

        <Path d={areaPath} fill="url(#weightArea)" />
        <Path d={linePath} stroke={c.accent.lime} strokeWidth={2} fill="none" />

        {trendPath && (
          <Path
            d={trendPath}
            stroke={c.accent.cyan}
            strokeWidth={1.4}
            strokeOpacity={0.55}
            fill="none"
          />
        )}

        {/* Wide invisible hit targets — a 4px dot is impossible to tap. */}
        {series.map((point, i) => (
          <Circle
            key={point.date}
            cx={x(i)}
            cy={y(point.value)}
            r={14}
            fill="transparent"
            onPress={() => setActive(active === i ? null : i)}
          />
        ))}

        {active !== null && series[active] && (
          <Circle
            cx={x(active)}
            cy={y(series[active]!.value)}
            r={5}
            fill={c.accent.lime}
            stroke={c.base['900']}
            strokeWidth={2}
          />
        )}

        <SvgText
          x={padding.left}
          y={height - 6}
          fill={c.text.tertiary}
          fontSize={10}
          textAnchor="start"
        >
          {formatDate(series[0]!.date)}
        </SvgText>
        <SvgText
          x={width - padding.right}
          y={height - 6}
          fill={c.text.tertiary}
          fontSize={10}
          textAnchor="end"
        >
          {formatDate(series[series.length - 1]!.date)}
        </SvgText>
      </Svg>

      {activePoint && (
        <View
          style={{
            marginTop: 8,
            alignSelf: 'center',
            backgroundColor: c.glass.DEFAULT,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: c.text.primary, fontSize: 13 }}>
            {formatDate(activePoint.date)} · {activePoint.value.toFixed(1)} kg
          </Text>
        </View>
      )}
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
