import AsyncStorage from '@react-native-async-storage/async-storage';
const key = (userId: string) => `@caylik_pending_ad_reward:${userId}`;
let tail: Promise<unknown> = Promise.resolve();
const serialize = <T,>(run: () => Promise<T>): Promise<T> => {
  const next = tail.then(run, run); tail = next.catch(() => undefined); return next;
};
async function read(userId: string) {
  const nonce = await AsyncStorage.getItem(key(userId));
  if (nonce && !/^[a-f0-9]{48}$/.test(nonce)) throw new Error('Bekleyen reklam ödülü okunamadı. Destek alın.');
  return nonce;
}
export const readPendingAdReward = (userId: string) => serialize(() => read(userId));
export const savePendingAdReward = (userId: string, nonce: string) => serialize(() => AsyncStorage.setItem(key(userId), nonce));
export const clearPendingAdReward = (userId: string, nonce: string) => serialize(async () => {
  if (await read(userId) === nonce) await AsyncStorage.removeItem(key(userId));
});
