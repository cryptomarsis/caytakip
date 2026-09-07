import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { Platform } from 'react-native';

const CONSENT_KEY = 'caylik:ad-measurement-consent';
const CONSENT_PROMPT_SEEN_KEY = 'caylik:ad-measurement-consent-prompt-seen';

export type AdTrackingState = 'unsupported' | 'disabled' | 'not-determined' | 'denied' | 'granted';

export async function hasSeenAdTrackingPrompt() {
  return (await AsyncStorage.getItem(CONSENT_PROMPT_SEEN_KEY)) === 'seen';
}

export async function dismissAdTrackingPrompt() {
  await AsyncStorage.setItem(CONSENT_PROMPT_SEEN_KEY, 'seen');
}

function isNativeSdkAvailable() {
  return Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

async function applyMetaConsent(enabled: boolean) {
  if (!isNativeSdkAvailable()) return;

  const { Settings } = await import('react-native-fbsdk-next');
  Settings.initializeSDK();
  Settings.setAdvertiserIDCollectionEnabled(enabled);

  if (Platform.OS === 'ios') {
    await Settings.setAdvertiserTrackingEnabled(enabled);
  }
}

async function applyFirebaseConsent(enabled: boolean) {
  if (!isNativeSdkAvailable()) return;

  const { getAnalytics, setAnalyticsCollectionEnabled } = await import('@react-native-firebase/analytics');
  await setAnalyticsCollectionEnabled(getAnalytics(), enabled);
}

async function applyTikTokConsent(enabled: boolean) {
  // TikTok App Secret mobil pakete gömülemez. TikTok ölçümü, ileride sunucu
  // tarafı Events API üzerinden güvenli biçimde etkinleştirilecektir.
  void enabled;
}

async function applyMeasurementConsent(enabled: boolean) {
  await Promise.all([
    applyMetaConsent(enabled),
    applyFirebaseConsent(enabled),
    applyTikTokConsent(enabled),
  ]);
}

async function trackTikTokStandardEvent(eventName: 'Registration' | 'Purchase') {
  // Gizli anahtar istemciye konmadan sunucu tarafında uygulanacak.
  void eventName;
}

export const trackTikTokRegistration = () => trackTikTokStandardEvent('Registration');
export const trackTikTokPurchase = () => trackTikTokStandardEvent('Purchase');

export async function getAdTrackingState(): Promise<AdTrackingState> {
  if (!isNativeSdkAvailable()) return 'unsupported';

  const savedConsent = await AsyncStorage.getItem(CONSENT_KEY);
  if (Platform.OS !== 'ios') return savedConsent === 'granted' ? 'granted' : 'disabled';

  const permission = await getTrackingPermissionsAsync();
  if (permission.status === 'denied') return 'denied';
  if (permission.status === 'undetermined') return 'not-determined';
  return permission.granted && savedConsent === 'granted' ? 'granted' : 'disabled';
}

export async function initializeAdTracking() {
  if (!isNativeSdkAvailable()) return 'unsupported' as const;

  const state = await getAdTrackingState();
  await applyMeasurementConsent(state === 'granted');
  return state;
}

export async function requestAdTrackingConsent(): Promise<AdTrackingState> {
  if (!isNativeSdkAvailable()) return 'unsupported';

  if (Platform.OS === 'ios') {
    const permission = await requestTrackingPermissionsAsync();
    if (!permission.granted) {
      await AsyncStorage.multiSet([[CONSENT_KEY, 'disabled'], [CONSENT_PROMPT_SEEN_KEY, 'seen']]);
      await applyMeasurementConsent(false);
      return permission.status === 'denied' ? 'denied' : 'disabled';
    }
  }

  await AsyncStorage.multiSet([[CONSENT_KEY, 'granted'], [CONSENT_PROMPT_SEEN_KEY, 'seen']]);
  await applyMeasurementConsent(true);
  return 'granted';
}

export async function disableAdTracking(): Promise<AdTrackingState> {
  await AsyncStorage.multiSet([[CONSENT_KEY, 'disabled'], [CONSENT_PROMPT_SEEN_KEY, 'seen']]);
  await applyMeasurementConsent(false);
  return 'disabled';
}
