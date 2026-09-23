import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useColors } from '../lib/theme';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  ratio: number;
  size: number;
  strokeWidth: number;
  from: string;
  to: string;
  delay?: number;
  gradientId: string;
  children?: React.ReactNode;
  /**
   * Draw the track as a broken circle and leave the arc off entirely.
   *
   * For a day with nothing logged. A solid track at zero progress looks like
   * a day that scored nothing, which is a different claim from a day nobody
   * told us about.
   */
  dashed?: boolean;
  /** Overrides the track colour, for states that are about the ring itself. */
  trackColor?: string;
}

/**
 * The mobile twin of the web's ProgressRing — an arc that springs from 0 to
 * its value on mount, drawn with react-native-svg (which ships inside Expo
 * Go, so this runs on a physical phone with no native build).
 */
export function ProgressRing({
  ratio,
  size,
  strokeWidth,
  from,
  to,
  delay = 0,
  gradientId,
  children,
  dashed = false,
  trackColor,
}: ProgressRingProps) {
  const c = useColors();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withSpring(safeRatio, { damping: 18, stiffness: 60, mass: 1 }),
    );
  }, [safeRatio, delay, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={from} />
            <Stop offset="100%" stopColor={to} />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor ?? c.glass.border}
          strokeWidth={strokeWidth}
          // Scaled off the stroke so the gaps stay in proportion at any size:
          // a fixed dash pattern reads as a dotted line on the 36px strip and
          // as a solid one on the 152px dashboard ring.
          strokeDasharray={dashed ? `${strokeWidth * 1.2} ${strokeWidth * 1.6}` : undefined}
          strokeLinecap={dashed ? 'round' : 'butt'}
        />

        {!dashed && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
          />
        )}
      </Svg>

      {children && (
        <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </View>
      )}
    </View>
  );
}
