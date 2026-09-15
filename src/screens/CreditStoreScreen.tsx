import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '../components/app-icon';
import { CaylikButton, CaylikSurface } from '../components/caylik-ui';
import { API_ORIGIN } from '../services/api';
import type { StoreProductId } from '../services/inAppPurchases';
import RewardedAdButton from '../components/RewardedAdButton';
import type { AuthFetch } from '../services/aiAssistant';

export type CreditProductId = StoreProductId;

const products: {
  id: CreditProductId;
  title: string;
  credits: string;
  price: string;
  detail: string;
  popular?: boolean;
  subscription?: boolean;
}[] = [
  { id: 'caylik_credits_250', title: 'Başlangıç', credits: '250 kredi', price: '39,99 TL', detail: 'Hasat ve alacak kayıtlarınızı Asistan’la yorumlamak için.' },
  { id: 'caylik_credits_750', title: 'Standart', credits: '750 kredi', price: '89,99 TL', detail: 'Çay üretimiyle ilgili sorularınızı Asistan’a daha sık danışmak için.' },
  { id: 'caylik_credits_2000', title: 'Büyük Paket', credits: '2.000 kredi', price: '199,99 TL', detail: 'Asistan’da kullanın veya markanızı çay üreticilerine tanıtmak için reklam başvurusu yapın.' },
  { id: 'caylik_pro_monthly', title: 'Çaylık Pro', credits: 'Her ay 1.500 kredi', price: '119,99 TL / ay', detail: 'Asistan kullanımı ve reklam başvuruları için aylık kredi aboneliği.', subscription: true },
];

type Props = {
  userId: string;
  onReload?: () => void;
  authFetch?: AuthFetch;
  credits: number | null;
  onBack: () => void;
  onPurchase: (productId: CreditProductId) => void;
  onRestore: () => void;
  prices?: Partial<Record<CreditProductId, string>>;
  purchasingProductId?: CreditProductId | null;
  restoring?: boolean;
  storeStatus?: string;
  onRewardedAdEarned?: () => Promise<void> | void;
};

