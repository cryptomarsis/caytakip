import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppIcon, AppIconName } from '../components/app-icon';
import { CaylikActionCard, CaylikScreenHeader } from '../components/caylik-ui';

type Tab = 'assistant' | 'creditStore' | 'history' | 'expense' | 'gardens' | 'prices' | 'reports' | 'settings';
type Props = { isAdmin: boolean; onNavigate: (tab: Tab | 'admin') => void };
type MenuItem = { tab: Tab; label: string; detail: string; icon: AppIconName; tone: string; soft: string };

const items: MenuItem[] = [
  { tab: 'history', label: 'Hasat Geçmişi', detail: 'Kayıtlarınızı bulun, filtreleyin ve düzenleyin', icon: 'timeline-clock-outline', tone: '#49B783', soft: 'rgba(73,183,131,0.16)' },
  { tab: 'expense', label: 'Giderler', detail: 'Masraflarınızı kaydedin ve takip edin', icon: 'receipt-text-outline', tone: '#E46E73', soft: 'rgba(228,110,115,0.16)' },
  { tab: 'gardens', label: 'Bahçeler', detail: 'Bahçelerinizi ve verimini yönetin', icon: 'greenhouse', tone: '#8FC35C', soft: 'rgba(143,195,92,0.16)' },
  { tab: 'prices', label: 'Fabrika Fiyatları', detail: 'Güncel alım fiyatlarını karşılaştırın', icon: 'factory', tone: '#C292E8', soft: 'rgba(194,146,232,0.16)' },
  { tab: 'reports', label: 'Raporlar', detail: 'Hasat, gelir ve sezon özetlerini görün', icon: 'chart-box-outline', tone: '#E5B657', soft: 'rgba(229,182,87,0.16)' },
];

export default function MoreScreen({ isAdmin, onNavigate }: Props) {
  const theme = useTheme();
  return (
    <View>
      <CaylikScreenHeader icon="view-grid-outline" eyebrow="ÇAYLIK ARAÇLARI" title="Diğer İşlemler" description="Kayıt, analiz ve hesap ayarları." />

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Çaylık Asistanı aç" activeOpacity={0.82} style={[local.assistantCard, { backgroundColor: theme.colors.primaryContainer }]} onPress={() => onNavigate('assistant')}>
        <View style={[local.assistantIcon, { backgroundColor: theme.colors.primary }]}><AppIcon name="robot-happy-outline" size={28} color={theme.colors.onPrimary} /></View>
        <View style={{ flex: 1 }}><Text style={[local.assistantEyebrow, { color: theme.colors.primary }]}>YAPAY ZEKÂ</Text><Text style={[local.assistantTitle, { color: theme.colors.onPrimaryContainer }]}>Çaylık Asistan’a Sor</Text><Text style={[local.assistantDetail, { color: theme.colors.onSurfaceVariant }]}>Çay ve kendi kayıtlarınız hakkında destek alın.</Text></View>
        <View style={[local.assistantArrow, { backgroundColor: theme.colors.surface }]}><AppIcon name="arrow-top-right" size={19} color={theme.colors.primary} /></View>
      </TouchableOpacity>

      <Text style={[local.groupLabel, { color: theme.colors.onSurfaceVariant }]}>KAYIT VE RAPORLAR</Text>
      <View style={[local.menuSurface, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        {items.map((item, index) => (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.label} activeOpacity={0.72} key={item.tab} style={[local.menuRow, index < items.length - 1 && { borderBottomColor: theme.colors.outlineVariant, borderBottomWidth: 1 }]} onPress={() => onNavigate(item.tab)}>
            <View style={[local.tileIcon, { backgroundColor: item.soft }]}><AppIcon name={item.icon} size={23} color={item.tone} /></View>
            <View style={local.menuCopy}>
              <Text style={[local.tileTitle, { color: theme.colors.onSurface }]}>{item.label}</Text>
              <Text style={[local.tileDetail, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>{item.detail}</Text>
            </View>
            <AppIcon name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={local.accountActions}>
        <TouchableOpacity accessibilityRole="button" style={[local.accountAction, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} onPress={() => onNavigate('creditStore')}>
          <View style={[local.accountIcon, { backgroundColor: theme.colors.secondaryContainer }]}><AppIcon name="wallet-plus-outline" size={22} color={theme.colors.secondary} /></View>
          <Text style={[local.accountTitle, { color: theme.colors.onSurface }]}>Kredi ve Pro</Text><AppIcon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={[local.accountAction, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} onPress={() => onNavigate('settings')}>
          <View style={[local.accountIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="cog-outline" size={22} color={theme.colors.primary} /></View>
          <Text style={[local.accountTitle, { color: theme.colors.onSurface }]}>Ayarlar</Text><AppIcon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
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
  hero: { paddingVertical: 8, marginBottom: 17, flexDirection: 'row', alignItems: 'center', gap: 13 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginBottom: 3 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  assistantCard: { minHeight: 112, borderRadius: 24, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 13, overflow: 'hidden' },
  assistantIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  assistantEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  assistantTitle: { fontSize: 17, fontWeight: '900', marginTop: 2 },
  assistantDetail: { fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  assistantArrow: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  groupLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginLeft: 5, marginBottom: 9 },
  menuSurface: { overflow: 'hidden', borderWidth: 1, borderRadius: 26, paddingHorizontal: 14 },
  menuRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12 },
  menuCopy: { flex: 1, minWidth: 0 },
  tileIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  tileDetail: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  accountActions: { gap: 10, marginTop: 12 },
  accountAction: { minHeight: 64, borderRadius: 19, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  accountIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  accountTitle: { flex: 1, fontSize: 14, fontWeight: '900' },
  adminCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  adminIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  adminTitle: { fontSize: 17, fontWeight: '900' },
  adminDetail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
});
