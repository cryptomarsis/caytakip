import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = '@caylik_theme_preference';

/** Çaylık arayüzünde ekranlar arasında ortak kullanılan tasarım ölçüleri. */
export const caylikDesign = {
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 },
  radius: { sm: 12, md: 16, lg: 20, xl: 26, pill: 999 },
  type: { caption: 12, body: 14, bodyLarge: 16, title: 20, headline: 26, display: 34 },
  touchTarget: 48,
  contentMaxWidth: 760,
  shadow: {
    soft: { shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  },
} as const;

export const caylikLightTheme = {
  ...MD3LightTheme,
  roundness: 5,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#155B42', onPrimary: '#FFFFFF', primaryContainer: '#DDEFE5', onPrimaryContainer: '#103D2D',
    secondary: '#B47A20', onSecondary: '#FFFFFF', secondaryContainer: '#F9EBCB', onSecondaryContainer: '#513500',
    tertiary: '#247C69', onTertiary: '#FFFFFF', tertiaryContainer: '#DDF3EA', onTertiaryContainer: '#123E34',
    error: '#BA3B43', errorContainer: '#FFE8E8', onErrorContainer: '#64151B',
    surface: '#FFFEFA', surfaceVariant: '#EEF2EC', onSurface: '#18221D', onSurfaceVariant: '#58645D',
    outline: '#D8DED7', outlineVariant: '#E8ECE7', background: '#F6F5EF', onBackground: '#18221D',
  },
};

export const caylikDarkTheme = {
  ...MD3DarkTheme,
  roundness: 5,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#55D49A', onPrimary: '#062A1B', primaryContainer: '#173D2D', onPrimaryContainer: '#D9F8E8',
    secondary: '#F0C66D', onSecondary: '#382B00', secondaryContainer: '#453817', onSecondaryContainer: '#FFE9AE',
    tertiary: '#79D6C5', onTertiary: '#00382F', tertiaryContainer: '#164A42', onTertiaryContainer: '#C5F7EC',
    error: '#FFB4AB', errorContainer: '#5A2423', onErrorContainer: '#FFDAD6',
    surface: '#171C19', surfaceVariant: '#222824', onSurface: '#F4F7F5', onSurfaceVariant: '#B9C3BD',
    surfaceDisabled: '#242A26', onSurfaceDisabled: '#7F8983',
    outline: '#46514B', outlineVariant: '#2B332F', background: '#0F1411', onBackground: '#F4F7F5',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: '#0F1411', level1: '#171C19', level2: '#1B211D', level3: '#202722', level4: '#222A25', level5: '#27302A',
    },
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
