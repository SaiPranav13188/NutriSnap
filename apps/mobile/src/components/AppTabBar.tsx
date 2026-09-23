import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useColors } from '../lib/theme';
import { useSession } from '../lib/session';
import { Avatar } from './Avatar';
import { QuickActionsFab } from './QuickActionsFab';

/**
 * The bottom bar: a floating pill of destinations, with the add button
 * alongside it rather than hovering over the Home screen.
 *
 * The default bar spanned the full width and sat flush against the bottom
 * edge, which left the plus button homeless — it floated above the Settings
 * tab on one screen only, so three of the four tabs had no way to reach
 * Movement or the coach without going Home first. Pulling the bar in from the
 * edges makes room for the button on the same row, where it is reachable from
 * everywhere.
 */
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  // Whatever the account carries: a name from OAuth, or the email.
  const who =
    (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email ?? null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 8,
        // The bar sits clear of the gesture area on phones that have one, and
        // keeps a hand's breadth of its own on phones that do not.
        paddingBottom: Math.max(insets.bottom, 12),
        backgroundColor: 'transparent',
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 999,
          paddingVertical: 6,
          paddingHorizontal: 6,
          backgroundColor: c.base['800'],
          borderWidth: 1,
          borderColor: c.glass.border,
          // Lifts the pill off whatever is scrolling behind it. Android reads
          // elevation, iOS reads the shadow, so both are set.
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const label =
            typeof options.title === 'string' ? options.title : route.name;

          const color = focused ? c.text.primary : c.text.tertiary;

          function onPress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (focused || event.defaultPrevented) return;
            void Haptics.selectionAsync();
            navigation.navigate(route.name, route.params);
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                paddingVertical: 8,
                borderRadius: 999,
                // The selected tab wears a pill of its own. On a bar with no
                // labels to bold and no underline to slide, the fill is what
                // says which one you are on.
                backgroundColor: focused ? c.glass.DEFAULT : 'transparent',
              }}
            >
              {/* Profile carries the person rather than a glyph, so the tab
                  reads as "you" — which is what the screen behind it is. */}
              {route.name === 'profile' ? (
                <Avatar name={who} size={22} muted={!focused} />
              ) : (
                options.tabBarIcon?.({ focused, color, size: 22 })
              )}

              <Text
                numberOfLines={1}
                style={{ color, fontSize: 10, fontWeight: focused ? '700' : '500' }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <QuickActionsFab />
    </View>
  );
}
