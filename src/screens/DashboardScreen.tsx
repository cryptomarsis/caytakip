import React from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatTL, formatDisplayDate } from '../utils/format';
import { styles } from '../styles/styles';

type DashboardProps = {
  ads: any[];
  harvests: any[];
  totalKg: number;
  totalSales: number;
  totalPay: number;
  pendingCollection: number;
  totalExp: number;
  netProfit: number;
  openEditModal: (item: any) => void;
  handleDelete: (endpoint: string, id: string, label: string) => void;
  onNavigate: (tab: 'harvest' | 'collections' | 'expense' | 'prices' | 'reports') => void;
};

export default function DashboardScreen({
  ads,
  harvests,
  totalKg,
  totalSales,
  totalPay,
  pendingCollection,
  totalExp,
  netProfit,
  openEditModal,
  handleDelete,
  onNavigate,
}: DashboardProps) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>

      <View style={styles.quickActionGrid}>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('harvest')}>
          <View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'leaf.fill', android: 'energy_savings_leaf', web: 'energy_savings_leaf' }} size={25} tintColor="#246548" /></View>
          <Text style={styles.quickActionText}>Hasat Ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('collections')}>
          <View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'creditcard.fill', android: 'payments', web: 'payments' }} size={25} tintColor="#246548" /></View>
          <Text style={styles.quickActionText}>Ödeme Al</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('expense')}>
          <View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'receipt', android: 'receipt_long', web: 'receipt_long' }} size={25} tintColor="#246548" /></View>
          <Text style={styles.quickActionText}>Gider Ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('prices')}>
          <View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'building.2.fill', android: 'factory', web: 'factory' }} size={25} tintColor="#246548" /></View>
          <Text style={styles.quickActionText}>Fabrika Fiyatları</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('reports')}>
          <View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }} size={25} tintColor="#246548" /></View>
          <Text style={styles.quickActionText}>Raporlar</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Bu Sezonun Özeti</Text>

      {ads.filter(a => a.slot === 'dashboard_top' || a.slot === 'dashboard_middle').slice(0, 2).map((ad, i) => (
        <View key={ad._id || i} style={styles.adCard}>
          <Text style={styles.adLabel}>SPONSORLU • {ad.kategori || 'REKLAM'}</Text>
          <Text style={styles.adTitle}>{ad.baslik}</Text>
          <Text style={styles.adText}>{ad.aciklama || ''}</Text>
          <Text style={styles.adCompany}>📣 {ad.firma}{ad.telefon ? ` • ${ad.telefon}` : ''}</Text>
        </View>
      ))}

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: '#2a9d8f' }]}>
          <Text style={styles.statTitle}>Toplam Hasat</Text>
          <Text style={styles.statValue}>{totalKg.toLocaleString('tr-TR')} KG</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#e76f51' }]}>
          <Text style={styles.statTitle}>Tahakkuk Eden Satış</Text>
          <Text style={styles.statValue}>{formatTL(totalSales)}</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#38b000' }]}>
          <Text style={styles.statTitle}>Yapılan Tahsilat</Text>
          <Text style={styles.statValue}>{formatTL(totalPay)}</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#d62828' }]}>
          <Text style={styles.statTitle}>Kalan Alacak / Bekleyen</Text>
          <Text style={[styles.statValue, { color: pendingCollection > 0 ? '#d62828' : '#2b9348' }]}>
            {formatTL(pendingCollection)}
          </Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#f4a261' }]}>
          <Text style={styles.statTitle}>Toplam Gider</Text>
          <Text style={styles.statValue}>{formatTL(totalExp)}</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#1d3557' }]}>
          <Text style={styles.statTitle}>Tahmini Net Kazanç</Text>
          <Text style={[styles.statValue, { color: netProfit >= 0 ? '#2b9348' : '#d62828' }]}>
            {formatTL(netProfit)}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>SON HASAT KAYITLARI</Text>
      {harvests.length === 0 ? (
        <Text style={styles.emptyText}>Henüz kaydedilmiş bir hasat yok.</Text>
      ) : (
        harvests.slice(0, 10).map((item, index) => {
          const saleVal = (Number(item.kg || item.weight) || 0) * (Number(item.fiyat) || 0);
          const payVal = Number(item.tahsilat) || 0;
          const remaining = saleVal - payVal;

          return (
            <View key={item._id || index} style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>
                  {item.uretici || item.producerName || 'Bilinmeyen Üretici'} ({item.surum || '1. Sürüm'})
                </Text>
                <Text style={styles.listSubText}>
                  📅 {item.tarih || 'Tarih Yok'} | ⚖️ {item.kg || item.weight || 0} KG | 💵 Fiyat: {item.fiyat || 0} TL
                </Text>
                {item.bahce ? <Text style={styles.listSubText}>🏡 Bahçe: {item.bahce}</Text> : null}
                {item.isVadeli ? <Text style={styles.listSubText}>⏳ Vade: {formatDisplayDate(item.vadeTarihi)}</Text> : null}
                <Text style={styles.listSubText}>
                  💰 Toplam: {formatTL(saleVal)} | 🟢 Ödenen: {formatTL(payVal)}
                </Text>
                <Text style={{ color: remaining > 0 ? '#d62828' : '#2b9348', fontWeight: 'bold', marginTop: 2 }}>
                  {remaining > 0 ? `🔴 Kalan Borç: ${formatTL(remaining)}` : '🟢 Tamamı Ödendi'}
                </Text>
              </View>
              <View style={{ gap: 5 }}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                  <Text style={styles.actionBtnText}>✏️ Ödeme</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('harvests', item._id, 'Hasat')}>
                  <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
