import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { styles } from '../styles/styles';
import { formatTL, remainingTotalOf, toServerDate } from '../utils/format';
import { CaylikScreenHeader, CaylikSurface } from '../components/caylik-ui';
import { ReceivableCard } from '../components/receivable-card';

export default function ReceivablesScreen(props: any) {
  const { getReceivablesByMonth, totalReceivables, onPayment } = props;
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Tümü');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysUntil = (value: string) => {
    const date = toServerDate(value);
    const time = date ? new Date(`${date}T00:00:00`).getTime() : NaN;
    return Number.isFinite(time) ? Math.round((time - today.getTime()) / 86400000) : null;
  };
  const groups = getReceivablesByMonth().map(([month, items]: any) => [month, items.filter((item: any) => {
    const days = daysUntil(item.vadeTarihi);
    return String(item.firma || '').toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR')) &&
      (filter === 'Tümü' || (days !== null && (filter === 'Geciken' ? days < 0 : days >= 0 && days <= 30)));
  })]).filter(([, items]: any) => items.length);
  return (
    <View>
      <CaylikScreenHeader icon="cash-clock" eyebrow="ÖDEME TAKİBİ" title="Alacaklar" description="Yaklaşan ve bekleyen tahsilatlarınızı takvim sırasıyla izleyin." />
      <CaylikSurface style={[styles.statCard, { borderLeftColor: theme.colors.primary, marginBottom: 15 }]}>
        <Text style={[styles.statTitle, { color: theme.colors.onSurfaceVariant }]}>Toplam Bekleyen Vadeli / Açık Alacak</Text>
        <Text style={[styles.statValue, { color: theme.colors.primary }]}>{formatTL(totalReceivables)}</Text>
      </CaylikSurface>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {['Tümü', 'Yaklaşan', 'Geciken'].map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={{ flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: filter === value ? theme.colors.primary : theme.colors.surfaceVariant }}><Text style={{ color: filter === value ? theme.colors.onPrimary : theme.colors.onSurface }}>{value}</Text></TouchableOpacity>)}
      </View>
      <TextInput accessibilityLabel="Firma ara" placeholder="Firma ara" value={query} onChangeText={setQuery} placeholderTextColor={theme.colors.onSurfaceVariant} style={[styles.input, { color: theme.colors.onSurface, backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} />
      {filter === 'Yaklaşan' && <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>Önümüzdeki 30 gün içinde vadesi gelen kayıtlar.</Text>}
      {groups.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Bekleyen vadeli alacak kaydı bulunmuyor.</Text>
      ) : (
        groups.map(([month, items]: any) => {
          const monthTotal = items.reduce((sum: number, item: any) => sum + remainingTotalOf(item), 0);
          return (
            <CaylikSurface key={month} style={[styles.monthCard, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.monthHeader}>
                <Text style={[styles.monthTitle, { color: theme.colors.onSurface }]}>{month}</Text>
                <Text style={[styles.monthTotal, { color: theme.colors.primary }]}>{formatTL(monthTotal)}</Text>
              </View>
              {items.map((item: any) => <ReceivableCard key={item._id} item={item} days={daysUntil(item.vadeTarihi)} onPayment={onPayment} />)}
            </CaylikSurface>
          );
        })
      )}
    </View>
  );
}
