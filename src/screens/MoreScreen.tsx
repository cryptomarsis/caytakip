import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { styles } from '../styles/styles';

type Tab = 'history' | 'expense' | 'gardens' | 'prices' | 'reports' | 'settings';
type Props = { isAdmin: boolean; onNavigate: (tab: Tab | 'admin') => void };

const items: Array<{ tab: Tab; label: string; detail: string; icon: string }> = [
  { tab: 'history', label: 'Hasat Geçmişi', detail: 'Eski hasat kayıtlarını bulun ve düzeltin', icon: 'history' },
  { tab: 'expense', label: 'Giderler', detail: 'Masrafları ekleyin ve takip edin', icon: 'receipt_long' },
  { tab: 'gardens', label: 'Bahçeler', detail: 'Bahçelerinizi tanımlayın', icon: 'yard' },
  { tab: 'prices', label: 'Fabrika Fiyatları', detail: 'Güncel alım fiyatlarını karşılaştırın', icon: 'factory' },
  { tab: 'reports', label: 'Raporlar', detail: 'Hasat ve gelir özetinizi görüntüleyin', icon: 'bar_chart' },
  { tab: 'settings', label: 'Ayarlar ve Gizlilik', detail: 'Gizlilik ve hesap işlemleri', icon: 'settings' }
];

export default function MoreScreen({ isAdmin, onNavigate }: Props) {
  return <View>
    <Text style={styles.sectionTitle}>Diğer İşlemler</Text>
    <Text style={styles.formHelp}>İhtiyacınız olan bölümü seçin.</Text>
    {items.map((item) => <TouchableOpacity key={item.tab} style={styles.moreRow} onPress={() => onNavigate(item.tab)}>
      <View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'circle.fill', android: item.icon as any, web: item.icon as any }} size={22} tintColor="#246548" /></View>
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
