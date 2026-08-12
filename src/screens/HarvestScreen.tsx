import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';

type ReceiptFields = {
  date?: string | null;
  kg?: number | null;
  firma?: string | null;
  fiyat?: number | null;
  tahsilat?: number | null;
  aciklama?: string | null;
};

const valueForInput = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  return String(value).replace('.', ',');
};

export default function HarvestScreen(props: any) {
  const { currentUser, hForm, handleSaveHarvest, setHForm } = props;
  const [isReadingReceipt, setIsReadingReceipt] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const readReceipt = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!currentUser?.token) {
      Alert.alert('Oturum Gerekli', 'Fişi okumak için önce giriş yapmalısınız.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 12 * 1024 * 1024) {
      Alert.alert('Fotoğraf Çok Büyük', 'Lütfen fişi daha yakından çekin veya daha küçük bir fotoğraf seçin.');
      return;
    }

    setIsReadingReceipt(true);
    try {
      // Kamera ve galerideki HEIC dahil her görseli sıkıştırılmış JPEG'e dönüştürür.
      // Böylece yükleme küçük kalır ve sunucu tek bir güvenli dosya türü işler.
      const prepared = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: Math.min(asset.width || 1600, 1600) } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
      );
      setReceiptPreview(prepared.uri);

      const formData = new FormData();
      formData.append('receipt', {
        uri: prepared.uri,
        name: `fis-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);

      const response = await fetchWithTimeout(`${API_URL}/receipts/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentUser.token}` },
        body: formData,
      }, 90000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Fiş okuma servisi henüz yayındaki sunucuya eklenmemiş. Sunucuyu yeni kodla Render’a dağıtın.');
        }
        throw new Error(data?.error || `Fiş servisi yanıt vermedi (${response.status}).`);
      }

      const fields: ReceiptFields = data?.fields || {};
      const filled = [fields.date, fields.kg, fields.firma, fields.fiyat, fields.tahsilat]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .length;
      if (!filled) {
        Alert.alert('Bilgi Bulunamadı', 'Fişte okunabilir hasat bilgisi bulunamadı. Lütfen alanları elle doldurun.');
        return;
      }

      setHForm({
        ...hForm,
        date: fields.date || hForm.date,
        kg: fields.kg !== undefined && fields.kg !== null ? valueForInput(fields.kg) : hForm.kg,
        firma: fields.firma || hForm.firma,
        fiyat: fields.fiyat !== undefined && fields.fiyat !== null ? valueForInput(fields.fiyat) : hForm.fiyat,
        tahsilat: fields.tahsilat !== undefined && fields.tahsilat !== null ? valueForInput(fields.tahsilat) : hForm.tahsilat,
        aciklama: fields.aciklama || hForm.aciklama,
      });
      Alert.alert('Fiş Okundu', 'Bulunan bilgiler forma yerleştirildi. Kaydetmeden önce tüm alanları kontrol edin.');
    } catch (error: any) {
      Alert.alert('Fiş Okunamadı', error?.message || 'Fotoğraf okunurken bir hata oluştu. Alanları elle doldurabilirsiniz.');
    } finally {
      setIsReadingReceipt(false);
    }
  };

  const takeReceiptPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kamera İzni Gerekli', 'Fişin fotoğrafını çekebilmek için kamera izni vermelisiniz.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], quality: 0.8, exif: false, cameraType: ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets?.[0]) await readReceipt(result.assets[0]);
  };

  const chooseReceiptFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Fotoğraf İzni Gerekli', 'Galeriden fiş seçebilmek için fotoğraf izni vermelisiniz.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.8, exif: false, allowsEditing: false, selectionLimit: 1,
    });
    if (!result.canceled && result.assets?.[0]) await readReceipt(result.assets[0]);
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Hasat Ekle</Text>
      <Text style={styles.formHelp}>Önce kilo, firma ve fiyatı girin. Diğer alanları isterseniz sonra doldurabilirsiniz.</Text>

      <View style={styles.receiptCard}>
        <View style={styles.receiptTextWrap}>
          <Text style={styles.receiptTitle}>Fişten hızlı doldur</Text>
          <Text style={styles.receiptText}>Fişi fotoğraflayın veya galeriden seçin. Bulunan bilgiler yalnızca forma öneri olarak eklenir.</Text>
        </View>
        <View style={styles.receiptActions}>
          <TouchableOpacity accessibilityRole="button" disabled={isReadingReceipt} style={[styles.receiptBtn, isReadingReceipt && styles.buttonDisabled]} onPress={takeReceiptPhoto}>
            {isReadingReceipt ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.receiptBtnText}>Kamera ile Çek</Text>}
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={isReadingReceipt} style={[styles.receiptSecondaryBtn, isReadingReceipt && styles.buttonDisabled]} onPress={chooseReceiptFromGallery}>
            <Text style={styles.receiptSecondaryBtnText}>Galeriden Seç</Text>
          </TouchableOpacity>
        </View>
        {receiptPreview && <Image source={{ uri: receiptPreview }} style={styles.receiptPreview} resizeMode="cover" />}
        {isReadingReceipt && <Text style={styles.receiptLoadingText}>Fişteki bilgiler okunuyor…</Text>}
      </View>

      <Text style={styles.label}>Tarih</Text>
      <TextInput style={styles.input} value={hForm.date} onChangeText={(t) => setHForm({ ...hForm, date: t })} placeholder="2026-08-12" />

      <Text style={styles.label}>Sürüm Seçimi</Text>
      <View style={styles.rowBtnGroup}>
        {['1. Sürüm', '2. Sürüm', '3. Sürüm', '4. Sürüm'].map((s) => (
          <TouchableOpacity key={s} style={[styles.groupBtn, hForm.surum === s && styles.groupBtnActive]} onPress={() => setHForm({ ...hForm, surum: s })}>
            <Text style={[styles.groupBtnText, hForm.surum === s && styles.groupBtnTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {currentUser?.role === 'admin' && <><Text style={styles.label}>Üretici Adı</Text><TextInput style={styles.input} value={hForm.producer} onChangeText={(t) => setHForm({ ...hForm, producer: t })} placeholder={currentUser?.name || 'Üretici Adı'} /></>}
      <Text style={styles.label}>Miktar (KG) *</Text>
      <TextInput style={styles.input} value={hForm.kg} onChangeText={(t) => setHForm({ ...hForm, kg: t })} placeholder="Örn: 1000" keyboardType="numeric" />
      <Text style={styles.label}>Firma / Alıcı</Text>
      <TextInput style={styles.input} value={hForm.firma} onChangeText={(t) => setHForm({ ...hForm, firma: t })} placeholder="Örn: ÇAYKUR / Özel Fabrika" />
      <Text style={styles.label}>Birim Fiyat (TL)</Text>
      <TextInput style={styles.input} value={hForm.fiyat} onChangeText={(t) => setHForm({ ...hForm, fiyat: t })} placeholder="Örn: 20" keyboardType="numeric" />
      <Text style={styles.label}>Alınan Ödeme (TL)</Text>
      <TextInput style={styles.input} value={hForm.tahsilat} onChangeText={(t) => setHForm({ ...hForm, tahsilat: t })} placeholder="Ödeme yoksa 0" keyboardType="numeric" />
      <Text style={styles.label}>Bahçe</Text>
      <TextInput style={styles.input} value={hForm.garden} onChangeText={(t) => setHForm({ ...hForm, garden: t })} placeholder="Örn: Arka Bahçe" />
      <View style={styles.switchRow}><Text style={styles.switchLabel}>Vadeli satış mı?</Text><Switch value={hForm.isVadeli} onValueChange={(val) => setHForm({ ...hForm, isVadeli: val })} trackColor={{ false: '#767577', true: '#2a9d8f' }} /></View>
      {hForm.isVadeli && <View><Text style={styles.label}>Vade Tarihi</Text><TextInput style={styles.input} value={hForm.vadeTarihi} onChangeText={(t) => setHForm({ ...hForm, vadeTarihi: t })} placeholder="2026-09-15" /></View>}
      <Text style={styles.label}>Açıklama</Text>
      <TextInput style={styles.input} value={hForm.aciklama} onChangeText={(t) => setHForm({ ...hForm, aciklama: t })} placeholder="Notlar..." />
      <TouchableOpacity style={styles.submitBtn} onPress={handleSaveHarvest}><Text style={styles.submitBtnText}>Kaydı Kaydet</Text></TouchableOpacity>
    </View>
  );
}
