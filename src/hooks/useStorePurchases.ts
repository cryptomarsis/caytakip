import { useMemo } from 'react';

import type { AuthFetch } from '../services/aiAssistant';
import type { StoreProductId } from '../services/inAppPurchases';

export const useStorePurchases = (
  _userId: string | undefined,
  _authFetch: AuthFetch,
  _refreshWallet: () => Promise<void>,
) => useMemo(() => ({
  connected: false,
  configured: false,
  prices: {} as Partial<Record<StoreProductId, string>>,
  purchasingProductId: null as StoreProductId | null,
  restoring: false,
  status: 'Satın alma yalnızca iPhone ve iPad uygulamasında kullanılabilir.',
  purchase: async (_productId: StoreProductId) => undefined,
  restore: async () => undefined,
}), []);
