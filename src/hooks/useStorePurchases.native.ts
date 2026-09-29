import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { clearPendingPurchase, readPendingPurchase, savePendingPurchase } from '../services/pendingPurchase';
import { API_URL } from '../services/api';
import Constants from 'expo-constants';

import type { AuthFetch } from '../services/aiAssistant';
import { ALL_IAP_PRODUCT_IDS, type StoreProductId } from '../services/inAppPurchases';
import { findStorePackage } from '../../shared/storeProducts';
import { trackTikTokPurchase } from '../services/adTracking';
import { useProAccess } from './useProAccess';

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || 'appl_ZMzoEtiIbrAKPLWMBXJLMTGbFwx';
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';
const EXPO_GO = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
type RevenueCatModule = typeof import('react-native-purchases');

export const useStorePurchases = (
  userId: string | undefined,
  authFetch: AuthFetch,
  refreshWallet: () => Promise<void>,
) => {
  const revenueCatRef = useRef<RevenueCatModule | null>(null);
  const activeUserRef = useRef<string | null>(null);
  const connectingRef = useRef<Promise<RevenueCatModule> | null>(null);
  const purchaseLock = useRef(false);
  const ownerRef = useRef(userId);
  useEffect(() => { ownerRef.current = userId; }, [userId]);
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [storeSession, setStoreSession] = useState<{ userId: string } | null>(null);
  const proStatus = useProAccess(userId, storeSession);
  const [prices, setPrices] = useState<Partial<Record<StoreProductId, string>>>({});
  const [purchasingProductId, setPurchasingProductId] = useState<StoreProductId | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState(EXPO_GO
    ? 'Satın alma Expo Go’da kullanılamaz; geliştirme build’i gerekir.'
    : 'RevenueCat bağlantısı hazırlanıyor…');

  const checkPending = useCallback(async (attempts = 6) => {
    if (!userId) return false;
    const transactionId = await readPendingPurchase(userId);
    if (!transactionId) return false;
    for (let attempt = 0; attempt < attempts && ownerRef.current === userId; attempt++) {
      try {
        const response = await authFetch(`${API_URL}/iap/status?transactionId=${encodeURIComponent(transactionId)}`);
        const data = await response.json();
        if (response.ok && data.recorded && ownerRef.current === userId) {
          await refreshWallet();
          await clearPendingPurchase(userId, transactionId);
          setStatus(data.sandbox ? 'Test satın alımı doğrulandı; gerçek kredi bakiyesi değişmedi.' : `Satın alma doğrulandı · ${data.creditsGranted} kredi kaydedildi.`);
          return true;
        }
      } catch { /* Persisted transaction is retried on next foreground. */ }
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (ownerRef.current === userId) setStatus('Ödeme mağazada tamamlandı; kredinizin doğrulanması bekleniyor. Yeniden satın almayın. Uygulamaya döndüğünüzde tekrar kontrol edeceğiz.');
    return false;
  }, [authFetch, refreshWallet, userId]);
  useEffect(() => {
    const timer = setTimeout(() => { void checkPending(1).catch(() => undefined); }, 0);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void checkPending(3).catch(() => undefined); });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [checkPending]);

  const loadOfferings = useCallback(async (module: RevenueCatModule) => {
    const offerings = await module.default.getOfferings();
    const nextPrices: Partial<Record<StoreProductId, string>> = {};
    ALL_IAP_PRODUCT_IDS.forEach((id) => {
      const item = findStorePackage(offerings.current?.availablePackages || [], id, Platform.OS);
      if (item) nextPrices[id] = item.product.priceString;
    });
    setPrices(nextPrices);
    return offerings;
  }, []);

  const connectStore = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new Error('Satın alma bu platformda kullanılamaz.');
    if (EXPO_GO) throw new Error('Satın alma Expo Go’da kullanılamaz. Mağaza test sürümünü kullanın.');
    if (!userId) throw new Error('Mağazaya bağlanmak için yeniden giriş yapın.');
    if (connectingRef.current) {
      await connectingRef.current.catch(() => undefined);
      if (ownerRef.current !== userId) throw new Error('Oturum değişti.');
      if (activeUserRef.current === userId && revenueCatRef.current) return revenueCatRef.current;
    }

    const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
    if (!apiKey) throw new Error('Google Play satın alma ayarları henüz tamamlanmadı.');

    const connection = (async () => {
      const revenueCat = await import('react-native-purchases');
      if (ownerRef.current !== userId) throw new Error('Oturum değişti.');
      revenueCatRef.current = revenueCat;

      const isConfigured = await revenueCat.default.isConfigured();
      if (!isConfigured) {
        revenueCat.default.configure({ apiKey, appUserID: userId });
      } else if (activeUserRef.current !== userId) {
        await revenueCat.default.logIn(userId);
      }

      activeUserRef.current = userId;
      if (ownerRef.current !== userId) throw new Error('Oturum değişti.');
      setStoreSession({ userId });
      await loadOfferings(revenueCat);
      setConnected(true);
      setConfigured(true);
      setStatus(await readPendingPurchase(userId) ? 'Önceki satın alımın kredi kaydı doğrulanıyor…' : 'RevenueCat bağlantısı hazır.');
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
        setStoreSession(null);
      });
      return;
    }
    void Promise.resolve().then(connectStore).catch(() => undefined);
  }, [connectStore, userId]);

  const purchase = useCallback(async (id: StoreProductId) => {
    if (purchaseLock.current || !userId) return;
    purchaseLock.current = true;
    setPurchasingProductId(id);
    try {
      if (await readPendingPurchase(userId)) {
        if (!await checkPending()) { Alert.alert('Önceki ödeme doğrulanıyor', 'Yeni ödeme yapmadan önce kredinizin kaydını bekleyin.'); return; }
      }
      const revenueCat = revenueCatRef.current && configured && activeUserRef.current === userId
        ? revenueCatRef.current
        : await connectStore();
      const offerings = await loadOfferings(revenueCat);
      const selectedPackage = findStorePackage(offerings.current?.availablePackages || [], id, Platform.OS);
      if (!selectedPackage) {
        console.warn('STORE_PACKAGE_NOT_FOUND', {
          platform: Platform.OS, requestedProduct: id, offering: offerings.current?.identifier,
          products: offerings.current?.availablePackages.map(item => item.product.identifier),
        });
        throw new Error('Bu paket şu anda mağazada kullanılamıyor. Lütfen daha sonra tekrar deneyin.');
      }
      if (ownerRef.current !== userId || activeUserRef.current !== userId) throw new Error('Oturum değişti. Yeniden giriş yapın.');
      const result = await revenueCat.default.purchasePackage(selectedPackage);
      if (ownerRef.current === userId) setStoreSession({ userId });
      const transactionId = result.transaction.transactionIdentifier;
      await savePendingPurchase(userId, transactionId);
      if (ownerRef.current !== userId) return;
      void trackTikTokPurchase();
      setStatus('Ödeme alındı; kredi kaydı doğrulanıyor…');
      const recorded = await checkPending();
      Alert.alert(
        recorded ? 'Satın alma doğrulandı' : 'Krediniz hazırlanıyor',
        recorded ? 'Mağaza işleminiz kaydedildi. Test işlemleri gerçek bakiyeye eklenmez.' : 'Ödemeniz alındı. Doğrulama tamamlandığında bakiye güncellenecek; tekrar satın almayın.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      const cancelled = (error as { code?: string; userCancelled?: boolean })?.code === '1' || (error as { userCancelled?: boolean })?.userCancelled;
      if (!cancelled && !message.toLocaleLowerCase('tr-TR').includes('cancel')) {
        console.warn('STORE_PURCHASE_FAILED', { code: (error as { code?: string })?.code, message });
        Alert.alert('Satın alma kontrol edilemedi', 'Mağaza bağlantısı kurulamadı. Ödeme alındıysa tekrar satın almayın; uygulamaya tekrar girdiğinizde kontrol edeceğiz.');
      }
    } finally {
      purchaseLock.current = false;
      setPurchasingProductId(null);
    }
  }, [configured, connectStore, loadOfferings, userId, checkPending]);

  const restore = useCallback(async () => {
    if (purchaseLock.current) return;
    const revenueCat = revenueCatRef.current;
    if (!revenueCat || !configured || activeUserRef.current !== userId) return;
    purchaseLock.current = true;
    setRestoring(true);
    try {
      await revenueCat.default.restorePurchases();
      if (userId && ownerRef.current === userId) setStoreSession({ userId });
      await refreshWallet();
      await checkPending(3);
      Alert.alert('Mağaza kontrol edildi', 'Abonelikleriniz mağazadan kontrol edildi. Tüketilen tek seferlik krediler yeniden yüklenmez; mevcut krediler Çaylık hesabınızda saklanır.');
    } catch (error) {
      Alert.alert('Geri yüklenemedi', error instanceof Error ? error.message : 'Lütfen tekrar deneyin.');
    } finally {
      purchaseLock.current = false;
      setRestoring(false);
    }
  }, [configured, refreshWallet, userId, checkPending]);

  const reload = useCallback(async () => { await connectStore().catch(() => undefined); await checkPending(3); }, [connectStore, checkPending]);
  return { connected, configured, prices, purchasingProductId, restoring, status, purchase, restore, reload, proStatus };
};
