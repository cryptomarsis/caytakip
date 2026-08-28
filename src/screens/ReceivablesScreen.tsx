import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { styles } from '../styles/styles';
import { deductionTotalOf, formatTL, formatDisplayDate, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';
import { CaylikScreenHeader, CaylikSurface } from '../components/caylik-ui';

export default function ReceivablesScreen(props: any) {
  const { getReceivablesByMonth, totalReceivables } = props;
  const theme = useTheme();
  return (
    <View>
      <CaylikScreenHeader icon="cash-clock" eyebrow="ÖDEME TAKİBİ" title="Alacaklar" description="Yaklaşan ve bekleyen tahsilatlarınızı takvim sırasıyla izleyin." />
      <CaylikSurface style={[styles.statCard, { borderLeftColor: '#d62828', marginBottom: 15 }]}>
        <Text style={[styles.statTitle, { color: theme.colors.onSurfaceVariant }]}>Toplam Bekleyen Vadeli / Açık Alacak</Text>
        <Text style={[styles.statValue, { color: '#d62828' }]}>{formatTL(totalReceivables)}</Text>
      </CaylikSurface>

      {getReceivablesByMonth().length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Bekleyen vadeli alacak kaydı bulunmuyor.</Text>
      ) : (
        getReceivablesByMonth().map(([month, items]: any) => {
          const monthTotal = items.reduce((sum: number, item: any) => sum + remainingTotalOf(item), 0);
          return (
            <CaylikSurface key={month} style={[styles.monthCard, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.monthHeader}>
                <Text style={[styles.monthTitle, { color: theme.colors.onSurface }]}>{month}</Text>
                <Text style={[styles.monthTotal, { color: theme.colors.error }]}>{formatTL(monthTotal)}</Text>
              </View>
              {items.map((item: any, index: number) => {
                const grossVal = grossTotalOf(item);
                const deductionVal = deductionTotalOf(item);
                const saleVal = netTotalOf(item);
                const payVal = Number(item.tahsilat) || 0;
                const remaining = remainingTotalOf(item);
                return (
                  <View key={item._id || index} style={[styles.listItem, { backgroundColor: theme.colors.surfaceVariant, borderWidth: 1, borderColor: theme.colors.outline }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>{item.firma || 'Firma Belirtilmedi'}</Text>
                      <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Satış: {formatDisplayDate(item.tarih)} | {item.kg || item.weight || 0} KG | {item.fiyat || 0} TL/KG</Text>
                      <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Vade: {formatDisplayDate(item.vadeTarihi)}</Text>
                      <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Brüt: {formatTL(grossVal)} | %2 kesinti: {formatTL(deductionVal)}</Text>
                      <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Net alacak: {formatTL(saleVal)} | Tahsilat: {formatTL(payVal)}</Text>
                      <Text style={{ color: theme.colors.error, fontWeight: 'bold', marginTop: 2 }}>Kalan: {formatTL(remaining)}</Text>
                    </View>
                  </View>
                );
              })}
            </CaylikSurface>
          );
        })
      )}
    </View>
  );
}
