'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { colors } from '@nutrisnap/ui';
import type { SeriesPoint } from '@/lib/api';

interface WeightChartProps {
  series: SeriesPoint[];
  trendLine: SeriesPoint[];
  goalKg: number | null;
}

/**
 * The weight chart from plan section 3.4 / Image 4 — area chart, a smoothed
 * trend line over the raw weigh-ins, a dotted goal reference line, and a
 * tooltip on hover.
 */
export function WeightChart({ series, trendLine, goalKg }: WeightChartProps) {
  if (series.length === 0) {
    return (
      <div className="grid h-56 place-items-center text-center">
        <div>
          <p className="text-ink-secondary">No weigh-ins yet.</p>
          <p className="mt-1 text-sm text-ink-tertiary">
            Log your weight and your trend will start here.
          </p>
        </div>
      </div>
    );
  }

  const data = series.map((point, i) => ({
    date: point.date,
    weight: point.value,
    trend: trendLine[i]?.value ?? null,
  }));

  const values = series.map((p) => p.value);
  const min = Math.min(...values, goalKg ?? Infinity);
  const max = Math.max(...values, goalKg ?? -Infinity);
  // A little headroom keeps the line off the edges of the plot.
  const padding = Math.max(0.6, (max - min) * 0.18);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent.lime} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colors.accent.cyan} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.055)" vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: colors.text.tertiary, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickFormatter={(value: string) =>
              new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            }
          />

          <YAxis
            domain={[min - padding, max + padding]}
            tick={{ fill: colors.text.tertiary, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(value: number) => `${value.toFixed(0)}`}
          />

          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
            contentStyle={{
              background: 'rgba(12,16,20,0.94)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              fontSize: 13,
              padding: '10px 12px',
            }}
            labelStyle={{ color: colors.text.secondary, marginBottom: 4 }}
            labelFormatter={(value: string) =>
              new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            }
            formatter={(value: number, name: string) => [
              `${Number(value).toFixed(1)} kg`,
              name === 'weight' ? 'Weighed' : '7-day average',
            ]}
          />

          {goalKg !== null && (
            <ReferenceLine
              y={goalKg}
              stroke={colors.accent.cyan}
              strokeDasharray="5 5"
              strokeOpacity={0.75}
              label={{
                value: `Goal ${goalKg} kg`,
                position: 'insideTopRight',
                fill: colors.accent.cyan,
                fontSize: 11,
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="weight"
            stroke={colors.accent.lime}
            strokeWidth={2}
            fill="url(#weightFill)"
            dot={false}
            activeDot={{ r: 4, fill: colors.accent.lime, stroke: colors.base[900], strokeWidth: 2 }}
            animationDuration={900}
          />

          <Line
            type="monotone"
            dataKey="trend"
            stroke={colors.accent.cyan}
            strokeWidth={1.5}
            strokeOpacity={0.55}
            dot={false}
            animationDuration={1100}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
