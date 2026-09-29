import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import type { UserSession } from '../types';
import type { AuthFetch } from '../services/aiAssistant';
import { shareRequest } from '../services/sharecropping';

const supported = Constants.executionEnvironment !== 'storeClient' && Constants.appOwnership !== 'expo';
export function useSharecroppingPush(user: UserSession | null, authFetch: AuthFetch, onOpen: () => void) {
  const current = useRef({ user, authFetch, onOpen });
  useLayoutEffect(() => { current.current = { user, authFetch, onOpen }; });
  const register = useCallback(async (requestPermission = false) => {
    const snapshot = current.current;
    if (!snapshot.user || !supported) return 'Telefon bildirimleri için Expo Go yerine mağaza veya development build kullanın.';
    const Notifications = await import('expo-notifications');
    // Android channel sound strings name bundled files. Omit sound for the system default.
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('sharecropping', { name: 'Pay Takibi', importance: Notifications.AndroidImportance.DEFAULT });
    let permission = await Notifications.getPermissionsAsync();
    if (requestPermission && !permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 'Bildirim izni kapalı. Telefon ayarlarından izin verebilirsiniz; ortak kayıtlar uygulamada görünmeye devam eder.';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw Error('Bildirim proje ayarı eksik.');
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (current.current.user !== snapshot.user) return 'Oturum değişti; tekrar deneyin.';
    const result = await shareRequest<{ pushEnabled: boolean }>(snapshot.authFetch, '/sharecropping-push/device', 'POST', { token, refreshToken: snapshot.user.refreshToken });
    return result.pushEnabled ? 'Pay Takibi bildirimleri için telefonunuz kaydedildi.' : 'Telefonunuz kaydedildi. Sunucuda uzaktan bildirimlerin etkinleştirilmesi bekleniyor.';
  }, []);
  useEffect(() => {
    if (!user || !supported) return;
    let alive = true;
    let remove: (() => void) | undefined;
    const open = (data: Record<string, unknown>) => {
      if (alive && data.type === 'sharecropping' && data.owner === current.current.user?.userId) current.current.onOpen();
    };
    void import('expo-notifications').then(async Notifications => {
      if (!alive) return;
      const listener = Notifications.addNotificationResponseReceivedListener(response => open(response.notification.request.content.data || {}));
      remove = () => listener.remove();
      const previous = await Notifications.getLastNotificationResponseAsync();
      if (alive && previous?.notification.request.content.data?.type === 'sharecropping') {
        open(previous.notification.request.content.data || {});
        await Notifications.clearLastNotificationResponseAsync();
      }
    }).catch(() => undefined);
    void register().catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void register().catch(() => undefined); });
    return () => { alive = false; remove?.(); subscription.remove(); };
  }, [user, register]);
  return { enable: () => register(true) };
}
