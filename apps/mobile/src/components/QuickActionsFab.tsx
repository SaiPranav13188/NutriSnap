import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../lib/theme';

interface QuickAction {
  label: string;
  icon: string;
  href: '/exercise' | '/coach' | '/suggest' | '/menu';
}

/**
 * The secondary destinations, ordered as they read top to bottom when the
 * menu is open. The last one lands nearest the button, so it is the one the
 * thumb is already on.
 */
const ACTIONS: readonly QuickAction[] = [
  { label: 'Suggestions', icon: '🍽️', href: '/suggest' },
  { label: 'Read a menu', icon: '📋', href: '/menu' },
  { label: 'Movement', icon: '🏃', href: '/exercise' },
  { label: 'Coach', icon: '💬', href: '/coach' },
];

/** Roughly the height of the tab bar, so the menu clears it. */
const BAR_CLEARANCE = 92;

/**
 * One pill in the open menu.
 *
 * The stagger comes out of the same shared `progress` rather than a chain of
 * timers: each pill reads a different slice of it, so opening and closing
 * stay in step with the button no matter how fast the two are tapped.
 */
function ActionPill({
  action,
  progress,
  slice,
  onPress,
}: {
  action: QuickAction;
  progress: SharedValue<number>;
  slice: readonly [number, number];
  onPress: () => void;
}) {
  const c = useColors();
  const [from, to] = slice;

  const style = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [from, to], [0, 1], 'clamp');
    return {
      opacity: t,
      transform: [{ translateY: interpolate(t, [0, 1], [18, 0]) }, { scale: 0.9 + t * 0.1 }],
    };
  });

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 13,
          paddingHorizontal: 20,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: c.glass.border,
          backgroundColor: c.glass.strong,
        }}
      >
        <Text style={{ fontSize: 15 }}>{action.icon}</Text>
        <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '600' }}>
          {action.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The round button that sits beside the tab bar, and the menu it opens.
 *
 * It used to float over the Home screen alone, which meant Movement, Coach
 * and the rest were reachable from exactly one tab. Sitting in the bar makes
 * it available from all four, and puts it where the thumb already is.
 *
 * The menu is a modal rather than an absolutely positioned sibling: the
 * button now lives inside the tab bar's row, and a scrim that has to cover
 * the whole screen cannot be a child of a bar eighty pixels tall without a
 * pile of negative offsets that break the moment the bar's height changes.
 * The modal also picks up the Android back button for free.
 */
export function QuickActionsFab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  function toggle(next: boolean) {
    setOpen(next);
    progress.value = next
      ? withSpring(1, { damping: 16, stiffness: 180 })
      : withTiming(0, { duration: 160 });
  }

  const plusStyle = useAnimatedStyle(() => ({
    // 135° rather than 45°, so the plus turns into a close cross the short way
    // round and comes back the way it went.
    transform: [{ rotate: `${progress.value * 135}deg` }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.35 }));

  return (
    <>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => toggle(false)}
      >
        <Animated.View
          style={[
            { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000' },
            scrimStyle,
          ]}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => toggle(false)}
            accessibilityLabel="Close quick actions"
          />
        </Animated.View>

        <View
          style={{
            position: 'absolute',
            right: 20,
            bottom: insets.bottom + BAR_CLEARANCE,
            alignItems: 'flex-end',
            gap: 10,
          }}
        >
          {ACTIONS.map((action, i) => {
            // Nearest the button opens first, so the menu unrolls towards the
            // thumb instead of away from it.
            const start = (ACTIONS.length - 1 - i) * 0.2;
            return (
              <ActionPill
                key={action.label}
                action={action}
                progress={progress}
                slice={[start, start + 0.8]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggle(false);
                  router.push(action.href);
                }}
              />
            );
          })}
        </View>
      </Modal>

      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          toggle(!open);
        }}
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        accessibilityHint="Shows suggestions, the menu reader, movement and the coach"
        accessibilityState={{ expanded: open }}
      >
        <LinearGradient
          colors={[c.accent.lime, c.accent.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View style={plusStyle}>
            {/* The gradient is a light fill in both themes, so the glyph
                stays dark rather than following the text colour. */}
            <Text style={{ fontSize: 28, lineHeight: 32, fontWeight: '300', color: '#07090C' }}>
              +
            </Text>
          </Animated.View>
        </LinearGradient>
      </Pressable>
    </>
  );
}
