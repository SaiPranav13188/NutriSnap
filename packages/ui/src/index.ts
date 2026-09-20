/**
 * NutriSnap design tokens — the "bio-glass" theme from the project plan.
 *
 * The raw palette lives in ../palette.json rather than in this file, because
 * two Tailwind configs need it and one of them (the mobile app's) is
 * CommonJS and cannot import TypeScript. JSON is the one format both the
 * bundlers and a plain `require` agree on.
 *
 * The rule the plan sets: one vivid accent gradient (electric lime → cyan),
 * reserved for the calorie ring and primary CTAs. Everything else is charcoal
 * and translucent white. If the accent is everywhere, it stops meaning
 * anything.
 */

import palette from '../palette.json' with { type: 'json' };

export const colors = palette;

/** The accent gradient, as stops, for CSS and SVG alike. */
export const accentGradient = {
  from: palette.accent.lime,
  to: palette.accent.cyan,
  css: `linear-gradient(135deg, ${palette.accent.lime} 0%, ${palette.accent.cyan} 100%)`,
} as const;

export const macroGradients = {
  protein: { from: '#FF8A5B', to: '#FFB08A' },
  carbs: { from: '#5BA8FF', to: '#8FC9FF' },
  fat: { from: '#FFD166', to: '#FFE29E' },
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  '2xl': 32,
  full: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

/** Spring curves used for every ring draw and number count-up. */
export const motion = {
  spring: { type: 'spring', stiffness: 120, damping: 18, mass: 0.9 },
  springSnappy: { type: 'spring', stiffness: 260, damping: 24 },
  ringDuration: 1.1,
  counterDuration: 1.0,
  pressScale: 0.96,
} as const;

export type MacroKey = 'protein' | 'carbs' | 'fat';
