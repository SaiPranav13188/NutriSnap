/**
 * NutriSnap design tokens — the "bio-glass" theme from the project plan.
 *
 * Both the web Tailwind config and the mobile NativeWind config read from
 * here, so a colour only ever needs changing in one place.
 *
 * The rule the plan sets: one vivid accent gradient (electric lime → cyan),
 * reserved for the calorie ring and primary CTAs. Everything else is charcoal
 * and translucent white. If the accent is everywhere, it stops meaning
 * anything.
 */

export const colors = {
  /** Page background — near-black with a faint blue cast, not pure #000. */
  base: {
    900: '#07090C',
    800: '#0C1014',
    700: '#12171D',
    600: '#1A2029',
    500: '#242C37',
  },

  /** Frosted card surfaces. Used with backdrop-blur. */
  glass: {
    DEFAULT: 'rgba(255, 255, 255, 0.045)',
    strong: 'rgba(255, 255, 255, 0.075)',
    border: 'rgba(255, 255, 255, 0.10)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
  },

  /** The one accent. */
  accent: {
    lime: '#C6FF3D',
    limeSoft: '#DEFF8F',
    cyan: '#3DE8FF',
    cyanSoft: '#8FF3FF',
  },

  /** Macro colours — distinct from the accent so rings stay readable. */
  macro: {
    protein: '#FF8A5B',
    carbs: '#5BA8FF',
    fat: '#FFD166',
  },

  text: {
    primary: '#F4F7FA',
    secondary: '#9AA6B4',
    tertiary: '#5F6B7A',
  },

  state: {
    success: '#43E6A0',
    warning: '#FFC24B',
    danger: '#FF5B6E',
  },
} as const;

/** The accent gradient, as stops, for CSS and SVG alike. */
export const accentGradient = {
  from: colors.accent.lime,
  to: colors.accent.cyan,
  css: `linear-gradient(135deg, ${colors.accent.lime} 0%, ${colors.accent.cyan} 100%)`,
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
