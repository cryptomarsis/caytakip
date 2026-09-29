import React, { useMemo, useState } from 'react';
import AdMobNativeCard from '../components/AdMobNativeCard';
import { useAdAccess } from '../context/ad-access';
import DashboardStatus from '../components/DashboardStatus';
import ShareOverviewCard from '../components/ShareOverviewCard';
import type { AuthFetch } from '../services/aiAssistant';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '../components/app-icon';
import { SeasonSummary } from '../components/season-summary';
import { CaylikButton } from '../components/caylik-ui';
import {
  DashboardEmptyState,
  DashboardListRow,
  DashboardMonthlyChart,
  DashboardSectionHeader,
  MonthlyChartPoint,
} from '../components/dashboard-ui';
import { caylikDesign } from '../context/app-theme';
import { AdRecord, HarvestRecord } from '../types';
import { formatDisplayDate, formatTL, netTotalOf, remainingTotalOf, toServerDate } from '../utils/format';

type DashboardDestination = 'assistant' | 'advertise' | 'harvest' | 'history' | 'collections' | 'receivables' | 'expense' | 'prices' | 'reports' | 'quota' | 'creditStore' | 'sharecropping';

type DashboardProps = {
  authFetch?: AuthFetch;
  pendingSyncCount?: number;
  ads: AdRecord[];
  harvests: HarvestRecord[];
  userName?: string;
  assistantCredits?: number | null;
  totalKg: number;
  totalSales: number;
  totalPay: number;
  pendingCollection: number;
  totalExp: number;
  netProfit: number;
  openPaymentForHarvest: (item: HarvestRecord) => void;
  openHarvestEditModal: (item: HarvestRecord) => void;
  handleDelete: (endpoint: string, id: string, label: string) => void;
  onNavigate: (tab: DashboardDestination) => void;
};

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const imageUrlOf = (value: unknown) => {
  const url = String(value || '').trim();
  return /^(https?:\/\/\S+|data:image\/(png|jpe?g|webp);base64,)/i.test(url) ? url : '';
};

const actionUrlOf = (ad: AdRecord) => {
  const link = String(ad.link || '').trim();
  if (/^https?:\/\/\S+$/i.test(link)) return link;
  const phone = String(ad.telefon || '').replace(/[^0-9+]/g, '');
  return phone ? `tel:${phone}` : '';
};

const dateTimestamp = (value: unknown) => {
  const raw = String(value || '').trim();
  const normalized = toServerDate(raw);
  if (normalized) return new Date(`${normalized}T00:00:00`).getTime();
  const monthOnly = raw.match(/^(\d{4})[-./](\d{1,2})$/);
  if (monthOnly) return new Date(Number(monthOnly[1]), Number(monthOnly[2]) - 1, 1).getTime();
  return 0;
};

