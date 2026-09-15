import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PaperProvider } from 'react-native-paper';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppThemeProvider, useAppTheme } from '@/context/app-theme';
import { getAdTrackingState, initializeAdTracking, requestAdTrackingConsent, subscribeAdTrackingChanges } from '@/services/adTracking';
import { initializeAdMob } from '@/services/adMob';
import { AdsPrivacyContext } from '@/context/ads-privacy';

SplashScreen.preventAutoHideAsync();

function ThemedLayout() {
  const { isDark, paperTheme } = useAppTheme();
  const [splashDone, setSplashDone] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [adsPrivacy, setAdsPrivacy] = useState({ ready: false, personalized: false });
  const finishSplash = useCallback(() => setSplashDone(true), []);
  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: paperTheme.colors.primary,
      background: paperTheme.colors.background,
      card: paperTheme.colors.surface,
      text: paperTheme.colors.onSurface,
      border: paperTheme.colors.outline,
    },
  };

  useEffect(() => {
    if (!splashDone) return;
    let alive = true;
    let running = false;
    let revision = 0;
    let rerun = false;
    const run = async () => {
      if (!alive || (Platform.OS !== 'web' && AppState.currentState !== 'active')) return;
      if (running) { rerun = true; return; }
      running = true;
      const startedRevision = revision;
      try {
        const existing = await getAdTrackingState();
        const state = Platform.OS === 'ios' && existing === 'not-determined'
          ? await requestAdTrackingConsent() : await initializeAdTracking();
        if (!alive) return;
        // App features do not depend on accepting tracking. Ads wait for a result.
        setPrivacyChecked(true);
        if (state === 'not-determined' || state === 'unsupported') return;
        await initializeAdMob();
        if (alive && revision === startedRevision && AppState.currentState === 'active') setAdsPrivacy({ ready: true, personalized: state === 'granted' });
      } catch {
        if (alive) { setPrivacyChecked(true); setAdsPrivacy({ ready: false, personalized: false }); }
        console.warn('Reklam gizlilik akışı tamamlanamadı; reklamlar kapalı, uygulama kullanılabilir.');
      } finally {
        running = false;
        if (alive && rerun) { rerun = false; void run(); }
      }
    };
    void run();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void run();
      else { revision++; setAdsPrivacy({ ready: false, personalized: false }); }
    });
    const unsubscribeConsent = subscribeAdTrackingChanges(() => {
      revision++;
      setAdsPrivacy({ ready: false, personalized: false });
      void run();
    });
    return () => { alive = false; subscription.remove(); unsubscribeConsent(); };
  }, [splashDone]);

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={navigationTheme}>
        <AnimatedSplashOverlay onFinished={finishSplash} />
        <AdsPrivacyContext.Provider value={adsPrivacy}>
        {privacyChecked && <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>}
        </AdsPrivacyContext.Provider>
      </ThemeProvider>
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <ThemedLayout />
    </AppThemeProvider>
  );
}
