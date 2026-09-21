import { useEffect } from 'react';
import { Text, type ColorValue } from 'react-native';
import { router } from 'expo-router';
// Same story as Stack: the root export of Tabs is deprecated in Expo Router 57
// and points here instead.
import { Tabs } from 'expo-router/js-tabs';
import { HomeIcon, ProgressIcon, ScanIcon } from '../../src/components/TabIcons';
import { useColors } from '../../src/lib/theme';
import { useSession } from '../../src/lib/session';

/**
 * Settings keeps its glyph: a cog already reads as settings, where the shapes
 * the other three carried did not. Still no icon font in the bundle.
 */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const c = useColors();
  const { session, loading } = useSession();

  // Guard the whole tab group: no session, no app.
  useEffect(() => {
    if (!loading && !session) router.replace('/signin');
  }, [session, loading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent.lime,
        tabBarInactiveTintColor: c.text.tertiary,
        sceneStyle: { backgroundColor: c.base['900'] },
        tabBarStyle: {
          backgroundColor: c.base['800'],
          borderTopColor: c.glass.DEFAULT,
          height: 86,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <HomeIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => <ScanIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, focused }) => <ProgressIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}
