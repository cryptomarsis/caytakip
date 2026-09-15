import React, { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import type { ExpenseRecord, HarvestRecord, PaymentRecord } from '../types';
import { buildTimeline } from '../utils/transactionTimeline';
import { CaylikButton, CaylikScreenHeader, CaylikSurface } from './caylik-ui';

export default function TransactionTimeline({ harvests, payments, expenses, onBack, onRefresh, refreshing = false }: { harvests: HarvestRecord[]; payments: PaymentRecord[]; expenses: ExpenseRecord[]; onBack: () => void; onRefresh?: () => void; refreshing?: boolean }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const items = useMemo(() => buildTimeline(harvests, payments, expenses).filter(item => `${item.title} ${item.detail} ${item.date}`.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'))), [harvests, payments, expenses, query]);
  return <FlatList data={items} keyExtractor={item => item.id} onRefresh={onRefresh} refreshing={refreshing} contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 40 }} ListHeaderComponent={<View>
    <CaylikScreenHeader icon="timeline-clock-outline" title="İşlem Geçmişi" description="Hasat, tahsilat ve gider kayıtlarınız tarih sırasıyla. Bunlar ayrı hareketlerdir; gelir toplamı değildir." />
    <CaylikButton mode="text" onPress={onBack}>Hasat kayıtlarına dön</CaylikButton>
    <TextInput accessibilityLabel="İşlem ara" placeholder="Firma, tarih veya açıklama ara" placeholderTextColor={theme.colors.onSurfaceVariant} value={query} onChangeText={setQuery} style={{ minHeight: 48, padding: 12, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant, borderRadius: 14 }} />
  </View>} ListEmptyComponent={<Text style={{ color: theme.colors.onSurfaceVariant }}>Gösterilecek işlem bulunamadı.</Text>} renderItem={({ item }) => <CaylikSurface style={{ padding: 16 }}>
    <Text style={{ color: theme.colors.onSurface, fontSize: 17, fontWeight: '700' }}>{item.kind === 'harvest' ? 'Hasat' : item.kind === 'payment' ? 'Tahsilat' : 'Gider'} · {item.title}</Text>
    <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 5 }}>{item.date || 'Tarih belirtilmedi'} · {item.detail}</Text>
    <Text style={{ color: item.kind === 'expense' ? theme.colors.error : theme.colors.primary, marginTop: 8, fontSize: 21, fontWeight: '700' }}>{item.value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} {item.unit}</Text>
  </CaylikSurface>} />;
}
