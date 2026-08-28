import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchArrayCollection, fetchCursorCollection } from '../services/paginatedData';
import { saveDataSnapshot, getDataSnapshot } from '../services/offlineQueue';
import { syncDueNotifications } from '../services/dueNotifications';
import { API_URL } from '../services/api';
import { AdRecord, ExpenseRecord, FactoryPriceRecord, GardenRecord, HarvestRecord, PaymentRecord, UserSession } from '../types';

const LAST_SYNC_STORAGE_PREFIX = '@caylik_last_sync_at';

type AuthFetch = (url: string, options?: RequestInit, timeout?: number) => Promise<Response>;
type Feedback = (title: string, message: string, type?: 'error' | 'success' | 'info') => void;

type UseAppDataOptions = {
  currentUser: UserSession | null;
  authFetch: AuthFetch;
  getAuthHeaders: () => Record<string, string>;
  setLoading: (value: boolean) => void;
  onFeedback: Feedback;
};

/**
 * Loads and caches the user's domain data. Keeping this outside the route
 * component prevents authentication, forms and rendering from sharing one
 * giant stateful file.
 */
export function useAppData({ currentUser, authFetch, getAuthHeaders, setLoading, onFeedback }: UseAppDataOptions) {
  const [harvests, setHarvests] = useState<HarvestRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [gardens, setGardens] = useState<GardenRecord[]>([]);
  const [factoryPrices, setFactoryPrices] = useState<FactoryPriceRecord[]>([]);
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentUser?.token) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const results = await Promise.allSettled([
        fetchCursorCollection<HarvestRecord>(authFetch, `${API_URL}/harvests`, { headers }),
        fetchCursorCollection<PaymentRecord>(authFetch, `${API_URL}/payments`, { headers }),
        fetchCursorCollection<ExpenseRecord>(authFetch, `${API_URL}/expenses`, { headers }, 200),
        fetchCursorCollection<GardenRecord>(authFetch, `${API_URL}/gardens`, { headers }),
        fetchArrayCollection<FactoryPriceRecord>(authFetch, `${API_URL}/factory-prices`, { headers }),
        fetchArrayCollection<AdRecord>(authFetch, `${API_URL}/ads`, { headers }),
      ]);

      const parse = <T,>(result: PromiseSettledResult<{ ok: boolean; data: T[] }>) =>
        result.status === 'fulfilled' && result.value.ok ? result.value.data : null;
      const rawH = parse(results[0]) as HarvestRecord[] | null;
      const rawPayments = parse(results[1]) as PaymentRecord[] | null;
      const rawE = parse(results[2]) as ExpenseRecord[] | null;
      const rawG = parse(results[3]) as GardenRecord[] | null;
      const rawP = parse(results[4]) as FactoryPriceRecord[] | null;
      const rawA = parse(results[5]) as AdRecord[] | null;
      const failed = results.map((result, index) =>
        result.status === 'rejected' || !result.value.ok ? index : -1
      ).filter((index) => index >= 0);
      const allRequestsSucceeded = failed.length === results.length ? false : failed.length === 0;
      const allRequestsFailed = failed.length === results.length;

      if (allRequestsFailed) {
        const snapshot = await getDataSnapshot(currentUser.userId);
        if (snapshot) {
          setHarvests(snapshot.harvests as HarvestRecord[]);
          setPayments((snapshot.payments || []) as PaymentRecord[]);
          setExpenses(snapshot.expenses as ExpenseRecord[]);
          setGardens(snapshot.gardens as GardenRecord[]);
          setFactoryPrices(snapshot.factoryPrices as FactoryPriceRecord[]);
          setAds(snapshot.ads as AdRecord[]);
          onFeedback('Çevrimdışı Mod', 'Son senkronize edilen veriler gösteriliyor. Yeni kayıtlar bağlantı geldiğinde gönderilecek.', 'info');
          return;
        }
      }

      const nextHarvests = rawH ?? harvests;
      const nextPayments = rawPayments ?? payments;
      const nextExpenses = rawE ?? expenses;
      const nextGardens = rawG ?? gardens;
      const nextFactoryPrices = rawP ?? factoryPrices;
      const nextAds = rawA ?? ads;
      setHarvests(nextHarvests);
      setPayments(nextPayments);
      setExpenses(nextExpenses);
      setGardens(nextGardens);
      setFactoryPrices(nextFactoryPrices);
      setAds(nextAds);

      if (allRequestsSucceeded) {
        await saveDataSnapshot(currentUser.userId, {
          harvests: nextHarvests,
          payments: nextPayments,
          expenses: nextExpenses,
          gardens: nextGardens,
          factoryPrices: nextFactoryPrices,
          ads: nextAds,
        });
        const syncedAt = new Date().toISOString();
        setLastSyncAt(syncedAt);
        await AsyncStorage.setItem(`${LAST_SYNC_STORAGE_PREFIX}:${currentUser.userId}`, syncedAt);
      }

      if (rawH !== null) await syncDueNotifications(currentUser.userId, nextHarvests);
      const sourceNames = ['hasatlar', 'tahsilatlar', 'giderler', 'bahçeler', 'fabrika fiyatları', 'reklamlar'];
      const failedSources = failed.map((index) => sourceNames[index]);
      if (failedSources.length > 0 && !allRequestsFailed) {
        // Geçici Render gecikmeleri kullanıcıya hata olarak gösterilmez. Başarılı
        // bölümler yenilenir, diğerlerinde son güvenli cihaz kopyası korunur.
        console.log('Arka planda güncellenemeyen veri kaynakları:', failedSources.join(', '));
      }
      if (allRequestsFailed) onFeedback('Veriler Güncellenemedi', 'Sunucuya bağlanılamadı.', 'error');
    } catch (error: unknown) {
      onFeedback('Bağlantı Kurulamadı', error instanceof Error ? error.message : 'Sunucuya ulaşılamadı.', 'error');
    } finally {
      setLoading(false);
    }
  }, [ads, authFetch, currentUser, expenses, factoryPrices, gardens, getAuthHeaders, harvests, onFeedback, payments, setLoading]);

  useEffect(() => {
    const userId = currentUser?.userId;
    if (!userId) {
      // Clear the account-specific timestamp immediately after logout.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastSyncAt(null);
      return;
    }
    let active = true;
    AsyncStorage.getItem(`${LAST_SYNC_STORAGE_PREFIX}:${userId}`)
      .then((stored) => { if (active) setLastSyncAt(stored); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [currentUser?.userId]);

  return {
    harvests, setHarvests,
    payments, setPayments,
    expenses, setExpenses,
    gardens, setGardens,
    factoryPrices, setFactoryPrices,
    ads, setAds,
    lastSyncAt,
    fetchData,
  };
}
