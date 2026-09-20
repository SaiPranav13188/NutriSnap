import '../global.css';
import 'react-native-gesture-handler';
// Expo Router 57 no longer re-exports Stack from the package root — importing
// it from 'expo-router' yields undefined and the app dies at startup with
// "undefined is not a function". The navigator lives on its own subpath now.
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '@nutrisnap/ui';
import { SessionProvider } from '../src/lib/session';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.base['900'] }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.base['900'] },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="signin" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
