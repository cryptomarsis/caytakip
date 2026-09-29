import { normalizeStoreProductId } from '../../shared/storeProducts';

export type ProStatus = 'unknown' | 'free' | 'pro';
type SubscriptionInfo = {
  activeSubscriptions: readonly string[];
  allExpirationDates: Readonly<Record<string, string | null>>;
  requestDate: string;
};

// Consumable credit balances never grant ad-free access. RevenueCat supplies
// active subscriptions, including cancellation until the paid period ends.
export function proStatusFromCustomerInfo(info: SubscriptionInfo, platform: string, now = Date.now()): ProStatus {
  if (!Array.isArray(info?.activeSubscriptions) || !info.allExpirationDates) return 'unknown';
  const products = info.activeSubscriptions.filter(id => normalizeStoreProductId(id, platform) === 'caylik_pro_monthly');
  if (!products.length) return 'free';
  for (const id of products) {
    const expiry = Date.parse(info.allExpirationDates[id] || info.allExpirationDates.caylik_pro_monthly || '');
    if (Number.isFinite(expiry) && expiry > now) return 'pro';
  }
  // A cached active subscription past its expiry isn't proof that renewal failed.
  // Keep advertisements hidden until the SDK supplies an unambiguous status.
  return 'unknown';
}

export type ProCustomerClient = {
  getAppUserID: () => Promise<string>;
  getCustomerInfo: () => Promise<SubscriptionInfo>;
  addCustomerInfoUpdateListener: (listener: () => void) => void;
  removeCustomerInfoUpdateListener: (listener: () => void) => unknown;
};

export function observeProAccess(client: ProCustomerClient, userId: string, platform: string, onStatus: (status: ProStatus) => void) {
  let active = true;
  let pending = false;
  const refresh = async () => {
    if (!active || pending) return;
    pending = true;
    try {
      if (await client.getAppUserID() !== userId) return;
      const info = await client.getCustomerInfo();
      if (active && await client.getAppUserID() === userId && active) {
        onStatus(proStatusFromCustomerInfo(info, platform));
      }
    } catch {
      // Never turn an offline subscriber into an ad-supported user.
      if (active) onStatus('unknown');
    } finally { pending = false; }
  };
  const listener = () => { void refresh(); };
  client.addCustomerInfoUpdateListener(listener);
  void refresh();
  return { refresh, dispose: () => { active = false; client.removeCustomerInfoUpdateListener(listener); } };
}
