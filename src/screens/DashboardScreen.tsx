import React from 'react';
import { Image, Linking, Text, View, TouchableOpacity } from 'react-native';
import { AppIcon, AppIconName } from '../components/app-icon';
import { CaylikActionCard, CaylikSurface } from '../components/caylik-ui';
import { useAppTheme } from '../context/app-theme';
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
  onNavigate: (tab: 'assistant' | 'harvest' | 'history' | 'collections' | 'receivables' | 'expense' | 'prices' | 'reports') => void;
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
  const { paperTheme: theme, isDark: darkCards } = useAppTheme();
  // Kart yüzeyi ve metni aynı tema çiftinden seçilir. Sabit açık tema rengi
  // kullanmak, koyu modda beyaz kart üzerinde silik yazı oluşmasına neden olur.
  const summaryCard = { backgroundColor: darkCards ? '#18251F' : '#FFFFFF', borderColor: darkCards ? '#476356' : '#DDE8DF' };
  const summaryLabel = { color: darkCards ? '#E5EDE7' : '#526057' };
  const summaryValue = { color: darkCards ? '#FFFFFF' : '#174E3A' };
  const pendingCount = harvests.filter((item) => remainingTotalOf(item) > 0.01).length;
  const quickActions = [
    { tab: 'harvest' as const, label: 'Hasat Ekle', detail: 'Yeni satış kaydı', primary: true, icon: 'leaf' as AppIconName, tint: '#FFFFFF', background: 'rgba(255,255,255,0.18)' },
    { tab: 'collections' as const, label: 'Tahsilat Ekle', detail: 'Ödeme girişini kaydet', icon: 'cash-multiple' as AppIconName, tint: '#1F6B4F', background: '#E7F4EC' },
    { tab: 'receivables' as const, label: 'Alacaklar', detail: 'Bekleyen ödemeleri gör', icon: 'calendar-clock' as AppIconName, tint: '#9A6515', background: '#FFF3D7' },
    { tab: 'expense' as const, label: 'Gider Ekle', detail: 'Masrafı kaydet', icon: 'receipt-text' as AppIconName, tint: '#2B5E8C', background: '#EAF3FB' },
    { tab: 'prices' as const, label: 'Fabrika Fiyatları', detail: 'Güncel fiyatları karşılaştır', icon: 'factory' as AppIconName, tint: '#6D4E9B', background: '#F2ECFA' },
  ];

  return (
    <View>
      {ads.filter((ad) => ad.slot === 'dashboard_top' || ad.slot === 'dashboard_middle').slice(0, 2).map((ad, index) => <SponsorBanner key={ad._id || index} ad={ad} />)}
      <View style={styles.dashboardSnapshot}>
        <View style={styles.dashboardSnapshotTop}>
          <View>
            <Text style={styles.dashboardSnapshotEyebrow}>ÇAYLIK ÖZETİ</Text>
            <Text style={styles.dashboardSnapshotTitle}>
              {pendingCollection > 0 ? 'Bekleyen alacaklarınızı takip edin' : 'Sezon durumunuz güncel'}
            </Text>
          </View>
          <View style={styles.dashboardSnapshotIcon}>
            <AppIcon name={pendingCollection > 0 ? 'calendar-clock' : 'check-circle'} size={23} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.dashboardSnapshotMetrics}>
          <View style={styles.dashboardSnapshotMetric}>
            <Text style={styles.dashboardSnapshotValue}>{totalKg.toLocaleString('tr-TR')} KG</Text>
            <Text style={styles.dashboardSnapshotLabel}>Toplam hasat</Text>
          </View>
          <View style={styles.dashboardSnapshotDivider} />
          <View style={styles.dashboardSnapshotMetric}>
            <Text style={styles.dashboardSnapshotValue}>{formatTL(pendingCollection)}</Text>
            <Text style={styles.dashboardSnapshotLabel}>Bekleyen alacak</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Çaylık Asistanı aç"
        activeOpacity={0.86}
        style={[styles.assistantSpotlight, { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.outline }]}
        onPress={() => onNavigate('assistant')}
      >
        <View style={[styles.assistantSpotlightIcon, { backgroundColor: theme.colors.surface }]}><AppIcon name="robot-outline" size={29} color={theme.colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.assistantSpotlightEyebrow, { color: theme.colors.primary }]}>YAPAY ZEKÂ DESTEĞİ</Text>
          <Text style={[styles.assistantSpotlightTitle, { color: theme.colors.onPrimaryContainer }]}>Çaylık Asistan’a Sor</Text>
          <Text style={[styles.assistantSpotlightText, { color: theme.colors.onSurfaceVariant }]}>Çay yetiştiriciliği ve kendi kayıtlarınız hakkında yardım alın.</Text>
        </View>
        <AppIcon name="chevron-right" size={25} color={theme.colors.primary} />
      </TouchableOpacity>
      {harvests.length === 0 && (
        <CaylikSurface style={styles.gettingStartedCard}>
          <View style={styles.gettingStartedHead}>
            <View style={[styles.gettingStartedIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="hand-wave" size={22} color={theme.colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.gettingStartedTitle, { color: theme.colors.onSurface }]}>Başlamak çok kolay</Text>
              <Text style={[styles.gettingStartedText, { color: theme.colors.onSurfaceVariant }]}>İlk kaydınızı birkaç dakikada tamamlayabilirsiniz.</Text>
            </View>
          </View>
          <View style={styles.gettingStartedSteps}>
            <Text style={[styles.gettingStartedStep, { color: theme.colors.onSurfaceVariant }]}><Text style={[styles.gettingStartedNumber, { color: theme.colors.primary }]}>1</Text> Hasat Ekle ile kilo ve satış fiyatını yazın.</Text>
            <Text style={[styles.gettingStartedStep, { color: theme.colors.onSurfaceVariant }]}><Text style={[styles.gettingStartedNumber, { color: theme.colors.primary }]}>2</Text> Net alacak tutarı otomatik hesaplansın.</Text>
            <Text style={[styles.gettingStartedStep, { color: theme.colors.onSurfaceVariant }]}><Text style={[styles.gettingStartedNumber, { color: theme.colors.primary }]}>3</Text> Ödeme geldiğinde Tahsilat Ekle’ye dokunun.</Text>
          </View>
        </CaylikSurface>
      )}
      <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Bugün ne yapmak istersiniz?</Text>
      <View style={styles.quickActionGrid}>
        {quickActions.map((action) => (
          <CaylikActionCard
            key={action.tab}
            accessibilityLabel={action.label}
            style={[styles.quickAction, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }, action.primary && styles.quickActionPrimary, action.primary && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
            onPress={() => onNavigate(action.tab)}
          >
            <View style={[styles.quickActionIconWrap, action.primary && styles.quickActionPrimaryIconWrap, { backgroundColor: action.background }]}>
              <AppIcon name={action.icon} size={action.primary ? 28 : 24} color={action.tint} />
            </View>
            <View style={styles.quickActionCopy}>
              <Text style={[styles.quickActionText, { color: theme.colors.onSurface }, action.primary && styles.quickActionPrimaryText, action.primary && { color: theme.colors.onPrimary }]}>{action.label}</Text>
              <Text style={[styles.quickActionSubText, { color: theme.colors.onSurfaceVariant }, action.primary && styles.quickActionPrimarySubText, action.primary && { color: theme.colors.onPrimary }]}>{action.detail}</Text>
            </View>
          </CaylikActionCard>
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Bekleyen tahsilatları aç"
        style={[styles.dashboardNotice, { backgroundColor: pendingCollection > 0 ? theme.colors.secondaryContainer : theme.colors.primaryContainer, borderColor: theme.colors.outline }]}
        onPress={() => onNavigate(pendingCollection > 0 ? 'collections' : 'history')}
      >
        <View style={[styles.dashboardNoticeIcon, pendingCollection <= 0 && styles.dashboardNoticeIconPositive]}>
          <AppIcon name={pendingCollection > 0 ? 'clock-alert-outline' : 'check-circle'} size={22} color={pendingCollection > 0 ? '#9A6515' : '#237044'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dashboardNoticeTitle, { color: pendingCollection > 0 ? theme.colors.onSecondaryContainer : theme.colors.onPrimaryContainer }]}>{pendingCollection > 0 ? `${pendingCount} kayıtta tahsilat bekliyor` : 'Bekleyen tahsilat yok'}</Text>
          <Text style={[styles.dashboardNoticeText, { color: theme.colors.onSurfaceVariant }]}>{pendingCollection > 0 ? `${formatTL(pendingCollection)} alacak için tahsilat ekranını açın.` : 'Tüm kayıtların ödemesi tamamlanmış görünüyor.'}</Text>
        </View>
        <Text style={[styles.dashboardNoticeAction, { color: theme.colors.primary }]}>{pendingCollection > 0 ? 'Aç' : 'Geçmiş'}</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 22, color: theme.colors.onBackground }]}>Sezon Özeti</Text>
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, summaryCard]}><Text style={[styles.statTitle, summaryLabel]}>Toplam Hasat</Text><Text style={[styles.statValue, summaryValue]}>{totalKg.toLocaleString('tr-TR')} KG</Text></View>
        <View style={[styles.statCard, summaryCard]}><Text style={[styles.statTitle, summaryLabel]}>Net Satış / Alacak</Text><Text style={[styles.statValue, summaryValue]}>{formatTL(totalSales)}</Text></View>
        <View style={[styles.statCard, summaryCard]}><Text style={[styles.statTitle, summaryLabel]}>Yapılan Tahsilat</Text><Text style={[styles.statValue, summaryValue]}>{formatTL(totalPay)}</Text></View>
        <View style={[styles.statCard, summaryCard]}><Text style={[styles.statTitle, summaryLabel]}>Kalan Alacak / Bekleyen</Text><Text style={[styles.statValue, { color: pendingCollection > 0 ? (darkCards ? '#FFB4AB' : theme.colors.error) : (darkCards ? '#8AD9A8' : theme.colors.primary) }]}>{formatTL(pendingCollection)}</Text></View>
        <View style={[styles.statCard, summaryCard]}><Text style={[styles.statTitle, summaryLabel]}>Toplam Gider</Text><Text style={[styles.statValue, summaryValue]}>{formatTL(totalExp)}</Text></View>
        <View style={[styles.statCard, summaryCard]}><Text style={[styles.statTitle, summaryLabel]}>Tahmini Net Kazanç</Text><Text style={[styles.statValue, { color: netProfit >= 0 ? (darkCards ? '#8AD9A8' : theme.colors.primary) : (darkCards ? '#FFB4AB' : theme.colors.error) }]}>{formatTL(netProfit)}</Text></View>
      </View>
      <View style={styles.dashboardSectionHeader}>
        <Text style={[styles.sectionTitle, { marginBottom: 0, color: theme.colors.onBackground }]}>Son Hasat Kayıtları</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tüm hasat kayıtlarını aç" onPress={() => onNavigate('history')}><Text style={[styles.dashboardSectionLink, { color: theme.colors.primary }]}>Tümünü gör</Text></TouchableOpacity>
      </View>
      {harvests.length === 0 ? <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Henüz kaydedilmiş bir hasat yok.</Text> : harvests.slice(0, 10).map((item, index) => {
        const saleVal = netTotalOf(item); const remaining = remainingTotalOf(item);
        return <View key={item._id || index} style={[styles.listItem, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outline }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>{item.uretici || item.producerName || 'Bilinmeyen Üretici'} ({item.surum || '1. Sürüm'})</Text>
            <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>{formatDisplayDate(item.tarih)} · {item.kg || item.weight || 0} KG · {item.fiyat || 0} TL/KG</Text>
            {item.bahce ? <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Bahçe: {item.bahce}</Text> : null}
            <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Net satış: {formatTL(saleVal)}</Text>
            <Text style={[styles.dashboardRecordStatus, { color: remaining > 0 ? '#A84646' : '#237044' }]}>{remaining > 0 ? `Kalan alacak: ${formatTL(remaining)}` : 'Ödeme tamamlandı'}</Text>
          </View>
        </View>;
      }).slice(0, 3)}
    </View>
  );
}
