import React from 'react';
import { Image, Linking, Text, View, TouchableOpacity } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatTL, formatDisplayDate, netTotalOf, remainingTotalOf } from '../utils/format';
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
  onNavigate: (tab: 'harvest' | 'history' | 'collections' | 'receivables' | 'expense' | 'prices' | 'reports') => void;
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
  const pendingCount = harvests.filter((item) => remainingTotalOf(item) > 0.01).length;
  const quickActions = [
    { tab: 'harvest' as const, label: 'Hasat Ekle', detail: 'Yeni satış kaydı', primary: true, icon: { ios: 'leaf.fill', android: 'energy_savings_leaf', web: 'energy_savings_leaf' }, tint: '#FFFFFF', background: 'rgba(255,255,255,0.18)' },
    { tab: 'collections' as const, label: 'Tahsilat Ekle', detail: 'Ödeme girişini kaydet', icon: { ios: 'creditcard.fill', android: 'payments', web: 'payments' }, tint: '#1F6B4F', background: '#E7F4EC' },
    { tab: 'receivables' as const, label: 'Alacaklar', detail: 'Bekleyen ödemeleri gör', icon: { ios: 'calendar.badge.clock', android: 'event_note', web: 'event_note' }, tint: '#9A6515', background: '#FFF3D7' },
    { tab: 'expense' as const, label: 'Gider Ekle', detail: 'Masrafı kaydet', icon: { ios: 'receipt', android: 'receipt_long', web: 'receipt_long' }, tint: '#2B5E8C', background: '#EAF3FB' },
    { tab: 'prices' as const, label: 'Fabrika Fiyatları', detail: 'Güncel fiyatları karşılaştır', icon: { ios: 'building.2.fill', android: 'factory', web: 'factory' }, tint: '#6D4E9B', background: '#F2ECFA' },
  ];

  return (
    <View>
      {ads.filter((ad) => ad.slot === 'dashboard_top' || ad.slot === 'dashboard_middle').slice(0, 2).map((ad, index) => <SponsorBanner key={ad._id || index} ad={ad} />)}
      <Text style={styles.sectionTitle}>Bugün ne yapmak istersiniz?</Text>
      <View style={styles.quickActionGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.tab}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={[styles.quickAction, action.primary && styles.quickActionPrimary]}
            onPress={() => onNavigate(action.tab)}
          >
            <View style={[styles.quickActionIconWrap, action.primary && styles.quickActionPrimaryIconWrap, { backgroundColor: action.background }]}>
              <SymbolView name={action.icon as any} size={action.primary ? 28 : 24} tintColor={action.tint} />
            </View>
            <View style={styles.quickActionCopy}>
              <Text style={[styles.quickActionText, action.primary && styles.quickActionPrimaryText]}>{action.label}</Text>
              <Text style={[styles.quickActionSubText, action.primary && styles.quickActionPrimarySubText]}>{action.detail}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Bekleyen tahsilatları aç"
        style={[styles.dashboardNotice, pendingCollection <= 0 && styles.dashboardNoticePositive]}
        onPress={() => onNavigate(pendingCollection > 0 ? 'collections' : 'history')}
      >
        <View style={[styles.dashboardNoticeIcon, pendingCollection <= 0 && styles.dashboardNoticeIconPositive]}>
          <SymbolView name={{ ios: pendingCollection > 0 ? 'clock.badge.exclamationmark' : 'checkmark.circle.fill', android: pendingCollection > 0 ? 'pending_actions' : 'check_circle', web: pendingCollection > 0 ? 'pending_actions' : 'check_circle' }} size={22} tintColor={pendingCollection > 0 ? '#9A6515' : '#237044'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dashboardNoticeTitle}>{pendingCollection > 0 ? `${pendingCount} kayıtta tahsilat bekliyor` : 'Bekleyen tahsilat yok'}</Text>
          <Text style={styles.dashboardNoticeText}>{pendingCollection > 0 ? `${formatTL(pendingCollection)} alacak için tahsilat ekranını açın.` : 'Tüm kayıtların ödemesi tamamlanmış görünüyor.'}</Text>
        </View>
        <Text style={styles.dashboardNoticeAction}>{pendingCollection > 0 ? 'Aç' : 'Geçmiş'}</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Sezon Özeti</Text>
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: '#2a9d8f' }]}><Text style={styles.statTitle}>Toplam Hasat</Text><Text style={styles.statValue}>{totalKg.toLocaleString('tr-TR')} KG</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#e76f51' }]}><Text style={styles.statTitle}>Net Satış / Alacak</Text><Text style={styles.statValue}>{formatTL(totalSales)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#38b000' }]}><Text style={styles.statTitle}>Yapılan Tahsilat</Text><Text style={styles.statValue}>{formatTL(totalPay)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#d62828' }]}><Text style={styles.statTitle}>Kalan Alacak / Bekleyen</Text><Text style={[styles.statValue, { color: pendingCollection > 0 ? '#d62828' : '#2b9348' }]}>{formatTL(pendingCollection)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#f4a261' }]}><Text style={styles.statTitle}>Toplam Gider</Text><Text style={styles.statValue}>{formatTL(totalExp)}</Text></View>
        <View style={[styles.statCard, { borderLeftColor: '#1d3557' }]}><Text style={styles.statTitle}>Tahmini Net Kazanç</Text><Text style={[styles.statValue, { color: netProfit >= 0 ? '#2b9348' : '#d62828' }]}>{formatTL(netProfit)}</Text></View>
      </View>
      <View style={styles.dashboardSectionHeader}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Son Hasat Kayıtları</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tüm hasat kayıtlarını aç" onPress={() => onNavigate('history')}><Text style={styles.dashboardSectionLink}>Tümünü gör</Text></TouchableOpacity>
      </View>
      {harvests.length === 0 ? <Text style={styles.emptyText}>Henüz kaydedilmiş bir hasat yok.</Text> : harvests.slice(0, 10).map((item, index) => {
        const saleVal = netTotalOf(item); const remaining = remainingTotalOf(item);
        return <View key={item._id || index} style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>{item.uretici || item.producerName || 'Bilinmeyen Üretici'} ({item.surum || '1. Sürüm'})</Text>
            <Text style={styles.listSubText}>{formatDisplayDate(item.tarih)} · {item.kg || item.weight || 0} KG · {item.fiyat || 0} TL/KG</Text>
            {item.bahce ? <Text style={styles.listSubText}>Bahçe: {item.bahce}</Text> : null}
            <Text style={styles.listSubText}>Net satış: {formatTL(saleVal)}</Text>
            <Text style={[styles.dashboardRecordStatus, { color: remaining > 0 ? '#A84646' : '#237044' }]}>{remaining > 0 ? `Kalan alacak: ${formatTL(remaining)}` : 'Ödeme tamamlandı'}</Text>
          </View>
        </View>;
      }).slice(0, 3)}
    </View>
  );
}
