import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SegmentedButtons, useTheme } from 'react-native-paper';
import { type ThemePreference, useAppTheme } from '../context/app-theme';
import { API_ORIGIN, API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';
import { CaylikScreenHeader } from '../components/caylik-ui';

type Props = {
  currentUser: { token?: string } | null;
  onChangePin: (currentPin: string, newPin: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  lastSyncAt?: string | null;
  onExportData?: () => Promise<void>;
  onSendFeedback?: (subject: string, message: string) => Promise<void>;
};

export default function SettingsScreen({ currentUser, onChangePin, onDeleteAccount, lastSyncAt, onExportData, onSendFeedback }: Props) {
  const theme = useTheme();
  const { preference, setPreference } = useAppTheme();
  const [privacy, setPrivacy] = useState<any>(null);
  const [loadingPrivacy, setLoadingPrivacy] = useState(true);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

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

  const themeStyles = {
    card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline },
    title: { color: theme.colors.onSurface },
    body: { color: theme.colors.onSurfaceVariant },
    input: { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface },
  };

  return <View>
    <CaylikScreenHeader icon="cog-outline" eyebrow="HESAP VE UYGULAMA" title="Ayarlar ve Gizlilik" description="Görünüm, veri güvenliği ve hesap seçeneklerinizi yönetin." />
    <View style={[styles.formCard, themeStyles.card]}>
      <Text style={[styles.formTitle, themeStyles.title]}>Görünüm</Text>
      <Text style={[styles.formHelp, themeStyles.body]}>Uygulamanın renk düzenini seçin.</Text>
      <SegmentedButtons
        value={preference}
        onValueChange={(value) => setPreference(value as ThemePreference)}
        buttons={[
          { value: 'light', label: 'Açık', icon: 'white-balance-sunny' },
          { value: 'dark', label: 'Koyu', icon: 'weather-night' },
          { value: 'system', label: 'Sistem', icon: 'cellphone' },
        ]}
        style={{ marginTop: 10 }}
      />
    </View>
    <View style={[styles.formCard, themeStyles.card]}>
      <Text style={[styles.formTitle, themeStyles.title]}>Verilerim güvende mi?</Text>
      <Text style={[styles.formHelp, themeStyles.body]}>Kayıtlarınız hesabınıza bağlı olarak güvenli sunucuda saklanır. İnternet olduğunda cihazlarınız arasında eşitlenir.</Text>
      <Text style={[styles.listSubText, themeStyles.body]}>Son senkronizasyon: {lastSyncAt ? new Date(lastSyncAt).toLocaleString('tr-TR') : 'Henüz senkronize edilmedi'}</Text>
      {!!onExportData && <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 10, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.primary }]} onPress={() => onExportData().catch((error: any) => Alert.alert('Dışa aktarma', error?.message || 'Veriler hazırlanamadı.'))}><Text style={[styles.secondaryBtnText, { color: theme.colors.primary }]}>Verilerimi yedekle / dışa aktar</Text></TouchableOpacity>}
    </View>
    <View style={[styles.formCard, themeStyles.card]}>
      <Text style={[styles.formTitle, themeStyles.title]}>Gizlilik</Text>
      {loadingPrivacy ? <ActivityIndicator color="#246548" /> : privacy?.sections?.map((section: any) => (
        <View key={section.heading} style={styles.legalSection}>
          <Text style={[styles.legalTitle, themeStyles.title]}>{section.heading}</Text>
          <Text style={[styles.legalText, themeStyles.body]}>{section.body}</Text>
        </View>
      ))}
      <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.primary }]} onPress={() => Linking.openURL(`${API_ORIGIN}/privacy`)}>
        <Text style={[styles.secondaryBtnText, { color: theme.colors.primary }]}>Gizlilik politikasını tarayıcıda aç</Text>
      </TouchableOpacity>
      {privacy?.contactEmail && !String(privacy.contactEmail).startsWith('Destek') && <>
          <Text style={[styles.listSubText, themeStyles.body]}>Destek: {privacy.contactEmail}</Text>
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 8, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.primary }]}
            onPress={() => Linking.openURL(`mailto:${String(privacy.contactEmail).trim()}?subject=${encodeURIComponent('Çaylık destek talebi')}`).catch(() => undefined)}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.colors.primary }]}>Destek ekibine e-posta gönder</Text>
          </TouchableOpacity>
        </>}
    </View>

    {currentUser?.token && <View style={[styles.formCard, themeStyles.card]}>
      <Text style={[styles.formTitle, themeStyles.title]}>Giriş Şifresi</Text>
      <Text style={[styles.formHelp, themeStyles.body]}>Telefon numaranızla birlikte kullanacağınız 6 haneli giriş şifresini belirleyin veya değiştirin.</Text>
      <Text style={[styles.label, themeStyles.title]}>Mevcut giriş şifresi</Text>
      <TextInput style={[styles.input, themeStyles.input]} placeholderTextColor={theme.colors.onSurfaceVariant} placeholder="İlk kez oluşturuyorsanız boş bırakın" keyboardType="number-pad" secureTextEntry maxLength={6} value={currentPin} onChangeText={setCurrentPin} />
      <Text style={[styles.label, themeStyles.title]}>Yeni 6 haneli giriş şifresi</Text>
      <TextInput style={[styles.input, themeStyles.input]} placeholderTextColor={theme.colors.onSurfaceVariant} placeholder="Örn: 123456" keyboardType="number-pad" secureTextEntry maxLength={6} value={newPin} onChangeText={setNewPin} />
      <Text style={[styles.label, themeStyles.title]}>Yeni giriş şifresi tekrar</Text>
      <TextInput style={[styles.input, themeStyles.input]} placeholderTextColor={theme.colors.onSurfaceVariant} placeholder="6 haneyi tekrar yazın" keyboardType="number-pad" secureTextEntry maxLength={6} value={confirmPin} onChangeText={setConfirmPin} />
      <TouchableOpacity style={styles.submitBtn} onPress={savePin} disabled={savingPin}>
        <Text style={styles.submitBtnText}>{savingPin ? 'KAYDEDİLİYOR...' : 'GİRİŞ ŞİFRESİNİ KAYDET'}</Text>
      </TouchableOpacity>
    </View>}

    {currentUser?.token && !!onSendFeedback && <View style={[styles.formCard, themeStyles.card]}>
      <Text style={[styles.formTitle, themeStyles.title]}>Sorun bildir / öneri gönder</Text>
      <Text style={[styles.formHelp, themeStyles.body]}>Uygulamada zorlandığınız bir yeri veya önerinizi bize yazın.</Text>
      <TextInput style={[styles.input, themeStyles.input]} placeholderTextColor={theme.colors.onSurfaceVariant} value={feedbackSubject} onChangeText={setFeedbackSubject} placeholder="Konu" />
      <TextInput style={[styles.input, themeStyles.input, { minHeight: 92, textAlignVertical: 'top' }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={feedbackMessage} onChangeText={setFeedbackMessage} placeholder="Mesajınız" multiline />
      <TouchableOpacity style={styles.submitBtn} disabled={sendingFeedback} onPress={async () => {
        if (!feedbackMessage.trim()) return Alert.alert('Geri bildirim', 'Lütfen mesajınızı yazın.');
        setSendingFeedback(true);
        try { await onSendFeedback(feedbackSubject, feedbackMessage); setFeedbackSubject(''); setFeedbackMessage(''); Alert.alert('Teşekkürler', 'Geri bildiriminiz kaydedildi.'); }
        catch (error: any) { Alert.alert('Geri bildirim', error?.message || 'Mesaj gönderilemedi.'); }
        finally { setSendingFeedback(false); }
      }}><Text style={styles.submitBtnText}>{sendingFeedback ? 'GÖNDERİLİYOR...' : 'GERİ BİLDİRİMİ GÖNDER'}</Text></TouchableOpacity>
    </View>}

    {currentUser?.token && <View style={[styles.dangerCard, { backgroundColor: theme.colors.errorContainer, borderColor: theme.colors.error }]}>
      <Text style={[styles.dangerTitle, { color: theme.colors.onErrorContainer }]}>Hesabı sil</Text>
      <Text style={[styles.dangerText, { color: theme.colors.onErrorContainer }]}>Hesabınız ve ilişkili kayıtlarınız sunucudan kalıcı olarak silinir.</Text>
      <TouchableOpacity style={styles.dangerBtn} onPress={confirmDelete}>
        <Text style={styles.dangerBtnText}>Hesabımı ve kayıtlarımı sil</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}
