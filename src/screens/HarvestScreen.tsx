import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';
import { styles } from '../styles/styles';
import { calculateAgriculturalDeductions, formatTL } from '../utils/format';

export default function HarvestScreen(props: any) {
  const {
    currentUser,
    hForm,
    handleSaveHarvest,
    setHForm,
    onPickReceipt,
    receiptBusy,
    receiptNotice,
  } = props;
  const [showDetails, setShowDetails] = useState(false);
  const amounts = calculateAgriculturalDeductions(hForm.kg, hForm.fiyat);

  return <View style={styles.formCard}>
    <Text style={styles.formTitle}>Yeni Hasat Kaydı</Text>
    <Text style={styles.formHelp}>Brüt fiyatı yazın; %2 kesinti ve net alacak otomatik hesaplanır.</Text>

    <View style={{ backgroundColor: '#edf7f0', borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <Text style={{ color: '#1b4332', fontWeight: '800', marginBottom: 3 }}>Fişten bilgileri ekle</Text>
      <Text style={[styles.listSubText, { color: '#4e6758', marginBottom: 10 }]}>
        Fiş fotoğrafını çekin veya galeriden seçin. Bilgiler kaydedilmeden önce formda gösterilir.
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity
          disabled={receiptBusy}
          onPress={() => onPickReceipt?.('camera')}
          style={{ flex: 1, borderWidth: 1, borderColor: '#2b6f50', paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginRight: 8, opacity: receiptBusy ? 0.55 : 1 }}
        >
          <Text style={{ color: '#1b4332', fontWeight: '700' }}>{receiptBusy ? 'Fiş okunuyor...' : 'Fotoğraf Çek'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={receiptBusy}
          onPress={() => onPickReceipt?.('library')}
          style={{ flex: 1, borderWidth: 1, borderColor: '#2b6f50', paddingVertical: 10, borderRadius: 10, alignItems: 'center', opacity: receiptBusy ? 0.55 : 1 }}
        >
          <Text style={{ color: '#1b4332', fontWeight: '700' }}>Galeriden Seç</Text>
        </TouchableOpacity>
      </View>
      {!!receiptNotice && <Text style={{ color: '#24553c', fontSize: 13, marginTop: 10 }}>{receiptNotice}</Text>}
    </View>

    <Text style={styles.label}>Miktar (KG) *</Text>
    <TextInput style={styles.input} value={hForm.kg} onChangeText={(t) => setHForm({ ...hForm, kg: t })} placeholder="Örn: 1000" keyboardType="decimal-pad" />
    <Text style={styles.label}>Firma / Alıcı *</Text>
    <TextInput style={styles.input} value={hForm.firma} onChangeText={(t) => setHForm({ ...hForm, firma: t })} placeholder="Örn: ÇAYKUR veya özel fabrika" />
    <Text style={styles.label}>Brüt Birim Fiyat (TL) *</Text>
    <TextInput style={styles.input} value={hForm.fiyat} onChangeText={(t) => setHForm({ ...hForm, fiyat: t })} placeholder="Örn: 35,00" keyboardType="decimal-pad" />
    <View style={{ backgroundColor: '#edf7f0', borderRadius: 10, padding: 12, marginBottom: 6 }}>
      <Text style={[styles.listSubText, { color: '#24553c' }]}>Brüt tutar: {formatTL(amounts.brutTutar)}</Text>
      <Text style={[styles.listSubText, { color: '#24553c' }]}>%2 kesinti: {formatTL(amounts.gelirVergisiKesintisi)}</Text>
      <Text style={{ color: '#1b4332', fontWeight: '800', marginTop: 3 }}>Net alacak: {formatTL(amounts.netTutar)}</Text>
    </View>

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
