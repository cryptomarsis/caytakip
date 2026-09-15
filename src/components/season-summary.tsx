import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppIcon, type AppIconName } from './app-icon';
import { caylikDesign } from '../context/app-theme';
import { formatTL } from '../utils/format';

export function SeasonSummary({ kg, sales, paid, remaining }: { kg: number; sales: number; paid: number; remaining: number }) {
  const theme = useTheme();
  const metrics: { label: string; value: string; icon: AppIconName }[] = [
    { label: 'Toplam hasat', value: `${kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`, icon: 'basket-outline' },
    { label: 'Kalan alacak', value: formatTL(remaining), icon: 'cash-multiple' },
    { label: 'Net satış', value: formatTL(sales), icon: 'leaf' },
    { label: 'Tahsil edilen', value: formatTL(paid), icon: 'wallet-outline' },
  ];
  return <View style={[ui.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
    {[0, 2].map(offset => <View key={offset} style={[ui.row, offset === 2 && { borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }]}>
      {metrics.slice(offset, offset + 2).map((metric, index) => <View key={metric.label} style={[ui.metric, index === 1 && { borderLeftWidth: 1, borderLeftColor: theme.colors.outlineVariant }]}>
        <AppIcon name={metric.icon} size={28} color={offset === 0 && index === 1 ? theme.colors.secondary : theme.colors.primary} />
        <View style={ui.copy}><Text style={[ui.label, { color: theme.colors.onSurfaceVariant }]}>{metric.label}</Text><Text style={[ui.value, { color: theme.colors.onSurface }]}>{metric.value}</Text></View>
      </View>)}
    </View>)}
  </View>;
}
const ui = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: caylikDesign.radius.lg, paddingHorizontal: caylikDesign.spacing.sm, ...caylikDesign.shadow.soft },
  row: { flexDirection: 'row', paddingVertical: caylikDesign.spacing.lg },
  metric: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: caylikDesign.spacing.xs, gap: caylikDesign.spacing.xs },
  copy: { flex: 1, minWidth: 0 },
  label: { fontSize: caylikDesign.type.caption, marginBottom: caylikDesign.spacing.xs },
  value: { fontSize: caylikDesign.type.title, fontFamily: caylikDesign.font.editorial, fontWeight: '700' },
});
