import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { caylikDesign } from '../context/app-theme';
import type { HarvestRecord } from '../types/records';
import { deductionTotalOf, formatDisplayDate, formatTL, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';
import { AppIcon } from './app-icon';
import { CaylikButton } from './caylik-ui';

/** Presentation only; balances remain calculated by the shared accounting helpers. */
export function ReceivableCard({ item, days, onPayment }: { item: HarvestRecord; days: number | null; onPayment?: (item: HarvestRecord) => void }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const status = days === null ? 'Vade belirtilmedi' : days < 0 ? `${Math.abs(days)} gün gecikti` : days === 0 ? 'Vadesi bugün' : `${days} gün kaldı`;
  const details = [
    ['Brüt satış', formatTL(grossTotalOf(item))],
    ['Kesinti', formatTL(deductionTotalOf(item))],
    [item.sharedDeliveryId ? 'Net satıştan payınız' : 'Net alacak', formatTL(netTotalOf(item))],
    ['Tahsil edilen', formatTL(Number(item.tahsilat) || 0)],
  ];
  return <View style={[ui.card, { borderTopColor: theme.colors.outlineVariant }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${item.firma || 'Firma belirtilmedi'}, ${status}, ayrıntılar`} onPress={() => setExpanded(value => !value)} style={ui.heading}>
      <View style={[ui.icon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="factory" size={22} color={theme.colors.primary} /></View>
      <View style={ui.copy}>
        <Text style={[ui.title, { color: theme.colors.onSurface }]}>{item.firma || 'Firma belirtilmedi'}</Text>
        <Text style={[ui.caption, { color: theme.colors.onSurfaceVariant }]}>Vade: {formatDisplayDate(item.vadeTarihi)}</Text>
      </View>
      <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.colors.onSurfaceVariant} />
    </Pressable>
    <View style={ui.balanceRow}>
      <Text style={[ui.amount, { color: theme.colors.primary }]}>{formatTL(remainingTotalOf(item))}</Text>
      <Text style={[ui.caption, { color: days !== null && days < 0 ? theme.colors.error : theme.colors.secondary }]}>{status}</Text>
    </View>
    {item.sharedDeliveryId && <Text style={[ui.caption, { color: theme.colors.onSurfaceVariant }]}>{item.sharedPartner} · Kendi payınızın kalan alacağı</Text>}
    {!!item.legacySharedCollection && <Text style={[ui.caption, { color: theme.colors.error }]}>Eski tahsilatın aktarımı Pay Takibi’nde onay bekliyor.</Text>}
    {expanded && <View style={[ui.details, { backgroundColor: theme.colors.surfaceVariant }]}>
      <Text style={[ui.caption, { color: theme.colors.onSurfaceVariant }]}>Teslimat: {formatDisplayDate(item.tarih)} · {item.kg || item.weight || 0} KG · {formatTL(Number(item.fiyat) || 0)} / KG</Text>
      {details.map(([label, value]) => <View key={label} style={ui.detailRow}><Text style={[ui.caption, ui.copy, { color: theme.colors.onSurfaceVariant }]}>{label}</Text><Text style={[ui.caption, { color: theme.colors.onSurface }]}>{value}</Text></View>)}
      {!!item.aciklama && <Text style={[ui.caption, { color: theme.colors.onSurfaceVariant }]}>{item.aciklama}</Text>}
    </View>}
    {!!onPayment && <CaylikButton mode="outlined" icon="hand-coin-outline" disabled={Boolean(item.legacySharedCollection)} onPress={() => onPayment(item)} style={ui.payment}>Ödeme al</CaylikButton>}
  </View>;
}

const ui = StyleSheet.create({
  card: { borderTopWidth: 1, paddingVertical: caylikDesign.spacing.md, gap: caylikDesign.spacing.sm },
  heading: { minHeight: caylikDesign.touchTarget, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  icon: { width: 44, height: 44, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: caylikDesign.type.bodyLarge, fontWeight: '600' },
  caption: { fontSize: caylikDesign.type.body, lineHeight: 21 },
  balanceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: caylikDesign.spacing.sm },
  amount: { fontFamily: caylikDesign.font.editorial, fontSize: caylikDesign.type.title, fontWeight: '700', flexShrink: 1 },
  details: { borderRadius: caylikDesign.radius.md, padding: caylikDesign.spacing.md, gap: caylikDesign.spacing.sm },
  detailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: caylikDesign.spacing.sm },
  payment: { alignSelf: 'flex-start', minHeight: caylikDesign.touchTarget },
});
