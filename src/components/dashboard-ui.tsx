import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MD3Theme, useTheme } from 'react-native-paper';

import { caylikDesign } from '../context/app-theme';
import { AppIcon, AppIconName } from './app-icon';

type Tone = 'primary' | 'warning' | 'danger' | 'neutral';

const toneColors = (theme: MD3Theme, tone: Tone) => {
  if (tone === 'warning') return { background: theme.colors.secondaryContainer, foreground: theme.colors.onSecondaryContainer, icon: theme.colors.secondary };
  if (tone === 'danger') return { background: theme.colors.errorContainer, foreground: theme.colors.onErrorContainer, icon: theme.colors.error };
  if (tone === 'neutral') return { background: theme.colors.surfaceVariant, foreground: theme.colors.onSurface, icon: theme.colors.onSurfaceVariant };
  return { background: theme.colors.primaryContainer, foreground: theme.colors.onPrimaryContainer, icon: theme.colors.primary };
};

export function DashboardSectionHeader({ title, detail, actionLabel, onAction }: { title: string; detail?: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View style={ui.sectionHeader}>
      <View style={ui.sectionCopy}>
        <Text style={[ui.sectionTitle, { color: theme.colors.onBackground }]}>{title}</Text>
        {!!detail && <Text style={[ui.sectionDetail, { color: theme.colors.onSurfaceVariant }]}>{detail}</Text>}
      </View>
      {!!actionLabel && !!onAction && (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={8} onPress={onAction} style={({ pressed }) => [ui.sectionAction, pressed && ui.pressed]}>
          <Text style={[ui.sectionActionText, { color: theme.colors.primary }]}>{actionLabel}</Text>
          <AppIcon name="chevron-right" size={18} color={theme.colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

export function DashboardMetricCard({ label, value, icon, tone = 'primary', detail }: { label: string; value: string; icon: AppIconName; tone?: Tone; detail?: string }) {
  const theme = useTheme();
  const colors = toneColors(theme, tone);
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[ui.metricCard, caylikDesign.shadow.soft, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, shadowColor: theme.colors.shadow }]}>
      <View style={[ui.metricTop, { backgroundColor: colors.background }]}>
        <AppIcon name={icon} size={22} color={colors.icon} />
      </View>
      <Text style={[ui.metricLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7} style={[ui.metricValue, { color: tone === 'danger' || tone === 'warning' ? colors.icon : theme.colors.onSurface }]}>{value}</Text>
      {!!detail && <Text numberOfLines={1} style={[ui.metricDetail, { color: theme.colors.onSurfaceVariant }]}>{detail}</Text>}
    </View>
  );
}

export type MonthlyChartPoint = { label: string; value: number };

export function DashboardMonthlyChart({ data, unit = 'KG' }: { data: MonthlyChartPoint[]; unit?: string }) {
  const theme = useTheme();
  const maximum = Math.max(1, ...data.map((point) => point.value));
  return (
    <View style={[ui.chartCard, caylikDesign.shadow.soft, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, shadowColor: theme.colors.shadow }]}>
      <View style={ui.chartTopRow}>
        <View style={[ui.chartIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="chart-bar" size={21} color={theme.colors.primary} /></View>
        <Text style={[ui.chartHint, { color: theme.colors.onSurfaceVariant }]}>Çubuk yüksekliği aylık toplamı gösterir</Text>
      </View>
      <View style={ui.chartPlot}>
        {data.map((point) => {
          const height = point.value > 0 ? Math.max(8, Math.round((point.value / maximum) * 128)) : 4;
          return (
            <View key={point.label} accessible accessibilityLabel={`${point.label}: ${point.value.toLocaleString('tr-TR')} ${unit}`} style={ui.chartColumn}>
              <View style={[ui.chartTrack, { backgroundColor: theme.colors.surfaceVariant }]}>
                <View style={[ui.chartBar, { height, backgroundColor: theme.colors.primary }]} />
              </View>
              <Text style={[ui.chartLabel, { color: theme.colors.onSurfaceVariant }]}>{point.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={[ui.chartFooter, { borderTopColor: theme.colors.outlineVariant }]}>
        <Text style={[ui.chartFooterLabel, { color: theme.colors.onSurfaceVariant }]}>En yüksek ay</Text>
        <Text style={[ui.chartFooterValue, { color: theme.colors.onSurface }]}>{data.reduce((best, point) => point.value > best.value ? point : best, data[0] || { label: '-', value: 0 }).label} · {maximum === 1 && data.every((point) => point.value === 0) ? '0' : maximum.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} {unit}</Text>
      </View>
    </View>
  );
}

export function DashboardListRow({ icon, title, detail, value, status, tone = 'neutral', onPress, accessibilityLabel }: { icon: AppIconName; title: string; detail: string; value: string; status?: string; tone?: Tone; onPress?: () => void; accessibilityLabel: string }) {
  const theme = useTheme();
  const colors = toneColors(theme, tone);
  const content = (
    <>
      <View style={[ui.rowIcon, { backgroundColor: colors.background }]}><AppIcon name={icon} size={21} color={colors.icon} /></View>
      <View style={ui.rowCopy}>
        <Text numberOfLines={1} style={[ui.rowTitle, { color: theme.colors.onSurface }]}>{title}</Text>
        <Text numberOfLines={2} style={[ui.rowDetail, { color: theme.colors.onSurfaceVariant }]}>{detail}</Text>
        {!!status && <Text numberOfLines={1} style={[ui.rowStatus, { color: colors.foreground }]}>{status}</Text>}
      </View>
      <View style={ui.rowValueWrap}>
        <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.72} style={[ui.rowValue, { color: theme.colors.onSurface }]}>{value}</Text>
        {!!onPress && <AppIcon name="chevron-right" size={19} color={theme.colors.onSurfaceVariant} />}
      </View>
    </>
  );
  const rowStyle = [ui.listRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }];
  if (!onPress) return <View accessible accessibilityLabel={accessibilityLabel} style={rowStyle}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [rowStyle, pressed && ui.pressed]}>{content}</Pressable>;
}

export function DashboardEmptyState({ icon, text }: { icon: AppIconName; text: string }) {
  const theme = useTheme();
  return (
    <View style={[ui.empty, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
      <View style={[ui.emptyIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name={icon} size={22} color={theme.colors.primary} /></View>
      <Text style={[ui.emptyText, { color: theme.colors.onSurfaceVariant }]}>{text}</Text>
    </View>
  );
}

const ui = StyleSheet.create({
  sectionHeader: { marginTop: caylikDesign.spacing.xl, marginBottom: caylikDesign.spacing.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: caylikDesign.spacing.sm },
  sectionCopy: { flex: 1 },
  sectionTitle: { fontSize: caylikDesign.type.title, fontWeight: '900', letterSpacing: -0.35 },
  sectionDetail: { marginTop: 3, fontSize: caylikDesign.type.caption, lineHeight: 17, fontWeight: '600' },
  sectionAction: { minHeight: caylikDesign.touchTarget, paddingLeft: caylikDesign.spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sectionActionText: { fontSize: caylikDesign.type.body, fontWeight: '800' },
  metricCard: { flexGrow: 1, flexBasis: '47%', minWidth: 138, minHeight: 148, padding: caylikDesign.spacing.md, borderWidth: 1, borderRadius: caylikDesign.radius.xl },
  metricTop: { width: 42, height: 42, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: caylikDesign.spacing.sm },
  metricLabel: { fontSize: caylikDesign.type.caption, lineHeight: 16, fontWeight: '800' },
  metricValue: { marginTop: caylikDesign.spacing.xs, fontSize: 21, fontWeight: '900', letterSpacing: -0.45 },
  metricDetail: { marginTop: 5, fontSize: 11, fontWeight: '600' },
  chartCard: { borderWidth: 1, borderRadius: caylikDesign.radius.xl, paddingVertical: caylikDesign.spacing.lg, overflow: 'hidden' },
  chartTopRow: { paddingHorizontal: caylikDesign.spacing.md, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  chartIcon: { width: 38, height: 38, borderRadius: caylikDesign.radius.sm, alignItems: 'center', justifyContent: 'center' },
  chartHint: { flex: 1, fontSize: caylikDesign.type.caption, lineHeight: 17, fontWeight: '600' },
  chartPlot: { width: '100%', height: 170, paddingHorizontal: 6, paddingTop: caylikDesign.spacing.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  chartColumn: { flex: 1, minWidth: 0, alignItems: 'center' },
  chartTrack: { width: '46%', minWidth: 5, maxWidth: 13, height: 132, borderRadius: caylikDesign.radius.pill, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: caylikDesign.radius.pill },
  chartLabel: { marginTop: caylikDesign.spacing.xs, fontSize: 8, fontWeight: '800' },
  chartFooter: { marginTop: caylikDesign.spacing.md, paddingHorizontal: caylikDesign.spacing.md, paddingTop: caylikDesign.spacing.sm, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartFooterLabel: { fontSize: caylikDesign.type.caption, fontWeight: '700' },
  chartFooterValue: { fontSize: caylikDesign.type.body, fontWeight: '900' },
  listRow: { minHeight: 82, borderWidth: 1, borderRadius: caylikDesign.radius.lg, padding: caylikDesign.spacing.sm, marginBottom: caylikDesign.spacing.xs, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  rowIcon: { width: 42, height: 42, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: caylikDesign.type.bodyLarge, fontWeight: '900' },
  rowDetail: { marginTop: 3, fontSize: caylikDesign.type.caption, lineHeight: 17, fontWeight: '600' },
  rowStatus: { marginTop: 4, fontSize: 11, fontWeight: '900' },
  rowValueWrap: { maxWidth: '34%', flexDirection: 'row', alignItems: 'center', gap: 3 },
  rowValue: { flexShrink: 1, fontSize: caylikDesign.type.body, fontWeight: '900', textAlign: 'right' },
  empty: { minHeight: 80, borderWidth: 1, borderRadius: caylikDesign.radius.lg, padding: caylikDesign.spacing.md, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm },
  emptyIcon: { width: 42, height: 42, borderRadius: caylikDesign.radius.md, alignItems: 'center', justifyContent: 'center' },
  emptyText: { flex: 1, fontSize: caylikDesign.type.body, lineHeight: 20, fontWeight: '600' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
