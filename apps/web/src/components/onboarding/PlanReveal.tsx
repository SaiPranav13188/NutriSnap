'use client';

import { motion } from 'framer-motion';
import { Flame, Info } from 'lucide-react';
import type { TargetResult } from '@nutrisnap/core';
import { accentGradient, macroGradients } from '@nutrisnap/ui';
import { ProgressRing } from '@/components/rings/ProgressRing';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

interface PlanRevealProps {
  targets: TargetResult;
  goalWeightKg?: number;
  projectedDate?: Date | null;
}

/**
 * The payoff screen (plan section 1.3): the computed target revealed with
 * animated count-up numbers, and an honest note about where it came from.
 */
export function PlanReveal({ targets, goalWeightKg, projectedDate }: PlanRevealProps) {
  const macros = [
    { key: 'protein', label: 'Protein', value: targets.protein_g },
    { key: 'carbs', label: 'Carbs', value: targets.carbs_g },
    { key: 'fat', label: 'Fat', value: targets.fat_g },
  ] as const;

  return (
    <div className="flex flex-col items-center gap-9">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 16 }}
        className="text-center"
      >
        <p className="text-sm uppercase tracking-[0.18em] text-ink-secondary">Your daily target</p>
      </motion.div>

      <ProgressRing ratio={1} size={228} strokeWidth={16} from={accentGradient.from} to={accentGradient.to}>
        <div className="text-center">
          <span className="text-[58px] font-semibold leading-none tracking-tight">
            <AnimatedNumber value={targets.calories} duration={1.4} />
          </span>
          <p className="mt-1.5 text-sm uppercase tracking-[0.16em] text-ink-secondary">calories</p>
        </div>
      </ProgressRing>

      <div className="grid w-full max-w-sm grid-cols-3 gap-3">
        {macros.map((macro, index) => (
          <motion.div
            key={macro.key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + index * 0.1, duration: 0.45 }}
            className="glass rounded-2xl p-4 text-center"
          >
            <p
              className="text-2xl font-semibold"
              style={{ color: macroGradients[macro.key].from }}
            >
              <AnimatedNumber value={macro.value} suffix="g" duration={1.2} />
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-ink-secondary">{macro.label}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex w-full max-w-sm flex-col gap-3"
      >
        <div className="glass flex items-start gap-3 rounded-2xl p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" aria-hidden />
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            Built from your BMR of <strong className="text-ink-primary">{Math.round(targets.bmr)}</strong>{' '}
            kcal and an estimated daily burn of{' '}
            <strong className="text-ink-primary">{Math.round(targets.tdee)}</strong> kcal.
            {targets.floorApplied && (
              <>
                {' '}
                We raised your target to the safe minimum — the pace you picked would have
                taken it lower than is healthy.
              </>
            )}
          </p>
        </div>

        {goalWeightKg && projectedDate && (
          <div className="glass flex items-start gap-3 rounded-2xl p-4">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-accent-lime" aria-hidden />
            <p className="text-[13px] leading-relaxed text-ink-secondary">
              At this pace you should reach{' '}
              <strong className="text-ink-primary">{goalWeightKg} kg</strong> around{' '}
              <strong className="text-ink-primary">
                {projectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </strong>
              .
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
