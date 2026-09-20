'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { CRAFTING_STEPS } from '@nutrisnap/core';
import { cn } from '@/lib/cn';

interface CraftingLoaderProps {
  onDone: () => void;
  /** Milliseconds each checklist item takes to tick off. */
  stepDuration?: number;
}

/**
 * The "Crafting your plan…" screen from plan section 1.3 — an animated
 * checklist that ticks through the real steps of the calculation before the
 * reveal. It is theatre, but it is honest theatre: these are the four things
 * calculateTargets() actually does.
 */
export function CraftingLoader({ onDone, stepDuration = 700 }: CraftingLoaderProps) {
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (completed >= CRAFTING_STEPS.length) {
      const finish = setTimeout(onDone, 420);
      return () => clearTimeout(finish);
    }

    const tick = setTimeout(() => setCompleted((n) => n + 1), stepDuration);
    return () => clearTimeout(tick);
  }, [completed, onDone, stepDuration]);

  return (
    <div className="flex flex-col items-center justify-center gap-10 py-16">
      <div className="relative grid h-28 w-28 place-items-center">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-accent-lime/25"
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.15, 0.5] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute inset-3 rounded-full border-2 border-accent-cyan/30"
          animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />
        <Loader2 className="h-9 w-9 animate-spin text-accent-lime" aria-hidden />
      </div>

      <div>
        <h2 className="text-center text-2xl font-semibold tracking-tight">Crafting your plan…</h2>
        <p className="mt-2 text-center text-sm text-ink-secondary">
          Running the numbers on what you told us.
        </p>
      </div>

      <ul className="flex w-full max-w-xs flex-col gap-3" aria-live="polite">
        {CRAFTING_STEPS.map((step, index) => {
          const done = index < completed;
          const active = index === completed;

          return (
            <li
              key={step}
              className={cn(
                'flex items-center gap-3 text-[15px] transition-colors duration-300',
                done ? 'text-ink-primary' : active ? 'text-ink-secondary' : 'text-ink-tertiary',
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors',
                  done ? 'border-accent-lime bg-accent-lime' : 'border-white/20',
                )}
              >
                <AnimatePresence mode="wait">
                  {done ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 460, damping: 18 }}
                    >
                      <Check className="h-3.5 w-3.5 text-base-900" strokeWidth={3} aria-hidden />
                    </motion.span>
                  ) : active ? (
                    <motion.span
                      key="spin"
                      className="h-2 w-2 rounded-full bg-accent-lime"
                      animate={{ opacity: [1, 0.25, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  ) : null}
                </AnimatePresence>
              </span>
              {step}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
