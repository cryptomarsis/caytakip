import React from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';
import { AppIcon } from '../components/app-icon';
import { IconHeading } from '../components/icon-heading';

export default function ExpenseScreen(props: any) {
  const { eForm, expenses, handleDelete, handleSaveExpense, setEForm } = props;
  return (

            <View>
              <View style={styles.formCard}>
                <IconHeading icon="receipt-text" title="Gider Ekle" compact />
                <Text style={styles.formHelp}>Gider türünü ve tutarı yazıp kaydedin.</Text>

                <Text style={styles.label}>Tarih (GG.AA.YYYY)</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.date}
                  onChangeText={(t) => setEForm({ ...eForm, date: t })}
                  placeholder="12.08.2026"
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
                  <View style={styles.submitBtnContent}><AppIcon name="content-save" size={20} color="#FFFFFF" /><Text style={styles.submitBtnText}>GİDERİ KAYDET</Text></View>
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
                      <Text style={styles.listSubText}>Tarih: {formatDisplayDate(item.tarih)}</Text>
                      {item.aciklama ? <Text style={styles.listSubText}>Not: {item.aciklama}</Text> : null}
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('expenses', item._id, 'Gider')}>
                      <View style={styles.actionBtnContent}><AppIcon name="trash-can-outline" size={15} color="#FFFFFF" /><Text style={styles.actionBtnText}>Sil</Text></View>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

  );
}
