export function normalizeStoreProductId(identifier: unknown, platform: string):
  'caylik_credits_250' | 'caylik_credits_750' | 'caylik_credits_2000' | 'caylik_pro_monthly' | null;
export function findStorePackage<T extends { identifier: string; product: { identifier: string } }>(
  packages: readonly T[], productId: string, platform: string,
): T | undefined;
