import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Tab bar icons, drawn rather than imported.
 *
 * The bar previously used typographic glyphs — a circled dot for Home, a
 * filled circle for Scan, a diamond for Progress — which are abstract shapes
 * that say nothing about where they lead.
 *
 * Emoji would have been the quick fix and are the wrong tool: they render in
 * their own colours and ignore a tint, so the active-versus-inactive lime and
 * grey would have stopped working. These are stroked paths taking `stroke`
 * from the colour the navigator hands down, so tinting keeps working and the
 * icons stay crisp at any density.
 *
 * react-native-svg is already a dependency (the progress rings use it), so
 * this adds nothing to the bundle — which was the reason the glyphs were
 * chosen over an icon font in the first place.
 */

interface TabIconProps {
  color: ColorValue;
  focused: boolean;
  size?: number;
}

const VIEW_BOX = '0 0 24 24';

/** A touch heavier when selected, so the active tab reads even in monochrome. */
const strokeFor = (focused: boolean): number => (focused ? 2.4 : 1.9);

export function HomeIcon({ color, focused, size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
      <Path
        d="M3 10.7 12 3.5l9 7.2V20a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 20z"
        stroke={color}
        strokeWidth={strokeFor(focused)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.4 21.2v-6.4h5.2v6.4"
        stroke={color}
        strokeWidth={strokeFor(focused)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A camera: the Scan tab opens the viewfinder to photograph a meal. */
export function ScanIcon({ color, focused, size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
      <Path
        d="M4 7.6h3.1l1.4-2.1h7l1.4 2.1H20A1.4 1.4 0 0 1 21.4 9v9.6A1.4 1.4 0 0 1 20 20H4a1.4 1.4 0 0 1-1.4-1.4V9A1.4 1.4 0 0 1 4 7.6z"
        stroke={color}
        strokeWidth={strokeFor(focused)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13.6} r={3.4} stroke={color} strokeWidth={strokeFor(focused)} />
    </Svg>
  );
}

/** Ascending bars — the shape of the thing the tab is about. */
export function ProgressIcon({ color, focused, size = 24 }: TabIconProps) {
  const stroke = focused ? 2.6 : 2.1;
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
      <Path d="M5 20.5v-5" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <Path d="M12 20.5v-10" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <Path d="M19 20.5V5.5" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
    </Svg>
  );
}
