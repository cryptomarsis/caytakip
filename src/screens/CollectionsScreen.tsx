import React from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';

export default function CollectionsScreen(props: any) {
  const { handleSpecificHarvestPayment, harvests, payAmount, payDesc, payHarvestId, setPayAmount, setPayDesc, setPayHarvestId } = props;
  return (

            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>💳 Ödeme Al</Text>
                <Text style={styles.formHelp}>Ödeme alınan satışı seçin, tutarı yazın ve kaydedin.</Text>

                <Text style={styles.label}>Satışı Seçin</Text>
                <ScrollView style={{ maxHeight: 200, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 5, marginBottom: 10 }}>
                  {harvests.filter((h: any) => ((Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0) - (Number(h.tahsilat) || 0)) > 0).length === 0 ? (
                    <Text style={{ padding: 10, color: '#888' }}>Bekleyen ödemesi olan satış yok.</Text>
                  ) : (
                    harvests
                      .filter((h: any) => ((Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0) - (Number(h.tahsilat) || 0)) > 0)
                      .map((h: any) => {
                        const kalan = (Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0) - (Number(h.tahsilat) || 0);
                        const isSelected = payHarvestId === h._id;
                        return (
                          <TouchableOpacity
                            key={h._id}
                            style={{
                              padding: 10,
                              backgroundColor: isSelected ? '#1b4332' : '#f8f9fa',
                              borderRadius: 6,
                              marginBottom: 5
                            }}
                            onPress={() => setPayHarvestId(h._id)}
                          >
                            <Text style={{ color: isSelected ? '#fff' : '#333', fontWeight: 'bold' }}>
                              {formatDisplayDate(h.tarih)} - {h.firma || 'Firma Yok'} ({h.kg || h.weight} KG) {h.bahce ? `- ${h.bahce}` : ''}
                            </Text>
                            <Text style={{ color: isSelected ? '#e0e0e0' : '#666', fontSize: 12 }}>
                              Kalan Borç: {formatTL(kalan)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                  )}
                </ScrollView>

                <Text style={styles.label}>Alınan Tutar (TL)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Örn: 5000"
                  keyboardType="numeric"
                  value={payAmount}
                  onChangeText={setPayAmount}
                />

                <Text style={styles.label}>Not (İsteğe Bağlı)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Örn: Banka havalesi"
                  value={payDesc}
                  onChangeText={setPayDesc}
                 autoCorrect={false} />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSpecificHarvestPayment}>
                  <Text style={styles.submitBtnText}>💳 Ödemeyi Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>

  );
}
