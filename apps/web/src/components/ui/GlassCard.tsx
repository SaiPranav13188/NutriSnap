'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  /** Brighter surface for cards that should sit above the rest. */
  strong?: boolean;
  /** Stagger index — cards fade up in sequence on mount. */
  index?: number;
}

/**
 * The frosted surface every panel in the app is built on.
 * Plan section 4: translucent, rounded-2xl, soft ambient shadow.
 */
export function GlassCard({
  strong = false,
  index = 0,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        strong ? 'glass-strong' : 'glass',
        'rounded-2xl shadow-glass',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
