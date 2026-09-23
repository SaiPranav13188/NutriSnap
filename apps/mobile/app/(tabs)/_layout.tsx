import { useEffect } from 'react';
import { router } from 'expo-router';
// Same story as Stack: the root export of Tabs is deprecated in Expo Router 57
// and points here instead.
import { Tabs } from 'expo-router/js-tabs';
import { HomeIcon, ProgressIcon, ScanIcon } from '../../src/components/TabIcons';
import { AppTabBar } from '../../src/components/AppTabBar';
import { useColors } from '../../src/lib/theme';
import { useSession } from '../../src/lib/session';

export default function TabsLayout() {
  const c = useColors();
  const { session, loading } = useSession();

  // Guard the whole tab group: no session, no app.
  useEffect(() => {
    if (!loading && !session) router.replace('/signin');
  }, [session, loading]);

  return (
    <Tabs
      // The bar is drawn by hand rather than styled through screenOptions:
      // a floating pill with the add button beside it is a different layout
      // from the full-width bar the navigator draws, not a restyling of it.
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.base['900'] },
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
      {/* The old Settings tab. It was always the account screen; calling it
          Profile and giving it the person's face says so on the bar. */}
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
