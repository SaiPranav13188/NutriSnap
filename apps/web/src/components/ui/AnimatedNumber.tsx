'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface AnimatedNumberProps {
  value: number;
  /** Decimal places to show. */
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}

/**
 * Counts up from 0 (or from the previous value on update) with an ease-out
 * tween — plan section 4, "number counters animate".
 *
 * Written against the DOM node rather than React state so a 60fps count-up
 * does not trigger a re-render on every frame.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  duration = 1,
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();

  const format = (n: number): string =>
    `${prefix}${n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const target = Number.isFinite(value) ? value : 0;

    if (reduceMotion || !inView) {
      node.textContent = format(inView ? target : 0);
      if (inView) previous.current = target;
      return;
    }

    const controls = animate(previous.current, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
    });

    previous.current = target;
    return () => controls.stop();
    // `format` is derived from the formatting props, which are listed here.
  }, [value, inView, reduceMotion, duration, decimals, prefix, suffix]);

  return (
    <span ref={ref} className={cn('tnum', className)}>
      {format(0)}
    </span>
  );
}
