import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';

import type { AuthFetch } from '../services/aiAssistant';
import { isStoreProductId, type StoreProductId } from '../services/inAppPurchases';
import { trackTikTokPurchase } from '../services/adTracking';

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || 'appl_ZMzoEtiIbrAKPLWMBXJLMTGbFwx';
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';
const EXPO_GO = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
type RevenueCatModule = typeof import('react-native-purchases');

export const useStorePurchases = (
  userId: string | undefined,
  _authFetch: AuthFetch,
  refreshWallet: () => Promise<void>,
) => {
  const revenueCatRef = useRef<RevenueCatModule | null>(null);
  const activeUserRef = useRef<string | null>(null);
  const connectingRef = useRef<Promise<RevenueCatModule> | null>(null);
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

  const connectStore = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new Error('Satın alma bu platformda kullanılamaz.');
    if (EXPO_GO) throw new Error('Satın alma Expo Go’da kullanılamaz. Mağaza test sürümünü kullanın.');
    if (!userId) throw new Error('Mağazaya bağlanmak için yeniden giriş yapın.');
    if (connectingRef.current) return connectingRef.current;

    const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
    if (!apiKey) throw new Error('Google Play satın alma ayarları henüz tamamlanmadı.');

    const connection = (async () => {
      const revenueCat = await import('react-native-purchases');
      revenueCatRef.current = revenueCat;

      const isConfigured = await revenueCat.default.isConfigured();
      if (!isConfigured) {
        revenueCat.default.configure({ apiKey, appUserID: userId });
      } else if (activeUserRef.current !== userId) {
        await revenueCat.default.logIn(userId);
      }

      activeUserRef.current = userId;
      await loadOfferings(revenueCat);
      setConnected(true);
      setConfigured(true);
      setStatus('RevenueCat bağlantısı hazır.');
      return revenueCat;
    })();

    connectingRef.current = connection;
    try {
      return await connection;
    } catch (error) {
      revenueCatRef.current = null;
      activeUserRef.current = null;
      setConnected(false);
      setConfigured(false);
      setStatus(error instanceof Error ? error.message : 'App Store bağlantısı kurulamadı.');
      throw error;
    } finally {
      if (connectingRef.current === connection) connectingRef.current = null;
    }
  }, [loadOfferings, userId]);

  useEffect(() => {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || EXPO_GO || !userId) {
      activeUserRef.current = null;
      void Promise.resolve().then(() => {
        setConnected(false);
        setConfigured(false);
      });
      return;
    }
    void Promise.resolve().then(connectStore).catch(() => undefined);
  }, [connectStore, userId]);

  const purchase = useCallback(async (id: StoreProductId) => {
    setPurchasingProductId(id);
    try {
      const revenueCat = revenueCatRef.current && configured && activeUserRef.current === userId
        ? revenueCatRef.current
        : await connectStore();
      const offerings = await loadOfferings(revenueCat);
      const selectedPackage = offerings.current?.availablePackages.find((item) => item.product.identifier === id);
      if (!selectedPackage) throw new Error('Bu paket şu anda mağazada bulunamadı.');
      await revenueCat.default.purchasePackage(selectedPackage);
      void trackTikTokPurchase();
      await refreshWallet();
      Alert.alert(
        'Satın alma tamamlandı',
        'Gerçek mağaza satın alımlarında kredi bakiyesi doğrulama tamamlanınca güncellenir. TestFlight Sandbox işlemleri gerçek kredi bakiyesine eklenmez.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (!message.toLocaleLowerCase('tr-TR').includes('cancel')) Alert.alert('Satın alma tamamlanamadı', message || 'Lütfen tekrar deneyin.');
    } finally {
      setPurchasingProductId(null);
    }
  }, [configured, connectStore, loadOfferings, refreshWallet, userId]);

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
