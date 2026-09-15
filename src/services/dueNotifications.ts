import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { HarvestRecord } from '../types';
import { formatTL, remainingTotalOf } from '../utils/format';
import { dueSoundConfig, getSoundPreferences } from './soundPreferences';
import { isNotificationOwner, MAX_PENDING_LOCAL_NOTIFICATIONS, serializeNotifications } from './notificationQueue';
import { clearSeasonReminderInQueue, syncSeasonReminderInQueue } from './dailyReminder';
import { DUE_NOTIFICATION_RULES } from '../../shared/notificationMessages';

const STORAGE_PREFIX = '@caylik_due_notifications_v1:';

type StoredNotification = {
  notificationId: string;
  signature: string;
};

type StoredNotifications = Record<string, StoredNotification>;

const storageKey = (userId: string) => STORAGE_PREFIX + userId;
const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';

const readStored = async (userId: string): Promise<StoredNotifications> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const setupNotifications = async () => {
  if (isExpoGo || Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient') return false;
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: Boolean(notification.request.content.sound),
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('cay-takip', {
        name: 'Çay Takip Bildirimleri',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const finalStatus = current.status === 'granted'
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
    if (finalStatus !== 'granted') return false;
    return true;
  } catch {
    return false;
  }
};

const syncDueNotificationsNow = async (userId: string, harvests: HarvestRecord[], throwOnError = false) => {
  if (isExpoGo || Platform.OS === 'web') return;
  if (!userId || (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient')) return;
  if (!isNotificationOwner(userId)) return;

  try {
    const Notifications = await import('expo-notifications');
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted' || !isNotificationOwner(userId)) return;
    // Transactional due reminders take priority. Seasonal slots are refilled after this batch.
    await clearSeasonReminderInQueue();

    const prefs = await getSoundPreferences(userId);
    const sound = dueSoundConfig(prefs.due);
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(sound.channelId, {
        name: prefs.due ? 'Vadeler · Sesli' : 'Vadeler · Sessiz',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: prefs.due ? 'due_reminder.wav' : null,
        enableVibrate: prefs.due,
      });
    }

    const existing = await readStored(userId);
    const desired: Record<string, { signature: string; reminder: Date; harvest: HarvestRecord; title: string; body: string }> = {};
    const now = Date.now();

    // Engagement reminders now use the separately opted-in daily reminder.
    // Old engagement entries are cancelled by the reconciliation below.
    for (const harvest of harvests) {
      if (!harvest._id || !harvest.isVadeli || !harvest.vadeTarihi) continue;
      const match = String(harvest.vadeTarihi).match(/^(\d{4})[-.](\d{1,2})(?:[-.](\d{1,2}))?/);
      if (!match) continue;

      const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1), 9, 0, 0);
      const remaining = remainingTotalOf(harvest);
      if (remaining <= 0.01) continue;

      const company = harvest.firma || 'Fabrika';
      const signatureBase = [company, harvest.vadeTarihi, harvest.tahsilat || 0, harvest.toplamTutar || 0, remaining, sound.signature].join('|');
      const reminders = DUE_NOTIFICATION_RULES.map(rule => ({
        key: rule.key, date: new Date(due.getFullYear(), due.getMonth(), due.getDate() + rule.days, 9),
        title: rule.title, body: rule.body.replace('{firma}', () => company).replace('{tutar}', () => formatTL(remaining)),
      }));

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

    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const pendingIds = new Set(pending.map(item => item.identifier));
    const existingIds = new Set(Object.values(existing).map(item => item.notificationId));
    const otherCount = pending.filter(item => !existingIds.has(item.identifier)).length;
    const capacity = Math.max(0, MAX_PENDING_LOCAL_NOTIFICATIONS - otherCount);
    const nearest = new Set(Object.entries(desired).sort((left, right) => left[1].reminder.getTime() - right[1].reminder.getTime()).slice(0, capacity).map(([key]) => key));
    for (const key of Object.keys(desired)) if (!nearest.has(key)) delete desired[key];

    const next: StoredNotifications = {};
    for (const [notificationKey, stored] of Object.entries(existing)) {
      const target = desired[notificationKey];
      if (!target || target.signature !== stored.signature || !pendingIds.has(stored.notificationId)) {
        await Notifications.cancelScheduledNotificationAsync(stored.notificationId);
      } else {
        next[notificationKey] = stored;
      }
    }

    for (const [notificationKey, target] of Object.entries(desired)) {
      if (!isNotificationOwner(userId)) return;
      if (next[notificationKey]) continue;
      const harvestId = target.harvest._id as string;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: target.title,
          body: target.body,
          data: { type: notificationKey.startsWith('engagement:') ? notificationKey.split(':')[1] : 'vade', harvestId, owner: userId },
          sound: sound.sound,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: target.reminder,
          ...(Platform.OS === 'android' ? { channelId: sound.channelId } : {}),
        },
      });
      next[notificationKey] = { notificationId, signature: target.signature };
      // Persist each scheduled item: a later native error must not orphan earlier ones.
      try {
        await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch (error) {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        delete next[notificationKey];
        throw error;
      }
    }

    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch (error) {
    if (throwOnError) throw error;
    console.log('Vade bildirimleri güncellenemedi:', error);
  }
};

const clearDueNotificationsNow = async (userId: string) => {
  if (!userId) return;
  if (isExpoGo || Platform.OS === 'web') {
    await AsyncStorage.removeItem(storageKey(userId));
    return;
  }
  const Notifications = await import('expo-notifications');
  const stored = await readStored(userId);
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const ids = new Set([
    ...Object.values(stored).map(item => item.notificationId),
    ...pending.filter(item => item.content.data?.type === 'vade' && item.content.data?.owner === userId).map(item => item.identifier),
  ]);
  const results = await Promise.allSettled([...ids].map(id => Notifications.cancelScheduledNotificationAsync(id)));
  if (results.some(result => result.status === 'rejected')) {
    // Keep the ledger for a later retry instead of orphaning a failed cancellation.
    throw Error('Vade bildirimleri tamamen kapatılamadı. Telefon ayarlarından bildirimleri kapatabilirsiniz.');
  }
  await AsyncStorage.removeItem(storageKey(userId));
};

export const syncDueNotifications = (userId: string, harvests: HarvestRecord[], throwOnError = false) => serializeNotifications(async () => {
  try { await syncDueNotificationsNow(userId, harvests, throwOnError); }
  finally {
    if (isNotificationOwner(userId)) await syncSeasonReminderInQueue(userId).catch(() => {
      console.warn('Sezon hatırlatmaları yeniden planlanamadı.');
    });
  }
});
export const clearDueNotifications = (userId: string) => serializeNotifications(() => clearDueNotificationsNow(userId));
