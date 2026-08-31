import React, { useMemo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '../components/app-icon';
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

type DashboardDestination = 'assistant' | 'harvest' | 'history' | 'collections' | 'receivables' | 'expense' | 'prices' | 'reports';

type DashboardProps = {
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
  return /^https?:\/\/\S+$/i.test(url) ? url : '';
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

function SponsorBanner({ ad }: { ad: AdRecord }) {
  const theme = useTheme();
  const imageUrl = imageUrlOf(ad.gorselUrl);
  const actionUrl = actionUrlOf(ad);
  const title = String(ad.baslik || ad.firma || 'Çaylık duyurusu').trim();
  const firm = String(ad.firma || '').trim();
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
        {!!firm && <Text numberOfLines={1} style={[local.bannerDetail, { color: theme.colors.onSurfaceVariant }]}>{firm}</Text>}
      </View>
      {!!actionUrl && <AppIcon name="arrow-top-right" size={20} color={theme.colors.primary} />}
    </>
  );
  const style = [local.banner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }];
  if (!actionUrl) return <View style={style}>{content}</View>;
  return <Pressable accessibilityRole="link" accessibilityLabel={`${title} bağlantısını aç`} onPress={() => void Linking.openURL(actionUrl).catch(() => undefined)} style={({ pressed }) => [style, pressed && local.pressed]}>{content}</Pressable>;
}

function AssistantEntry({ credits, onPress }: { credits?: number | null; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Çaylık yapay zeka asistanını aç" onPress={onPress} style={({ pressed }) => [local.assistantCard, caylikDesign.shadow.soft, { backgroundColor: theme.colors.tertiaryContainer, borderColor: theme.colors.tertiary, shadowColor: theme.colors.shadow }, pressed && local.pressed]}>
      <View pointerEvents="none" style={[local.assistantDecorLarge, { backgroundColor: theme.colors.tertiary }]} />
      <View pointerEvents="none" style={[local.assistantDecorSmall, { backgroundColor: theme.colors.primary }]} />
      <View style={[local.assistantIcon, { backgroundColor: theme.colors.surface }]}><AppIcon name="robot-happy-outline" size={29} color={theme.colors.tertiary} /></View>
      <View style={local.assistantCopy}>
        <Text style={[local.assistantEyebrow, { color: theme.colors.tertiary }]}>YAPAY ZEKÂ DESTEĞİ</Text>
        <Text style={[local.assistantTitle, { color: theme.colors.onTertiaryContainer }]}>Çaylık Asistan</Text>
        <Text style={[local.assistantDetail, { color: theme.colors.onSurfaceVariant }]}>Çayınız ve kayıtlarınız hakkında sorun</Text>
      </View>
      {credits !== null && credits !== undefined && <View style={[local.creditBadge, { backgroundColor: theme.colors.primaryContainer }]}><Text style={[local.creditBadgeText, { color: theme.colors.onPrimaryContainer }]}>{credits.toLocaleString('tr-TR')} kredi</Text></View>}
      <View style={[local.assistantArrow, { backgroundColor: theme.colors.tertiary }]}><AppIcon name="arrow-right" size={20} color={theme.colors.onTertiary} /></View>
    </Pressable>
  );
}

