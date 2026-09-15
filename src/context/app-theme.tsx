import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = '@caylik_theme_preference';

/** Çaylık arayüzünde ekranlar arasında ortak kullanılan tasarım ölçüleri. */
export const caylikDesign = {
  font: { editorial: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) },
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
    primary: '#254B37', onPrimary: '#FFFFFF', primaryContainer: '#E2E8D9', onPrimaryContainer: '#254B37',
    secondary: '#92532F', onSecondary: '#FFFFFF', secondaryContainer: '#F0E1D2', onSecondaryContainer: '#693A23',
    tertiary: '#426347', onTertiary: '#FFFFFF', tertiaryContainer: '#E6EBDD', onTertiaryContainer: '#254B37',
    error: '#BA3B43', errorContainer: '#FFE8E8', onErrorContainer: '#64151B',
    surface: '#FFFCF6', surfaceVariant: '#EDE9DF', onSurface: '#26332B', onSurfaceVariant: '#5C645A',
    outline: '#9B9F91', outlineVariant: '#DDDCD1', background: '#F5F1E8', onBackground: '#26332B',
    elevation: { level0: 'transparent', level1: '#FFFCF6', level2: '#F5F1E8', level3: '#EDE9DF', level4: '#EDE9DF', level5: '#E2E8D9' },
  },
};

export const caylikDarkTheme = {
  ...MD3DarkTheme,
  roundness: 5,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#B8CEAD', onPrimary: '#203426', primaryContainer: '#364B39', onPrimaryContainer: '#E2ECD9',
    secondary: '#D9A27E', onSecondary: '#382519', secondaryContainer: '#49392D', onSecondaryContainer: '#F4DCC8',
    tertiary: '#B8CEAD', onTertiary: '#203426', tertiaryContainer: '#303F33', onTertiaryContainer: '#E2ECD9',
    error: '#FFB4AB', errorContainer: '#5A2423', onErrorContainer: '#FFDAD6',
    surface: '#2C342E', surfaceVariant: '#343D35', onSurface: '#F2EEE5', onSurfaceVariant: '#C0C5B8',
    surfaceDisabled: '#242A26', onSurfaceDisabled: '#7F8983',
    outline: '#778172', outlineVariant: '#465044', background: '#202521', onBackground: '#F2EEE5',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: '#202521', level1: '#2C342E', level2: '#303A32', level3: '#343D35', level4: '#364237', level5: '#3C493D',
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
