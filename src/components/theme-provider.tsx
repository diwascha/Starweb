'use client';

/**
 * @fileOverview Light / dark theming, with no dependency.
 *
 * This was briefly built on next-themes. It is a good library, but adding it
 * meant every machine that builds this app had to reinstall before the app
 * would compile - and the first build to hit that failed with "Can't resolve
 * 'next-themes'". Fifty lines we control beats an install step that has to
 * succeed everywhere.
 *
 * The one genuinely fiddly part is the flash. React cannot set the theme class
 * before the browser paints, so a dark-mode user would see a white page for a
 * frame on every load. `themeInitScript` below runs before first paint and
 * settles it; this provider then takes over.
 *
 * Three states, not two. "System" is a real answer: a machine set to switch at
 * dusk should carry the app with it.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'starsutra:theme';

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong
 * theme. Kept deliberately tiny and dependency-free - it is inlined verbatim
 * into the HTML, and it must not throw in a private window where localStorage
 * access itself can raise.
 */
export const themeInitScript = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var dark = theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    /* storage blocked: fall through to the light default already in the CSS */
  }
})();
`;

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStored = (): Theme => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* private window */
  }
  return 'system';
};

const applyTheme = (theme: Theme) => {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
};

interface ThemeContextValue {
  /** What the user chose, which may be 'system'. */
  theme: Theme;
  /** What is actually on screen right now. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The server has no way to know the viewer's theme, so the first render must
  // match the server's output. The init script has already set the class, so
  // nothing flashes; this only catches state up on mount.
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    setResolvedTheme(stored === 'dark' || (stored === 'system' && prefersDark()) ? 'dark' : 'light');
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice simply will not survive a reload */
    }
    applyTheme(next);
    setResolvedTheme(next === 'dark' || (next === 'system' && prefersDark()) ? 'dark' : 'light');
  }, []);

  // Follow the operating system while the user is on "system", including when
  // it flips at dusk with the app already open.
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      setResolvedTheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  // Another tab changing the theme should change this one too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStored();
      setThemeState(next);
      applyTheme(next);
      setResolvedTheme(next === 'dark' || (next === 'system' && prefersDark()) ? 'dark' : 'light');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
