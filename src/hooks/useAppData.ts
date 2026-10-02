import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchArrayCollection, fetchCursorCollection } from '../services/paginatedData';
import { saveDataSnapshot, getDataSnapshot } from '../services/offlineQueue';
import { syncDueNotifications } from '../services/dueNotifications';
import { API_URL } from '../services/api';
import { mergeShareLedger } from '../services/shareLedger';
import { AdRecord, ExpenseRecord, FactoryPriceRecord, GardenRecord, HarvestRecord, PaymentRecord, UserSession } from '../types';

const LAST_SYNC_STORAGE_PREFIX = '@caylik_last_sync_at';
const EMPTY: never[] = [];

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
  const [dataOwner, setDataOwner] = useState<string | null>(null);
  const [dataStale, setDataStale] = useState(false);
  const freshness = useRef({ userId: '', at: 0, pending: 0 });
  const account = useRef(currentUser?.userId);
  const generation = useRef(0);
  useEffect(() => { account.current = currentUser?.userId; generation.current++; }, [currentUser?.userId]);
  const ownData = dataOwner === currentUser?.userId;

  const fetchData = useCallback(async (silent = false) => {
    if (!currentUser?.token) return;
    if (silent && freshness.current.userId === currentUser.userId &&
      (freshness.current.pending || Date.now() - freshness.current.at < 30000)) return;
    const requestGeneration = ++generation.current;
    freshness.current = { userId: currentUser.userId, at: freshness.current.userId === currentUser.userId ? freshness.current.at : 0, pending: requestGeneration };
    const valid = () => account.current === currentUser.userId && generation.current === requestGeneration;
    if (!silent) setLoading(true);
    try {
      const headers = getAuthHeaders();
      const results = await Promise.allSettled([
        fetchCursorCollection<HarvestRecord>(authFetch, `${API_URL}/harvests`, { headers }),
        fetchCursorCollection<PaymentRecord>(authFetch, `${API_URL}/payments`, { headers }),
        fetchCursorCollection<ExpenseRecord>(authFetch, `${API_URL}/expenses`, { headers }, 200),
        fetchCursorCollection<GardenRecord>(authFetch, `${API_URL}/gardens`, { headers }),
        fetchArrayCollection<FactoryPriceRecord>(authFetch, `${API_URL}/factory-prices`, { headers }),
        fetchArrayCollection<AdRecord>(authFetch, `${API_URL}/ads`, { headers }),
        fetchCursorCollection<HarvestRecord>(authFetch, `${API_URL}/shared-ledger`, { headers }),
      ]);
      if (!valid()) return;

      const parse = <T,>(result: PromiseSettledResult<{ ok: boolean; data: T[] }>) =>
        result.status === 'fulfilled' && result.value.ok ? result.value.data : null;
      const rawH = parse(results[0]) as HarvestRecord[] | null;
      const rawPayments = parse(results[1]) as PaymentRecord[] | null;
      const rawE = parse(results[2]) as ExpenseRecord[] | null;
      const rawG = parse(results[3]) as GardenRecord[] | null;
      const rawP = parse(results[4]) as FactoryPriceRecord[] | null;
      const rawA = parse(results[5]) as AdRecord[] | null;
      const rawShared = parse(results[6]) as HarvestRecord[] | null;
      const failed = results.map((result, index) =>
        result.status === 'rejected' || !result.value.ok ? index : -1
      ).filter((index) => index >= 0);
      const allRequestsSucceeded = failed.length === results.length ? false : failed.length === 0;
      const allRequestsFailed = failed.length === results.length;

      if (allRequestsFailed) {
        const snapshot = await getDataSnapshot(currentUser.userId);
        if (!valid()) return;
        if (snapshot) {
          setDataOwner(currentUser.userId);
          setHarvests(snapshot.harvests as HarvestRecord[]);
          setPayments((snapshot.payments || []) as PaymentRecord[]);
          setExpenses(snapshot.expenses as ExpenseRecord[]);
          setGardens(snapshot.gardens as GardenRecord[]);
          setFactoryPrices(snapshot.factoryPrices as FactoryPriceRecord[]);
          setAds(snapshot.ads as AdRecord[]);
          setDataStale(true);
          setLastSyncAt(snapshot.savedAt);
          onFeedback('Çevrimdışı Mod', 'Son senkronize edilen veriler gösteriliyor. Yeni kayıtlar bağlantı geldiğinde gönderilecek.', 'info');
          return;
        }
      }

      // The three ledgers form one snapshot. Never show a fresh personal full
      // sale beside an old shared projection or temporarily inflate balances.
      let merged: ReturnType<typeof mergeShareLedger> | null = null;
      try {
        if (rawH !== null && rawPayments !== null && rawShared !== null) merged = mergeShareLedger(rawH, rawPayments, rawShared);
      } catch { /* Keep the last coherent ledger if sources race or disagree. */ }
      const cached = !ownData && (!merged || !allRequestsSucceeded) ? await getDataSnapshot(currentUser.userId) : null;
      if (!valid()) return;
      const nextHarvests = merged?.harvests ?? (ownData ? harvests : cached?.harvests as HarvestRecord[] ?? EMPTY);
      const nextPayments = merged?.payments ?? (ownData ? payments : cached?.payments as PaymentRecord[] ?? EMPTY);
      const nextExpenses = rawE ?? (ownData ? expenses : cached?.expenses as ExpenseRecord[] ?? EMPTY);
      const nextGardens = rawG ?? (ownData ? gardens : cached?.gardens as GardenRecord[] ?? EMPTY);
      const nextFactoryPrices = rawP ?? (ownData ? factoryPrices : cached?.factoryPrices as FactoryPriceRecord[] ?? EMPTY);
      const nextAds = rawA ?? (ownData ? ads : cached?.ads as AdRecord[] ?? EMPTY);
      setDataStale(!allRequestsSucceeded || !merged);
      if (!merged && cached) setLastSyncAt(cached.savedAt);
      setDataOwner(currentUser.userId);
      setHarvests(nextHarvests);
      setPayments(nextPayments);
      setExpenses(nextExpenses);
      setGardens(nextGardens);
      setFactoryPrices(nextFactoryPrices);
      setAds(nextAds);

      // Harvests, shares, collections and expenses must be coherent. Optional
      // catalog/advertising failures must not prevent saving this fresh ledger.
      if (merged && rawE !== null) {
        await saveDataSnapshot(currentUser.userId, {
          harvests: nextHarvests,
          payments: nextPayments,
          expenses: nextExpenses,
          gardens: nextGardens,
          factoryPrices: nextFactoryPrices,
          ads: nextAds,
        });
        if (!valid()) return;
        const syncedAt = new Date().toISOString();
        setLastSyncAt(syncedAt);
        if (allRequestsSucceeded) freshness.current.at = Date.now();
        await AsyncStorage.setItem(`${LAST_SYNC_STORAGE_PREFIX}:${currentUser.userId}`, syncedAt);
      }

      if (merged) await syncDueNotifications(currentUser.userId, nextHarvests.filter(row => !row.legacySharedCollection));
      if (!merged && !allRequestsFailed) onFeedback('Hesap güncellenemedi', 'Hasat, pay ve tahsilatlar birlikte yenilenemedi. Son güvenli hesap korunuyor; sunucu güncellemesini ve bağlantınızı kontrol edin.', 'info');
      const sourceNames = ['hasatlar', 'tahsilatlar', 'giderler', 'bahçeler', 'fabrika fiyatları', 'reklamlar', 'pay hesapları'];
      const failedSources = failed.map((index) => sourceNames[index]);
      if (failedSources.length > 0 && !allRequestsFailed) {
        // Geçici Render gecikmeleri kullanıcıya hata olarak gösterilmez. Başarılı
        // bölümler yenilenir, diğerlerinde son güvenli cihaz kopyası korunur.
        console.log('Arka planda güncellenemeyen veri kaynakları:', failedSources.join(', '));
      }
      if (allRequestsFailed) onFeedback('Veriler Güncellenemedi', 'Sunucuya bağlanılamadı.', 'error');
    } catch (error: unknown) {
      if (valid()) { setDataStale(true); onFeedback('Bağlantı Kurulamadı', error instanceof Error ? error.message : 'Sunucuya ulaşılamadı.', 'error'); }
    } finally {
      if (freshness.current.pending === requestGeneration) freshness.current.pending = 0;
      if (valid()) setLoading(false);
    }
  }, [ads, authFetch, currentUser, expenses, factoryPrices, gardens, getAuthHeaders, harvests, onFeedback, payments, setLoading, ownData]);

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
    harvests: ownData ? harvests : EMPTY, setHarvests,
    payments: ownData ? payments : EMPTY, setPayments,
    expenses: ownData ? expenses : EMPTY, setExpenses,
    gardens: ownData ? gardens : EMPTY, setGardens,
    factoryPrices: ownData ? factoryPrices : EMPTY, setFactoryPrices,
    ads: ownData ? ads : EMPTY, setAds,
    lastSyncAt: ownData ? lastSyncAt : null,
    dataStale: ownData && dataStale,
    fetchData,
  };
}
