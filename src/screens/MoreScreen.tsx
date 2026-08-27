import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppIcon, AppIconName } from '../components/app-icon';
import { CaylikActionCard } from '../components/caylik-ui';

type Tab = 'assistant' | 'creditStore' | 'history' | 'expense' | 'gardens' | 'prices' | 'reports' | 'settings';
type Props = { isAdmin: boolean; onNavigate: (tab: Tab | 'admin') => void };
type MenuItem = { tab: Tab; label: string; detail: string; icon: AppIconName; tint: string; background: string };

const items: MenuItem[] = [
  { tab: 'assistant', label: 'Çaylık Asistan', detail: 'Çay üretimi ve kayıtlarınız için akıllı yardım', icon: 'robot-outline', tint: '#147A57', background: '#DDF5E8' },
  { tab: 'creditStore', label: 'Kredi ve Pro', detail: 'Kredi paketleri ve Pro üyelik seçenekleri', icon: 'wallet-plus-outline', tint: '#A56500', background: '#FFF0C9' },
  { tab: 'history', label: 'Hasat Geçmişi', detail: 'Kayıtlarınızı bulun, filtreleyin ve düzenleyin', icon: 'history', tint: '#267559', background: '#E0F2E8' },
  { tab: 'expense', label: 'Giderler', detail: 'Masraflarınızı kaydedin ve takip edin', icon: 'receipt-text-outline', tint: '#326DA3', background: '#E1EFFB' },
  { tab: 'gardens', label: 'Bahçeler', detail: 'Bahçelerinizi ve verimini yönetin', icon: 'tree-outline', tint: '#557D35', background: '#EAF3DE' },
  { tab: 'prices', label: 'Fabrika Fiyatları', detail: 'Güncel alım fiyatlarını karşılaştırın', icon: 'factory', tint: '#7250A1', background: '#EEE5FA' },
  { tab: 'reports', label: 'Raporlar', detail: 'Hasat, gelir ve sezon özetlerini görün', icon: 'chart-box-outline', tint: '#B16812', background: '#FCEBD5' },
  { tab: 'settings', label: 'Ayarlar', detail: 'Hesap, görünüm ve gizlilik seçenekleri', icon: 'cog-outline', tint: '#586A62', background: '#E7ECE9' },
];

export default function MoreScreen({ isAdmin, onNavigate }: Props) {
  const theme = useTheme();
  return (
    <View>
      <View style={[local.hero, { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.outline }]}>
        <View style={[local.heroIcon, { backgroundColor: theme.colors.primary }]}>
          <AppIcon name="view-grid-outline" size={27} color={theme.colors.onPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[local.eyebrow, { color: theme.colors.primary }]}>TÜM ARAÇLAR</Text>
          <Text style={[local.title, { color: theme.colors.onSurface }]}>Ne yapmak istersiniz?</Text>
          <Text style={[local.subtitle, { color: theme.colors.onSurfaceVariant }]}>İşlemlerinize tek dokunuşla ulaşın.</Text>
        </View>
      </View>
      <View style={local.grid}>
        {items.map((item) => (
          <CaylikActionCard accessibilityLabel={item.label} key={item.tab} style={[local.tile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]} onPress={() => onNavigate(item.tab)}>
            <View style={[local.tileIcon, { backgroundColor: item.background }]}><AppIcon name={item.icon} size={26} color={item.tint} /></View>
            <Text style={[local.tileTitle, { color: theme.colors.onSurface }]}>{item.label}</Text>
            <Text style={[local.tileDetail, { color: theme.colors.onSurfaceVariant }]} numberOfLines={3}>{item.detail}</Text>
            <View style={[local.openButton, { backgroundColor: theme.colors.primaryContainer }]}>
              <Text style={[local.openText, { color: theme.colors.primary }]}>Aç</Text><AppIcon name="arrow-right" size={16} color={theme.colors.primary} />
            </View>
          </CaylikActionCard>
        ))}
      </View>
      {isAdmin && (
        <CaylikActionCard accessibilityLabel="Yönetici Paneli" style={[local.adminCard, { backgroundColor: theme.colors.secondaryContainer, borderColor: theme.colors.outline }]} onPress={() => onNavigate('admin')}>
          <View style={[local.adminIcon, { backgroundColor: theme.colors.secondary }]}><AppIcon name="shield-account-outline" size={28} color={theme.colors.onSecondary} /></View>
          <View style={{ flex: 1 }}><Text style={[local.adminTitle, { color: theme.colors.onSecondaryContainer }]}>Yönetici Paneli</Text><Text style={[local.adminDetail, { color: theme.colors.onSurfaceVariant }]}>Üretici, fiyat ve duyuru yönetimi</Text></View>
          <AppIcon name="chevron-right" size={26} color={theme.colors.secondary} />
        </CaylikActionCard>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  hero: { borderWidth: 1, borderRadius: 24, padding: 18, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginBottom: 3 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  tile: { width: '48%', minHeight: 206, borderRadius: 22, borderWidth: 1, padding: 15, marginBottom: 0, alignItems: 'flex-start' },
  tileIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  tileTitle: { fontSize: 16, lineHeight: 20, fontWeight: '900', marginBottom: 6 },
  tileDetail: { fontSize: 12.5, lineHeight: 18, flexGrow: 1 },
  openButton: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  openText: { fontSize: 13, fontWeight: '900' },
  adminCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  adminIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  adminTitle: { fontSize: 17, fontWeight: '900' },
  adminDetail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
});
