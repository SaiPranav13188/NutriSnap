'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { colors } from '@nutrisnap/ui';

interface MacroChartProps {
  data: Array<{ date: string; protein_g: number; carbs_g: number; fat_g: number }>;
}

/**
 * The stacked macro-over-time chart from plan section 3.4's "extra chart worth
 * adding". Only the last 30 days — beyond that the bars become unreadable.
 */
export function MacroChart({ data }: MacroChartProps) {
  const recent = data.slice(-30);

  if (recent.every((d) => d.protein_g + d.carbs_g + d.fat_g === 0)) {
    return (
      <div className="grid h-48 place-items-center">
        <p className="text-sm text-ink-tertiary">Log a few meals and your macro split appears here.</p>
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={recent} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.055)" vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: colors.text.tertiary, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={(value: string) =>
              new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            }
          />

          <YAxis
            tick={{ fill: colors.text.tertiary, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(value: number) => `${value}g`}
          />

          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{
              background: 'rgba(12,16,20,0.94)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              fontSize: 13,
            }}
            labelStyle={{ color: colors.text.secondary }}
            formatter={(value: number, name: string) => [`${Math.round(value)}g`, name]}
          />

          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
            iconType="circle"
            iconSize={8}
          />

          <Bar dataKey="protein_g" name="Protein" stackId="m" fill={colors.macro.protein} radius={[0, 0, 0, 0]} />
          <Bar dataKey="carbs_g" name="Carbs" stackId="m" fill={colors.macro.carbs} />
          <Bar dataKey="fat_g" name="Fat" stackId="m" fill={colors.macro.fat} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
