import '../global.css';
import 'react-native-gesture-handler';
// Expo Router 57 no longer re-exports Stack from the package root — importing
// it from 'expo-router' yields undefined and the app dies at startup with
// "undefined is not a function". The navigator lives on its own subpath now.
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SessionProvider } from '../src/lib/session';
import { ThemeProvider, useTheme } from '../src/lib/theme';

/**
 * Split out because the navigator needs the palette, and a component cannot
 * consume a context its own parent provides.
 */
function ThemedNavigator() {
  const { theme, name } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.base['900'] }}>
      {/* Status bar text has to invert with the background or it disappears. */}
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.base['900'] },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="signin" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="log/[id]" />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <SessionProvider>
          <ThemedNavigator />
        </SessionProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
