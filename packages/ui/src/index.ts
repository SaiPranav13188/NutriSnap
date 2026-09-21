/**
 * NutriSnap design tokens — the "bio-glass" theme from the project plan.
 *
 * The dark palette lives in ../palette.json rather than in this file, because
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

/** The original dark theme. Still the default everywhere. */
export const darkTheme = palette;

/**
 * Light theme.
 *
 * Not an inversion of the dark one. Two things have to change to stay
 * readable on white:
 *
 *   - The glass surfaces flip from translucent white over charcoal to
 *     translucent white over grey, with a darker hairline border. Without the
 *     border, cards vanish into the page.
 *   - The macro colours are darkened. #FFD166 (fat) is legible on charcoal and
 *     almost invisible on white, so each one is deepened until it holds
 *     contrast against a light background.
 *
 * The lime → cyan accent survives unchanged, because it is only ever used as
 * a fill behind dark text or as a ring stroke, never as text on white.
 */
export const lightTheme = {
  base: {
    900: '#F6F8FA', // page background
    800: '#FFFFFF', // raised surfaces
    700: '#EEF1F5',
    600: '#E2E7EC',
    500: '#D3DAE2',
  },
  glass: {
    DEFAULT: 'rgba(255, 255, 255, 0.72)',
    strong: 'rgba(255, 255, 255, 0.92)',
    border: 'rgba(13, 17, 23, 0.09)',
    borderStrong: 'rgba(13, 17, 23, 0.16)',
  },
  accent: {
    lime: '#A8E01F',
    limeSoft: '#CFF06E',
    cyan: '#12C4E0',
    cyanSoft: '#7FE2F2',
  },
  macro: {
    protein: '#D9531E',
    carbs: '#1F6FD0',
    fat: '#B07B08',
  },
  micro: {
    fiber: '#6247D6',
    sugar: '#C42D7B',
    sodium: '#A86A05',
  },
  text: {
    primary: '#0D1117',
    secondary: '#49555F',
    tertiary: '#78848F',
  },
  state: {
    success: '#12855A',
    warning: '#A56A00',
    danger: '#C8354B',
  },
} as const;

export type ThemeName = 'dark' | 'light';

/** Both palettes share a shape, so a component can swap between them freely. */
export type Theme = typeof darkTheme;

export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme as unknown as Theme,
};

/** Kept for existing imports; equivalent to `darkTheme`. */
export const colors = darkTheme;

/** The accent gradient, as stops, for CSS and SVG alike. */
export const accentGradient = {
  from: palette.accent.lime,
  to: palette.accent.cyan,
  css: `linear-gradient(135deg, ${palette.accent.lime} 0%, ${palette.accent.cyan} 100%)`,
} as const;

export function accentGradientFor(theme: Theme) {
  return { from: theme.accent.lime, to: theme.accent.cyan };
}

export const macroGradients = {
  protein: { from: '#FF8A5B', to: '#FFB08A' },
  carbs: { from: '#5BA8FF', to: '#8FC9FF' },
  fat: { from: '#FFD166', to: '#FFE29E' },
} as const;

/** Macro ring gradients that track the active theme. */
export function macroGradientsFor(theme: Theme) {
  return {
    protein: { from: theme.macro.protein, to: theme.macro.protein },
    carbs: { from: theme.macro.carbs, to: theme.macro.carbs },
    fat: { from: theme.macro.fat, to: theme.macro.fat },
  };
}

/** The same, for the fibre/sugar/sodium rings on the dashboard's second page. */
export function microGradientsFor(theme: Theme) {
  return {
    fiber: { from: theme.micro.fiber, to: theme.micro.fiber },
    sugar: { from: theme.micro.sugar, to: theme.micro.sugar },
    sodium: { from: theme.micro.sodium, to: theme.micro.sodium },
  };
}

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

export type MicroKey = 'fiber' | 'sugar' | 'sodium';
