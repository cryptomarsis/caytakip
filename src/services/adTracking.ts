import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AppState, Platform } from 'react-native';

const CONSENT_KEY = 'caylik:ad-measurement-consent';
const CONSENT_PROMPT_SEEN_KEY = 'caylik:ad-measurement-consent-prompt-seen';
const consentListeners = new Set<() => void>();

export function subscribeAdTrackingChanges(listener: () => void) {
  consentListeners.add(listener);
  return () => { consentListeners.delete(listener); };
}

function notifyConsentChanged() { consentListeners.forEach(listener => listener()); }

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
  Settings.setAutoLogAppEventsEnabled(enabled);
  Settings.setAdvertiserIDCollectionEnabled(enabled);

  if (Platform.OS === 'ios') {
    await Settings.setAdvertiserTrackingEnabled(enabled);
  }
  if (enabled) Settings.initializeSDK();
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

  const { getTrackingPermissionsAsync } = await import('expo-tracking-transparency');
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

let consentRequest: Promise<AdTrackingState> | null = null;

export function requestAdTrackingConsent(): Promise<AdTrackingState> {
  if (!consentRequest) consentRequest = requestConsent().then(state => {
    // An unanswered native prompt is not a consent change. Emitting here would
    // re-enter the startup request indefinitely while iOS remains undetermined.
    if (state !== 'not-determined' && state !== 'unsupported') notifyConsentChanged();
    return state;
  }).finally(() => { consentRequest = null; });
  return consentRequest;
}

async function requestConsent(): Promise<AdTrackingState> {
  if (!isNativeSdkAvailable()) return 'unsupported';

  if (Platform.OS === 'ios') {
    // ATT cannot present while inactive (for example another OS permission dialog).
    if (AppState.currentState !== 'active') await new Promise<void>(resolve => {
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') { subscription.remove(); resolve(); }
      });
    });
    const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
    const currentPermission = await getTrackingPermissionsAsync();
    const permission = currentPermission.status === 'undetermined' && currentPermission.canAskAgain
      ? await requestTrackingPermissionsAsync()
      : currentPermission;
    if (permission.status === 'undetermined') {
      await applyMeasurementConsent(false);
      return 'not-determined'; // Not a refusal: do not mark the system prompt as answered.
    }
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
  notifyConsentChanged();
  return 'disabled';
}
