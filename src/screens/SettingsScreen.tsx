import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { API_ORIGIN, API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';

type Props = {
  currentUser: { token?: string } | null;
  onChangePin: (currentPin: string, newPin: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
};

export default function SettingsScreen({ currentUser, onChangePin, onDeleteAccount }: Props) {
  const [privacy, setPrivacy] = useState<any>(null);
  const [loadingPrivacy, setLoadingPrivacy] = useState(true);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    fetchWithTimeout(`${API_URL}/legal/privacy`)
      .then((response) => response.json())
      .then(setPrivacy)
      .catch(() => setPrivacy(null))
      .finally(() => setLoadingPrivacy(false));
  }, []);

  const confirmDelete = () => {
    Alert.alert(
      'Hesap silinsin mi?',
      'Hasat, gider, ödeme ve bahçe kayıtlarınız kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Hesabı Sil', style: 'destructive', onPress: () => onDeleteAccount().catch(() => undefined) }
      ]
    );
  };

  const savePin = async () => {
    const cleanNewPin = newPin.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanNewPin)) {
      Alert.alert('Giriş Şifresi', 'Yeni giriş şifresi 6 haneli olmalıdır.');
      return;
    }
    if (cleanNewPin !== confirmPin.replace(/\D/g, '')) {
      Alert.alert('Giriş Şifresi', 'Yeni giriş şifreleri aynı olmalıdır.');
      return;
    }
    setSavingPin(true);
    try {
      await onChangePin(currentPin.replace(/\D/g, ''), cleanNewPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      Alert.alert('Başarılı', 'Giriş şifreniz kaydedildi.');
    } catch (error: any) {
      Alert.alert('Giriş Şifresi', error?.message || 'Giriş şifresi güncellenemedi.');
    } finally {
      setSavingPin(false);
    }
  };

  return <View>
    <Text style={styles.sectionTitle}>Ayarlar ve Gizlilik</Text>
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Gizlilik</Text>
      {loadingPrivacy ? <ActivityIndicator color="#246548" /> : privacy?.sections?.map((section: any) => (
        <View key={section.heading} style={styles.legalSection}>
          <Text style={styles.legalTitle}>{section.heading}</Text>
          <Text style={styles.legalText}>{section.body}</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(`${API_ORIGIN}/privacy`)}>
        <Text style={styles.secondaryBtnText}>Gizlilik politikasını tarayıcıda aç</Text>
      </TouchableOpacity>
      {privacy?.contactEmail && !String(privacy.contactEmail).startsWith('Destek') && <Text style={styles.listSubText}>Destek: {privacy.contactEmail}</Text>}
    </View>

    {currentUser?.token && <View style={styles.formCard}>
      <Text style={styles.formTitle}>Giriş Şifresi</Text>
      <Text style={styles.formHelp}>Telefon numaranızla birlikte kullanacağınız 6 haneli giriş şifresini belirleyin veya değiştirin.</Text>
      <Text style={styles.label}>Mevcut giriş şifresi</Text>
      <TextInput style={styles.input} placeholder="İlk kez oluşturuyorsanız boş bırakın" keyboardType="number-pad" secureTextEntry maxLength={6} value={currentPin} onChangeText={setCurrentPin} />
      <Text style={styles.label}>Yeni 6 haneli giriş şifresi</Text>
      <TextInput style={styles.input} placeholder="Örn: 123456" keyboardType="number-pad" secureTextEntry maxLength={6} value={newPin} onChangeText={setNewPin} />
      <Text style={styles.label}>Yeni giriş şifresi tekrar</Text>
      <TextInput style={styles.input} placeholder="6 haneyi tekrar yazın" keyboardType="number-pad" secureTextEntry maxLength={6} value={confirmPin} onChangeText={setConfirmPin} />
      <TouchableOpacity style={styles.submitBtn} onPress={savePin} disabled={savingPin}>
        <Text style={styles.submitBtnText}>{savingPin ? 'KAYDEDİLİYOR...' : 'GİRİŞ ŞİFRESİNİ KAYDET'}</Text>
      </TouchableOpacity>
    </View>}

    {currentUser?.token && <View style={styles.dangerCard}>
      <Text style={styles.dangerTitle}>Hesabı sil</Text>
      <Text style={styles.dangerText}>Hesabınız ve ilişkili kayıtlarınız sunucudan kalıcı olarak silinir.</Text>
      <TouchableOpacity style={styles.dangerBtn} onPress={confirmDelete}>
        <Text style={styles.dangerBtnText}>Hesabımı ve kayıtlarımı sil</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}
