import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { Encouragement } from '@nutrisnap/core';
import { AppLogo } from './AppLogo';
import { useColors } from '../lib/theme';

/** Long enough to read a sentence, short enough not to be a wall. */
const DWELL_MS = 3400;

/**
 * A breather between questions.
 *
 * The onboarding quiz is fifteen-odd screens of forms asked of someone who
 * has not yet seen the app do anything, and the middle of it is where people
 * put the phone down. This interrupts that run with something that is not a
 * question — and, as importantly, with movement: a screen that animates reads
 * as progress, where another static form reads as more work.
 *
 * It dismisses itself, because an interstitial that demands a tap is one more
 * thing being asked of someone already being asked a lot. Tapping skips it.
 */
export function EncouragementOverlay({
  encouragement,
  progress,
  onDone,
}: {
  encouragement: Encouragement;
  /** How far through the quiz they are, 0 to 1. */
  progress: number;
  onDone: () => void;
}) {
  const c = useColors();

  /** Drives the entrance: the card rises and settles as the text fades up. */
  const enter = useSharedValue(0);
  /** A slow breath on the mark, so the screen is never quite still. */
  const breathe = useSharedValue(0);
  /** The progress bar fills towards where they have got to. */
  const fill = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    breathe.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    fill.value = withDelay(
      280,
      withTiming(Math.min(1, Math.max(0, progress)), {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      }),
    );

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const timer = setTimeout(onDone, DWELL_MS);
    return () => clearTimeout(timer);
  }, [enter, breathe, fill, progress, onDone]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [26, 0]) },
      { scale: interpolate(enter.value, [0, 1], [0.94, 1]) },
    ],
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(breathe.value, [0, 1], [1, 1.09]) },
      { rotate: `${interpolate(breathe.value, [0, 1], [-3, 3])}deg` },
    ],
  }));

  const barStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const quoteStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0.3, 1], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(enter.value, [0.3, 1], [10, 0], 'clamp') }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(260)}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: c.base['900'],
      }}
    >
      <Pressable
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        <Animated.View style={[{ alignItems: 'center', gap: 22, width: '100%' }, cardStyle]}>
          <Animated.View style={markStyle}>
            <AppLogo size={52} />
          </Animated.View>

          <Animated.View style={[{ alignItems: 'center', gap: 12 }, quoteStyle]}>
            <Text
              style={{
                color: c.text.primary,
                fontSize: 23,
                lineHeight: 33,
                fontWeight: '700',
                textAlign: 'center',
              }}
              accessibilityLiveRegion="polite"
            >
              {encouragement.quote}
            </Text>

            {encouragement.author && (
              <Text style={{ color: c.text.tertiary, fontSize: 13, fontWeight: '600' }}>
                — {encouragement.author}
              </Text>
            )}
          </Animated.View>

          {/* The reason this is not just a quote: it shows the end getting
              closer, which is the actual reassurance being offered. */}
          <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 6 }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: c.glass.DEFAULT,
                overflow: 'hidden',
              }}
            >
              <Animated.View style={[{ height: '100%', borderRadius: 3 }, barStyle]}>
                <LinearGradient
                  colors={[c.accent.lime, c.accent.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flex: 1, borderRadius: 3 }}
                />
              </Animated.View>
            </View>

            <Text style={{ color: c.text.tertiary, fontSize: 12, textAlign: 'center' }}>
              {Math.round(Math.min(1, Math.max(0, progress)) * 100)}% of the way there
            </Text>
          </View>
        </Animated.View>

        <Text
          style={{ color: c.text.tertiary, fontSize: 12, position: 'absolute', bottom: 46 }}
        >
          Tap to continue
        </Text>
      </Pressable>
    </Animated.View>
  );
}
