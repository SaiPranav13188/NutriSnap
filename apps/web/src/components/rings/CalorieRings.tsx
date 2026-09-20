'use client';

import { ringProgress, type MacroTotals } from '@nutrisnap/core';
import { accentGradient, colors, macroGradients } from '@nutrisnap/ui';
import { ProgressRing } from './ProgressRing';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/cn';

interface Targets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface CalorieRingsProps {
  totals: MacroTotals;
  targets: Targets;
}

const MACROS = [
  { key: 'protein', label: 'Protein', totalKey: 'protein_g', targetKey: 'protein_g' },
  { key: 'carbs', label: 'Carbs', totalKey: 'carbs_g', targetKey: 'carbs_g' },
  { key: 'fat', label: 'Fat', totalKey: 'fat_g', targetKey: 'fat_g' },
] as const;

/**
 * The dashboard hero: one big calorie ring with remaining calories emphasised,
 * plus three macro sub-rings beneath it (plan section 3.3 / Image 1).
 */
export function CalorieRings({ totals, targets }: CalorieRingsProps) {
  const calories = ringProgress(totals.calories, targets.calories);

  return (
    <div className="flex flex-col items-center gap-8">
      <ProgressRing
        ratio={calories.ratio}
        size={248}
        strokeWidth={18}
        from={accentGradient.from}
        to={accentGradient.to}
        over={calories.over}
      >
        <div className="flex flex-col items-center text-center">
          <span
            className={cn(
              'text-[56px] font-semibold leading-none tracking-tight',
              calories.over ? 'text-state-danger' : 'text-ink-primary',
            )}
          >
            <AnimatedNumber value={Math.abs(Math.round(calories.remaining))} />
          </span>
          <span className="mt-2 text-[13px] font-medium uppercase tracking-[0.14em] text-ink-secondary">
            {calories.over ? 'over' : 'remaining'}
          </span>
          <span className="mt-3 text-sm text-ink-tertiary">
            <AnimatedNumber value={Math.round(totals.calories)} /> / {Math.round(targets.calories)} kcal
          </span>
        </div>
      </ProgressRing>

      <div className="grid w-full max-w-md grid-cols-3 gap-3">
        {MACROS.map((macro, i) => {
          const consumed = totals[macro.totalKey];
          const target = targets[macro.targetKey];
          const progress = ringProgress(consumed, target);
          const gradient = macroGradients[macro.key];

          return (
            <div key={macro.key} className="flex flex-col items-center gap-2">
              <ProgressRing
                ratio={progress.ratio}
                size={76}
                strokeWidth={7}
                from={gradient.from}
                to={gradient.to}
                delay={0.12 + i * 0.09}
                over={progress.over}
              >
                <span className="text-[15px] font-semibold text-ink-primary">
                  <AnimatedNumber value={Math.round(consumed)} suffix="g" />
                </span>
              </ProgressRing>

              <div className="text-center">
                <p
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: colors.macro[macro.key] }}
                >
                  {macro.label}
                </p>
                <p className="text-[11px] text-ink-tertiary">
                  {Math.max(0, Math.round(progress.remaining))}g left
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
