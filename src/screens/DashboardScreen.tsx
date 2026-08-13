import React from 'react';
import { Image, Linking, Text, View, TouchableOpacity } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { deductionTotalOf, formatTL, formatDisplayDate, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';
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
  openPaymentForHarvest: (item: any) => void;
  openHarvestEditModal: (item: any) => void;
  handleDelete: (endpoint: string, id: string, label: string) => void;
  onNavigate: (tab: 'harvest' | 'collections' | 'expense' | 'prices' | 'reports') => void;
};

const imageUrlOf = (value: unknown) => {
  const url = String(value || '').trim();
  return /^https?:\/\/\S+$/i.test(url) ? url : '';
};

const actionUrlOf = (ad: any) => {
  const link = String(ad?.link || '').trim();
  if (/^https?:\/\/\S+$/i.test(link)) return link;
  const phone = String(ad?.telefon || '').replace(/[^0-9+]/g, '');
  return phone ? `tel:${phone}` : '';
};

function SponsorBanner({ ad }: { ad: any }) {
  const imageUrl = imageUrlOf(ad.gorselUrl);
  const actionUrl = actionUrlOf(ad);
  const title = String(ad.baslik || ad.firma || 'Sponsorlu içerik').trim();
  const firm = String(ad.firma || '').trim();
  const isAnnouncement = String(ad.kategori || '').toLocaleLowerCase('tr-TR') === 'duyuru';
  const content = (
    <>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.sponsorBannerImage} resizeMode="cover" /> : <View style={styles.sponsorBannerFallback}><Text style={styles.sponsorBannerFallbackMark}>{firm || 'Çaylık'}</Text></View>}
      <View style={styles.sponsorBannerInfo}>
        <View style={styles.sponsorBannerMeta}>
          <Text style={styles.sponsorBannerBadge}>{isAnnouncement ? 'DUYURU' : 'SPONSORLU'}</Text>
          {!!firm && <Text style={styles.sponsorBannerFirm}>{firm}</Text>}
        </View>
        <Text style={styles.sponsorBannerTitle}>{title}</Text>
        {!!ad.aciklama && <Text style={styles.sponsorBannerText}>{ad.aciklama}</Text>}
        {!!actionUrl && <Text style={styles.sponsorBannerAction}>İncelemek için dokunun →</Text>}
      </View>
    </>
  );
  if (!actionUrl) return <View style={styles.sponsorBanner}>{content}</View>;
  return <TouchableOpacity accessibilityRole="link" style={[styles.sponsorBanner, styles.sponsorBannerPress]} onPress={() => { Linking.openURL(actionUrl).catch(() => undefined); }}>{content}</TouchableOpacity>;
}

