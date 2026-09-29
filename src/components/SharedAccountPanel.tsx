import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { CaylikButton, CaylikSurface } from './caylik-ui';
import { SeasonSummary } from './season-summary';
import { DashboardMonthlyChart, DashboardSectionHeader } from './dashboard-ui';
import type { HarvestRecord } from '../types';
import { formatDisplayDate, formatTL, netTotalOf, remainingTotalOf } from '../utils/format';

export default function SharedAccountPanel({ rows, onCollect }: { rows: HarvestRecord[]; onCollect?: (row: HarvestRecord) => void }) {
  const theme = useTheme();
  const totals = rows.reduce((sum, row) => ({ kg: sum.kg + Number(row.kg || 0), sales: sum.sales + netTotalOf(row), paid: sum.paid + Number(row.tahsilat || 0), remaining: sum.remaining + remainingTotalOf(row) }), { kg: 0, sales: 0, paid: 0, remaining: 0 });
  const year = rows.reduce((latest, row) => Math.max(latest, Number(String(row.tarih).slice(0, 4)) || 0), 0) || new Date().getFullYear();
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const points = months.map((label, index) => ({ label, value: rows.filter(row => String(row.tarih).startsWith(`${year}-${String(index + 1).padStart(2, '0')}-`)).reduce((n, row) => n + Number(row.kg || 0), 0) }));
  const pending = [...rows].filter(row => remainingTotalOf(row) > 0.01).sort((a, b) => String(a.vadeTarihi || '9999').localeCompare(String(b.vadeTarihi || '9999')));
  return <View style={{ gap: 12 }}>
    <SeasonSummary kg={totals.kg} sales={totals.sales} paid={totals.paid} remaining={totals.remaining} />
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
      <CaylikButton mode="outlined" onPress={() => onCollect?.(row)} disabled={Number(row.legacySharedCollection) > 0}>Payım için ödeme al</CaylikButton>
    </CaylikSurface>)}
    {pending.length > 5 && <Text style={{ color: theme.colors.onSurfaceVariant }}>Diğer {pending.length - 5} kayıt Alacaklar ve Ödeme Al ekranlarında.</Text>}
  </View>;
}
