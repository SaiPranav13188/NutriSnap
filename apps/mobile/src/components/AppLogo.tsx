import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../lib/theme';

/**
 * The NutriSnap mark.
 *
 * Drawn rather than imported, for the same reason the tab icons are: one
 * shape that stays crisp at any density and needs no @2x/@3x assets in the
 * bundle, and react-native-svg is already here for the progress rings.
 *
 * The mark is an open aperture with a leaf at its centre and a shutter light
 * riding the gap — the two halves of the name in one figure. Everything is
 * struck in the accent gradient on a dark slab, because the lime end of that
 * gradient is far too light to hold a thin stroke against a white header.
 */

/**
 * The slab is not a theme token.
 *
 * On white it has to be near-black for the neon to read. On the dark theme
 * that same near-black would dissolve into the page, so it lifts to the
 * raised-surface greys instead of inverting.
 */
const SLAB = {
  light: { from: '#0B1016', to: '#05070A' },
  dark: { from: '#161D26', to: '#0C1116' },
} as const;

export function AppLogo({ size = 36 }: { size?: number }) {
  const { theme, name } = useTheme();
  const slab = SLAB[name];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="NutriSnap">
      <Defs>
        <LinearGradient id="logoNeon" x1="6%" y1="4%" x2="94%" y2="96%">
          <Stop offset="0%" stopColor={theme.accent.lime} />
          <Stop offset="100%" stopColor={theme.accent.cyan} />
        </LinearGradient>
        <LinearGradient id="logoSlab" x1="0%" y1="0%" x2="70%" y2="100%">
          <Stop offset="0%" stopColor={slab.from} />
          <Stop offset="100%" stopColor={slab.to} />
        </LinearGradient>
      </Defs>

      <Rect width="24" height="24" rx="7" fill="url(#logoSlab)" />

      {/* The aperture, left open at the top right so it reads as an
          instrument rather than a plain circle. */}
      <Path
        d="M18.4 8.7a7.2 7.2 0 1 1-3.5-3.5"
        fill="none"
        stroke="url(#logoNeon)"
        strokeWidth={1.6}
        strokeLinecap="round"
      />

      {/* The shutter light, sitting in the gap the arc leaves. */}
      <Circle cx="18.9" cy="5.1" r="2" fill="url(#logoNeon)" />

      {/* A vesica leaf on the aperture's diagonal: two arcs meeting at the
          tips, which is the smallest figure that still reads as a leaf once
          the whole mark is 38px wide. */}
      <Path
        d="M8.1 15.9C8.1 11.6 11.6 8.1 15.9 8.1C15.9 12.4 12.4 15.9 8.1 15.9Z"
        fill="url(#logoNeon)"
      />
      <Path
        d="M9.8 14.2L14.2 9.8"
        stroke={slab.to}
        strokeWidth={1.1}
        strokeLinecap="round"
        opacity={0.85}
      />
    </Svg>
  );
}
