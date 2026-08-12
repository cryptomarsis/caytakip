import React from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';

export default function ExpenseScreen(props: any) {
  const { eForm, expenses, handleDelete, handleSaveExpense, setEForm } = props;
  return (

            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>🧾 Gider Ekle</Text>
                <Text style={styles.formHelp}>Gider türünü ve tutarı yazıp kaydedin.</Text>

                <Text style={styles.label}>Tarih</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.date}
                  onChangeText={(t) => setEForm({ ...eForm, date: t })}
                  placeholder="GÜN.AY.YIL"
                />

                <Text style={styles.label}>Kategori</Text>
                <View style={styles.rowBtnGroup}>
                  {['İşçilik', 'Gübre', 'Nakliye', 'Diğer'].map((kat) => (
                    <TouchableOpacity
                      key={kat}
                      style={[styles.groupBtn, eForm.kategori === kat && styles.groupBtnActive]}
                      onPress={() => setEForm({ ...eForm, kategori: kat })}
                    >
                      <Text style={[styles.groupBtnText, eForm.kategori === kat && styles.groupBtnTextActive]}>{kat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Tutar (TL) *</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.tutar}
                  onChangeText={(t) => setEForm({ ...eForm, tutar: t })}
                  placeholder="Örn: 1500"
                  keyboardType="numeric"
                />

                <Text style={styles.label}>Açıklama</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.aciklama}
                  onChangeText={(t) => setEForm({ ...eForm, aciklama: t })}
                  placeholder="Gider detayları..."
                />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}>
                  <Text style={styles.submitBtnText}>💾 GİDERİ KAYDET</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>GİDER LİSTESİ</Text>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bir gider yok.</Text>
              ) : (
                expenses.map((item: any, index: number) => (
                  <View key={item._id || index} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>
                        {item.kategori || 'Diğer'} - {formatTL(item.tutar)}
                      </Text>
                      <Text style={styles.listSubText}>📅 {item.tarih || 'Tarih Yok'}</Text>
                      {item.aciklama ? <Text style={styles.listSubText}>📝 {item.aciklama}</Text> : null}
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('expenses', item._id, 'Gider')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

  );
}
