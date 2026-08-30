import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import type { AuthFetch } from '../services/aiAssistant';
import { isStoreProductId, type StoreProductId } from '../services/inAppPurchases';

const KEY = 'appl_ZMzoEtiIbrAKPLWMBXJLMTGbFwx';
const EXPO_GO = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
type RC = typeof import('react-native-purchases');

export const useStorePurchases = (userId: string | undefined, _authFetch: AuthFetch, refreshWallet: () => Promise<void>) => {
  const ref = useRef<RC | null>(null);
  const [connected, setConnected] = useState(false); const [configured, setConfigured] = useState(false);
  const [prices, setPrices] = useState<Partial<Record<StoreProductId, string>>>({});
  const [purchasingProductId, setPurchasingProductId] = useState<StoreProductId | null>(null); const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState(EXPO_GO ? 'Satın alma Expo Go’da kullanılamaz; geliştirme build’i gerekir.' : 'RevenueCat bağlantısı hazırlanıyor…');
  useEffect(() => { if (Platform.OS !== 'ios' || EXPO_GO) return; let off = false; void import('react-native-purchases').then(async (rc) => { if (off) return; ref.current = rc; if (!rc.default.isConfigured()) rc.default.configure({ apiKey: KEY }); setConnected(true); setConfigured(true); const o = await rc.default.getOfferings(); const p: Partial<Record<StoreProductId, string>> = {}; o.current?.availablePackages.forEach(x => { if (isStoreProductId(x.product.identifier)) p[x.product.identifier] = x.product.priceString; }); setPrices(p); setStatus('RevenueCat bağlantısı hazır.'); }).catch(e => !off && setStatus(e instanceof Error ? e.message : 'Satın alma bağlantısı kurulamadı.')); return () => { off = true; }; }, []);
  const purchase = useCallback(async (id: StoreProductId) => { const rc = ref.current; if (!rc || !configured) return Alert.alert('Satın alma hazır değil', 'RevenueCat bağlantısı henüz hazır değil.'); setPurchasingProductId(id); try { const o = await rc.default.getOfferings(); const pkg = o.current?.availablePackages.find(x => x.product.identifier === id); if (!pkg) throw new Error('Bu paket şu anda mağazada bulunamadı.'); await rc.default.purchasePackage(pkg); await refreshWallet(); } catch (e) { if (!String(e).toLowerCase().includes('cancel')) Alert.alert('Satın alma tamamlanamadı', e instanceof Error ? e.message : 'Lütfen tekrar deneyin.'); } finally { setPurchasingProductId(null); } }, [configured, refreshWallet]);
  const restore = useCallback(async () => { const rc = ref.current; if (!rc || !configured) return; setRestoring(true); try { await rc.default.restorePurchases(); await refreshWallet(); Alert.alert('Tamamlandı', 'Satın alımlarınız kontrol edildi.'); } catch (e) { Alert.alert('Geri yüklenemedi', e instanceof Error ? e.message : 'Lütfen tekrar deneyin.'); } finally { setRestoring(false); } }, [configured, refreshWallet]);
  return { connected, configured, prices, purchasingProductId, restoring, status, purchase, restore };
};
