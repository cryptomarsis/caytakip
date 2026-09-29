import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { defaultSeasonReminderSettings, seasonReminderDates, validateSeasonReminderSettings, type DailyReminderSettings } from '../../shared/seasonReminders';
import { isNotificationOwner, MAX_PENDING_LOCAL_NOTIFICATIONS, serializeNotifications } from './notificationQueue';
import { loadSeasonReminderPolicy, parseSeasonPolicy, type SeasonPolicyRequest } from './seasonReminderPolicy';
import { SEASON_NOTIFICATION } from '../../shared/notificationMessages';
import { getSoundPreferences } from './soundPreferences';

export { SEASON_REMINDER_WINDOW_DAYS } from '../../shared/seasonReminders';
export type { DailyReminderSettings } from '../../shared/seasonReminders';
const key = (userId: string) => `@caylik_season_optin_v1:${userId}`;
const policyKey = (userId: string) => `@caylik_season_policy_v1:${userId}`;
const legacyId = 'caylik-daily-reminder-v1';
const prefix = 'caylik-season-reminder-v2:';
export const dailyReminderSupported = Platform.OS !== 'web' && Constants.executionEnvironment !== 'storeClient' && Constants.appOwnership !== 'expo';
type Notifications = typeof import('expo-notifications');
export type DailyReminderResult = { settings: DailyReminderSettings; scheduledCount: number; permissionGranted: boolean; capacityLimited: boolean };
const isOurs = (id: string) => id === legacyId || id.startsWith(prefix);
// Only an absent preference defaults on. Saved opt-outs and invalid values stay off.
const acceptsSeasonReminders = (value: string | null) => value === null || value === 'true';

export const getDailyReminderSettings = async (userId: string): Promise<DailyReminderSettings> => {
  if (!userId) return defaultSeasonReminderSettings();
  const [raw, consent] = await Promise.all([AsyncStorage.getItem(policyKey(userId)), AsyncStorage.getItem(key(userId))]);
  // A default-on preference never substitutes for a valid admin plan or OS permission.
  if (!raw || !acceptsSeasonReminders(consent)) return defaultSeasonReminderSettings();
  try {
    const cached = JSON.parse(raw);
    if (!Number.isFinite(cached.fetchedAt) || cached.fetchedAt > Date.now()) return defaultSeasonReminderSettings();
    const settings = parseSeasonPolicy(cached.policy).settings;
    // Do not keep extending stale server policy while offline. This lease also bounds cancellation delay.
    const end = new Date(cached.fetchedAt);
    end.setDate(end.getDate() + 13);
    const leaseEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return validateSeasonReminderSettings({ ...settings, seasonEnd: settings.seasonEnd && settings.seasonEnd < leaseEnd ? settings.seasonEnd : leaseEnd }, new Date(), true);
  }
  catch { return defaultSeasonReminderSettings(); }
};

export const getSeasonReminderOptIn = async (userId: string) => !!userId && acceptsSeasonReminders(await AsyncStorage.getItem(key(userId)));

export async function refreshDailyReminderPolicy(userId: string, token: string, request?: SeasonPolicyRequest) {
  if (!isNotificationOwner(userId)) return;
  const policy = await loadSeasonReminderPolicy(token, request);
  return serializeNotifications(async () => {
    if (!isNotificationOwner(userId)) return;
    const existing = await AsyncStorage.getItem(policyKey(userId));
    let revision = -1;
    try { revision = JSON.parse(existing || 'null')?.policy?.revision ?? -1; } catch { /* replace invalid cache */ }
    if (policy.revision < revision) return;
    await AsyncStorage.setItem(policyKey(userId), JSON.stringify({ policy, fetchedAt: Date.now() }));
    return syncSeasonReminderInQueue(userId);
  });
}

