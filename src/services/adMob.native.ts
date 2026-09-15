import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';

let initialization: Promise<unknown> | null = null;

export function initializeAdMob() {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      await AdsConsent.requestInfoUpdate();
      await AdsConsent.loadAndShowConsentFormIfRequired();
    } catch { /* Cached consent is checked below; errors never imply consent. */ }
    const consent = await AdsConsent.getConsentInfo();
    if (!consent.canRequestAds) throw new Error('Reklam gizlilik tercihi henüz tamamlanmadı.');
    return mobileAds().initialize();
  })().catch(error => { initialization = null; throw error; });
  return initialization;
}
