export const HARVEST_INTERSTITIAL_IDS = {
  android: 'ca-app-pub-4870931624363029/6113892832',
  ios: 'ca-app-pub-4870931624363029/2363273527',
};

export type InterstitialAdapter = {
  on: (event: 'loaded' | 'closed' | 'error', callback: () => void) => () => void;
  load: () => void;
  show: () => Promise<unknown>;
};
export const newInterstitialBudget = (now = Date.now()) => ({ startedAt: now, lastShownAt: 0, shown: 0, entries: 0 });
type Budget = ReturnType<typeof newInterstitialBudget>;
const SAFE_ORIGINS = new Set(['dashboard', 'history', 'receivables', 'more', 'prices', 'reports', 'gardens', 'quota']);

// All ad events are scoped to one generation. Loading never triggers showing:
// only a fresh user tap at a natural transition may consume a preloaded ad.
export function createHarvestInterstitial({ createAd, allowed, budget, now = Date.now }: {
  createAd: () => InterstitialAdapter;
  allowed: () => boolean;
  budget: Budget;
  now?: () => number;
}) {
  let disposed = false;
  let ad: InterstitialAdapter | undefined;
  let phase: 'idle' | 'loading' | 'ready' | 'showing' = 'idle';
  let generation = 0;
  let loadedAt = 0;
  let retryAt = 0;
  let startedLoadingAt = 0;
  let listeners: (() => void)[] = [];
  let continuation: (() => void) | undefined;
  const drop = () => {
    generation++;
    listeners.forEach(remove => remove()); listeners = [];
    ad = undefined; phase = 'idle';
  };
  const finish = () => {
    const next = continuation; continuation = undefined;
    drop();
    next?.();
  };
  const preload = () => {
    if (disposed || phase === 'showing') return;
    if (!allowed()) { drop(); return; }
    if ((phase === 'ready' && now() - loadedAt >= 3_300_000) || (phase === 'loading' && now() - startedLoadingAt >= 45_000)) drop();
    if (phase !== 'idle' || now() < retryAt || budget.shown >= 3) return;
    const current = ++generation;
    retryAt = now() + 60_000;
    startedLoadingAt = now(); phase = 'loading';
    try {
      ad = createAd();
      listeners = [
        ad.on('loaded', () => {
          if (disposed || current !== generation) return;
          if (!allowed()) { drop(); return; }
          loadedAt = now(); phase = 'ready';
        }),
        ad.on('closed', () => { if (!disposed && current === generation) finish(); }),
        ad.on('error', () => { if (!disposed && current === generation) finish(); }),
      ];
      ad.load();
    } catch { finish(); }
  };
  return {
    sync: (invalidate = false) => {
      // Privacy can change when the ad itself backgrounds the app. Keep the
      // displayed ad's close handler, but discard any old pending request.
      if (invalidate && phase !== 'showing') drop();
      preload();
    },
    navigate: (from: string, to: string, next: () => void) => {
      if (disposed) { next(); return; }
      if (phase === 'showing') return; // Rapid taps cannot duplicate show or navigation.
      if (to !== 'harvest' || !SAFE_ORIGINS.has(from) || !allowed()) { next(); return; }
      budget.entries++;
      preload();
      const eligible = now() - budget.startedAt >= 60_000 && budget.entries >= 2
        && budget.shown < 3 && (!budget.shown || now() - budget.lastShownAt >= 120_000);
      if (!eligible || phase !== 'ready' || !ad) { next(); return; }
      phase = 'showing'; continuation = next;
      budget.entries = 0; budget.shown++; budget.lastShownAt = now();
      const current = generation;
      try {
        void ad.show().catch(() => { if (!disposed && current === generation) finish(); });
      } catch { finish(); }
    },
    dispose: () => { disposed = true; continuation = undefined; drop(); },
  };
}
