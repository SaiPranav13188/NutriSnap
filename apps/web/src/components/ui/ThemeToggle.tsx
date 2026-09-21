'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';

export type ThemeName = 'dark' | 'light';

const STORAGE_KEY = 'nutrisnap.theme.v1';

/** Read the theme the inline boot script already applied to <html>. */
function currentTheme(): ThemeName {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Light/dark switch.
 *
 * The actual theme is applied by a small blocking script in the root layout
 * before first paint — doing it here would flash the wrong colours on every
 * page load. This component only reflects and changes it.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>('dark');
  // Rendered inert until mounted, because the server cannot know which theme
  // the browser stored; committing to one would be a hydration mismatch.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: ThemeName = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing — the choice still applies for this session.
    }
  }

  const isDark = theme === 'dark';

  return (
    <button
      suppressHydrationWarning
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="glass relative flex h-9 w-[62px] items-center rounded-full px-1 transition-colors hover:bg-white/[0.09]"
    >
      <motion.span
        className="grid h-7 w-7 place-items-center rounded-full"
        animate={{
          x: mounted && !isDark ? 26 : 0,
          backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#C6FF3D',
        }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-ink-secondary" aria-hidden />
        ) : (
          <Sun className="h-3.5 w-3.5 text-base-900" aria-hidden />
        )}
      </motion.span>

      {/* The destination glyph, sitting behind the knob. */}
      <span
        className="pointer-events-none absolute grid place-items-center opacity-35"
        style={{ [isDark ? 'right' : 'left']: 10 } as React.CSSProperties}
        aria-hidden
      >
        {isDark ? (
          <Sun className="h-3 w-3 text-ink-tertiary" />
        ) : (
          <Moon className="h-3 w-3 text-ink-tertiary" />
        )}
      </span>
    </button>
  );
}
