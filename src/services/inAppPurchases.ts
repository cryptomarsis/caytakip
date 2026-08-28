import type { AuthFetch } from './aiAssistant';

export const IAP_PRODUCT_IDS = [
  'caylik_credits_250',
  'caylik_credits_750',
  'caylik_credits_2000',
] as const;

export const IAP_SUBSCRIPTION_IDS = ['caylik_pro_monthly'] as const;
export const ALL_IAP_PRODUCT_IDS = [...IAP_PRODUCT_IDS, ...IAP_SUBSCRIPTION_IDS] as const;
export type StoreProductId = (typeof ALL_IAP_PRODUCT_IDS)[number];

export const isStoreProductId = (value: string): value is StoreProductId =>
  (ALL_IAP_PRODUCT_IDS as readonly string[]).includes(value);

export type IapConfig = {
  configured: boolean;
  appAccountToken: string;
  productIds: string[];
};

export type IapVerification = {
  verified: boolean;
  replayed: boolean;
  creditsGranted: number;
  credits: number;
};

const readJson = async (response: Response) => response.json().catch(() => ({}));

export const fetchIapConfig = async (authFetch: AuthFetch, apiUrl: string): Promise<IapConfig> => {
  const response = await authFetch(`${apiUrl}/iap/config`);
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || 'Mağaza yapılandırması alınamadı.');
  return {
    configured: Boolean(data?.configured),
    appAccountToken: String(data?.appAccountToken || ''),
    productIds: Array.isArray(data?.productIds) ? data.productIds.map(String) : [],
  };
};

export const verifyApplePurchase = async (
  authFetch: AuthFetch,
  apiUrl: string,
  transactionId: string,
  productId: StoreProductId,
): Promise<IapVerification> => {
  const response = await authFetch(`${apiUrl}/iap/apple/verify`, {
    method: 'POST',
    body: JSON.stringify({ transactionId, productId }),
  }, 45000);
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || 'Satın alma doğrulanamadı.');
  return {
    verified: Boolean(data?.verified),
    replayed: Boolean(data?.replayed),
    creditsGranted: Number(data?.creditsGranted || 0),
    credits: Number(data?.credits || 0),
  };
};
