import AsyncStorage from '@react-native-async-storage/async-storage';
let work: Promise<unknown> = Promise.resolve();
const serialize = <T,>(action: () => Promise<T>): Promise<T> => {
  const next = work.then(action, action); work = next.catch(() => undefined); return next;
};
const key = (userId: string) => `@caylik_pending_purchase:${userId}`;
export const readPendingPurchase = (userId: string) => serialize(() => AsyncStorage.getItem(key(userId)));
export const savePendingPurchase = (userId: string, id: string) => serialize(() => AsyncStorage.setItem(key(userId), id));
export const clearPendingPurchase = (userId: string, id: string) => serialize(async () => {
  if (await AsyncStorage.getItem(key(userId)) === id) await AsyncStorage.removeItem(key(userId));
});
