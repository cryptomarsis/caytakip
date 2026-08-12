import React from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';

export default function GardensScreen(props: any) {
  const { gForm, gardens, calculatedGardenSummaries, handleDelete, handleSaveGarden, setGForm } = props;
  return (

            <View>
              <Text style={styles.sectionTitle}>📊 BAHÇE BAZLI TOPLAM TOPLAMA VE KAZANÇ</Text>
              {calculatedGardenSummaries.length === 0 ? (
                <Text style={styles.emptyText}>Henüz bahçelerden yapılmış bir hasat verisi bulunamadı.</Text>
              ) : (
                calculatedGardenSummaries.map((g: any, idx: number) => (
                  <View key={idx} style={[styles.listItem, { borderLeftWidth: 4, borderLeftColor: '#1b4332' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>🏡 {g.name}</Text>
                      <Text style={styles.listSubText}>⚖️ Toplam Hasat: {g.toplamKg.toLocaleString('tr-TR')} KG</Text>
                      <Text style={styles.listSubText}>💰 Toplam Kazanç: {formatTL(g.toplamKazanc)}</Text>
                      <Text style={styles.listSubText}>💵 Toplam Tahsilat: {formatTL(g.toplamTahsilat)}</Text>
                    </View>
                  </View>
                ))
              )}

              <View style={[styles.formCard, { marginTop: 20 }]}>
                <Text style={styles.formTitle}>🏡 YENİ BAHÇE TANIMLA</Text>

                <Text style={styles.label}>Bahçe Adı</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.name}
                  onChangeText={(t) => setGForm({ ...gForm, name: t })}
                  placeholder="Örn: Arka Bahçe"
                />

                <Text style={styles.label}>Ada / Parsel</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.adaParsel}
                  onChangeText={(t) => setGForm({ ...gForm, adaParsel: t })}
                  placeholder="Örn: 101/12"
                />

                <Text style={styles.label}>Alan (Dönüm / m²)</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.alan}
                  onChangeText={(t) => setGForm({ ...gForm, alan: t })}
                  placeholder="Örn: 5 Dönüm"
                />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveGarden}>
                  <Text style={styles.submitBtnText}>💾 BAHÇEYİ KAYDET</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>KAYITLI BAHÇE LİSTESİ</Text>
              {gardens.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bir bahçe yok.</Text>
              ) : (
                gardens.map((item: any, index: number) => (
                  <View key={item._id || index} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>🏡 {item.name || 'İsimsiz Bahçe'}</Text>
                      {item.adaParsel ? <Text style={styles.listSubText}>📍 Ada/Parsel: {item.adaParsel}</Text> : null}
                      {item.alan ? <Text style={styles.listSubText}>📐 Alan: {item.alan}</Text> : null}
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('gardens', item._id, 'Bahçe')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

  );
}
