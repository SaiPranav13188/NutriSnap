import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useTheme } from '../lib/theme';

/**
 * Light/dark switch for the dashboard header.
 *
 * A sliding pill rather than an icon button, so the current mode is readable
 * at a glance instead of having to infer it from which icon is showing.
 */
export function ThemeToggle() {
  const { theme, name, toggle } = useTheme();
  const isDark = name === 'dark';

  const offset = useSharedValue(isDark ? 0 : 1);

  useEffect(() => {
    offset.value = withSpring(isDark ? 0 : 1, { damping: 16, stiffness: 220 });
  }, [isDark, offset]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value * 28 }],
  }));

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggle();
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: !isDark }}
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      hitSlop={8}
      style={{
        width: 62,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.glass.border,
        backgroundColor: theme.glass.DEFAULT,
        justifyContent: 'center',
        paddingHorizontal: 3,
      }}
    >
      <Animated.View
        style={[
          {
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: isDark ? theme.base['700'] : theme.accent.lime,
            alignItems: 'center',
            justifyContent: 'center',
          },
          knobStyle,
        ]}
      >
        <Text style={{ fontSize: 14 }}>{isDark ? '🌙' : '☀️'}</Text>
      </Animated.View>

      {/* The inactive glyph sits behind the knob as a hint of where it slides to. */}
      <View
        style={{
          position: 'absolute',
          left: isDark ? undefined : 9,
          right: isDark ? 9 : undefined,
          opacity: 0.35,
        }}
        pointerEvents="none"
      >
        <Text style={{ fontSize: 12 }}>{isDark ? '☀️' : '🌙'}</Text>
      </View>
    </Pressable>
  );
}
