'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'accent' | 'glass' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // The accent gradient is reserved for primary actions — plan section 4.
  accent: 'bg-accent text-base-900 font-semibold hover:shadow-glow',
  glass: 'glass-strong text-ink-primary hover:bg-white/[0.11]',
  ghost: 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05]',
  danger: 'bg-state-danger/15 text-state-danger border border-state-danger/30 hover:bg-state-danger/25',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm rounded-xl',
  md: 'h-12 px-6 text-[15px] rounded-2xl',
  lg: 'h-14 px-8 text-base rounded-2xl',
};

export function Button({
  variant = 'accent',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button suppressHydrationWarning
      // Plan section 4: press scales to 0.96.
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      whileHover={isDisabled ? undefined : { scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
}
