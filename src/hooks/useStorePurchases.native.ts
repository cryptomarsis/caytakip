import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Product, ProductSubscription, Purchase } from 'expo-iap';

import { API_URL } from '../services/api';
import type { AuthFetch } from '../services/aiAssistant';
import {
  ALL_IAP_PRODUCT_IDS,
  fetchIapConfig,
  IAP_PRODUCT_IDS,
  isStoreProductId,
  type StoreProductId,
  verifyApplePurchase,
} from '../services/inAppPurchases';

const isConsumable = (productId: string) => (IAP_PRODUCT_IDS as readonly string[]).includes(productId);
const transactionIdOf = (purchase: Purchase) => String(('transactionId' in purchase && purchase.transactionId) || purchase.id || '');
type IapModule = typeof import('expo-iap');
const IS_EXPO_GO = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

export const useStorePurchases = (
  userId: string | undefined,
  authFetch: AuthFetch,
  refreshWallet: () => Promise<void>,
) => {
  const authFetchRef = useRef(authFetch);
  const refreshWalletRef = useRef(refreshWallet);
  const processingRef = useRef(new Set<string>());
  const iapRef = useRef<IapModule | null>(null);
  const [serverConfig, setServerConfig] = useState({ userId: '', configured: false, appAccountToken: '' });
  const [connected, setConnected] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [subscriptions, setSubscriptions] = useState<ProductSubscription[]>([]);
  const [purchasingProductId, setPurchasingProductId] = useState<StoreProductId | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState(IS_EXPO_GO ? 'Satın alma Expo Go’da kullanılamaz; TestFlight veya geliştirme sürümünde açılır.' : 'App Store bağlantısı hazırlanıyor…');
  const configured = Boolean(userId && serverConfig.userId === userId && serverConfig.configured);
  const appAccountToken = serverConfig.userId === userId ? serverConfig.appAccountToken : '';

  useEffect(() => { authFetchRef.current = authFetch; }, [authFetch]);
  useEffect(() => { refreshWalletRef.current = refreshWallet; }, [refreshWallet]);

  const fetchStoreProducts = useCallback(async () => {
    const iap = iapRef.current;
    if (!iap) throw new Error('App Store bağlantısı kapalı.');
    const items = await iap.fetchProducts({ skus: [...ALL_IAP_PRODUCT_IDS], type: 'all' }) || [];
    const nextProducts = items.filter((item) => item.type === 'in-app') as Product[];
    const nextSubscriptions = items.filter((item) => item.type === 'subs') as ProductSubscription[];
    setProducts(nextProducts);
    setSubscriptions(nextSubscriptions);
    if (items.length) setStatus(`${items.length} App Store ürünü hazır.`);
    else setStatus('App Store ürünleri henüz bu cihazın mağazasında görünmüyor.');
    return items;
  }, []);

  const processPurchase = async (purchase: Purchase) => {
    const productId = String(purchase.productId || '');
    const transactionId = transactionIdOf(purchase);
    if (!isStoreProductId(productId) || !transactionId) throw new Error('App Store işlem bilgisi eksik geldi.');
    if (processingRef.current.has(transactionId)) return { creditsGranted: 0, replayed: true };
    processingRef.current.add(transactionId);
    try {
      const verified = await verifyApplePurchase(authFetchRef.current, API_URL, transactionId, productId);
      if (!verified.verified) throw new Error('Satın alma doğrulanamadı.');
      if (!iapRef.current) throw new Error('App Store bağlantısı kapandı.');
      await iapRef.current.finishTransaction({ purchase, isConsumable: isConsumable(productId) });
      await refreshWalletRef.current();
      return verified;
    } finally {
      processingRef.current.delete(transactionId);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let purchaseSubscription: { remove: () => void } | undefined;
    let errorSubscription: { remove: () => void } | undefined;
    if (IS_EXPO_GO) return;

    void import('expo-iap').then(async (iap) => {
      if (cancelled) return;
      iapRef.current = iap;
      purchaseSubscription = iap.purchaseUpdatedListener((purchase) => {
        setPurchasingProductId(isStoreProductId(purchase.productId) ? purchase.productId : null);
        void processPurchase(purchase)
          .then((result) => {
            setStatus('Satın alma tamamlandı. Krediniz hesabınıza eklendi.');
            Alert.alert('Satın alma başarılı', result.replayed ? 'Bu işlem daha önce hesabınıza eklenmişti.' : `${result.creditsGranted.toLocaleString('tr-TR')} kredi hesabınıza eklendi.`);
          })
          .catch((error) => {
            setStatus(error instanceof Error ? error.message : 'Satın alma doğrulanamadı.');
            Alert.alert('Doğrulama bekliyor', error instanceof Error ? error.message : 'İşlem daha sonra yeniden denenecek.');
          })
          .finally(() => setPurchasingProductId(null));
      });
      errorSubscription = iap.purchaseErrorListener((error) => {
        setPurchasingProductId(null);
        if (String(error.code).toLowerCase().includes('cancel')) return;
        const message = error.message || 'Satın alma başlatılamadı.';
        setStatus(message);
        Alert.alert('Satın alma tamamlanamadı', message);
      });
      const ready = await iap.initConnection();
      if (cancelled) return;
      setConnected(Boolean(ready));
      if (!ready) setStatus('App Store bağlantısı kurulamadı.');
    }).catch((error) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : 'App Store bağlantısı kurulamadı.');
    });

    return () => {
      cancelled = true;
      purchaseSubscription?.remove();
      errorSubscription?.remove();
      const iap = iapRef.current;
      iapRef.current = null;
      if (iap) void iap.endConnection();
    };
  }, []);

  useEffect(() => {
    if (!userId || Platform.OS !== 'ios') return;
    let cancelled = false;
    void fetchIapConfig(authFetchRef.current, API_URL)
      .then((config) => {
        if (cancelled) return;
        setServerConfig({ userId, configured: config.configured, appAccountToken: config.appAccountToken });
        setStatus(config.configured ? 'App Store bağlantısı hazır.' : 'Satın alma sunucusu henüz yapılandırılmadı.');
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Mağaza yapılandırması alınamadı.');
      });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!connected || !userId || Platform.OS !== 'ios') return;
    void fetchStoreProducts().catch((error) => setStatus(error instanceof Error ? error.message : 'App Store ürünleri alınamadı.'));
  }, [connected, fetchStoreProducts, userId]);

  const prices = [...products, ...subscriptions].reduce<Partial<Record<StoreProductId, string>>>((result, product) => {
    if (isStoreProductId(product.id)) result[product.id] = product.displayPrice;
    return result;
  }, {});

  const purchase = async (productId: StoreProductId) => {
    if (Platform.OS !== 'ios') return Alert.alert('Yakında', 'Google Play satın alma bağlantısı Android mağaza ürünleri tanımlandığında açılacak.');
    if (!connected) return Alert.alert('App Store bağlantısı yok', 'İnternet bağlantınızı kontrol edip tekrar deneyin.');
    if (!configured || !appAccountToken) return Alert.alert('Satın alma hazır değil', 'Apple doğrulama ayarları tamamlandıktan sonra paketler satın alınabilir.');
    if (!ALL_IAP_PRODUCT_IDS.includes(productId)) return;
    let available = [...products, ...subscriptions].some((product) => product.id === productId);
    if (!available) {
      setStatus('App Store ürün listesi yenileniyor…');
      try {
        const refreshedItems = await fetchStoreProducts();
        available = refreshedItems.some((product) => product.id === productId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'App Store ürünleri alınamadı.';
        setStatus(message);
        return Alert.alert('App Store bağlantısı kurulamadı', message);
      }
    }
    if (!available) return Alert.alert('Paket Apple’da görünmüyor', `App Store bu cihaz için ${productId} ürününü döndürmedi. Ürünün fiyat, ülke ve sözleşme durumunu App Store Connect’te kontrol edin.`);
    setPurchasingProductId(productId);
    try {
      const iap = iapRef.current;
      if (!iap) throw new Error('App Store bağlantısı kapalı.');
      await iap.requestPurchase({
        request: { apple: { sku: productId, quantity: 1, appAccountToken } },
        type: isConsumable(productId) ? 'in-app' : 'subs',
      });
    } catch (error) {
      setPurchasingProductId(null);
      const message = error instanceof Error ? error.message : 'Satın alma başlatılamadı.';
      setStatus(message);
      Alert.alert('Satın alma tamamlanamadı', message);
    }
  };

  const restore = async () => {
    if (Platform.OS !== 'ios') return Alert.alert('Yakında', 'Google Play geri yükleme bağlantısı daha sonra açılacak.');
    if (!connected || !configured) return Alert.alert('App Store bağlantısı yok', 'Mağaza bağlantısı hazır olduğunda tekrar deneyin.');
    setRestoring(true);
    try {
      const iap = iapRef.current;
      if (!iap) throw new Error('App Store bağlantısı kapalı.');
      const purchases = await iap.getAvailablePurchases();
      const matching = purchases.filter((item) => isStoreProductId(item.productId));
      for (const purchaseItem of matching) await processPurchase(purchaseItem);
      await refreshWalletRef.current();
      setStatus('Satın alımlar kontrol edildi.');
      Alert.alert('Geri yükleme tamamlandı', matching.length ? 'Çaylık Pro ve bekleyen mağaza işlemleriniz kontrol edildi.' : 'Geri yüklenecek aktif Çaylık Pro aboneliği bulunamadı. Kredi paketleriniz Çaylık hesabınızda saklanır.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Satın alımlar geri yüklenemedi.';
      setStatus(message);
      Alert.alert('Geri yüklenemedi', message);
    } finally {
      setRestoring(false);
    }
  };

  return { connected, configured, prices, purchasingProductId, restoring, status, purchase, restore };
};
