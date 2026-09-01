import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';

import type { AuthFetch } from '../services/aiAssistant';
import { isStoreProductId, type StoreProductId } from '../services/inAppPurchases';

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || 'appl_ZMzoEtiIbrAKPLWMBXJLMTGbFwx';
const EXPO_GO = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
type RevenueCatModule = typeof import('react-native-purchases');

export const useStorePurchases = (
  userId: string | undefined,
  _authFetch: AuthFetch,
  refreshWallet: () => Promise<void>,
) => {
  const revenueCatRef = useRef<RevenueCatModule | null>(null);
  const activeUserRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [prices, setPrices] = useState<Partial<Record<StoreProductId, string>>>({});
  const [purchasingProductId, setPurchasingProductId] = useState<StoreProductId | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState(EXPO_GO
    ? 'Satın alma Expo Go’da kullanılamaz; geliştirme build’i gerekir.'
    : 'RevenueCat bağlantısı hazırlanıyor…');

  const loadOfferings = useCallback(async (module: RevenueCatModule) => {
    const offerings = await module.default.getOfferings();
    const nextPrices: Partial<Record<StoreProductId, string>> = {};
    offerings.current?.availablePackages.forEach((item) => {
      if (isStoreProductId(item.product.identifier)) nextPrices[item.product.identifier] = item.product.priceString;
    });
    setPrices(nextPrices);
    return offerings;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios' || EXPO_GO || !userId) {
      activeUserRef.current = null;
      void Promise.resolve().then(() => {
        setConnected(false);
        setConfigured(false);
      });
      return;
    }
    let cancelled = false;
    const connect = async () => {
      try {
        const revenueCat = await import('react-native-purchases');
        if (cancelled) return;
        revenueCatRef.current = revenueCat;
        if (!revenueCat.default.isConfigured()) {
          revenueCat.default.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: userId });
        } else if (activeUserRef.current !== userId) {
          await revenueCat.default.logIn(userId);
        }
        if (cancelled) return;
        activeUserRef.current = userId;
        setConnected(true);
        setConfigured(true);
        await loadOfferings(revenueCat);
        if (!cancelled) setStatus('RevenueCat bağlantısı hazır.');
      } catch (error) {
        if (!cancelled) {
          setConnected(false);
          setConfigured(false);
          setStatus(error instanceof Error ? error.message : 'Satın alma bağlantısı kurulamadı.');
        }
      }
    };
    void connect();
    return () => { cancelled = true; };
  }, [loadOfferings, userId]);

  const purchase = useCallback(async (id: StoreProductId) => {
    const revenueCat = revenueCatRef.current;
    if (!revenueCat || !configured || activeUserRef.current !== userId) {
      Alert.alert('Satın alma hazır değil', 'Mağaza hesabı hazırlanıyor. Lütfen kısa süre sonra tekrar deneyin.');
      return;
    }
    setPurchasingProductId(id);
    try {
      const offerings = await loadOfferings(revenueCat);
      const selectedPackage = offerings.current?.availablePackages.find((item) => item.product.identifier === id);
      if (!selectedPackage) throw new Error('Bu paket şu anda mağazada bulunamadı.');
      await revenueCat.default.purchasePackage(selectedPackage);
      await refreshWallet();
      Alert.alert('Satın alma tamamlandı', 'Kredileriniz hesabınıza işlendi. Görünmesi birkaç saniye sürebilir.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (!message.toLocaleLowerCase('tr-TR').includes('cancel')) Alert.alert('Satın alma tamamlanamadı', message || 'Lütfen tekrar deneyin.');
    } finally {
      setPurchasingProductId(null);
    }
  }, [configured, loadOfferings, refreshWallet, userId]);

  const restore = useCallback(async () => {
    const revenueCat = revenueCatRef.current;
    if (!revenueCat || !configured || activeUserRef.current !== userId) return;
    setRestoring(true);
    try {
      await revenueCat.default.restorePurchases();
      await refreshWallet();
      Alert.alert('Tamamlandı', 'Satın alımlarınız kontrol edildi.');
    } catch (error) {
      Alert.alert('Geri yüklenemedi', error instanceof Error ? error.message : 'Lütfen tekrar deneyin.');
    } finally {
      setRestoring(false);
    }
  }, [configured, refreshWallet, userId]);

  return { connected, configured, prices, purchasingProductId, restoring, status, purchase, restore };
};
