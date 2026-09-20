'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  emoji?: string;
}

interface OptionGridProps<T extends string> {
  options: ReadonlyArray<Option<T>>;
  value: T | T[] | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2;
  multiple?: boolean;
}

/** The selectable card used by almost every question in the quiz. */
export function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 1,
  multiple = false,
}: OptionGridProps<T>) {
  const isSelected = (option: T): boolean =>
    multiple && Array.isArray(value) ? value.includes(option) : value === option;

  return (
    <div className={cn('grid gap-2.5', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {options.map((option, index) => {
        const selected = isSelected(option.value);

        return (
          <motion.button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3 }}
            whileTap={{ scale: 0.98 }}
            aria-pressed={selected}
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
              selected
                ? 'border-accent-lime/60 bg-accent-lime/[0.09]'
                : 'border-glass-border bg-white/[0.035] hover:bg-white/[0.06]',
            )}
          >
            {option.emoji && <span className="text-xl leading-none">{option.emoji}</span>}

            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-snug">{option.label}</span>
              {option.hint && (
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-secondary">
                  {option.hint}
                </span>
              )}
            </span>

            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
                selected ? 'border-accent-lime bg-accent-lime' : 'border-white/25',
              )}
            >
              {selected && <Check className="h-3 w-3 text-base-900" strokeWidth={3} aria-hidden />}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
