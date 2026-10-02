import React from 'react';
import { Platform, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useAdAccess } from '../context/ad-access';
import { useAdsPrivacy } from '../context/ads-privacy';
import { CaylikButton } from './caylik-ui';

type Props = { credits: number | null; disabled: boolean; onOpenStore: () => void };

export default function AssistantRewardOffer({ credits, disabled, onOpenStore }: Props) {
  const theme = useTheme();
  const { adsAllowed } = useAdAccess();
  const privacy = useAdsPrivacy();
  if (Platform.OS === 'web' || !adsAllowed || !privacy.ready || credits === null || !Number.isFinite(credits) || credits < 0 || credits > 15) return null;
  return <View style={{ gap: 8, marginBottom: 20 }}>
    <CaylikButton icon="play-circle-outline" mode="outlined" disabled={disabled} onPress={onOpenStore}>
      Reklam izle, 10 kredi kazan
    </CaylikButton>
    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, lineHeight: 18 }}>
      İsteğe bağlı · Kredi mağazasından başlatın. Ödül onaylandığında eklenir; günde en fazla 3 ödül.
    </Text>
  </View>;
}
