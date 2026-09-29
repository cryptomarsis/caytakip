import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { NativeAd, NativeAdView, NativeAsset, NativeAssetType, NativeMediaView, TestIds } from 'react-native-google-mobile-ads';
import { useTheme } from 'react-native-paper';
import { useAdsPrivacy } from '../context/ads-privacy';
import { useAdAccess } from '../context/ad-access';

const productionIds = { ios: 'ca-app-pub-4870931624363029/5664845432', android: 'ca-app-pub-4870931624363029/1721730996' };

export default function AdMobNativeCard() {
  const privacy = useAdsPrivacy();
  const { adsAllowed } = useAdAccess();
  return privacy.ready && adsAllowed ? <ReadyNativeCard key={String(privacy.personalized)} personalized={privacy.personalized} /> : null;
}

function ReadyNativeCard({ personalized }: { personalized: boolean }) {
  const theme = useTheme();
  const [ad, setAd] = useState<NativeAd | null>(null);
  const adRef = useRef<NativeAd | null>(null);
  useEffect(() => {
    let active = true;
    NativeAd.createForAdRequest(__DEV__ ? TestIds.NATIVE : productionIds[Platform.OS as 'ios' | 'android'], { requestNonPersonalizedAdsOnly: !personalized })
      .then((loaded) => { if (active) { adRef.current = loaded; setAd(loaded); } else loaded.destroy(); })
      .catch(() => undefined);
    return () => { active = false; adRef.current?.destroy(); adRef.current = null; };
  }, [personalized]);
  if (!ad) return null;
  return <NativeAdView nativeAd={ad} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
    <Text style={[styles.sponsored, { color: theme.colors.onSurfaceVariant }]}>REKLAM</Text>
    <View style={styles.row}>
      {!!ad.icon?.url && <NativeAsset assetType={NativeAssetType.ICON}><Image source={{ uri: ad.icon.url }} style={styles.icon} /></NativeAsset>}
      <View style={styles.copy}>
        <NativeAsset assetType={NativeAssetType.HEADLINE}><Text numberOfLines={2} style={[styles.title, { color: theme.colors.onSurface }]}>{ad.headline}</Text></NativeAsset>
        {!!ad.body && <NativeAsset assetType={NativeAssetType.BODY}><Text numberOfLines={3} style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>{ad.body}</Text></NativeAsset>}
      </View>
    </View>
    {!!ad.mediaContent && <NativeMediaView style={styles.media} resizeMode="contain" />}
    {!!ad.callToAction && <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}><Text style={[styles.action, styles.actionText, { backgroundColor: theme.colors.primary, color: theme.colors.onPrimary }]}>{ad.callToAction}</Text></NativeAsset>}
  </NativeAdView>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 20, padding: 16, marginVertical: 24 }, sponsored: { fontSize: 12, fontWeight: '900', letterSpacing: 1, paddingRight: 32 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }, icon: { width: 48, height: 48, borderRadius: 12 }, copy: { flex: 1, minWidth: 0 }, title: { fontSize: 16, lineHeight: 21, fontWeight: '900' }, body: { marginTop: 4, fontSize: 13, lineHeight: 18 }, media: { width: '100%', height: 180, marginTop: 14 }, action: { minHeight: 44, marginTop: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignSelf: 'flex-start' }, actionText: { fontSize: 14, fontWeight: '900', textAlign: 'center' } });
