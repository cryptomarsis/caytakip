import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = '@caylik_theme_preference';

export const caylikLightTheme = {
  ...MD3LightTheme,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1F6B4F', onPrimary: '#FFFFFF', primaryContainer: '#E4F3E8', onPrimaryContainer: '#123D2C',
    secondary: '#A96A17', secondaryContainer: '#FFF3D7', error: '#B23A3A', surface: '#FFFFFF',
    surfaceVariant: '#F4F7F2', outline: '#D7E1D7', background: '#F4F7F2',
  },
};

export const caylikDarkTheme = {
  ...MD3DarkTheme,
  roundness: 3,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#8AD9A8', onPrimary: '#0D2A1B', primaryContainer: '#1D5137', onPrimaryContainer: '#D6F9E1',
    secondary: '#FFD08A', secondaryContainer: '#65450F', onSecondaryContainer: '#FFE6B6', error: '#FFB4AB',
    surface: '#101916', surfaceVariant: '#24352C', onSurface: '#E5EDE7', onSurfaceVariant: '#C4D0C6',
    outline: '#8EA094', background: '#101916', onBackground: '#E5EDE7',
  },
};

type AppThemeValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  isDark: boolean;
  paperTheme: MD3Theme;
};

const AppThemeContext = createContext<AppThemeValue | undefined>(undefined);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((saved) => {
        if (mounted && (saved === 'system' || saved === 'light' || saved === 'dark')) setPreferenceState(saved);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const setPreference = async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try { await AsyncStorage.setItem(THEME_PREFERENCE_KEY, nextPreference); } catch { /* Tercih kaydedilemese de uygulama çalışır. */ }
  };

  const isDark = preference === 'dark' || (preference === 'system' && systemScheme === 'dark');
  const paperTheme = isDark ? caylikDarkTheme : caylikLightTheme;
  const value = useMemo(() => ({ preference, setPreference, isDark, paperTheme }), [preference, isDark, paperTheme]);

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error('useAppTheme must be used inside AppThemeProvider.');
  return context;
}
