import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useAdsPrivacy } from '../context/ads-privacy';

const productionIds = {
  ios: 'ca-app-pub-4870931624363029/4128402483',
  android: 'ca-app-pub-4870931624363029/6543541780',
};

export default function AdMobBanner() {
  const privacy = useAdsPrivacy();
  const unitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : productionIds[Platform.OS as 'ios' | 'android'];
  if (!unitId || !privacy.ready) return null;
  return <View style={styles.container}><BannerAd key={String(privacy.personalized)} unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: !privacy.personalized }} /></View>;
}

const styles = StyleSheet.create({ container: { minHeight: 54, paddingVertical: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