async function cancelOwned(Notifications: Notifications) {
  await Notifications.cancelScheduledNotificationAsync(legacyId);
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of requests) {
    if (request.identifier.startsWith(prefix)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
}

// Internal unlocked helpers: callers must already hold serializeNotifications.
export const clearSeasonReminderInQueue = async () => {
  if (!dailyReminderSupported) return;
  await cancelOwned(await import('expo-notifications'));
};

async function applyReminder(userId: string, settings: DailyReminderSettings, requestPermission: boolean): Promise<DailyReminderResult> {
  const result: DailyReminderResult = { settings, scheduledCount: 0, permissionGranted: false, capacityLimited: false };
  if (!dailyReminderSupported || !isNotificationOwner(userId)) return result;
  const Notifications = await import('expo-notifications');
  // Remove the legacy indefinite repeating request even when dates are not yet configured.
  await Notifications.cancelScheduledNotificationAsync(legacyId);
  if (!settings.enabled) { await cancelOwned(Notifications); return result; }
  const audible = (await getSoundPreferences(userId)).season;
  const channelId = audible ? 'caylik-season-sound-v1' : 'caylik-season-silent-v1';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Sezon hatırlatması', importance: Notifications.AndroidImportance.DEFAULT,
      // Omitted sound uses Android's system sound; null explicitly keeps a channel silent.
      ...(audible ? {} : { sound: null }), enableVibrate: audible,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  result.permissionGranted = permission.granted;
  if (!permission.granted || !isNotificationOwner(userId)) { await cancelOwned(Notifications); return result; }

  const requests = await Notifications.getAllScheduledNotificationsAsync();
  const dates = seasonReminderDates(settings);
  // Leave room for transactional alerts; never cancel another notification family.
  const availableSlots = Math.max(0, MAX_PENDING_LOCAL_NOTIFICATIONS - requests.filter(item => !isOurs(item.identifier)).length);
  result.capacityLimited = dates.length > availableSlots;
  const selected = dates.slice(0, availableSlots);
  const signature = JSON.stringify([userId, settings.seasonStart, settings.seasonEnd, settings.hour, settings.minute, channelId]);
  const wanted = new Map(selected.map(date => [`${prefix}${date.getTime()}`, date]));
  const retained = new Set<string>();
  for (const request of requests) {
    if (!isOurs(request.identifier)) continue;
    if (wanted.has(request.identifier) && request.content.data?.seasonSignature === signature) retained.add(request.identifier);
    else await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  try {
    for (const [identifier, date] of wanted) {
      if (!isNotificationOwner(userId)) { await cancelOwned(Notifications); return { ...result, scheduledCount: 0 }; }
      if (retained.has(identifier)) continue;
      // Each trigger has an absolute end. No background JS is needed to stop at season end.
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          ...SEASON_NOTIFICATION,
          data: { type: 'daily-reminder', owner: userId, seasonSignature: signature },
          sound: audible ? 'default' : false,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date,
          ...(Platform.OS === 'android' ? { channelId } : {}) },
      });
    }
  } catch (error) {
    // No partial/stale plan after a failed save. A later foreground sync may retry.
    await cancelOwned(Notifications);
    throw error;
  }
  result.scheduledCount = selected.length;
  return result;
}

export const syncSeasonReminderInQueue = async (userId: string) => {
  if (!isNotificationOwner(userId)) return;
  try {
    const settings = await getDailyReminderSettings(userId);
    return await applyReminder(userId, settings, false);
  } catch (error) {
    // Storage failure must not leave v1's endless reminder or a previous owner's plan alive.
    await clearSeasonReminderInQueue();
    throw error;
  }
};
export const syncDailyReminder = (userId: string) => serializeNotifications(() => syncSeasonReminderInQueue(userId));

export const saveSeasonReminderOptIn = (userId: string, enabled: boolean) => serializeNotifications(async (): Promise<DailyReminderResult> => {
  if (!isNotificationOwner(userId)) throw Error('Hatırlatmayı kaydetmek için hesabınıza giriş yapın.');
  if (!dailyReminderSupported) throw Error('Hatırlatmaları kurulu iOS veya Android uygulamasından ayarlayın.');
  if (typeof enabled !== 'boolean') throw Error('Hatırlatma tercihini kontrol edin.');
  // Persist opt-out before native cancellation. Failed configuration must not auto-enable.
  await AsyncStorage.setItem(key(userId), 'false');
  const Notifications = await import('expo-notifications');
  await cancelOwned(Notifications);
  try {
    // Opting in never grants a user control of dates/time or edits the server policy.
    if (enabled) {
      let permission = await Notifications.getPermissionsAsync();
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('caylik-daily', { name: 'Sezon hatırlatması', importance: Notifications.AndroidImportance.DEFAULT });
      if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return { settings: defaultSeasonReminderSettings(), scheduledCount: 0, permissionGranted: false, capacityLimited: false };
    }
    if (!isNotificationOwner(userId)) throw Error('Oturum değişti. Hatırlatma kaydedilmedi.');
    await AsyncStorage.setItem(key(userId), String(enabled));
    const next = await getDailyReminderSettings(userId);
    const result = await applyReminder(userId, next, false);
    if (!isNotificationOwner(userId)) throw Error('Oturum değişti. Hatırlatma kaydedilmedi.');
    return { ...result, permissionGranted: enabled || result.permissionGranted };
  } catch (error) {
    await AsyncStorage.setItem(key(userId), 'false');
    await cancelOwned(Notifications);
    throw error;
  }
});

export const cancelDailyReminder = () => serializeNotifications(clearSeasonReminderInQueue);
