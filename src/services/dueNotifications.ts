import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { HarvestRecord } from '../types';
import { formatDisplayDate } from '../utils/format';

const STORAGE_PREFIX = '@caylik_due_notifications_v1:';

type StoredNotification = {
  notificationId: string;
  signature: string;
};

type StoredNotifications = Record<string, StoredNotification>;

const notificationKey = (userId: string) => STORAGE_PREFIX + userId;

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
  try {
    if (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient') return false;
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
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
  if (!userId || (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient')) return;

  try {
    const Notifications = require('expo-notifications');
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return;

    const existing = await readStored(userId);
    const desired: Record<string, { signature: string; reminder: Date; harvest: HarvestRecord }> = {};
    const now = Date.now();

    for (const harvest of harvests) {
      if (!harvest._id || !harvest.isVadeli || !harvest.vadeTarihi) continue;
      const match = String(harvest.vadeTarihi).match(/^(\d{4})[-.](\d{1,2})(?:[-.](\d{1,2}))?/);
      if (!match) continue;

      const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1), 9, 0, 0);
      const reminder = new Date(due.getTime() - 24 * 60 * 60 * 1000);
      if (reminder.getTime() <= now) continue;

      const signature = [harvest.firma || '', harvest.vadeTarihi, harvest.tahsilat || 0, harvest.toplamTutar || 0].join('|');
      desired[harvest._id] = { signature, reminder, harvest };
    }

    const next: StoredNotifications = {};
    for (const [harvestId, stored] of Object.entries(existing)) {
      const target = desired[harvestId];
      if (!target || target.signature !== stored.signature) {
        await Notifications.cancelScheduledNotificationAsync(stored.notificationId).catch(() => undefined);
      } else {
        next[harvestId] = stored;
      }
    }

    for (const [harvestId, target] of Object.entries(desired)) {
      if (next[harvestId]) continue;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Çaylık - Vade Yaklaşıyor',
          body: (target.harvest.firma || 'Fabrika') + ' ödemesinin vadesi ' + formatDisplayDate(target.harvest.vadeTarihi) + '.',
          data: { type: 'vade', harvestId },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: target.reminder,
          ...(Platform.OS === 'android' ? { channelId: 'cay-takip' } : {}),
        },
      });
      next[harvestId] = { notificationId, signature: target.signature };
    }

    await AsyncStorage.setItem(notificationKey(userId), JSON.stringify(next));
  } catch (error) {
    console.log('Vade bildirimleri güncellenemedi:', error);
  }
};

export const clearDueNotifications = async (userId: string) => {
  if (!userId) return;
  try {
    const Notifications = require('expo-notifications');
    const stored = await readStored(userId);
    await Promise.all(Object.values(stored).map((item) =>
      Notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)
    ));
  } finally {
    await AsyncStorage.removeItem(notificationKey(userId));
  }
};