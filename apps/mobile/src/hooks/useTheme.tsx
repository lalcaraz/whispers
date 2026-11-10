import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '@/constants';
import {
  light,
  dark,
  resolveScheme,
  isThemePreference,
  type ThemeColors,
  type ThemePreference,
} from '@/theme';

type ThemeContextValue = {
  /** Resolved color table for the active scheme. */
  colors: ThemeColors;
  /** The scheme actually being rendered. */
  scheme: 'light' | 'dark';
  /** The user's stored preference (`'system'` follows the OS). */
  pref: ThemePreference;
  /** Set and persist the preference. */
  setTheme: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePreference>('system');
  const systemScheme = useColorScheme();

  // Load the saved preference once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEYS.THEME);
        if (!cancelled && isThemePreference(saved)) setPref(saved);
      } catch (error) {
        console.error('Error loading theme preference:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setPref(next);
    SecureStore.setItemAsync(STORAGE_KEYS.THEME, next).catch((error) => {
      console.error('Error saving theme preference:', error);
    });
  }, []);

  const scheme = resolveScheme(pref, systemScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: scheme === 'dark' ? dark : light, scheme, pref, setTheme }),
    [scheme, pref, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
