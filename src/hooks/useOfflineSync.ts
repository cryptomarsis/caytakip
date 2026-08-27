import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { API_URL } from '../services/api';
import {
  discardOfflineRequest,
  enqueueOfflineRequest,
  getFailedRequestCount,
  getOfflineRequests,
  getPendingRequestCount,
  retryOfflineRequest,
  syncOfflineRequests,
} from '../services/offlineQueue';
import { UserSession } from '../types';

type AuthFetch = (url: string, options?: RequestInit, timeout?: number) => Promise<Response>;

type Options = {
  currentUser: UserSession | null;
  authFetch: AuthFetch;
  getAuthHeaders: () => Record<string, string>;
};

export function useOfflineSync({ currentUser, authFetch, getAuthHeaders }: Options) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const syncing = useRef(false);

  const refreshCounts = useCallback(async () => {
    if (!currentUser?.userId) return;
    const [pending, failed] = await Promise.all([
      getPendingRequestCount(currentUser.userId),
      getFailedRequestCount(currentUser.userId),
    ]);
    setPendingCount(pending);
    setFailedCount(failed);
  }, [currentUser?.userId]);

  const queueRequest = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    if (!currentUser?.userId) throw new Error('Oturum bulunamadı.');
    await enqueueOfflineRequest({ userId: currentUser.userId, endpoint, method: 'POST', body });
    await refreshCounts();
  }, [currentUser?.userId, refreshCounts]);

  const syncQueue = useCallback(async () => {
    if (!currentUser?.userId || syncing.current) return { synced: 0, pending: 0 };
    const network = await NetInfo.fetch();
    if (Platform.OS !== 'web' && (!network.isConnected || network.isInternetReachable === false)) {
      return { synced: 0, pending: await getPendingRequestCount(currentUser.userId) };
    }

    syncing.current = true;
    try {
      const result = await syncOfflineRequests(currentUser.userId, (request) => authFetch(`${API_URL}${request.endpoint}`, {
        method: request.method,
        headers: { ...getAuthHeaders(), 'Idempotency-Key': request.id },
        body: JSON.stringify(request.body),
      }));
      setPendingCount(result.pending);
      setFailedCount(await getFailedRequestCount(currentUser.userId));
      return result;
    } finally {
      syncing.current = false;
    }
  }, [authFetch, currentUser?.userId, getAuthHeaders]);

  const manageFailedRequests = useCallback(async () => {
    if (!currentUser?.userId) return;
    const failed = (await getOfflineRequests(currentUser.userId)).filter((item) => item.status === 'failed');
    if (!failed.length) return;
    const first = failed[0];
    Alert.alert(
      'Gönderilemeyen kayıt var',
      `${failed.length} kayıt sunucu tarafından kabul edilmedi. İlk hata: ${first.lastError || 'Bilinmeyen hata'}`,
      [
        { text: 'Kapat', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: async () => { await discardOfflineRequest(currentUser.userId, first.id); await refreshCounts(); } },
        { text: 'Tekrar Dene', onPress: async () => { await retryOfflineRequest(currentUser.userId, first.id); await syncQueue(); await refreshCounts(); } },
      ],
    );
  }, [currentUser?.userId, refreshCounts, syncQueue]);

  return {
    pendingCount,
    failedCount,
    refreshCounts,
    queueRequest,
    syncQueue,
    manageFailedRequests,
  };
}
