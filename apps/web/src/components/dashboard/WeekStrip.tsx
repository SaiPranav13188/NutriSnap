'use client';

import { motion } from 'framer-motion';
import type { DayTotals } from '@/lib/api';
import { cn } from '@/lib/cn';

interface WeekStripProps {
  days: DayTotals[];
  targetCalories: number;
  selectedDate: string;
  onSelect: (date: string) => void;
}

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The week row from plan section 3.3 / Image 1: one small completion ring per
 * day, with today highlighted and past days tappable.
 */
export function WeekStrip({ days, targetCalories, selectedDate, onSelect }: WeekStripProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-start justify-between gap-1">
      {days.map((day, index) => {
        const date = new Date(`${day.day}T12:00:00Z`);
        const ratio = targetCalories > 0 ? Math.min(1, day.calories / targetCalories) : 0;
        const isToday = day.day === today;
        const isSelected = day.day === selectedDate;
        const circumference = 2 * Math.PI * 15;

        return (
          <button suppressHydrationWarning
            key={day.day}
            type="button"
            onClick={() => onSelect(day.day)}
            aria-current={isSelected ? 'date' : undefined}
            aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, ${Math.round(day.calories)} calories`}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-xl py-1 transition-colors hover:bg-white/[0.04]"
          >
            <span
              className={cn(
                'text-[11px] font-medium uppercase',
                isToday ? 'text-accent-lime' : 'text-ink-tertiary',
              )}
            >
              {LETTERS[date.getUTCDay()]}
            </span>

            <span className="relative grid h-9 w-9 place-items-center">
              <svg width={36} height={36} className="-rotate-90" aria-hidden>
                <circle cx={18} cy={18} r={15} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
                <motion.circle
                  cx={18}
                  cy={18}
                  r={15}
                  fill="none"
                  stroke={ratio >= 1 ? '#C6FF3D' : '#3DE8FF'}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * (1 - ratio) }}
                  transition={{ delay: index * 0.05, type: 'spring', stiffness: 70, damping: 16 }}
                />
              </svg>
              <span
                className={cn(
                  'absolute text-[11px] font-semibold',
                  isSelected ? 'text-ink-primary' : 'text-ink-secondary',
                )}
              >
                {date.getUTCDate()}
              </span>
            </span>

            {isSelected && (
              <motion.span
                layoutId="week-selected"
                className="h-1 w-1 rounded-full bg-accent-lime"
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              />
            )}
            {!isSelected && <span className="h-1 w-1" />}
          </button>
        );
      })}
    </div>
  );
}
