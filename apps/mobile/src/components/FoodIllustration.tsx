import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import type { FoodIllustration as Name } from '@nutrisnap/core';

/**
 * The drawings on the suggestion cards.
 *
 * Fixed colours rather than theme tokens: an egg yolk that went grey in dark
 * mode would stop being an egg yolk. These are food, and food looks the same
 * in both themes.
 *
 * Drawn rather than photographed for the usual reasons — nothing to fetch,
 * nothing to cache, crisp at any density — and because a closed set means the
 * model picks a picture that exists instead of describing one that does not.
 */
const INK = '#2B333B';
const GREEN = '#5BB85C';
const GRAIN = '#E9B44C';
const PROTEIN = '#D9714E';
const CREAM = '#F5E3C3';
const BLUE = '#4FA8DE';
const BERRY = '#C0467E';
const PLATE = '#FFFFFF';

function Bowl() {
  return (
    <>
      <Path
        d="M6 22h36a18 18 0 0 1-36 0Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx="17" cy="27" r="5" fill={GREEN} />
      <Circle cx="27" cy="29" r="5.5" fill={GRAIN} />
      <Circle cx="36" cy="27" r="4.5" fill={PROTEIN} />
      <Path d="M4 22h40" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </>
  );
}

function Salad() {
  return (
    <>
      <Path
        d="M5 26h38a19 19 0 0 1-38 0Z"
        fill={PLATE}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M12 26c0-7 5-11 11-11s11 4 11 11Z" fill={GREEN} />
      <Path d="M18 26c0-5 3-8 6-8" stroke="#3E8E3F" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx="30" cy="21" r="3" fill={PROTEIN} />
      <Circle cx="17" cy="22" r="2.4" fill={BERRY} />
    </>
  );
}

function Curry() {
  return (
    <>
      <Path
        d="M4 24h20a10 10 0 0 1-20 0Z"
        fill={PROTEIN}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M26 30c0-6 4-10 9-10s9 4 9 10Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx="11" cy="21" r="2" fill={GRAIN} />
      <Circle cx="17" cy="21.5" r="1.7" fill={GREEN} />
      <Path d="M2 24h24" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </>
  );
}

function Sandwich() {
  return (
    <>
      <Path
        d="M8 18h32a3 3 0 0 1 3 3v2H5v-2a3 3 0 0 1 3-3Z"
        fill={GRAIN}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M5 23h38v4H5z" fill={GREEN} />
      <Path d="M5 27h38v3H5z" fill={PROTEIN} />
      <Path
        d="M5 30h38v3a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z"
        fill={GRAIN}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </>
  );
}

function Smoothie() {
  return (
    <>
      <Path d="M28 8 22 20" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <Path
        d="M15 14h18l-2.5 24a3 3 0 0 1-3 2.6h-7A3 3 0 0 1 17.5 38Z"
        fill={BERRY}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M15.6 20h16.8" stroke={PLATE} strokeWidth={2} opacity={0.5} />
    </>
  );
}

function Eggs() {
  return (
    <>
      <Ellipse cx="18" cy="27" rx="12" ry="9" fill={PLATE} stroke={INK} strokeWidth={2} />
      <Circle cx="18" cy="27" r="4.5" fill={GRAIN} />
      <Ellipse cx="33" cy="22" rx="9" ry="7" fill={PLATE} stroke={INK} strokeWidth={2} />
      <Circle cx="33" cy="22" r="3.4" fill={GRAIN} />
    </>
  );
}

function Pasta() {
  return (
    <>
      <Path
        d="M5 23h38a19 19 0 0 1-38 0Z"
        fill={PLATE}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M11 23c2-6 7-9 13-9s11 3 13 9Z" fill={GRAIN} />
      <Path
        d="M14 22c3-4 6-6 10-6M20 22c3-4 6-5 9-5"
        stroke="#C08A2E"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="30" cy="18" r="3.2" fill={PROTEIN} />
    </>
  );
}

function Soup() {
  return (
    <>
      <Path
        d="M8 24h32a16 16 0 0 1-32 0Z"
        fill={PROTEIN}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M5 24h38" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M18 16c0-3 3-3 3-6M25 16c0-3 3-3 3-6M32 16c0-3 2-3 2-5"
        stroke={INK}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />
    </>
  );
}

function Oats() {
  return (
    <>
      <Path
        d="M7 23h34a17 17 0 0 1-34 0Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M5 23h38" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="18" cy="19.5" r="3" fill={BERRY} />
      <Circle cx="26" cy="18" r="2.6" fill={BLUE} />
      <Circle cx="33" cy="20" r="2.4" fill={BERRY} />
    </>
  );
}

function Wrap() {
  return (
    <>
      <Path
        d="M14 38 30 10a7 7 0 0 1 8 4L24 40a7 7 0 0 1-10-2Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M30 10a7 7 0 0 1 8 4l-4 2-6-4Z" fill={GREEN} />
      <Path
        d="M24 22c3 1 6 1 9-1"
        stroke={PROTEIN}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M20 30c3 1 6 1 9-1"
        stroke={GREEN}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

const DRAWINGS: Readonly<Record<Name, () => React.JSX.Element>> = {
  bowl: Bowl,
  salad: Salad,
  curry: Curry,
  sandwich: Sandwich,
  smoothie: Smoothie,
  eggs: Eggs,
  pasta: Pasta,
  soup: Soup,
  oats: Oats,
  wrap: Wrap,
};

export function FoodIllustration({ name, size = 64 }: { name: Name; size?: number }) {
  const Drawing = DRAWINGS[name] ?? Bowl;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Drawing />
    </Svg>
  );
}
