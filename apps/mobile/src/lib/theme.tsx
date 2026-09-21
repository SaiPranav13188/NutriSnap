import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { themes, type Theme, type ThemeName } from '@nutrisnap/ui';

/**
 * Theme for the mobile app.
 *
 * Every screen styles inline rather than with classes, so the palette has to
 * arrive through context. Components read `useTheme()` and index into it
 * exactly as they used to index into the static `colors` export — the shape is
 * identical, so switching a screen over is a rename rather than a rewrite.
 *
 * The stored preference wins; with none saved we follow the OS.
 */

const STORAGE_KEY = 'nutrisnap.theme.v1';

interface ThemeContextValue {
  theme: Theme;
  name: ThemeName;
  toggle: () => void;
  setTheme: (name: ThemeName) => void;
  /** False until the saved preference has been read, to avoid a flash. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.dark,
  name: 'dark',
  toggle: () => {},
  setTheme: () => {},
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [stored, setStored] = useState<ThemeName | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'dark' || value === 'light') setStored(value);
      })
      .catch(() => {
        // Unreadable storage just means we fall back to the system setting.
      })
      .finally(() => setReady(true));
  }, []);

  // The app is dark-first (plan section 4), so an unset system preference
  // lands on dark rather than light.
  const name: ThemeName = stored ?? (system === 'light' ? 'light' : 'dark');

  const setTheme = useCallback((next: ThemeName) => {
    setStored(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Not worth surfacing; the choice still applies for this session.
    });
  }, []);

  const toggle = useCallback(() => {
    setTheme(name === 'dark' ? 'light' : 'dark');
  }, [name, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[name], name, toggle, setTheme, ready }),
    [name, toggle, setTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Just the palette, for components that do not need to switch it. */
export function useColors(): Theme {
  return useContext(ThemeContext).theme;
}
