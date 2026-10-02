import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { CaylikButton, CaylikSurface } from './caylik-ui';
import { SeasonSummary } from './season-summary';
import { DashboardMonthlyChart, DashboardSectionHeader } from './dashboard-ui';
import type { HarvestRecord } from '../types';
import { formatDisplayDate, formatTL, remainingTotalOf } from '../utils/format';
import SharedPaymentHistory from './SharedPaymentHistory';
import { sharedAccountHtml, sharedPeriod } from '../utils/sharedAccountReport';
import { shareAccountPdf } from '../services/shareAccountPdf';

export default function SharedAccountPanel({ rows, onCollect, reportTitle }: { rows: HarvestRecord[]; onCollect?: (row: HarvestRecord) => void; reportTitle?: string }) {
  const theme = useTheme();
  const years = [...new Set([new Date().getFullYear(), ...rows.map(r => Number(String(r.tarih).slice(0, 4))).filter(Number.isFinite)])].sort((a, b) => b - a);
  const [year, setYear] = useState(new Date().getFullYear());
  const [season, setSeason] = useState('');
  const [exporting, setExporting] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), exportLock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const seasons = [...new Set(rows.filter(r => String(r.tarih).startsWith(`${year}-`)).map(r => r.surum || 'Belirtilmedi'))].sort();
  const { selected, totals, previousRemaining, months: values } = sharedPeriod(rows, year, season);
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const points = months.map((label, index) => ({ label, value: values[index] }));
  const pending = [...selected].filter(row => remainingTotalOf(row) > 0.01).sort((a, b) => String(a.vadeTarihi || '9999').localeCompare(String(b.vadeTarihi || '9999')));
  const share = async () => {
    if (!reportTitle || exportLock.current) return;
    exportLock.current = true; setExporting(true); setError('');
    try { await shareAccountPdf(sharedAccountHtml(rows, reportTitle, year, season), () => alive.current); }
    catch { if (alive.current) setError('Hesap özeti paylaşılamadı. Tekrar deneyin.'); }
    finally { exportLock.current = false; if (alive.current) setExporting(false); }
  };
  return <View style={{ gap: 12 }}>
    <View style={styles.filters}>
      <Text style={[styles.filterLabel, { color: theme.colors.onSurfaceVariant }]}>Dönem</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{years.map(y => <CaylikButton key={y} size="compact" selected={year === y} style={styles.filter} mode={year === y ? 'contained' : 'outlined'} onPress={() => { setYear(y); setSeason(''); }}>{String(y)}</CaylikButton>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{['', ...seasons].map(s => <CaylikButton key={s} size="compact" selected={season === s} style={styles.filter} mode={season === s ? 'contained' : 'outlined'} onPress={() => setSeason(s)}>{s || 'Tüm sürgünler'}</CaylikButton>)}</ScrollView>
    </View>
    <SeasonSummary kg={totals.kg} sales={totals.net} paid={totals.paid} remaining={totals.remaining} />
    {previousRemaining > 0 && <Text style={{ color: theme.colors.onSurfaceVariant }}>Önceki yıllardan kalan: {formatTL(previousRemaining)} · Bu döneme dahil değil.</Text>}
    {!!reportTitle && <CaylikButton size="compact" mode="outlined" icon="share-variant-outline" disabled={exporting} onPress={() => void share()}>{exporting ? 'Hazırlanıyor…' : 'Hesap özetini paylaş (PDF)'}</CaylikButton>}
    {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text>}
    <Text style={{ color: theme.colors.onSurfaceVariant }}>KG ortak teslimattır. Tutarlar %2 kesinti sonrası yalnızca sizin payınız ve kendi tahsilatınızdır.</Text>
    {rows.some(row => Number(row.legacySharedCollection) > 0) && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>Eski toplam tahsilatı olan kayıtlar var. Bu tutarlar henüz paylaştırılmadı; aşağıdaki teslimatlardan inceleyin. Kalan alacak bu eski tahsilatları içermiyor.</Text>}
    <DashboardSectionHeader title="Aylık hasat" detail={`${year} · Ortak teslimat KG`} />
    <DashboardMonthlyChart data={points} />
    <DashboardSectionHeader title="Alacaklarım" detail="Yalnızca kendi payınız" />
    {!pending.length && <Text style={{ color: theme.colors.onSurfaceVariant }}>Açık alacağınız yok.</Text>}
    {pending.slice(0, 5).map(row => <CaylikSurface key={row._id} style={{ padding: 16, gap: 6 }}>
      <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>{row.firma} · {row.sharedPartner}</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>{row.kg} kg · {row.vadeTarihi ? `Vade: ${formatDisplayDate(row.vadeTarihi)}` : formatDisplayDate(row.tarih)}</Text>
      <Text style={{ color: theme.colors.primary, fontSize: 22, fontWeight: '700' }}>{formatTL(remainingTotalOf(row))}</Text>
      <CaylikButton size="compact" style={styles.collection} mode="outlined" onPress={() => onCollect?.(row)} disabled={Number(row.legacySharedCollection) > 0}>Payım için ödeme al</CaylikButton>
    </CaylikSurface>)}
    {pending.length > 5 && <Text style={{ color: theme.colors.onSurfaceVariant }}>Diğer {pending.length - 5} kayıt Alacaklar ve Ödeme Al ekranlarında.</Text>}
    <SharedPaymentHistory rows={selected} />
  </View>;
}

const styles = StyleSheet.create({
  filters: { gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  filterRow: { gap: 8, paddingVertical: 2 },
  filter: { minWidth: 72, flexShrink: 0, borderRadius: 14 },
  collection: { marginTop: 6 },
});
