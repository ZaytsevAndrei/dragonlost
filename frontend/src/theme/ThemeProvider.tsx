import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_THEME_ID,
  readStoredThemeId,
  writeStoredThemeId,
  type ThemeId,
  THEME_IDS,
  THEME_OPTIONS,
  isThemeId,
} from './themes';

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  options: typeof THEME_OPTIONS;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): ThemeId {
  if (typeof document === 'undefined') return DEFAULT_THEME_ID;
  const attr = document.documentElement.getAttribute('data-theme');
  if (isThemeId(attr)) return attr;
  return readStoredThemeId();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    if (!(THEME_IDS as readonly string[]).includes(id)) return;
    setThemeState(id);
    writeStoredThemeId(id);
    document.documentElement.setAttribute('data-theme', id);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, options: THEME_OPTIONS }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme должен вызываться внутри ThemeProvider');
  }
  return ctx;
}
