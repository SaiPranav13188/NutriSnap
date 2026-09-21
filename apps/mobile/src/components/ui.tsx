import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useColors } from '../lib/theme';

/**
 * The frosted card. React Native has no backdrop-filter, so the glass effect
 * is approximated with a translucent fill and a hairline border — which reads
 * the same over both the dark and the light background.
 */
export function Card({ style, children, ...props }: ViewProps) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.glass.DEFAULT,
          borderColor: c.glass.border,
          borderWidth: 1,
          borderRadius: 24,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'accent' | 'glass' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewProps['style'];
}

/** Press scales to 0.96 with a haptic tap, matching the web's micro-interaction. */
export function Button({
  children,
  onPress,
  variant = 'accent',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const c = useColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  // The accent gradient is always a light fill, so its label stays dark in
  // both themes rather than following the text colour.
  const labelColor = variant === 'accent' ? '#07090C' : c.text.primary;

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {loading && <ActivityIndicator size="small" color={labelColor} />}
      {typeof children === 'string' ? (
        <Text style={{ fontSize: 16, fontWeight: '600', color: labelColor }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={() => {
          if (isDisabled) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => {
          if (!isDisabled) scale.value = withSpring(0.96, { damping: 18, stiffness: 400 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 400 });
        }}
        disabled={isDisabled}
        accessibilityRole="button"
        style={{ opacity: isDisabled ? 0.45 : 1 }}
      >
        {variant === 'accent' ? (
          <LinearGradient
            colors={[c.accent.lime, c.accent.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ height: 54, borderRadius: 24, justifyContent: 'center', paddingHorizontal: 24 }}
          >
            {content}
          </LinearGradient>
        ) : (
          <View
            style={{
              height: 54,
              borderRadius: 24,
              justifyContent: 'center',
              paddingHorizontal: 24,
              backgroundColor:
                variant === 'danger'
                  ? `${c.state.danger}22`
                  : variant === 'ghost'
                    ? 'transparent'
                    : c.glass.strong,
              borderWidth: variant === 'ghost' ? 0 : 1,
              borderColor: variant === 'danger' ? `${c.state.danger}55` : c.glass.border,
            }}
          >
            {content}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  suffix?: string;
  style?: React.ComponentProps<typeof Text>['style'];
  duration?: number;
}

/**
 * Counts up to `value`. Reanimated drives the tween on the UI thread and
 * hands each frame back with runOnJS, so the text stays in sync without
 * re-rendering the whole screen.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  style,
  duration = 900,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const animated = useSharedValue(0);

  useEffect(() => {
    animated.value = withTiming(Number.isFinite(value) ? value : 0, { duration });
  }, [value, duration, animated]);

  useDerivedValue(() => {
    runOnJS(setDisplay)(animated.value);
  }, [animated]);

  return (
    <Text style={style}>
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </Text>
  );
}

/**
 * One nutrition figure with its label. Used for all seven values on the scan
 * results screen so calories, the three macros, and sugar/fibre/sodium are
 * presented with equal weight rather than the last three being an afterthought.
 */
export function Metric({
  label,
  value,
  suffix = '',
  color,
  size = 'md',
}: {
  label: string;
  value: number;
  suffix?: string;
  color: string;
  size?: 'md' | 'sm';
}) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', minWidth: size === 'md' ? 64 : 72 }}>
      <AnimatedNumber
        value={Math.round(value)}
        suffix={suffix}
        duration={600}
        style={{ color, fontSize: size === 'md' ? 20 : 17, fontWeight: '700' }}
      />
      <Text
        style={{
          color: c.text.tertiary,
          fontSize: 10,
          marginTop: 3,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Inline error banner, used on every screen that can fail. */
export function ErrorNote({ message }: { message: string }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: `${c.state.danger}1A`,
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
      accessibilityLiveRegion="polite"
    >
      <Text style={{ color: c.state.danger, fontSize: 14, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}

export function Screen({ children, style, ...props }: ViewProps) {
  const c = useColors();
  return (
    <View style={[{ flex: 1, backgroundColor: c.base['900'] }, style]} {...props}>
      {children}
    </View>
  );
}

/**
 * Page indicator for a horizontally paged card.
 *
 * Without it a swipeable card looks like a static one — there is nothing on
 * screen to say a second page exists, so nobody swipes.
 */
export function PagerDots({ count, active }: { count: number; active: number }) {
  const c = useColors();
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 12 }}
      accessibilityRole="tablist"
      accessibilityLabel={`Page ${active + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === active ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === active ? c.text.primary : c.glass.borderStrong,
          }}
        />
      ))}
    </View>
  );
}
