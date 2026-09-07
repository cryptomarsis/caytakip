import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeAd, NativeAdView, NativeAsset, NativeAssetType, TestIds } from 'react-native-google-mobile-ads';
import { useTheme } from 'react-native-paper';

const productionIds = { ios: 'ca-app-pub-4870931624363029/5664845432', android: 'ca-app-pub-4870931624363029/1721730996' };

export default function AdMobNativeCard() {
  const theme = useTheme();
  const [ad, setAd] = useState<NativeAd | null>(null);
  const adRef = useRef<NativeAd | null>(null);
  useEffect(() => {
    let active = true;
    NativeAd.createForAdRequest(__DEV__ ? TestIds.NATIVE : productionIds[Platform.OS as 'ios' | 'android'], { requestNonPersonalizedAdsOnly: false })
      .then((loaded) => { if (active) { adRef.current = loaded; setAd(loaded); } else loaded.destroy(); })
      .catch(() => undefined);
    return () => { active = false; adRef.current?.destroy(); adRef.current = null; };
  }, []);
  if (!ad) return null;
  return <NativeAdView nativeAd={ad} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
    <Text style={[styles.sponsored, { color: theme.colors.onSurfaceVariant }]}>REKLAM</Text>
    <View style={styles.row}>
      {!!ad.icon?.url && <NativeAsset assetType={NativeAssetType.ICON}><Image source={{ uri: ad.icon.url }} style={styles.icon} /></NativeAsset>}
      <View style={styles.copy}>
        <NativeAsset assetType={NativeAssetType.HEADLINE}><Text numberOfLines={2} style={[styles.title, { color: theme.colors.onSurface }]}>{ad.headline}</Text></NativeAsset>
        <NativeAsset assetType={NativeAssetType.BODY}><Text numberOfLines={2} style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>{ad.body}</Text></NativeAsset>
      </View>
      <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}><Pressable style={[styles.action, { backgroundColor: theme.colors.primary }]}><Text style={[styles.actionText, { color: theme.colors.onPrimary }]}>{ad.callToAction}</Text></Pressable></NativeAsset>
    </View>
  </NativeAdView>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 20, padding: 13, marginVertical: 14 }, sponsored: { fontSize: 9, fontWeight: '900', letterSpacing: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }, icon: { width: 48, height: 48, borderRadius: 12 }, copy: { flex: 1, minWidth: 0 }, title: { fontSize: 15, lineHeight: 19, fontWeight: '900' }, body: { marginTop: 3, fontSize: 11, lineHeight: 15 }, action: { minHeight: 40, maxWidth: 100, paddingHorizontal: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, actionText: { fontSize: 11, fontWeight: '900', textAlign: 'center' } });
