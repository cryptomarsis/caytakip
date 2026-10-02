import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AuthFetch } from '../services/aiAssistant';
import { shareRequest } from '../services/sharecropping';

export function useShareEvents(userId: string | undefined, authFetch: AuthFetch) {
  const current = useRef({ userId, authFetch });
  useLayoutEffect(() => { current.current = { userId, authFetch }; }, [userId, authFetch]);
  const [state, setState] = useState({ userId: '', unread: 0 });
  const generation = useRef({ version: 0 });
  const refresh = useCallback(async () => {
    const scope = current.current;
    if (!scope.userId) return;
    const version = ++generation.current.version;
    try {
      const result = await shareRequest<{ unread?: number }>(scope.authFetch, '/sharecropping-events');
      if (current.current.userId === scope.userId && version === generation.current.version && Number.isSafeInteger(result.unread) && result.unread! >= 0) setState({ userId: scope.userId, unread: result.unread! });
    } catch { /* A failed count request must not erase an existing badge. */ }
  }, []);
  useEffect(() => {
    if (!userId) return;
    const guard = generation.current;
    void refresh();
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60000);
    return () => { guard.version++; listener.remove(); clearInterval(timer); };
  }, [userId, refresh]);
  return { unread: state.userId === userId ? state.unread : 0, refresh };
}
