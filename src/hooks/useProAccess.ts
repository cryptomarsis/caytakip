import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { observeProAccess, type ProStatus } from '../services/proAccess';

export function useProAccess(userId: string | undefined, storeSession: { userId: string } | null) {
  const [result, setResult] = useState<{ session: typeof storeSession; status: ProStatus } | null>(null);
  useEffect(() => {
    if (!userId || userId !== storeSession?.userId || Platform.OS === 'web') return;
    let alive = true;
    let observer: ReturnType<typeof observeProAccess> | undefined;
    void import('react-native-purchases').then(({ default: purchases }) => {
      if (alive) observer = observeProAccess(purchases, userId, Platform.OS, status => {
        if (alive) setResult({ session: storeSession, status });
      });
    }).catch(() => { if (alive) setResult({ session: storeSession, status: 'unknown' }); });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void observer?.refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void observer?.refresh();
    }, 60_000);
    return () => { alive = false; observer?.dispose(); subscription.remove(); clearInterval(timer); };
  }, [userId, storeSession]);
  return userId && userId === storeSession?.userId && result?.session === storeSession ? result.status : 'unknown';
}
