import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  ZoomIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../lib/theme';

/**
 * The banner that appears under the calorie ring once the ring fills.
 *
 * The ring going full is the moment the whole screen exists for, and until
 * now it passed silently — the arc closed and nothing said so. This is the
 * acknowledgement: it springs in when the last meal tips the day over, and is
 * already there when the day is reopened later.
 */
export function GoalCelebration({ isToday }: { isToday: boolean }) {
  const c = useColors();

  // One looping value drives both the confetti tilt and the sheen, so they
  // stay in step instead of drifting apart over a long session.
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const partyStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [1, 1.18]) },
      { rotate: `${interpolate(pulse.value, [0, 1], [-8, 8])}deg` },
    ],
  }));

  return (
    <Animated.View entering={ZoomIn.springify().damping(15)} style={{ alignSelf: 'stretch' }}>
      <LinearGradient
        colors={[c.accent.lime, c.accent.cyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 20,
        }}
        accessibilityRole="alert"
      >
        <Animated.View style={partyStyle}>
          <Text style={{ fontSize: 24 }}>{'🎉'}</Text>
        </Animated.View>

        <View style={{ flex: 1 }}>
          {/* The gradient is a light fill in both themes, so this text stays
              dark rather than following the theme's text colour. */}
          <Text style={{ color: '#07090C', fontSize: 15, fontWeight: '700' }}>
            {isToday ? "Great — today's goal is complete!" : 'Goal complete for this day!'}
          </Text>
          <Text style={{ color: '#07090C', fontSize: 12, opacity: 0.75, marginTop: 2 }}>
            {isToday ? 'Keep it up.' : 'You hit your target.'}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
