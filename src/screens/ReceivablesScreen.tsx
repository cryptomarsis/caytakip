import React from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';

export default function ReceivablesScreen(props: any) {
  const { getReceivablesByMonth, totalReceivables } = props;
  return (

            <View>
              <Text style={styles.sectionTitle}>⏳ VADELİ ALACAKLAR • AYLIK TAKİP</Text>
              <View style={[styles.statCard, { borderLeftColor: '#d62828', marginBottom: 15 }]}>
                <Text style={styles.statTitle}>Toplam Bekleyen Vadeli / Açık Alacak</Text>
                <Text style={[styles.statValue, { color: '#d62828' }]}>{formatTL(totalReceivables)}</Text>
              </View>

              {getReceivablesByMonth().length === 0 ? (
                <Text style={styles.emptyText}>Bekleyen vadeli alacak kaydı bulunmuyor.</Text>
              ) : (
                getReceivablesByMonth().map(([month, items]: any) => {
                  const monthTotal = items.reduce((sum: number, item: any) => {
                    const total = (Number(item.kg || item.weight) || 0) * (Number(item.fiyat) || 0);
                    return sum + Math.max(0, total - (Number(item.tahsilat) || 0));
                  }, 0);
                  return (
                    <View key={month} style={styles.monthCard}>
                      <View style={styles.monthHeader}>
                        <Text style={styles.monthTitle}>📅 {month}</Text>
                        <Text style={styles.monthTotal}>{formatTL(monthTotal)}</Text>
                      </View>
                      {items.map((item: any, index: number) => {
                        const saleVal = (Number(item.kg || item.weight) || 0) * (Number(item.fiyat) || 0);
                        const payVal = Number(item.tahsilat) || 0;
                        const remaining = Math.max(0, saleVal - payVal);
                        return (
                          <View key={item._id || index} style={styles.listItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.listTitle}>🏭 {item.firma || 'Firma Belirtilmedi'}</Text>
                              <Text style={styles.listSubText}>
                                📅 Satış: {formatDisplayDate(item.tarih)} | ⚖️ {item.kg || item.weight || 0} KG | 💵 {item.fiyat || 0} TL/KG
                              </Text>
                              <Text style={styles.listSubText}>⏳ Vade: {formatDisplayDate(item.vadeTarihi)}</Text>
                              <Text style={styles.listSubText}>
                                Toplam: {formatTL(saleVal)} | Tahsilat: {formatTL(payVal)}
                              </Text>
                              <Text style={{ color: '#d62828', fontWeight: 'bold', marginTop: 2 }}>
                                🔴 Kalan: {formatTL(remaining)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}
            </View>

  );
}
