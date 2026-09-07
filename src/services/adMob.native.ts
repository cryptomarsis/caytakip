import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';

let initialization: Promise<unknown> | null = null;

export function initializeAdMob() {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      await AdsConsent.requestInfoUpdate();
      await AdsConsent.loadAndShowConsentFormIfRequired();
    } catch {
      // Reklam izni alınamazsa SDK kişiselleştirilmemiş/uygun reklam kararını kendisi verir.
    }
    return mobileAds().initialize();
  })();
  return initialization;
}
