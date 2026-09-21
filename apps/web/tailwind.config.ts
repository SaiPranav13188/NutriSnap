import type { Config } from 'tailwindcss';
import { radii } from '@nutrisnap/ui';

/**
 * Colours resolve to CSS variables defined in globals.css rather than to
 * literal hex values, so a single `data-theme` swap on <html> repaints the
 * whole app. The variables are the source of truth; the token names here just
 * make them reachable from Tailwind classes.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          900: 'var(--base-900)',
          800: 'var(--base-800)',
          700: 'var(--base-700)',
          600: 'var(--base-600)',
          500: 'var(--base-500)',
        },
        accent: {
          lime: 'var(--accent-lime)',
          cyan: 'var(--accent-cyan)',
        },
        macro: {
          protein: 'var(--macro-protein)',
          carbs: 'var(--macro-carbs)',
          fat: 'var(--macro-fat)',
        },
        state: {
          success: 'var(--state-success)',
          warning: 'var(--state-warning)',
          danger: 'var(--state-danger)',
        },
        ink: {
          primary: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          tertiary: 'var(--ink-tertiary)',
        },
        glass: {
          DEFAULT: 'var(--glass-fill)',
          strong: 'var(--glass-fill-strong)',
          border: 'var(--glass-border)',
          'border-strong': 'var(--glass-border-strong)',
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
        glass: 'var(--shadow-glass)',
        'glass-lg': '0 24px 64px rgba(0, 0, 0, 0.25)',
        glow: '0 0 28px color-mix(in srgb, var(--accent-lime) 30%, transparent)',
      },
      backgroundImage: {
        accent: 'linear-gradient(135deg, var(--accent-lime) 0%, var(--accent-cyan) 100%)',
        'accent-soft':
          'linear-gradient(135deg, color-mix(in srgb, var(--accent-lime) 14%, transparent) 0%, color-mix(in srgb, var(--accent-cyan) 14%, transparent) 100%)',
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
