const colors = require('@nutrisnap/ui/palette.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        base: colors.base,
        accent: colors.accent,
        macro: colors.macro,
        state: colors.state,
        ink: colors.text,
      },
    },
  },
  plugins: [],
};
