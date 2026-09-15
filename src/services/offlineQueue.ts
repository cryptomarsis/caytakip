import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@cay_takip_offline_queue_v1';
const SNAPSHOT_PREFIX = '@cay_takip_data_snapshot_v1:';
let storageWork: Promise<unknown> = Promise.resolve();
const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
  const next = storageWork.then(work, work);
  storageWork = next.catch(() => undefined);
  return next;
};
const syncing = new Map<string, Promise<{ synced: number; failed: number; pending: number; lastError?: string }>>();
export const newRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export type OfflineRequest = {
  id: string;
  userId: string;
  endpoint: string;
  method: 'POST';
  body: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  lastError?: string;
  status?: 'pending' | 'failed';
};

export type DataSnapshot = {
  harvests: unknown[];
  payments?: unknown[];
  expenses: unknown[];
  gardens: unknown[];
  factoryPrices: unknown[];
  ads: unknown[];
  savedAt: string;
};

const readQueue = async (): Promise<OfflineRequest[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value) || value.some(item => !item || typeof item.id !== 'string' || typeof item.userId !== 'string' || typeof item.endpoint !== 'string' || !item.body)) throw new Error('Invalid queue');
    return value;
  } catch {
    throw new Error('Telefondaki bekleyen kayıtlar okunamadı. Veriler korunuyor; uygulama verilerini silmeden destek alın.');
  }
};

const writeQueue = (queue: OfflineRequest[]) => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
const updateQueue = (change: (queue: OfflineRequest[]) => OfflineRequest[]) => serialize(async () => {
  const queue = change(await readQueue());
  await writeQueue(queue);
  return queue;
});

export const getPendingRequestCount = async (userId: string) =>
  (await readQueue()).filter((request) => request.userId === userId && request.status !== 'failed').length;

export const getFailedRequestCount = async (userId: string) =>
  (await readQueue()).filter((request) => request.userId === userId && request.status === 'failed').length;

export const getOfflineRequests = async (userId: string) =>
  (await readQueue()).filter((request) => request.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const retryOfflineRequest = async (userId: string, id: string) => {
  await updateQueue(queue => queue.map((item) => item.userId === userId && item.id === id
    ? { ...item, status: 'pending', lastError: undefined }
    : item));
};

export const discardOfflineRequest = async (userId: string, id: string) => {
  await updateQueue(queue => queue.filter((item) => item.userId !== userId || item.id !== id));
};

export const enqueueOfflineRequest = async (request: Omit<OfflineRequest, 'id' | 'createdAt' | 'retryCount'> & { id?: string }) => {
  const item: OfflineRequest = {
    ...request,
    id: request.id || newRequestId(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };
  await updateQueue(queue => queue.some(existing => existing.id === item.id && existing.userId === item.userId) ? queue : [...queue, item]);
  return item;
};

const runSync = async (
  userId: string,
  send: (request: OfflineRequest) => Promise<Response>,
) => {
  const queue = await readQueue();
  const mine = queue.filter((request) => request.userId === userId && request.status !== 'failed');
  let synced = 0;
  let lastError: string | undefined;
  let failed = 0;

  for (const request of mine) {
    try {
      const response = await send(request);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        lastError = error?.error || 'Sunucu yanıtı: ' + response.status;
        if (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status) && error?.code !== 'REQUEST_IN_PROGRESS') {
          await updateQueue(queue => queue.map((item) => item.userId === userId && item.id === request.id
            ? { ...item, status: 'failed', retryCount: item.retryCount + 1, lastError }
            : item));
          failed += 1;
          continue;
        }
        break;
      }
      const data = await response.json().catch(() => null);
      if (!data?._id && !data?.payment?._id) { lastError = 'Sunucu kaydı doğrulayamadı; telefondaki kopya korunuyor.'; break; }
      await updateQueue(queue => queue.filter((item) => item.userId !== userId || item.id !== request.id));
      synced += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Bağlantı kurulamadı.';
      await updateQueue(queue => queue.map((item) => item.userId === userId && item.id === request.id
        ? { ...item, status: 'pending', retryCount: item.retryCount + 1, lastError }
        : item));
      break;
    }
  }

  const pending = await getPendingRequestCount(userId);
  return { synced, failed, pending, lastError };
};
export const syncOfflineRequests = (userId: string, send: (request: OfflineRequest) => Promise<Response>) => {
  const existing = syncing.get(userId);
  if (existing) return existing;
  const job = runSync(userId, send).finally(() => { if (syncing.get(userId) === job) syncing.delete(userId); });
  syncing.set(userId, job);
  return job;
};
export const saveDataSnapshot = (userId: string, snapshot: Omit<DataSnapshot, 'savedAt'>) =>
  AsyncStorage.setItem(`${SNAPSHOT_PREFIX}${userId}`, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));

export const getDataSnapshot = async (userId: string): Promise<DataSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${SNAPSHOT_PREFIX}${userId}`);
    const snapshot = raw ? JSON.parse(raw) : null;
    return snapshot && ['harvests', 'expenses', 'gardens', 'factoryPrices', 'ads'].every(key => Array.isArray(snapshot[key])) && (snapshot.payments === undefined || Array.isArray(snapshot.payments)) ? snapshot : null;
  } catch {
    return null;
  }
};

// Hesap kalıcı olarak silindiğinde o hesaba ait cihaz içi kuyruk ve önbelleği de
// kaldırılır. Böylece silinen bir kullanıcının hasat verisi telefonda kalmaz.
export const clearOfflineData = async (userId: string) => {
  await Promise.all([
    updateQueue(queue => queue.filter((item) => item.userId !== userId)),
    AsyncStorage.removeItem(`${SNAPSHOT_PREFIX}${userId}`),
  ]);
};
