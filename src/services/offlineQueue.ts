import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@cay_takip_offline_queue_v1';
const SNAPSHOT_PREFIX = '@cay_takip_data_snapshot_v1:';

export type OfflineRequest = {
  id: string;
  userId: string;
  endpoint: string;
  method: 'POST';
  body: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  lastError?: string;
};

export type DataSnapshot = {
  harvests: unknown[];
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
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue: OfflineRequest[]) => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

export const getPendingRequestCount = async (userId: string) =>
  (await readQueue()).filter((request) => request.userId === userId).length;

export const enqueueOfflineRequest = async (request: Omit<OfflineRequest, 'id' | 'createdAt' | 'retryCount'>) => {
  const queue = await readQueue();
  const item: OfflineRequest = {
    ...request,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  await writeQueue([...queue, item]);
  return item;
};

export const syncOfflineRequests = async (
  userId: string,
  send: (request: OfflineRequest) => Promise<Response>,
) => {
  const queue = await readQueue();
  const mine = queue.filter((request) => request.userId === userId);
  let synced = 0;
  let lastError: string | undefined;

  for (const request of mine) {
    try {
      const response = await send(request);
      if (!response.ok) {
        lastError = `Sunucu yanıtı: ${response.status}`;
        break;
      }
      const remaining = (await readQueue()).filter((item) => item.id !== request.id);
      await writeQueue(remaining);
      synced += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Bağlantı kurulamadı.';
      const latest = await readQueue();
      await writeQueue(latest.map((item) => item.id === request.id
        ? { ...item, retryCount: item.retryCount + 1, lastError }
        : item));
      break;
    }
  }

  return { synced, pending: await getPendingRequestCount(userId), lastError };
};

export const saveDataSnapshot = (userId: string, snapshot: Omit<DataSnapshot, 'savedAt'>) =>
  AsyncStorage.setItem(`${SNAPSHOT_PREFIX}${userId}`, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));

export const getDataSnapshot = async (userId: string): Promise<DataSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${SNAPSHOT_PREFIX}${userId}`);
    const snapshot = raw ? JSON.parse(raw) : null;
    return snapshot && Array.isArray(snapshot.harvests) ? snapshot : null;
  } catch {
    return null;
  }
};