export default function DashboardScreen({ ads, harvests, totalKg, totalSales, totalPay, pendingCollection, totalExp, netProfit, openPaymentForHarvest, openHarvestEditModal, handleDelete, onNavigate }: DashboardProps) {
  return (
    <View>
      {ads.filter((ad) => ad.slot === 'dashboard_top' || ad.slot === 'dashboard_middle').slice(0, 2).map((ad, index) => <SponsorBanner key={ad._id || index} ad={ad} />)}
      <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>
      <View style={styles.quickActionGrid}>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('harvest')}><View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'leaf.fill', android: 'energy_savings_leaf', web: 'energy_savings_leaf' }} size={25} tintColor="#246548" /></View><Text style={styles.quickActionText}>Hasat Ekle</Text></TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('collections')}><View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'creditcard.fill', android: 'payments', web: 'payments' }} size={25} tintColor="#246548" /></View><Text style={styles.quickActionText}>Ödeme Al</Text></TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('expense')}><View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'receipt', android: 'receipt_long', web: 'receipt_long' }} size={25} tintColor="#246548" /></View><Text style={styles.quickActionText}>Gider Ekle</Text></TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('prices')}><View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'building.2.fill', android: 'factory', web: 'factory' }} size={25} tintColor="#246548" /></View><Text style={styles.quickActionText}>Fabrika Fiyatları</Text></TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => onNavigate('reports')}><View style={styles.quickActionIconWrap}><SymbolView name={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }} size={25} tintColor="#246548" /></View><Text style={styles.quickActionText}>Raporlar</Text></TouchableOpacity>
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Bu Sezonun Özeti</Text>
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: '#2a9d8f' }]}><Text style={styles.statTitle}>Toplam Hasat</Text><Text style={styles.statValue}>{totalKg.toLocaleString('tr-TR')} KG</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#e76f51' }]}><Text style={styles.statTitle}>Net Satış / Alacak</Text><Text style={styles.statValue}>{formatTL(totalSales)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#38b000' }]}><Text style={styles.statTitle}>Yapılan Tahsilat</Text><Text style={styles.statValue}>{formatTL(totalPay)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#d62828' }]}><Text style={styles.statTitle}>Kalan Alacak / Bekleyen</Text><Text style={[styles.statValue, { color: pendingCollection > 0 ? '#d62828' : '#2b9348' }]}>{formatTL(pendingCollection)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#f4a261' }]}><Text style={styles.statTitle}>Toplam Gider</Text><Text style={styles.statValue}>{formatTL(totalExp)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#1d3557' }]}><Text style={styles.statTitle}>Tahmini Net Kazanç</Text><Text style={[styles.statValue, { color: netProfit >= 0 ? '#2b9348' : '#d62828' }]}>{formatTL(netProfit)}</Text></View>
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>SON HASAT KAYITLARI</Text>
      {harvests.length === 0 ? <Text style={styles.emptyText}>Henüz kaydedilmiş bir hasat yok.</Text> : harvests.slice(0, 10).map((item, index) => {
        const grossVal = grossTotalOf(item); const deductionVal = deductionTotalOf(item); const saleVal = netTotalOf(item); const payVal = Number(item.tahsilat) || 0; const remaining = remainingTotalOf(item);
        return <View key={item._id || index} style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>{item.uretici || item.producerName || 'Bilinmeyen Üretici'} ({item.surum || '1. Sürüm'})</Text>
            <Text style={styles.listSubText}>📅 {formatDisplayDate(item.tarih)} | ⚖️ {item.kg || item.weight || 0} KG | 💵 Fiyat: {item.fiyat || 0} TL</Text>
            {item.bahce ? <Text style={styles.listSubText}>🏡 Bahçe: {item.bahce}</Text> : null}
            {item.isVadeli ? <Text style={styles.listSubText}>⏳ Vade: {formatDisplayDate(item.vadeTarihi)}</Text> : null}
            <Text style={styles.listSubText}>Brüt: {formatTL(grossVal)} | %2 kesinti: {formatTL(deductionVal)}</Text>
            <Text style={styles.listSubText}>Net alacak: {formatTL(saleVal)} | Ödenen: {formatTL(payVal)}</Text>
            <Text style={{ color: remaining > 0 ? '#d62828' : '#2b9348', fontWeight: 'bold', marginTop: 2 }}>{remaining > 0 ? `🔴 Kalan Borç: ${formatTL(remaining)}` : '🟢 Tamamı Ödendi'}</Text>
          </View>
          <View style={{ gap: 5 }}>
            <TouchableOpacity style={styles.editBtn} onPress={() => openHarvestEditModal(item)}><Text style={styles.actionBtnText}>✏️ Düzenle</Text></TouchableOpacity>
            <TouchableOpacity style={styles.editBtn} onPress={() => openPaymentForHarvest(item)}><Text style={styles.actionBtnText}>💳 Ödeme</Text></TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('harvests', item._id, 'Hasat')}><Text style={styles.actionBtnText}>🗑️ Sil</Text></TouchableOpacity>
          </View>
        </View>;
      })}
    </View>
  );
}
