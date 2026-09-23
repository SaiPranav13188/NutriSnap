import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';
import { useColors } from '../lib/theme';

/**
 * The glass and bottles above the water quick-add buttons.
 *
 * Drawn rather than imported, like the tab icons and the app mark: one shape
 * that stays crisp at any density and adds nothing to the bundle, since
 * react-native-svg is already here.
 *
 * The three are deliberately different vessels rather than one at three
 * sizes. A row of identical outlines would make the buttons look like a
 * stepper, when what they actually are is a glass, a small bottle and a big
 * one — which is how people think about what they just drank.
 */
export type Vessel = 'glass' | 'smallBottle' | 'bottle';

interface Shape {
  /** The outline, in a 24x24 box. */
  d: string;
  /** Where the water starts; lower means less in it. */
  waterTop: number;
}

const SHAPES: Readonly<Record<Vessel, Shape>> = {
  glass: {
    d: 'M7.6 5H16.4L15.3 18.9A1.7 1.7 0 0 1 13.6 20.5H10.4A1.7 1.7 0 0 1 8.7 18.9Z',
    waterTop: 8.4,
  },
  smallBottle: {
    d: 'M10.7 5H13.3V6.8C13.3 7.9 14.7 8.5 14.7 10.3V18.4A1.8 1.8 0 0 1 12.9 20.2H11.1A1.8 1.8 0 0 1 9.3 18.4V10.3C9.3 8.5 10.7 7.9 10.7 6.8Z',
    waterTop: 11.2,
  },
  bottle: {
    d: 'M10.1 1.8H13.9V4.5C13.9 6 16.5 7 16.5 9.6V19.2A2.1 2.1 0 0 1 14.4 21.3H9.6A2.1 2.1 0 0 1 7.5 19.2V9.6C7.5 7 10.1 6 10.1 4.5Z',
    waterTop: 7.6,
  },
};

export function WaterVessel({ vessel, size = 26 }: { vessel: Vessel; size?: number }) {
  const c = useColors();
  const shape = SHAPES[vessel];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        {/* The fill is a plain rectangle clipped to the vessel, which is what
            gives it a flat waterline instead of a shape-hugging blob. */}
        <ClipPath id={`vessel-${vessel}`}>
          <Path d={shape.d} />
        </ClipPath>
      </Defs>

      <Rect
        x="0"
        y={shape.waterTop}
        width="24"
        height={24 - shape.waterTop}
        fill={c.accent.cyan}
        clipPath={`url(#vessel-${vessel})`}
      />

      <Path
        d={shape.d}
        fill="none"
        stroke={c.text.secondary}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
