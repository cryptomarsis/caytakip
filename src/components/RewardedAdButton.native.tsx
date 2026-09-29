import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';
import { CaylikButton } from './caylik-ui';
import { API_URL } from '../services/api';
import type { RewardProps } from './RewardedAdButton';
import { useAdAccess } from '../context/ad-access';
import { clearPendingAdReward, readPendingAdReward, savePendingAdReward } from '../services/pendingAdReward';
import { useAdsPrivacy } from '../context/ads-privacy';

const ids = { ios: 'ca-app-pub-4870931624363029/7255812058', android: 'ca-app-pub-4870931624363029/3226384358' };
export default function RewardedAdButton(props: RewardProps) {
  const { adsAllowed } = useAdAccess();
  return adsAllowed ? <AvailableRewardedAdButton {...props} /> : null;
}

function AvailableRewardedAdButton({ userId, onEarned, authFetch }: RewardProps) {
  const privacy = useAdsPrivacy();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const live = useRef(true);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => { live.current = true; return () => { live.current = false; cleanup.current(); }; }, []);
  const watch = async () => {
    if (!authFetch || lock.current || !privacy.ready) return;
    lock.current = true; setBusy(true);
    const finish = () => { lock.current = false; if (live.current) setBusy(false); };
    const claimLegacy = async (nonce: string) => {
      const completed = await authFetch(API_URL + '/ai/rewarded-ad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customData: nonce }) });
      const award = await completed.json();
      if (completed.status === 410 && award.code === 'AD_REWARD_EXPIRED') await clearPendingAdReward(userId, nonce);
      if (!completed.ok || !Number.isFinite(award.credits)) throw new Error(award.error || 'Ödül bekleniyor.');
      await clearPendingAdReward(userId, nonce);
      if (live.current) await onEarned();
    };
    try {
      const pending = await readPendingAdReward(userId);
      if (pending) { await claimLegacy(pending); finish(); return; }
      const response = await authFetch(API_URL + '/ai/rewarded-ad/session', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.customData || data.userId !== userId || !['legacy', 'ssv'].includes(data.mode)) throw new Error(data.error || 'Reklam hazırlanamadı.');
      if (!live.current) return;
      const ad = RewardedAd.createForAdRequest(__DEV__ ? TestIds.REWARDED : ids[Platform.OS as 'ios' | 'android'], {
        requestNonPersonalizedAdsOnly: !privacy.personalized,
        serverSideVerificationOptions: { userId: data.userId, customData: data.customData },
      });
      let earned = false;
      let persistEarned: Promise<unknown> = Promise.resolve();
      let timer: ReturnType<typeof setTimeout>;
      const listeners = [
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => { clearTimeout(timer); void ad.show().catch(() => { cleanup.current(); finish(); }); }),
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
          if (data.mode === 'legacy' && !__DEV__) {
            persistEarned = savePendingAdReward(userId, data.customData);
            void persistEarned.catch(() => undefined);
          }
        }),
        ad.addAdEventListener(AdEventType.ERROR, () => { cleanup.current(); finish(); if (live.current) Alert.alert('Reklam açılamadı', 'Daha sonra tekrar deneyin.'); }),
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          cleanup.current();
          if (!earned) { finish(); return; }
          void (async () => {
            try {
              // A session's mode never changes mid-ad. SSV errors never downgrade.
              if (data.mode === 'legacy' && !__DEV__) {
                await persistEarned;
                await claimLegacy(data.customData);
                return;
              }
              for (let attempt = 0; attempt < 6 && live.current; attempt++) {
                const result = await authFetch(API_URL + '/ai/rewarded-ad/status/' + data.customData);
                const status = await result.json();
                if (result.ok && status.rewarded && live.current) { await onEarned(); return; }
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
              if (live.current) Alert.alert('Ödül doğrulanıyor', __DEV__ ? 'Test reklamı gerçek kredi kazandırmaz.' : 'Google onayı geldiğinde krediniz otomatik eklenecek. Tekrar reklam izlemeniz gerekmiyor.');
            } catch { if (live.current) Alert.alert('Ödül doğrulanıyor', data.mode === 'legacy' ? 'Bağlantı geldiğinde reklam düğmesine tekrar basın. Önce bekleyen ödül kontrol edilir; yeniden reklam izlemeniz gerekmez.' : 'Google onayı geldiğinde bakiyeniz güncellenecek.'); }
            finally { finish(); }
          })();
        }),
      ];
      timer = setTimeout(() => { cleanup.current(); finish(); if (live.current) Alert.alert('Reklam yüklenemedi', 'Daha sonra tekrar deneyin.'); }, 45000);
      cleanup.current = () => { clearTimeout(timer); listeners.forEach(remove => remove()); };
      ad.load();
    } catch (error) {
      finish();
      if (live.current) Alert.alert('Ücretsiz kredi', error instanceof Error ? error.message : 'Reklam hazırlanamadı.');
    }
  };
  return <CaylikButton icon="play-circle-outline" disabled={busy || !authFetch || !privacy.ready} onPress={() => void watch()}>{busy ? 'Reklam / ödül hazırlanıyor…' : 'Reklam İzle · 10 Kredi Kazan'}</CaylikButton>;
}
