import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAdsPrivacy } from '../context/ads-privacy';
import { createHarvestInterstitial, HARVEST_INTERSTITIAL_IDS, newInterstitialBudget } from '../services/harvestInterstitial';
import type { HarvestAdNavigationOptions } from './useHarvestAdNavigation';
import type { ActiveTab } from '../navigation';

const EXPO_GO = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

export function useHarvestAdNavigation(options: HarvestAdNavigationOptions) {
  const privacy = useAdsPrivacy();
  const latest = useRef({ ...options, privacy });
  const budget = useRef(newInterstitialBudget());
  const controller = useRef<ReturnType<typeof createHarvestInterstitial> | null>(null);
  useLayoutEffect(() => { latest.current = { ...options, privacy }; });
  const { userId } = options;

  useEffect(() => {
    if (!userId || EXPO_GO || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
    let alive = true;
    let instance: ReturnType<typeof createHarvestInterstitial> | undefined;
    const allowed = () => alive && latest.current.userId === userId && latest.current.proStatus === 'free'
      && latest.current.enabled && latest.current.privacy.ready && AppState.currentState === 'active';
    void import('react-native-google-mobile-ads').then(({ InterstitialAd, AdEventType, TestIds }) => {
      if (!alive) return;
      instance = createHarvestInterstitial({
        budget: budget.current, allowed,
        createAd: () => {
          const ad = InterstitialAd.createForAdRequest(__DEV__ ? TestIds.INTERSTITIAL : HARVEST_INTERSTITIAL_IDS[Platform.OS as 'ios' | 'android'], {
            requestNonPersonalizedAdsOnly: !latest.current.privacy.personalized,
          });
          return { load: () => ad.load(), show: () => ad.show(), on: (event, callback) => ad.addAdEventListener(
            { loaded: AdEventType.LOADED, closed: AdEventType.CLOSED, error: AdEventType.ERROR }[event], callback,
          ) };
        },
      });
      controller.current = instance;
      instance.sync();
    }).catch(() => undefined); // Unsupported builds must still navigate normally.
    const subscription = AppState.addEventListener('change', () => instance?.sync());
    return () => {
      alive = false; instance?.dispose(); subscription.remove();
      if (controller.current === instance) controller.current = null;
    };
  }, [userId]);

  useEffect(() => { controller.current?.sync(); }, [privacy.ready, options.proStatus, options.enabled]);
  useEffect(() => { controller.current?.sync(true); }, [privacy.personalized]);

  return useCallback((tab: ActiveTab) => {
    const snapshot = latest.current;
    const next = () => {
      if (latest.current.userId === snapshot.userId) latest.current.onNavigate(tab);
    };
    if (controller.current) controller.current.navigate(snapshot.activeTab, tab, next);
    else next();
  }, []);
}
