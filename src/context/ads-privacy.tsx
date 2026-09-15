import { createContext, useContext } from 'react';
export const AdsPrivacyContext = createContext({ ready: false, personalized: false });
export const useAdsPrivacy = () => useContext(AdsPrivacyContext);
