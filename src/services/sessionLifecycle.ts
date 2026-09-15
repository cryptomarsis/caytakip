import type { UserSession } from '../types';

export type SessionScope = { generation: number; credentials: number; user: UserSession | null };

// One account boundary and one persistence queue: an already-running old save must
// finish before logout's clear or the next account's save can touch device storage.
export function createSessionLifecycle(storage: {
  save: (user: UserSession) => Promise<unknown>;
  clear: () => Promise<unknown>;
  changed: (user: UserSession | null) => void;
}) {
  let generation = 0;
  let credentials = 0;
  let user: UserSession | null = null;
  let writes: Promise<unknown> = Promise.resolve();
  let refresh: { generation: number; promise: Promise<UserSession | null> } | null = null;
  const capture = (): SessionScope => ({ generation, credentials, user });
  const isCurrent = (scope: SessionScope, exactCredentials = false) => scope.generation === generation
    && scope.user?.userId === user?.userId && (!exactCredentials || scope.credentials === credentials);
  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    const result = writes.then(task, task);
    writes = result.catch(() => undefined);
    return result;
  };
  const publish = (next: UserSession | null, replacement: boolean) => {
    if (replacement) generation++;
    credentials++;
    user = next;
    storage.changed(next);
    return capture();
  };
  const persist = (scope: SessionScope) => enqueue(async () => {
    if (!isCurrent(scope, true) || !scope.user) return false;
    await storage.save(scope.user);
    return isCurrent(scope, true);
  });
  const replace = (next: UserSession, expected: SessionScope, exactCredentials = false) => {
    if (!isCurrent(expected, exactCredentials)) return Promise.resolve(false);
    return persist(publish(next, true));
  };
  const invalidate = (expected?: SessionScope) => {
    if (expected && !isCurrent(expected)) return Promise.resolve(false);
    publish(null, true);
    // Never skip an already-enqueued clear: a later login queues its save after it.
    return enqueue(async () => { await storage.clear(); return true; });
  };
  const beginAuthentication = () => {
    generation++;
    return capture();
  };
  const restore = (read: () => Promise<UserSession | null>, active: () => boolean) => {
    const expected = capture();
    return enqueue(async () => {
      if (!active() || !isCurrent(expected)) return;
      // getSession may migrate legacy storage; it belongs in this same queue.
      const saved = await read();
      if (!active() || !isCurrent(expected)) return;
      if (saved?.token && saved.refreshToken) publish(saved, true);
      else if (saved) await storage.clear();
    });
  };
  const refreshOnce = (scope: SessionScope, load: (previous: UserSession) => Promise<UserSession | null>) => {
    if (!isCurrent(scope) || !user?.refreshToken) return Promise.resolve(null);
    if (scope.credentials !== credentials) return Promise.resolve(user);
    if (refresh?.generation === generation) return refresh.promise;
    const started = capture();
    const pending = (async () => {
      try {
        const next = await load(started.user!);
        if (!isCurrent(started, true)) return null;
        if (!next || next.userId !== started.user!.userId) { await invalidate(started); return null; }
        const updated = publish(next, false);
        return await persist(updated) ? next : null;
      } catch { return null; }
    })();
    const flight = { generation, promise: pending };
    refresh = flight;
    void pending.finally(() => { if (refresh === flight) refresh = null; });
    return pending;
  };
  return { capture, isCurrent, beginAuthentication, replace, invalidate, restore, refreshOnce };
}
