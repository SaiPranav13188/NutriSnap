import { useEffect } from 'react';
import { Text, type ColorValue } from 'react-native';
import { Tabs, router } from 'expo-router';
import { colors } from '@nutrisnap/ui';
import { useSession } from '../../src/lib/session';

/** A tiny glyph-based tab icon — avoids pulling in an icon font package. */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { session, loading } = useSession();

  // Guard the whole tab group: no session, no app.
  useEffect(() => {
    if (!loading && !session) router.replace('/signin');
  }, [session, loading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent.lime,
        tabBarInactiveTintColor: colors.text.tertiary,
        sceneStyle: { backgroundColor: colors.base['900'] },
        tabBarStyle: {
          backgroundColor: colors.base['800'],
          borderTopColor: 'rgba(255,255,255,0.08)',
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
          tabBarIcon: ({ color }) => <TabIcon glyph="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => <TabIcon glyph="◈" color={color} />,
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