export default function CreditStoreScreen({ userId, onReload, authFetch, credits, onBack, onPurchase, onRestore, prices = {}, purchasingProductId = null, restoring = false, storeStatus = '', onRewardedAdEarned }: Props) {
  const theme = useTheme();

  return (
    <View>
      <View style={local.headerRow}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Asistana dön" onPress={onBack} style={[local.backButton, { backgroundColor: theme.colors.surfaceVariant }]}>
          <AppIcon name="arrow-left" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[local.title, { color: theme.colors.onSurface }]}>Kredi Yükle</Text>
          <Text style={[local.subtitle, { color: theme.colors.onSurfaceVariant }]}>Asistan ve reklam için tek kredi bakiyesi.</Text>
        </View>
        <View style={[local.balance, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text style={[local.balanceValue, { color: theme.colors.onPrimaryContainer }]}>{credits ?? '…'}</Text>
          <Text style={[local.balanceLabel, { color: theme.colors.onPrimaryContainer }]}>mevcut kredi</Text>
        </View>
      </View>

      <CaylikSurface style={local.freeCard}>
        <View style={local.freeInner}>
          <View style={[local.giftIcon, { backgroundColor: theme.colors.secondaryContainer }]}><AppIcon name="gift-outline" size={24} color={theme.colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[local.freeTitle, { color: theme.colors.onSurface }]}>Başlangıç hediyesi: 50 kredi</Text>
            <Text style={[local.freeText, { color: theme.colors.onSurfaceVariant }]}>Yeni hesaplara ücretsiz tanımlanır. Asistan’da yazılı yanıt ve sesin yazıya çevrilmesi ayrı kredilidir; başarısız işlemde kredi iade edilir.</Text>
          </View>
        </View>
      </CaylikSurface>

      {!!onRewardedAdEarned && <CaylikSurface style={local.rewardCard}><View style={local.rewardInner}><View style={{ flex: 1 }}><Text style={[local.freeTitle, { color: theme.colors.onSurface }]}>Ücretsiz kredi kazan</Text><Text style={[local.freeText, { color: theme.colors.onSurfaceVariant }]}>Reklamı tamamlayın; ödül işlemi onaylandığında 10 kredi eklenir. Günde en fazla 3 ödül.</Text></View><RewardedAdButton userId={userId} authFetch={authFetch} onEarned={onRewardedAdEarned} /></View></CaylikSurface>}

      <CaylikSurface style={local.proInfoCard}>
        <View style={local.proInfoHeader}>
          <View style={[local.proIcon, { backgroundColor: theme.colors.secondaryContainer }]}><AppIcon name="crown-outline" size={25} color="#9A6416" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[local.proInfoTitle, { color: theme.colors.onSurface }]}>Çaylık Pro ne sağlar?</Text>
            <Text style={[local.proInfoLead, { color: theme.colors.onSurfaceVariant }]}>İlk satın alımda ve her başarılı aylık yenilemede 1.500 kredi eklenir. Yenilemeyi mağaza hesabınızdan iptal edebilirsiniz.</Text>
          </View>
        </View>
        <Text style={[local.proNote, { color: theme.colors.onSurfaceVariant, borderTopColor: theme.colors.outlineVariant }]}>Pro sınırsız değildir; reklam kredisi başvuruda düşer, yönetici reddederse iade edilir.</Text>
      </CaylikSurface>

      <View style={local.grid}>
        {!!onReload && <CaylikButton mode="text" icon="refresh" disabled={Boolean(purchasingProductId) || restoring} onPress={onReload}>Mağazayı ve ödeme durumunu yenile</CaylikButton>}
        {products.map((product) => (
          <CaylikSurface key={product.id} style={[local.productCard, product.popular && { borderColor: theme.colors.primary, borderWidth: 2 }]}>
            <View style={local.productInner}>
              <View style={local.productTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[local.productTitle, { color: theme.colors.onSurface }]}>{product.title}</Text>
                  <Text style={[local.credits, { color: theme.colors.primary }]}>{product.credits}</Text>
                </View>
                {product.popular && <Text style={[local.badge, { backgroundColor: theme.colors.primary, color: theme.colors.onPrimary }]}>POPÜLER</Text>}
                {product.subscription && <AppIcon name="crown-outline" size={25} color="#B7791F" />}
              </View>
              <Text style={[local.detail, { color: theme.colors.onSurfaceVariant }]}>{product.detail}</Text>
              <Text style={[local.price, { color: theme.colors.onSurface }]}>{prices[product.id] || 'Mağaza fiyatı bekleniyor…'}</Text>
              <CaylikButton
                icon={product.subscription ? 'crown-outline' : 'cart-outline'}
                disabled={!prices[product.id] || Boolean(purchasingProductId) || restoring}
                onPress={() => onPurchase(product.id)}
              >
                {purchasingProductId === product.id ? 'İşleniyor…' : product.subscription ? 'Pro’ya Geç' : 'Satın Al'}
              </CaylikButton>
            </View>
          </CaylikSurface>
        ))}
      </View>

      <CaylikButton icon="restore" mode="text" disabled={Boolean(purchasingProductId) || restoring} onPress={onRestore}>{restoring ? 'Kontrol Ediliyor…' : 'Satın Alımları Geri Yükle'}</CaylikButton>
      {!!storeStatus && <Text accessibilityLiveRegion="polite" style={[local.status, { color: theme.colors.onSurfaceVariant }]}>{storeStatus}</Text>}
      <Text style={[local.legal, { color: theme.colors.onSurfaceVariant }]}>Ödeme iOS’ta App Store, Android’de Google Play hesabınız üzerinden alınır; mağazanın gösterdiği yerel fiyat geçerlidir. Kredi, satın alma doğrulanınca eklenir. Tek seferlik paketlerin kullanım süresi yoktur.</Text>
      <View style={local.legalLinks}>
        <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(`${API_ORIGIN}/privacy`)}><Text style={[local.legalLink, { color: theme.colors.primary }]}>Gizlilik Politikası</Text></TouchableOpacity>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>·</Text>
        <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}><Text style={[local.legalLink, { color: theme.colors.primary }]}>Kullanım Koşulları</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  balance: { minWidth: 88, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  balanceValue: { fontSize: 21, fontWeight: '900' },
  balanceLabel: { fontSize: 10, fontWeight: '700' },
  freeCard: { marginBottom: 14 },
  rewardCard: { marginBottom: 14 },
  rewardInner: { padding: 15, gap: 12 },
  freeInner: { padding: 15, flexDirection: 'row', gap: 12, alignItems: 'center' },
  giftIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  freeTitle: { fontSize: 16, fontWeight: '900', marginBottom: 3 },
  freeText: { fontSize: 12, lineHeight: 17 },
  proInfoCard: { marginBottom: 16, overflow: 'hidden' },
  proInfoHeader: { paddingHorizontal: 16, paddingTop: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  proIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  proInfoTitle: { fontSize: 18, fontWeight: '900', marginBottom: 3 },
  proInfoLead: { fontSize: 12, lineHeight: 17 },
  proNote: { marginTop: 15, borderTopWidth: 1, padding: 15, fontSize: 11, lineHeight: 16 },
  grid: { gap: 12 },
  productCard: { overflow: 'hidden' },
  productInner: { padding: 17 },
  productTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productTitle: { fontSize: 20, fontWeight: '900' },
  credits: { fontSize: 16, fontWeight: '900', marginTop: 3 },
  badge: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  detail: { fontSize: 12, lineHeight: 18, minHeight: 36, marginTop: 13, marginBottom: 8 },
  price: { fontSize: 24, fontWeight: '900', marginBottom: 12 },
  status: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginHorizontal: 10, marginBottom: 4 },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5, marginBottom: 24, paddingHorizontal: 10 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: -15, marginBottom: 28 },
  legalLink: { fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
});
