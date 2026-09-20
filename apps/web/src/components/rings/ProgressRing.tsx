'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface ProgressRingProps {
  /** 0..1, already clamped by the caller. */
  ratio: number;
  size: number;
  strokeWidth: number;
  /** Gradient stops for the filled arc. */
  from: string;
  to: string;
  /** Delay before the arc starts drawing, for staggering a row of rings. */
  delay?: number;
  /** Drawn when the user has gone over target. */
  over?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * An SVG arc that draws itself from 0 to `ratio` with spring easing on mount
 * — the motion the plan asks for on every ring, every screen load.
 *
 * The arc starts at 12 o'clock, so the ring is rotated -90°.
 */
export function ProgressRing({
  ratio,
  size,
  strokeWidth,
  from,
  to,
  delay = 0,
  over = false,
  className,
  children,
}: ProgressRingProps) {
  const gradientId = useId();
  const reduceMotion = useReducedMotion();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));

  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
        />

        {/* Filled arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - safeRatio) }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 60, damping: 18, mass: 1, delay }
          }
          style={over ? { filter: 'drop-shadow(0 0 8px rgba(255,91,110,0.55))' } : undefined}
        />
      </svg>

      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}
