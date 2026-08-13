import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { styles } from '../styles/styles';

type Tab = 'history' | 'expense' | 'gardens' | 'prices' | 'reports' | 'settings';
type Props = { isAdmin: boolean; onNavigate: (tab: Tab | 'admin') => void };

const items: Array<{ tab: Tab; label: string; detail: string; icon: { ios: string; android: string; web: string }; tint: string; background: string }> = [
  { tab: 'history', label: 'Hasat Geçmişi', detail: 'Eski hasat kayıtlarını bulun ve düzeltin', icon: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }, tint: '#1F6B4F', background: '#E7F4EC' },
  { tab: 'expense', label: 'Giderler', detail: 'Masrafları ekleyin ve takip edin', icon: { ios: 'receipt', android: 'receipt_long', web: 'receipt_long' }, tint: '#2B5E8C', background: '#EAF3FB' },
  { tab: 'gardens', label: 'Bahçeler', detail: 'Bahçelerinizi tanımlayın', icon: { ios: 'tree.fill', android: 'yard', web: 'yard' }, tint: '#527541', background: '#EEF6E8' },
  { tab: 'prices', label: 'Fabrika Fiyatları', detail: 'Güncel alım fiyatlarını karşılaştırın', icon: { ios: 'building.2.fill', android: 'factory', web: 'factory' }, tint: '#6D4E9B', background: '#F2ECFA' },
  { tab: 'reports', label: 'Raporlar', detail: 'Hasat ve gelir özetinizi görüntüleyin', icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }, tint: '#9A6515', background: '#FFF3D7' },
  { tab: 'settings', label: 'Ayarlar ve Gizlilik', detail: 'Gizlilik ve hesap işlemleri', icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' }, tint: '#52695A', background: '#EEF1F2' }
];

export default function MoreScreen({ isAdmin, onNavigate }: Props) {
  return <View>
    <Text style={styles.sectionTitle}>Diğer İşlemler</Text>
    <Text style={styles.formHelp}>İhtiyacınız olan bölümü seçin.</Text>
    {items.map((item) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.label} key={item.tab} style={styles.moreRow} onPress={() => onNavigate(item.tab)}>
      <View style={[styles.quickActionIconWrap, { backgroundColor: item.background }]}><SymbolView name={item.icon as any} size={22} tintColor={item.tint} /></View>
      <View style={{ flex: 1 }}><Text style={styles.listTitle}>{item.label}</Text><Text style={styles.listSubText}>{item.detail}</Text></View>
      <Text style={styles.moreChevron}>›</Text>
    </TouchableOpacity>)}
    {isAdmin && <TouchableOpacity style={styles.moreRow} onPress={() => onNavigate('admin')}>
      <View style={[styles.quickActionIconWrap, { backgroundColor: '#FFF0CC' }]}><SymbolView name={{ ios: 'person.badge.key.fill', android: 'admin_panel_settings', web: 'admin_panel_settings' }} size={22} tintColor="#9B6A20" /></View>
      <View style={{ flex: 1 }}><Text style={styles.listTitle}>Yönetici Paneli</Text><Text style={styles.listSubText}>Üretici, fiyat ve duyuru yönetimi</Text></View>
      <Text style={styles.moreChevron}>›</Text>
    </TouchableOpacity>}
  </View>;
}
