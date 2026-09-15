import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, fetchWithTimeout } from './api';

type Pending = { id: string; payload: string };
const storageKey = (userId: string) => `@caylik_pending_ad:${userId}`;
const running = new Map<string, Promise<unknown>>();

export async function readPendingAd(userId: string): Promise<Pending | null> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value.id !== 'string' || !/^ad-[\w-]+$/.test(value.id) || typeof value.payload !== 'string' || !value.payload) throw Error();
    JSON.parse(value.payload);
    return value;
  } catch { throw new Error('Bekleyen reklam başvurusu okunamadı. Yeni başvuru yapmadan destek alın.'); }
}

// Persist BEFORE network. Changed forms cannot replace unknown financial outcomes.
export function sendAdApplication(userId: string, token: string, payload?: string): Promise<unknown> {
  const existing = running.get(userId);
  if (existing) return existing;
  const work = (async () => {
    let pending = await readPendingAd(userId);
    if (pending && payload && pending.payload !== payload) throw new Error('Önce bekleyen reklam başvurunuzun sonucunu kontrol edin.');
    if (!pending) {
      if (!payload) throw new Error('Bekleyen reklam başvurusu yok.');
      pending = { id: `ad-${Date.now()}-${Math.random().toString(36).slice(2)}`, payload };
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(pending));
    }
    const response = await fetchWithTimeout(`${API_URL}/ad-applications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': pending.id }, body: pending.payload,
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('Başvurunun sonucu henüz doğrulanamadı. Bekleyen başvuruyu kontrol edin.'); }
    if (!response.ok || typeof data?.item?._id !== 'string' || !data.item._id) {
      if ([400, 422].includes(response.status) && typeof data?.error === 'string') await AsyncStorage.removeItem(storageKey(userId));
      throw new Error(data?.error || 'Başvuru sonucu bekleniyor. Bekleyen başvuruyu kontrol edin.');
    }
    await AsyncStorage.removeItem(storageKey(userId));
    return data;
  })();
  running.set(userId, work);
  void work.finally(() => { if (running.get(userId) === work) running.delete(userId); }).catch(() => undefined);
  return work;
}