export default function DashboardScreen({
  ads,
  harvests,
  assistantCredits,
  totalKg,
  totalPay,
  pendingCollection,
  netProfit,
  openPaymentForHarvest,
  openHarvestEditModal,
  onNavigate,
}: DashboardProps) {
  const theme = useTheme();
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
    const months = Array.from({ length: 6 }, (_, index) => new Date(year, latestDate.getMonth() - 5 + index, 1));
    const totals = Array.from({ length: 6 }, () => 0);
    dated.forEach(({ item, timestamp }) => {
      const date = new Date(timestamp);
      const index = months.findIndex((month) => month.getFullYear() === date.getFullYear() && month.getMonth() === date.getMonth());
      if (index >= 0) totals[index] += Number(item.kg ?? item.weight) || 0;
    });
    return { year, points: totals.map((value, index) => ({ label: MONTH_NAMES[months[index].getMonth()], value })) };
  }, [harvests]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const pendingCount = harvests.filter((item) => remainingTotalOf(item) > 0.01).length;
  return (
    <View style={[local.screen, { maxWidth: caylikDesign.contentMaxWidth }]}>
      {ads.filter((ad) => ad.slot === 'dashboard_top').slice(0, 1).map((ad, index) => <SponsorBanner key={ad._id || index} ad={ad} />)}

      <View style={[local.summaryCard, caylikDesign.shadow.soft, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, shadowColor: theme.colors.shadow }]}>
        <View style={local.summaryHeader}><View style={[local.summaryIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="leaf" size={21} color={theme.colors.primary} /></View><Text style={[local.summaryTitle, { color: theme.colors.onSurface }]}>Bugünkü çay durumunuz</Text></View>
        <View style={local.primaryMetrics}>
          <View style={local.primaryMetric}><Text style={[local.primaryLabel, { color: theme.colors.onSurfaceVariant }]}>Toplam Hasat</Text><Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.65} style={[local.primaryValue, { color: theme.colors.primary }]}>{totalKg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} KG</Text></View>
          <View style={[local.primaryMetric, local.primaryMetricBorder, { borderLeftColor: theme.colors.outlineVariant }]}><Text style={[local.primaryLabel, { color: theme.colors.onSurfaceVariant }]}>Kalan Alacak</Text><Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6} style={[local.primaryValue, { color: pendingCollection > 0 ? theme.colors.error : theme.colors.primary }]}>{formatTL(pendingCollection)}</Text></View>
        </View>
        <View style={[local.secondaryMetrics, { borderTopColor: theme.colors.outlineVariant }]}>
          <View style={local.secondaryMetric}><AppIcon name="finance" size={21} color={theme.colors.primary} /><View><Text style={[local.secondaryLabel, { color: theme.colors.onSurfaceVariant }]}>Net Kazanç</Text><Text style={[local.secondaryValue, { color: netProfit < 0 ? theme.colors.error : theme.colors.onSurface }]}>{formatTL(netProfit)}</Text></View></View>
          <View style={local.secondaryMetric}><AppIcon name="hand-coin-outline" size={21} color={theme.colors.secondary} /><View><Text style={[local.secondaryLabel, { color: theme.colors.onSurfaceVariant }]}>Tahsil Edilen</Text><Text style={[local.secondaryValue, { color: theme.colors.onSurface }]}>{formatTL(totalPay)}</Text></View></View>
        </View>
      </View>

      <AssistantEntry credits={assistantCredits} onPress={() => onNavigate('assistant')} />

      <DashboardSectionHeader title="Son teslimatlar" detail="En son eklenen hasat kayıtları" actionLabel="Tümünü gör" onAction={() => onNavigate('history')} />
      {recentHarvests.length === 0 ? <DashboardEmptyState icon="leaf-off" text="Henüz teslimat kaydı bulunmuyor." /> : recentHarvests.map((item, index) => {
        const company = String(item.firma || item.uretici || item.producerName || 'Firma belirtilmedi'); const kg = Number(item.kg ?? item.weight) || 0;
        return <DashboardListRow key={item._id || index} icon="leaf" title={company} detail={`${formatDisplayDate(item.tarih)} · ${formatTL(netTotalOf(item))}`} value={`${kg.toLocaleString('tr-TR')} KG`} status={remainingTotalOf(item) > 0.01 ? `Kalan: ${formatTL(remainingTotalOf(item))}` : 'Tahsilat tamamlandı'} tone={remainingTotalOf(item) > 0.01 ? 'warning' : 'primary'} onPress={() => openHarvestEditModal(item)} accessibilityLabel={`${company}, ${kg.toLocaleString('tr-TR')} kilogram`} />;
      })}

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

      <DashboardSectionHeader title="Aylık hasat" detail="Son altı ayın kilogram dağılımı" actionLabel="Raporlar" onAction={() => onNavigate('reports')} />
      <DashboardMonthlyChart data={monthlyChart.points} />

      <Pressable accessibilityRole="button" accessibilityLabel="Yeni hasat kaydı oluştur" onPress={() => onNavigate('harvest')} style={({ pressed }) => [local.floatingAdd, caylikDesign.shadow.soft, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.shadow }, pressed && local.pressed]}><AppIcon name="plus" size={24} color={theme.colors.onPrimary} /><Text style={[local.floatingAddText, { color: theme.colors.onPrimary }]}>Yeni Hasat</Text></Pressable>

      {ads.filter((ad) => ad.slot === 'dashboard_middle').slice(0, 1).map((ad, index) => <SponsorBanner key={ad._id || index} ad={ad} />)}
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
  primaryMetrics: { flexDirection: 'row', gap: caylikDesign.spacing.sm },
  primaryMetric: { flex: 1, minWidth: 0, paddingVertical: caylikDesign.spacing.sm },
  primaryMetricBorder: { borderLeftWidth: 1, paddingLeft: caylikDesign.spacing.md },
  primaryLabel: { fontSize: caylikDesign.type.caption, fontWeight: '800' },
  primaryValue: { marginTop: caylikDesign.spacing.xs, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  secondaryMetrics: { borderTopWidth: 1, marginTop: caylikDesign.spacing.sm, paddingTop: caylikDesign.spacing.md, flexDirection: 'row', gap: caylikDesign.spacing.sm },
  secondaryMetric: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.xs },
  secondaryLabel: { fontSize: 10, fontWeight: '800' },
  secondaryValue: { marginTop: 2, fontSize: 14, fontWeight: '900' },
  banner: { minHeight: 88, borderRadius: caylikDesign.radius.lg, borderWidth: 1, padding: caylikDesign.spacing.sm, marginBottom: caylikDesign.spacing.md, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  bannerImage: { width: 64, height: 64, borderRadius: caylikDesign.radius.md },
  bannerMark: { width: 52, height: 52, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center' },
  bannerCopy: { flex: 1 },
  bannerEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  bannerTitle: { marginTop: 3, fontSize: caylikDesign.type.bodyLarge, lineHeight: 20, fontWeight: '900' },
  bannerDetail: { marginTop: 3, fontSize: caylikDesign.type.caption, fontWeight: '600' },
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
