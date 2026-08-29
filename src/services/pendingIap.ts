import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@caylik:pending-apple-iap:';

export type PendingApplePurchase = {
  transactionId: string;
  productId: string;
  environment?: string;
  attempts: number;
  updatedAt: string;
};

const keyFor = (userId: string) => `${STORAGE_PREFIX}${userId}`;

export const readPendingApplePurchases = async (userId: string): Promise<PendingApplePurchase[]> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.transactionId && item?.productId) : [];
  } catch {
    return [];
  }
};

export const rememberPendingApplePurchase = async (
  userId: string,
  purchase: Omit<PendingApplePurchase, 'attempts' | 'updatedAt'>,
) => {
  const current = await readPendingApplePurchases(userId);
  const previous = current.find((item) => item.transactionId === purchase.transactionId);
  const next: PendingApplePurchase = {
    ...purchase,
    attempts: Number(previous?.attempts || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(
    keyFor(userId),
    JSON.stringify([...current.filter((item) => item.transactionId !== purchase.transactionId), next].slice(-25)),
  );
};

export const forgetPendingApplePurchase = async (userId: string, transactionId: string) => {
  const current = await readPendingApplePurchases(userId);
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(current.filter((item) => item.transactionId !== transactionId)));
};
