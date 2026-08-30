import React, { useMemo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '../components/app-icon';
import {
  DashboardEmptyState,
  DashboardListRow,
  DashboardMetricCard,
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
        <Text style={[local.assistantEyebrow, { color: theme.colors.tertiary }]}>ÇAYLIK ASİSTANI</Text>
        <Text style={[local.assistantTitle, { color: theme.colors.onTertiaryContainer }]}>Çayla ilgili sorun, birlikte çözelim</Text>
        <Text style={[local.assistantDetail, { color: theme.colors.onSurfaceVariant }]}>{credits === null || credits === undefined ? 'Asistana soru sorun' : `${credits.toLocaleString('tr-TR')} krediniz kullanılabilir`}</Text>
      </View>
      <View style={[local.assistantArrow, { backgroundColor: theme.colors.tertiary }]}><AppIcon name="arrow-right" size={20} color={theme.colors.onTertiary} /></View>
    </Pressable>
  );
}

export default function DashboardScreen({
  ads,
  harvests,
  userName,
  assistantCredits,
  totalKg,
  totalSales,
  totalPay,
  pendingCollection,
  totalExp,
  netProfit,
  openPaymentForHarvest,
  openHarvestEditModal,
  onNavigate,
}: DashboardProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 370;
  const firstName = String(userName || '').trim().split(/\s+/)[0] || 'Üretici';

  const recentHarvests = useMemo(() => [...harvests]
    .sort((left, right) => dateTimestamp(right.tarih) - dateTimestamp(left.tarih))
    .slice(0, 3), [harvests]);

  const upcomingReceivables = useMemo(() => harvests
    .filter((item) => remainingTotalOf(item) > 0.01 && dateTimestamp(item.vadeTarihi) > 0)
    .sort((left, right) => dateTimestamp(left.vadeTarihi) - dateTimestamp(right.vadeTarihi))
    .slice(0, 3), [harvests]);

  const monthlyChart = useMemo((): { year: number; points: MonthlyChartPoint[] } => {
    const dated = harvests.map((item) => ({ item, timestamp: dateTimestamp(item.tarih) })).filter((row) => row.timestamp > 0);
    const year = dated.length ? Math.max(...dated.map((row) => new Date(row.timestamp).getFullYear())) : new Date().getFullYear();
    const totals = Array.from({ length: 12 }, () => 0);
    dated.forEach(({ item, timestamp }) => {
      const date = new Date(timestamp);
      if (date.getFullYear() === year) totals[date.getMonth()] += Number(item.kg ?? item.weight) || 0;
    });
    return { year, points: totals.map((value, index) => ({ label: MONTH_NAMES[index], value })) };
  }, [harvests]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const pendingCount = harvests.filter((item) => remainingTotalOf(item) > 0.01).length;
  return (
    <View style={[local.screen, { maxWidth: caylikDesign.contentMaxWidth }]}>
      <View style={local.welcomeRow}>
        <View style={local.welcomeCopy}>
          <Text style={[local.welcomeEyebrow, { color: theme.colors.primary }]}>ÇAYLIK · SEZON TAKİBİ</Text>
          <Text style={[local.welcomeTitle, { color: theme.colors.onBackground }]}>Merhaba, {firstName}</Text>
          <Text style={[local.welcomeDetail, { color: theme.colors.onSurfaceVariant }]}>{pendingCollection > 0 ? `${pendingCount} kayıtta tahsilat bekliyor.` : 'Kayıtlarınız güncel görünüyor.'}</Text>
        </View>
      </View>

      {ads.filter((ad) => ad.slot === 'dashboard_top').slice(0, 1).map((ad, index) => <SponsorBanner key={ad._id || index} ad={ad} />)}

      <View style={[local.hero, caylikDesign.shadow.soft, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.shadow }]}>
        <View pointerEvents="none" style={[local.heroDecor, { backgroundColor: theme.colors.primaryContainer }]} />
        <View style={local.heroTop}>
          <View style={[local.heroIcon, { backgroundColor: theme.colors.onPrimary }]}><AppIcon name="scale" size={24} color={theme.colors.primary} /></View>
          <Text style={[local.heroSeason, { color: theme.colors.onPrimary }]}>Toplam teslim edilen çay</Text>
        </View>
        <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.65} style={[local.heroValue, { color: theme.colors.onPrimary }]}>{totalKg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} KG</Text>
        <Text style={[local.heroHint, { color: theme.colors.onPrimary }]}>Tüm hasat kayıtlarınızdaki net kilogram toplamı</Text>
      </View>

      <View style={local.metricsGrid}>
        <DashboardMetricCard label="Toplam kazanç" value={formatTL(totalSales)} icon="finance" detail="Net satış toplamı" />
        <DashboardMetricCard label="Tahsil edilen" value={formatTL(totalPay)} icon="hand-coin-outline" tone="neutral" detail="Kaydedilen ödemeler" />
        <DashboardMetricCard label="Kalan alacak" value={formatTL(pendingCollection)} icon="wallet-bifold-outline" tone={pendingCollection > 0 ? 'warning' : 'primary'} detail={`${pendingCount} açık kayıt`} />
        <DashboardMetricCard label="Tahmini net kazanç" value={formatTL(netProfit)} icon="chart-areaspline" tone={netProfit < 0 ? 'danger' : 'primary'} detail={`Gider: ${formatTL(totalExp)}`} />
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Hızlı yeni hasat kaydı oluştur" onPress={() => onNavigate('harvest')} style={({ pressed }) => [local.newRecordButton, caylikDesign.shadow.soft, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, shadowColor: theme.colors.shadow }, pressed && local.pressed]}>
        <View style={[local.newRecordIcon, { backgroundColor: theme.colors.secondaryContainer }]}><AppIcon name="leaf-circle-outline" size={27} color={theme.colors.secondary} /></View>
        <View style={local.newRecordCopy}>
          <Text style={[local.newRecordTitle, { color: theme.colors.onSurface }]}>Yeni hasat kaydı</Text>
          <Text style={[local.newRecordDetail, { color: theme.colors.onSurfaceVariant }]}>Kilo, firma ve fiyat bilgilerini ekleyin</Text>
        </View>
        <View style={[local.newRecordArrow, { backgroundColor: theme.colors.primary }]}><AppIcon name="plus" size={21} color={theme.colors.onPrimary} /></View>
      </Pressable>

      <AssistantEntry credits={assistantCredits} onPress={() => onNavigate('assistant')} />

      <DashboardSectionHeader title="Aylık hasat" detail={`${monthlyChart.year} yılı kilogram dağılımı`} actionLabel="Raporlar" onAction={() => onNavigate('reports')} />
      <DashboardMonthlyChart data={monthlyChart.points} />

      <DashboardSectionHeader title="Yaklaşan tahsilatlar" detail="Vade tarihi yaklaşan ve geçen kayıtlar" actionLabel="Tümünü gör" onAction={() => onNavigate('receivables')} />
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

      <DashboardSectionHeader title="Son teslimatlar" detail="En son eklenen hasat kayıtları" actionLabel="Tümünü gör" onAction={() => onNavigate('history')} />
      {recentHarvests.length === 0 ? (
        <DashboardEmptyState icon="leaf-off" text="Henüz teslimat kaydı bulunmuyor. İlk kaydınızı Yeni hasat kaydı düğmesinden oluşturabilirsiniz." />
      ) : recentHarvests.map((item, index) => {
        const remaining = remainingTotalOf(item);
        const company = String(item.firma || item.uretici || item.producerName || 'Firma belirtilmedi');
        const kg = Number(item.kg ?? item.weight) || 0;
        return (
          <DashboardListRow
            key={item._id || index}
            icon="leaf"
            title={company}
            detail={`${formatDisplayDate(item.tarih)} · ${item.surum || '1. Sürüm'} · ${formatTL(netTotalOf(item))}`}
            value={`${kg.toLocaleString('tr-TR')} KG`}
            status={remaining > 0.01 ? `Kalan: ${formatTL(remaining)}` : 'Tahsilat tamamlandı'}
            tone={remaining > 0.01 ? 'warning' : 'primary'}
            onPress={() => openHarvestEditModal(item)}
            accessibilityLabel={`${company}, ${kg.toLocaleString('tr-TR')} kilogram, ${formatDisplayDate(item.tarih)}`}
          />
        );
      })}

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
  assistantArrow: { width: 38, height: 38, borderRadius: caylikDesign.radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
