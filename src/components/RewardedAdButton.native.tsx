import React, { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';
import { CaylikButton } from './caylik-ui';

const productionIds = { ios: 'ca-app-pub-4870931624363029/7255812058', android: 'ca-app-pub-4870931624363029/3226384358' };

export default function RewardedAdButton({ onEarned }: { onEarned: () => Promise<void> | void }) {
  const [loaded, setLoaded] = useState(false);
  const [showing, setShowing] = useState(false);
  const ad = useMemo(() => RewardedAd.createForAdRequest(__DEV__ ? TestIds.REWARDED : productionIds[Platform.OS as 'ios' | 'android'], { requestNonPersonalizedAdsOnly: false }), []);
  useEffect(() => {
    const loadedSub = ad.addAdEventListener(RewardedAdEventType.LOADED, () => setLoaded(true));
    const earnedSub = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => void onEarned());
    const closedSub = ad.addAdEventListener(AdEventType.CLOSED, () => { setShowing(false); setLoaded(false); ad.load(); });
    const errorSub = ad.addAdEventListener(AdEventType.ERROR, () => { setShowing(false); setLoaded(false); });
    ad.load();
    return () => { loadedSub(); earnedSub(); closedSub(); errorSub(); };
  }, [ad, onEarned]);
  return <CaylikButton icon="play-circle-outline" disabled={!loaded || showing} onPress={() => { setShowing(true); ad.show().catch(() => setShowing(false)); }}>{showing ? 'Reklam açılıyor…' : loaded ? 'Reklam İzle · 10 Kredi Kazan' : 'Reklam hazırlanıyor…'}</CaylikButton>;
}
