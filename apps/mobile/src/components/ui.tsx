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
import { colors } from '@nutrisnap/ui';

/**
 * The frosted card. React Native has no backdrop-filter, so the glass effect
 * is approximated with a translucent fill and a hairline border — which reads
 * the same over the app's dark, softly-lit background.
 */
export function Card({ style, children, ...props }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderColor: 'rgba(255,255,255,0.10)',
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
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {loading && (
        <ActivityIndicator size="small" color={variant === 'accent' ? colors.base['900'] : '#fff'} />
      )}
      {typeof children === 'string' ? (
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: variant === 'accent' ? colors.base['900'] : colors.text.primary,
          }}
        >
          {children}
        </Text>
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
            colors={[colors.accent.lime, colors.accent.cyan]}
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
                variant === 'danger' ? 'rgba(255,91,110,0.14)' : variant === 'ghost' ? 'transparent' : 'rgba(255,255,255,0.08)',
              borderWidth: variant === 'ghost' ? 0 : 1,
              borderColor:
                variant === 'danger' ? 'rgba(255,91,110,0.32)' : 'rgba(255,255,255,0.14)',
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

/** Inline error banner, used on every screen that can fail. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <View
      style={{
        backgroundColor: 'rgba(255,91,110,0.10)',
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
      accessibilityLiveRegion="polite"
    >
      <Text style={{ color: colors.state.danger, fontSize: 14, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}

export function Screen({ children, style, ...props }: ViewProps) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.base['900'] }, style]} {...props}>
      {children}
    </View>
  );
}
