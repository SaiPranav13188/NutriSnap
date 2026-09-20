import type { Config } from 'tailwindcss';
import { colors, radii } from '@nutrisnap/ui';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: colors.base,
        accent: colors.accent,
        macro: colors.macro,
        state: colors.state,
        ink: colors.text,
        glass: {
          DEFAULT: colors.glass.DEFAULT,
          strong: colors.glass.strong,
          border: colors.glass.border,
          'border-strong': colors.glass.borderStrong,
        },
      },
      borderRadius: {
        '2xl': `${radii['2xl']}px`,
        xl: `${radii.xl}px`,
        lg: `${radii.lg}px`,
      },
      fontFamily: {
        // Plan section 4: one geometric sans. Inter is the free fallback and
        // is loaded via next/font in the root layout.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.42)',
        'glass-lg': '0 24px 64px rgba(0, 0, 0, 0.55)',
        glow: `0 0 28px ${colors.accent.lime}33`,
      },
      backgroundImage: {
        accent: `linear-gradient(135deg, ${colors.accent.lime} 0%, ${colors.accent.cyan} 100%)`,
        'accent-soft': `linear-gradient(135deg, ${colors.accent.lime}22 0%, ${colors.accent.cyan}22 100%)`,
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.15', transform: 'scale(1.06)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
