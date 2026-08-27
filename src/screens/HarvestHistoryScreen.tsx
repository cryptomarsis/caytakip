import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleProp, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

import { styles } from '../styles/styles';
import { deductionTotalOf, formatDisplayDate, formatTL, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';
import { HarvestRecord } from '../types';

type Props = {
  harvests: HarvestRecord[];
  openHarvestEditModal: (harvest: HarvestRecord) => void;
  openPaymentForHarvest: (harvest: HarvestRecord) => void;
  handleDelete: (endpoint: string, id: string, title: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

const searchText = (harvest: HarvestRecord) => [
  harvest.firma,
  harvest.bahce || harvest.garden,
  harvest.tarih,
  harvest.surum,
  harvest.kg || harvest.weight,
  harvest.uretici || harvest.producerName,
].join(' ').toLocaleLowerCase('tr-TR');

const harvestDateValue = (value: unknown) => {
  const raw = String(value || '').trim();
  const turkishDate = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (turkishDate) {
    return new Date(Number(turkishDate[3]), Number(turkishDate[2]) - 1, Number(turkishDate[1])).getTime();
  }
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function HarvestHistoryScreen({
  harvests,
  openHarvestEditModal,
  openPaymentForHarvest,
  handleDelete,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
}: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'open' | 'paid'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    return harvests
      .filter((harvest) => !normalized || searchText(harvest).includes(normalized))
      .filter((harvest) => {
        const remaining = remainingTotalOf(harvest);
        return paymentFilter === 'all' || (paymentFilter === 'open' ? remaining > 0.01 : remaining <= 0.01);
      })
      .slice()
      .sort((left, right) => {
        const difference = harvestDateValue(right.tarih) - harvestDateValue(left.tarih);
        return sortOrder === 'newest' ? difference : -difference;
      });
  }, [harvests, paymentFilter, query, sortOrder]);

  const header = (
    <View>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Hasat Geçmişi</Text>
      <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>
        Eski kayıtları firma, bahçe, tarih veya kilo yazarak bulun. Her kaydı buradan düzenleyebilirsiniz.
      </Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
        value={query}
        onChangeText={setQuery}
        placeholder="Örn: ÇAYKUR, Arka Bahçe, 12.08.2026"
        placeholderTextColor={theme.colors.onSurfaceVariant}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {([
          ['all', 'Tümü'],
          ['open', 'Ödeme bekleyen'],
          ['paid', 'Ödenen'],
        ] as const).map(([value, label]) => {
          const active = paymentFilter === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setPaymentFilter(value)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: active ? theme.colors.primary : theme.colors.surfaceVariant }}
            >
              <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 13 }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setSortOrder((current) => current === 'newest' ? 'oldest' : 'newest')}
          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.colors.surfaceVariant }}
        >
          <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 13 }}>
            {sortOrder === 'newest' ? 'En yeni önce' : 'En eski önce'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.historyCount, { color: theme.colors.onSurfaceVariant }]}>{filtered.length} kayıt gösteriliyor</Text>
    </View>
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(harvest) => String(harvest._id)}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Aramanıza uygun hasat kaydı bulunamadı.</Text>}
      renderItem={({ item: harvest }) => {
        const gross = grossTotalOf(harvest);
        const deduction = deductionTotalOf(harvest);
        const net = netTotalOf(harvest);
        const paid = Number(harvest.tahsilat) || 0;
        const remaining = remainingTotalOf(harvest);
        return (
          <View style={[styles.listItem, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outline }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>
                {harvest.firma || 'Firma belirtilmedi'} · {harvest.surum || 'Sürüm belirtilmedi'}
              </Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>
                {formatDisplayDate(harvest.tarih)} · {harvest.kg || harvest.weight || 0} KG · {harvest.fiyat || 0} TL/KG
              </Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Bahçe: {harvest.bahce || harvest.garden || 'Belirtilmedi'}</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Brüt: {formatTL(gross)} · %2 kesinti: {formatTL(deduction)}</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Net: {formatTL(net)} · Ödenen: {formatTL(paid)}</Text>
              <Text style={[styles.historyRemaining, { color: remaining > 0.01 ? theme.colors.error : theme.colors.primary }]}>
                {remaining > 0.01 ? 'Kalan alacak: ' + formatTL(remaining) : 'Ödeme tamamlandı'}
              </Text>
            </View>
            <View style={styles.historyActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => openHarvestEditModal(harvest)}><Text style={styles.actionBtnText}>Düzenle</Text></TouchableOpacity>
              {remaining > 0.01 && <TouchableOpacity style={styles.historyPayBtn} onPress={() => openPaymentForHarvest(harvest)}><Text style={styles.actionBtnText}>Ödeme</Text></TouchableOpacity>}
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('harvests', harvest._id, 'Hasat')}><Text style={styles.actionBtnText}>Sil</Text></TouchableOpacity>
            </View>
          </View>
        );
      }}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} /> : undefined}
    />
  );
}