import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { HarvestRecord } from '../types';
import { formatTL, remainingTotalOf } from '../utils/format';

const STORAGE_PREFIX = '@caylik_due_notifications_v1:';

type StoredNotification = {
  notificationId: string;
  signature: string;
};

type StoredNotifications = Record<string, StoredNotification>;

const notificationKey = (userId: string) => STORAGE_PREFIX + userId;
const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';

const readStored = async (userId: string): Promise<StoredNotifications> => {
  try {
    const raw = await AsyncStorage.getItem(notificationKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const setupNotifications = async () => {
  if (isExpoGo && Platform.OS === 'android') return false;
  try {
    if (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient') return false;
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const current = await Notifications.getPermissionsAsync();
    const finalStatus = current.status === 'granted'
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
    if (finalStatus !== 'granted') return false;

    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('cay-takip', {
        name: 'Çay Takip Bildirimleri',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
      });
    }
    return true;
  } catch {
    return false;
  }
};

export const syncDueNotifications = async (userId: string, harvests: HarvestRecord[]) => {
  if (isExpoGo && Platform.OS === 'android') return;
  if (!userId || (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient')) return;

  try {
    const Notifications = await import('expo-notifications');
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return;

    const existing = await readStored(userId);
    const desired: Record<string, { signature: string; reminder: Date; harvest: HarvestRecord; title: string; body: string }> = {};
    const now = Date.now();

    for (const harvest of harvests) {
      if (!harvest._id || !harvest.isVadeli || !harvest.vadeTarihi) continue;
      const match = String(harvest.vadeTarihi).match(/^(\d{4})[-.](\d{1,2})(?:[-.](\d{1,2}))?/);
      if (!match) continue;

      const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1), 9, 0, 0);
      const remaining = remainingTotalOf(harvest);
      if (remaining <= 0.01) continue;

      const company = harvest.firma || 'Fabrika';
      const signatureBase = [company, harvest.vadeTarihi, harvest.tahsilat || 0, harvest.toplamTutar || 0, remaining].join('|');
      const reminders = [
        {
          key: 'two-days',
          date: new Date(due.getTime() - 2 * 24 * 60 * 60 * 1000),
          title: 'Çaylık Asistan · Vade yaklaşıyor',
          body: `${company} ödemesine 2 gün kaldı. Bekleyen tutar: ${formatTL(remaining)}.`,
        },
        {
          key: 'due-day',
          date: due,
          title: 'Çaylık Asistan · Ödeme günü',
          body: `${company} için ${formatTL(remaining)} tutarındaki alacağınızın vadesi bugün.`,
        },
        {
          key: 'overdue',
          date: new Date(due.getTime() + 24 * 60 * 60 * 1000),
          title: 'Çaylık Asistan · Geciken alacak',
          body: `${company} için ${formatTL(remaining)} tutarındaki ödeme gecikmiş görünüyor. Tahsilat durumunu kontrol edin.`,
        },
      ];

      for (const item of reminders) {
        if (item.date.getTime() <= now) continue;
        const desiredKey = `${harvest._id}:${item.key}`;
        desired[desiredKey] = {
          signature: `${signatureBase}|${item.key}`,
          reminder: item.date,
          harvest,
          title: item.title,
          body: item.body,
        };
      }
    }

    const next: StoredNotifications = {};
    for (const [notificationKey, stored] of Object.entries(existing)) {
      const target = desired[notificationKey];
      if (!target || target.signature !== stored.signature) {
        await Notifications.cancelScheduledNotificationAsync(stored.notificationId).catch(() => undefined);
      } else {
        next[notificationKey] = stored;
      }
    }

    for (const [notificationKey, target] of Object.entries(desired)) {
      if (next[notificationKey]) continue;
      const harvestId = target.harvest._id as string;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: target.title,
          body: target.body,
          data: { type: 'vade', harvestId },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: target.reminder,
          ...(Platform.OS === 'android' ? { channelId: 'cay-takip' } : {}),
        },
      });
      next[notificationKey] = { notificationId, signature: target.signature };
    }

    await AsyncStorage.setItem(notificationKey(userId), JSON.stringify(next));
  } catch (error) {
    console.log('Vade bildirimleri güncellenemedi:', error);
  }
};

export const clearDueNotifications = async (userId: string) => {
  if (!userId) return;
  if (isExpoGo && Platform.OS === 'android') {
    await AsyncStorage.removeItem(notificationKey(userId));
    return;
  }
  try {
    const Notifications = await import('expo-notifications');
    const stored = await readStored(userId);
    await Promise.all(Object.values(stored).map((item) =>
      Notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)
    ));
  } finally {
    await AsyncStorage.removeItem(notificationKey(userId));
  }
};