function SponsorBanner({ ad, onPress, width }: { ad: AdRecord; onPress: () => void; width?: number }) {
  const theme = useTheme();
  const imageUrl = imageUrlOf(ad.gorselUrl);
  const title = String(ad.baslik || ad.firma || 'Çaylık duyurusu').trim();
  const firm = String(ad.firma || '').trim();
  const description = String(ad.aciklama || '').trim();
  const content = (
    <>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={local.bannerImage} resizeMode="cover" />
      ) : (
        <View style={[local.bannerMark, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="leaf" size={25} color={theme.colors.primary} /></View>
      )}
      <View style={local.bannerCopy}>
        <Text style={[local.bannerEyebrow, { color: theme.colors.primary }]}>{String(ad.kategori || '').toLocaleLowerCase('tr-TR') === 'duyuru' ? 'DUYURU' : 'SPONSORLU'}</Text>
        <Text numberOfLines={2} style={[local.bannerTitle, { color: theme.colors.onSurface }]}>{title}</Text>
        {!!description && <Text numberOfLines={2} style={[local.bannerDescription, { color: theme.colors.onSurfaceVariant }]}>{description}</Text>}
        {!!firm && <Text numberOfLines={1} style={[local.bannerDetail, { color: theme.colors.onSurfaceVariant }]}>{firm}</Text>}
      </View>
      <AppIcon name="chevron-right" size={22} color={theme.colors.primary} />
    </>
  );
  const style = [local.banner, width ? { width } : null, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title} ayrıntılarını aç`} onPress={onPress} style={({ pressed }) => [style, pressed && local.pressed]}>{content}</Pressable>;
}

function SponsorCarousel({ ads }: { ads: AdRecord[] }) {
  const theme = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<AdRecord | null>(null);
  const cardWidth = Math.min(Math.max(viewportWidth - 40, 280), caylikDesign.contentMaxWidth);
  if (!ads.length) return null;
  const selectedImage = selected ? imageUrlOf(selected.gorselUrl) : '';
  const selectedAction = selected ? actionUrlOf(selected) : '';
  return <>
    <ScrollView
      horizontal
      pagingEnabled
      snapToInterval={cardWidth + caylikDesign.spacing.sm}
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={local.bannerTrack}
      onMomentumScrollEnd={(event) => setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / (cardWidth + caylikDesign.spacing.sm)))}
    >
      {ads.map((ad, index) => <SponsorBanner key={ad._id || index} ad={ad} width={cardWidth} onPress={() => setSelected(ad)} />)}
    </ScrollView>
    {ads.length > 1 && <View style={local.bannerDots}>{ads.map((ad, index) => <View key={ad._id || index} style={[local.bannerDot, { backgroundColor: index === activeIndex ? theme.colors.primary : theme.colors.outlineVariant }, index === activeIndex && local.bannerDotActive]} />)}</View>}
    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={local.modalBackdrop}>
        <View style={[local.adModal, { backgroundColor: theme.colors.surface }]}>
          <View style={local.modalHeader}><Text style={[local.modalEyebrow, { color: theme.colors.primary }]}>DUYURU DETAYI</Text><Pressable accessibilityRole="button" accessibilityLabel="Detayı kapat" onPress={() => setSelected(null)} style={local.modalClose}><AppIcon name="close" size={24} color={theme.colors.onSurface} /></Pressable></View>
          {!!selectedImage && <Image source={{ uri: selectedImage }} style={local.modalImage} resizeMode="cover" />}
          <Text style={[local.modalTitle, { color: theme.colors.onSurface }]}>{selected?.baslik || selected?.firma}</Text>
          {!!selected?.firma && <Text style={[local.modalFirm, { color: theme.colors.primary }]}>{selected.firma}</Text>}
          {!!selected?.aciklama && <ScrollView style={local.modalBodyScroll}><Text style={[local.modalBody, { color: theme.colors.onSurfaceVariant }]}>{selected.aciklama}</Text></ScrollView>}
          {!!selectedAction && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(selectedAction).catch(() => undefined)} style={[local.modalAction, { backgroundColor: theme.colors.primary }]}><Text style={[local.modalActionText, { color: theme.colors.onPrimary }]}>İletişime geç / Ayrıntıyı aç</Text><AppIcon name="arrow-top-right" size={19} color={theme.colors.onPrimary} /></Pressable>}
        </View>
      </View>
    </Modal>
  </>;
}

function AssistantEntry({ credits, onPress }: { credits?: number | null; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Çaylık yapay zeka asistanını aç" onPress={onPress} style={({ pressed }) => [local.assistantCard, caylikDesign.shadow.soft, { backgroundColor: theme.colors.tertiaryContainer, borderColor: theme.colors.tertiary, shadowColor: theme.colors.shadow }, pressed && local.pressed]}>
      <View style={[local.assistantIcon, { backgroundColor: theme.colors.surface }]}><AppIcon name="robot-happy-outline" size={29} color={theme.colors.tertiary} /></View>
      <View style={local.assistantCopy}>
        <Text style={[local.assistantTitle, { color: theme.colors.onTertiaryContainer }]}>Çaylık Asistan</Text>
        <Text style={[local.assistantDetail, { color: theme.colors.onSurfaceVariant }]}>Sor, keşfet, daha verimli üret.</Text>
      </View>
      {credits !== null && credits !== undefined && <View style={[local.creditBadge, { backgroundColor: theme.colors.primaryContainer }]}><Text style={[local.creditBadgeText, { color: theme.colors.onPrimaryContainer }]}>{credits.toLocaleString('tr-TR')} kredi</Text></View>}
      <AppIcon name="chevron-right" size={20} color={theme.colors.primary} />
    </Pressable>
  );
}

export default function DashboardScreen({
  authFetch, pendingSyncCount = 0,
  ads,
  harvests,
  assistantCredits,
  totalKg,
  totalPay,
  pendingCollection,
  totalSales,
  openPaymentForHarvest,
  openHarvestEditModal,
  onNavigate,
}: DashboardProps) {
  const theme = useTheme();
  const { adsAllowed, isPro } = useAdAccess();
  const { width } = useWindowDimensions();
  const compact = width < 370;

  const recentHarvests = useMemo(() => [...harvests]
    .sort((left, right) => dateTimestamp(right.tarih) - dateTimestamp(left.tarih))
    .slice(0, 2), [harvests]);

  const upcomingReceivables = useMemo(() => harvests
    .filter((item) => remainingTotalOf(item) > 0.01 && dateTimestamp(item.vadeTarihi) > 0)
    .sort((left, right) => dateTimestamp(left.vadeTarihi) - dateTimestamp(right.vadeTarihi))
    .slice(0, 2), [harvests]);

  const monthlyChart = useMemo((): { year: number; points: MonthlyChartPoint[] } => {
    const dated = harvests.map((item) => ({ item, timestamp: dateTimestamp(item.tarih) })).filter((row) => row.timestamp > 0);
    const latestDate = dated.length ? new Date(Math.max(...dated.map((row) => row.timestamp))) : new Date();
    const year = latestDate.getFullYear();
    const months = Array.from({ length: 12 }, (_, index) => new Date(year, index, 1));
    const totals = Array.from({ length: 12 }, () => 0);
    dated.forEach(({ item, timestamp }) => {
      const date = new Date(timestamp);
      const index = months.findIndex((month) => month.getFullYear() === date.getFullYear() && month.getMonth() === date.getMonth());
      if (index >= 0) totals[index] += Number(item.kg ?? item.weight) || 0;
    });
    return { year, points: totals.map((value, index) => ({ label: MONTH_NAMES[months[index].getMonth()], value })) };
  }, [harvests]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return (
    <View style={[local.screen, { maxWidth: caylikDesign.contentMaxWidth }]}>
      {adsAllowed && <SponsorCarousel ads={ads.filter((ad) => ad.slot === 'dashboard_top')} />}

      <SeasonSummary kg={totalKg} sales={totalSales} paid={totalPay} remaining={pendingCollection} />
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>Özet, tüm kayıtlarınızı kapsar.</Text>
      {authFetch ? <DashboardStatus authFetch={authFetch} harvests={harvests} pending={pendingSyncCount} onQuota={() => onNavigate('quota')} /> : <CaylikButton icon="leaf-circle-outline" mode="outlined" onPress={() => onNavigate('quota')}>Çaykur Kota Takip · Kalan kotam</CaylikButton>}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: caylikDesign.spacing.sm, marginVertical: caylikDesign.spacing.md }}>
        <CaylikButton icon="leaf-circle-outline" onPress={() => onNavigate('harvest')} style={{ flexGrow: 1, flexBasis: 140 }}>Hasat ekle</CaylikButton>
        <CaylikButton icon="hand-coin-outline" mode="outlined" onPress={() => onNavigate('collections')} style={{ flexGrow: 1, flexBasis: 140 }}>Ödeme al</CaylikButton>
      </View>

      <AssistantEntry credits={assistantCredits} onPress={() => onNavigate('assistant')} />
      {authFetch && <ShareOverviewCard authFetch={authFetch} refreshKey={harvests} onOpen={() => onNavigate('sharecropping')} />}

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reklam ver" activeOpacity={0.82} onPress={() => onNavigate('advertise')} style={[local.advertiseCard, { backgroundColor: theme.colors.secondaryContainer, borderColor: theme.colors.secondary }]}>
        <View style={[local.advertiseIcon, { backgroundColor: theme.colors.secondary }]}><AppIcon name="bullhorn-outline" size={24} color={theme.colors.onSecondary} /></View>
        <View style={{ flex: 1 }}><Text style={[local.advertiseTitle, { color: theme.colors.onSecondaryContainer }]}>Reklam Ver</Text><Text style={[local.advertiseText, { color: theme.colors.onSurfaceVariant }]}>Markanızı Çaylık kullanıcılarına tanıtın</Text></View>
        <View style={[local.advertiseAction, { backgroundColor: theme.colors.surface }]}><Text style={{ color: theme.colors.secondary, fontWeight: '900' }}>Başla</Text><AppIcon name="chevron-right" size={18} color={theme.colors.secondary} /></View>
      </TouchableOpacity>

      {isPro && <Text style={{ color: theme.colors.primary, marginTop: 12, fontWeight: '700' }}>Çaylık Pro · Reklamsız kullanım aktif</Text>}
      {Platform.OS !== 'web' && adsAllowed && <View style={{ marginTop: 16, marginBottom: 8 }}>
        <CaylikButton icon="play-circle-outline" mode="outlined" onPress={() => onNavigate('creditStore')}>Reklam izle, 10 kredi kazan</CaylikButton>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, lineHeight: 18, marginTop: 6 }}>İsteğe bağlı · Ödül onaylandığında eklenir · Günde en fazla 3 ödül</Text>
      </View>}
      <DashboardSectionHeader title="Son teslimatlar" actionLabel="Tümünü gör" onAction={() => onNavigate('history')} />
      {recentHarvests.length === 0 ? <DashboardEmptyState icon="leaf-off" text="Henüz teslimat kaydı bulunmuyor." /> : recentHarvests.map((item, index) => {
        const company = String(item.firma || item.uretici || item.producerName || 'Firma belirtilmedi'); const kg = Number(item.kg ?? item.weight) || 0;
        return <DashboardListRow key={item._id || index} icon="basket-outline" title={company} detail={`${formatDisplayDate(item.tarih)} · ${kg.toLocaleString('tr-TR')} kg`} value={formatTL(netTotalOf(item))} tone={remainingTotalOf(item) > 0.01 ? 'warning' : 'primary'} onPress={() => openHarvestEditModal(item)} accessibilityLabel={`${company}, ${kg.toLocaleString('tr-TR')} kilogram`} />;
      })}

      <AdMobNativeCard />

      <DashboardSectionHeader title="Yaklaşan tahsilatlar" detail="Vadesi yaklaşan ve geciken kayıtlar" actionLabel="Tümünü gör" onAction={() => onNavigate('receivables')} />
      {upcomingReceivables.length === 0 ? (
        <DashboardEmptyState icon="calendar-check-outline" text="Vade tarihi bulunan açık bir alacak kaydı yok." />
      ) : upcomingReceivables.map((item, index) => {
        const due = dateTimestamp(item.vadeTarihi);
        const days = Math.round((due - today) / 86400000);
        const overdue = days < 0;
        const status = overdue ? `${Math.abs(days)} gün gecikti` : days === 0 ? 'Vade bugün' : `${days} gün kaldı`;
        const company = String(item.firma || item.uretici || item.producerName || 'Firma belirtilmedi');
        return (
          <DashboardListRow
            key={item._id || index}
            icon={overdue ? 'alert-circle-outline' : 'calendar-clock'}
            title={company}
            detail={`Vade: ${formatDisplayDate(item.vadeTarihi)} · ${Number(item.kg ?? item.weight) || 0} KG`}
            value={formatTL(remainingTotalOf(item))}
            status={status}
            tone={overdue ? 'danger' : 'warning'}
            onPress={() => openPaymentForHarvest(item)}
            accessibilityLabel={`${company}, ${status}, kalan ${formatTL(remainingTotalOf(item))}`}
          />
        );
      })}

      <DashboardSectionHeader title="Aylık hasat" detail={`${monthlyChart.year} yılı kilogram dağılımı`} actionLabel="Raporlar" onAction={() => onNavigate('reports')} />
      <DashboardMonthlyChart data={monthlyChart.points} />

      <Pressable accessibilityRole="button" accessibilityLabel="Yeni hasat kaydı oluştur" onPress={() => onNavigate('harvest')} style={({ pressed }) => [local.floatingAdd, caylikDesign.shadow.soft, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.shadow }, pressed && local.pressed]}><AppIcon name="plus" size={24} color={theme.colors.onPrimary} /><Text style={[local.floatingAddText, { color: theme.colors.onPrimary }]}>Yeni Hasat</Text></Pressable>

      {adsAllowed && <SponsorCarousel ads={ads.filter((ad) => ad.slot === 'dashboard_middle')} />}
      <View style={{ height: compact ? caylikDesign.spacing.md : caylikDesign.spacing.xl }} />
    </View>
  );
}

const local = StyleSheet.create({
  screen: { width: '100%', alignSelf: 'center' },
  welcomeRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.md, marginBottom: caylikDesign.spacing.md },
  welcomeCopy: { flex: 1 },
  welcomeEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.25 },
  welcomeTitle: { marginTop: caylikDesign.spacing.xs, fontSize: caylikDesign.type.headline, fontWeight: '900', letterSpacing: -0.6 },
  welcomeDetail: { marginTop: 4, fontSize: caylikDesign.type.body, lineHeight: 20, fontWeight: '600' },
  summaryCard: { borderWidth: 1, borderRadius: caylikDesign.radius.xl, padding: caylikDesign.spacing.md, overflow: 'hidden' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm, marginBottom: caylikDesign.spacing.md },
  summaryIcon: { width: 40, height: 40, borderRadius: caylikDesign.radius.sm, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: caylikDesign.type.bodyLarge, fontWeight: '900' },
  advertiseCard: { minHeight: 84, borderWidth: 1, borderRadius: 22, padding: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  advertiseIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  advertiseTitle: { fontSize: 16, fontWeight: '900' },
  advertiseText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  advertiseAction: { minHeight: 38, borderRadius: 13, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 3 },
  primaryMetrics: { flexDirection: 'row', gap: caylikDesign.spacing.sm },
  primaryMetric: { flex: 1, minWidth: 0, paddingVertical: caylikDesign.spacing.sm },
  primaryMetricBorder: { borderLeftWidth: 1, paddingLeft: caylikDesign.spacing.md },
  primaryLabel: { fontSize: caylikDesign.type.caption, fontWeight: '800' },
  primaryValue: { marginTop: caylikDesign.spacing.xs, fontSize: 29, fontFamily: caylikDesign.font.editorial, fontWeight: '700', letterSpacing: -0.7 },
  secondaryMetrics: { borderTopWidth: 1, marginTop: caylikDesign.spacing.sm, paddingTop: caylikDesign.spacing.md, flexDirection: 'row', gap: caylikDesign.spacing.sm },
  secondaryMetric: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.xs },
  secondaryLabel: { fontSize: 10, fontWeight: '800' },
  secondaryValue: { marginTop: 2, fontSize: 14, fontWeight: '900' },
  bannerTrack: { gap: caylikDesign.spacing.sm },
  banner: { minHeight: 112, borderRadius: caylikDesign.radius.lg, borderWidth: 1, padding: caylikDesign.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  bannerImage: { width: 64, height: 64, borderRadius: caylikDesign.radius.md },
  bannerMark: { width: 52, height: 52, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center' },
  bannerCopy: { flex: 1 },
  bannerEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  bannerTitle: { marginTop: 3, fontSize: caylikDesign.type.bodyLarge, lineHeight: 20, fontWeight: '900' },
  bannerDescription: { marginTop: 4, fontSize: caylikDesign.type.caption, lineHeight: 17, fontWeight: '600' },
  bannerDetail: { marginTop: 3, fontSize: caylikDesign.type.caption, fontWeight: '600' },
  bannerDots: { flexDirection: 'row', alignSelf: 'center', gap: 6, marginTop: 8, marginBottom: caylikDesign.spacing.md },
  bannerDot: { width: 7, height: 7, borderRadius: 4 },
  bannerDotActive: { width: 20 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  adModal: { maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: caylikDesign.spacing.lg, paddingBottom: 34 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  modalClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '100%', height: 210, borderRadius: caylikDesign.radius.lg, marginTop: caylikDesign.spacing.sm },
  modalTitle: { marginTop: caylikDesign.spacing.md, fontSize: 24, lineHeight: 30, fontWeight: '900' },
  modalFirm: { marginTop: 5, fontSize: 15, fontWeight: '800' },
  modalBodyScroll: { marginTop: caylikDesign.spacing.md, flexGrow: 0 },
  modalBody: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  modalAction: { minHeight: 52, borderRadius: caylikDesign.radius.md, marginTop: caylikDesign.spacing.lg, paddingHorizontal: caylikDesign.spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalActionText: { fontSize: 15, fontWeight: '900' },
  hero: { minHeight: 188, borderRadius: 30, padding: caylikDesign.spacing.xl, overflow: 'hidden', justifyContent: 'space-between' },
  heroDecor: { position: 'absolute', width: 190, height: 190, borderRadius: caylikDesign.radius.pill, right: -70, top: -72, opacity: 0.12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  heroIcon: { width: 43, height: 43, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center' },
  heroSeason: { fontSize: caylikDesign.type.body, fontWeight: '800', opacity: 0.86 },
  heroValue: { marginTop: caylikDesign.spacing.lg, fontSize: caylikDesign.type.display, fontWeight: '900', letterSpacing: -1.1 },
  heroHint: { marginTop: caylikDesign.spacing.xs, fontSize: caylikDesign.type.caption, lineHeight: 17, fontWeight: '600', opacity: 0.78 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: caylikDesign.spacing.sm, marginTop: caylikDesign.spacing.md },
  newRecordButton: { minHeight: 82, marginTop: caylikDesign.spacing.md, borderRadius: caylikDesign.radius.xl, borderWidth: 1, padding: caylikDesign.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  newRecordIcon: { width: 48, height: 48, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center' },
  newRecordCopy: { flex: 1 },
  newRecordTitle: { fontSize: caylikDesign.type.bodyLarge, fontWeight: '900' },
  newRecordDetail: { marginTop: 3, fontSize: caylikDesign.type.caption, lineHeight: 17, fontWeight: '600' },
  newRecordArrow: { width: 40, height: 40, borderRadius: caylikDesign.radius.pill, alignItems: 'center', justifyContent: 'center' },
  assistantCard: { minHeight: 116, marginTop: caylikDesign.spacing.sm, borderRadius: caylikDesign.radius.xl, borderWidth: 1, padding: caylikDesign.spacing.md, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm, overflow: 'hidden' },
  assistantDecorLarge: { position: 'absolute', width: 150, height: 150, borderRadius: caylikDesign.radius.pill, right: -58, top: -78, opacity: 0.12 },
  assistantDecorSmall: { position: 'absolute', width: 72, height: 72, borderRadius: caylikDesign.radius.pill, right: 36, bottom: -50, opacity: 0.12 },
  assistantIcon: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  assistantCopy: { flex: 1, minWidth: 0 },
  assistantEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.15 },
  assistantTitle: { marginTop: 5, fontSize: caylikDesign.type.bodyLarge, lineHeight: 21, fontWeight: '900' },
  assistantDetail: { marginTop: 4, fontSize: caylikDesign.type.caption, fontWeight: '700' },
  creditBadge: { minHeight: 34, borderRadius: caylikDesign.radius.pill, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  creditBadgeText: { fontSize: 11, fontWeight: '900' },
  assistantArrow: { width: 38, height: 38, borderRadius: caylikDesign.radius.pill, alignItems: 'center', justifyContent: 'center' },
  floatingAdd: { alignSelf: 'flex-end', minHeight: 48, marginTop: caylikDesign.spacing.md, marginBottom: caylikDesign.spacing.sm, borderRadius: caylikDesign.radius.pill, paddingHorizontal: caylikDesign.spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: caylikDesign.spacing.xs },
  floatingAddText: { fontSize: caylikDesign.type.body, fontWeight: '900' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
