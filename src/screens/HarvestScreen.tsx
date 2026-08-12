import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';
import { styles } from '../styles/styles';

export default function HarvestScreen(props: any) {
  const { currentUser, hForm, handleSaveHarvest, setHForm } = props;
  const [showDetails, setShowDetails] = useState(false);

  return <View style={styles.formCard}>
    <Text style={styles.formTitle}>Yeni Hasat Kaydı</Text>
    <Text style={styles.formHelp}>Önce miktar, firma ve fiyatı yazın. Toplam tutar otomatik hesaplanır.</Text>

    <Text style={styles.label}>Miktar (KG) *</Text>
    <TextInput style={styles.input} value={hForm.kg} onChangeText={(t) => setHForm({ ...hForm, kg: t })} placeholder="Örn: 1000" keyboardType="decimal-pad" />
    <Text style={styles.label}>Firma / Alıcı *</Text>
    <TextInput style={styles.input} value={hForm.firma} onChangeText={(t) => setHForm({ ...hForm, firma: t })} placeholder="Örn: ÇAYKUR veya özel fabrika" />
    <Text style={styles.label}>Birim Fiyat (TL) *</Text>
    <TextInput style={styles.input} value={hForm.fiyat} onChangeText={(t) => setHForm({ ...hForm, fiyat: t })} placeholder="Örn: 35,00" keyboardType="decimal-pad" />

    <TouchableOpacity style={styles.detailsToggle} onPress={() => setShowDetails(!showDetails)}>
      <Text style={styles.detailsToggleText}>{showDetails ? '− Ek bilgileri gizle' : '+ Tarih, bahçe ve vade ekle'}</Text>
    </TouchableOpacity>

    {showDetails && <>
      <Text style={styles.label}>Tarih (GG.AA.YYYY)</Text>
      <TextInput style={styles.input} value={hForm.date} onChangeText={(t) => setHForm({ ...hForm, date: t })} placeholder="12.08.2026" />
      <Text style={styles.label}>Sürüm Seçimi</Text>
      <View style={styles.rowBtnGroup}>{['1. Sürüm', '2. Sürüm', '3. Sürüm', '4. Sürüm'].map((s) => <TouchableOpacity key={s} style={[styles.groupBtn, hForm.surum === s && styles.groupBtnActive]} onPress={() => setHForm({ ...hForm, surum: s })}><Text style={[styles.groupBtnText, hForm.surum === s && styles.groupBtnTextActive]}>{s}</Text></TouchableOpacity>)}</View>
      {currentUser?.role === 'admin' && <><Text style={styles.label}>Üretici Adı</Text><TextInput style={styles.input} value={hForm.producer} onChangeText={(t) => setHForm({ ...hForm, producer: t })} placeholder={currentUser?.name || 'Üretici Adı'} /></>}
      <Text style={styles.label}>Alınan Ödeme (TL)</Text>
      <TextInput style={styles.input} value={hForm.tahsilat} onChangeText={(t) => setHForm({ ...hForm, tahsilat: t })} placeholder="Ödeme yoksa 0" keyboardType="decimal-pad" />
      <Text style={styles.label}>Bahçe</Text>
      <TextInput style={styles.input} value={hForm.garden} onChangeText={(t) => setHForm({ ...hForm, garden: t })} placeholder="Örn: Arka Bahçe" />
      <View style={styles.switchRow}><Text style={styles.switchLabel}>Vadeli satış mı?</Text><Switch value={hForm.isVadeli} onValueChange={(val) => setHForm({ ...hForm, isVadeli: val })} trackColor={{ false: '#767577', true: '#2a9d8f' }} /></View>
      {hForm.isVadeli && <><Text style={styles.label}>Vade Tarihi (GG.AA.YYYY)</Text><TextInput style={styles.input} value={hForm.vadeTarihi} onChangeText={(t) => setHForm({ ...hForm, vadeTarihi: t })} placeholder="15.09.2026" /></>}
      <Text style={styles.label}>Açıklama</Text>
      <TextInput style={styles.input} value={hForm.aciklama} onChangeText={(t) => setHForm({ ...hForm, aciklama: t })} placeholder="Notlar..." />
    </>}
    <TouchableOpacity style={styles.submitBtn} onPress={handleSaveHarvest}><Text style={styles.submitBtnText}>Hasadı Kaydet</Text></TouchableOpacity>
  </View>;
}
