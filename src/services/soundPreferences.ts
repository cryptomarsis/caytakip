import AsyncStorage from '@react-native-async-storage/async-storage';

export type SoundPreferences = { harvest: boolean; payment: boolean; due: boolean; season: boolean };
const defaults: SoundPreferences = { harvest: true, payment: true, due: true, season: true };
const key = (userId: string) => `@caylik_sounds_v1:${userId}`;
export const getSoundPreferences = async (userId: string): Promise<SoundPreferences> => {
  if (!userId) return { harvest: false, payment: false, due: false, season: false };
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => [name, typeof parsed?.[name] === 'boolean' ? parsed[name] : fallback])) as SoundPreferences;
  } catch { return { harvest: false, payment: false, due: false, season: false }; }
};
export const saveSoundPreferences = async (userId: string, prefs: SoundPreferences) => {
  if (!userId) throw Error('Oturum bulunamadı.');
  await AsyncStorage.setItem(key(userId), JSON.stringify({ harvest: !!prefs.harvest, payment: !!prefs.payment, due: !!prefs.due, season: !!prefs.season }));
};

// New IDs are required: Android doesn't allow an existing channel's sound to change.
export const dueSoundConfig = (enabled: boolean) => ({
  sound: enabled ? 'due_reminder.wav' : false,
  channelId: enabled ? 'caylik-due-sound-v1' : 'caylik-due-silent-v1',
  signature: enabled ? 'due-sound-v1' : 'due-silent-v1',
} as const);
