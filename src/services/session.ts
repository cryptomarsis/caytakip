import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { UserSession } from '../types';

export const SESSION_KEY = '@cay_takip_user_session';
// SecureStore, AsyncStorage anahtarındaki "@" karakterini kabul etmez.
// Eski anahtar yalnızca eski AsyncStorage kaydını okuyup taşımak için korunur.
const SECURE_SESSION_KEY = 'cay_takip_user_session_v1';

const parseSession = (raw: string | null): UserSession | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as UserSession; }
  catch { return null; }
};

export const saveSession = async (user: UserSession) => {
  const value = JSON.stringify(user);
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(SESSION_KEY, value);
      return;
    }
    await SecureStore.setItemAsync(SECURE_SESSION_KEY, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    // Önceki sürümde AsyncStorage kullanılan cihazlarda düz metin kopyayı temizle.
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (e) { console.error('Session save error:', e); }
};

export const getSession = async (): Promise<UserSession | null> => {
  try {
    if (Platform.OS === 'web') return parseSession(await AsyncStorage.getItem(SESSION_KEY));

    const secureSession = parseSession(await SecureStore.getItemAsync(SECURE_SESSION_KEY));
    if (secureSession) return secureSession;

    // Eski uygulama sürümünden şifreli depoya bir defalık güvenli geçiş.
    const legacySession = parseSession(await AsyncStorage.getItem(SESSION_KEY));
    if (legacySession) await saveSession(legacySession);
    return legacySession;
  } catch (e) { console.error('Session read error:', e); return null; }
};

export const clearSession = async () => {
  try {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(SECURE_SESSION_KEY);
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (e) { console.error('Session clear error:', e); }
};
