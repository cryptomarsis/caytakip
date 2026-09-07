import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { AppIcon } from '../components/app-icon';
import { CaylikScreenHeader } from '../components/caylik-ui';
import { API_URL, fetchWithTimeout } from '../services/api';

const PACKAGES = [{ days: 7, credits: 500 }, { days: 14, credits: 900 }, { days: 30, credits: 1500 }];
const statusText: Record<string, string> = { pending: 'İnceleniyor', approved: 'Yayında', rejected: 'Reddedildi', ended: 'Sona erdi' };

export default function AdvertiseScreen({ token, credits, onBuyCredits, onCreditsChanged }: { token: string; credits: number | null; onBuyCredits: () => void; onCreditsChanged: () => void }) {
  const theme = useTheme();
  const [form, setForm] = useState({ firma: '', baslik: '', aciklama: '', telefon: '', link: '', gorselUrl: '', durationDays: 7 });
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const selected = PACKAGES.find((item) => item.days === form.durationDays)!;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithTimeout(`${API_URL}/ad-applications/mine`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Başvurular alınamadı.');
      setApplications(Array.isArray(data.items) ? data.items : []);
    } catch (error: any) { Alert.alert('Reklam Başvuruları', error.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Fotoğraf izni gerekli', 'Reklam görselini seçebilmek için fotoğraf erişimine izin verin.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]?.uri) return;
    const rendered = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 1200 } }], { compress: 0.62, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (rendered.base64) setForm((current) => ({ ...current, gorselUrl: `data:image/jpeg;base64,${rendered.base64}` }));
  };

  const submit = async () => {
    if (!form.firma.trim() || !form.baslik.trim()) return Alert.alert('Eksik bilgi', 'Firma ve reklam başlığını yazın.');
    if (!form.aciklama.trim() && !form.gorselUrl) return Alert.alert('Eksik içerik', 'Bir açıklama veya reklam görseli ekleyin.');
    if ((credits ?? 0) < selected.credits) return Alert.alert('Yetersiz kredi', `${selected.days} günlük reklam için ${selected.credits} kredi gerekiyor.`, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Kredi Al', onPress: onBuyCredits }]);
    setSending(true);
    try {
      if (!acceptedRules) return Alert.alert('Reklam kuralları', 'Başvuru göndermek için reklam yayın kurallarını kabul edin.');
      const response = await fetchWithTimeout(`${API_URL}/ad-applications`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, acceptedRules: true }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Başvuru gönderilemedi.');
      setForm({ firma: '', baslik: '', aciklama: '', telefon: '', link: '', gorselUrl: '', durationDays: 7 });
      setAcceptedRules(false);
      await Promise.all([load(), onCreditsChanged()]);
      Alert.alert('Başvuru alındı', 'Reklamınız yönetici onayına gönderildi. Onaylanınca otomatik olarak yayınlanacak. Reddedilirse krediniz iade edilir.');
    } catch (error: any) { Alert.alert('Reklam verilemedi', error.message); }
    finally { setSending(false); }
  };

  return <View>
    <CaylikScreenHeader icon="bullhorn-outline" eyebrow="ÇAYLIK REKLAM" title="Reklam Ver" description="Çay üreticilerine markanızı ve hizmetinizi tanıtın." />
    <View style={[styles.creditCard, { backgroundColor: theme.colors.primaryContainer }]}><View><Text style={[styles.creditLabel, { color: theme.colors.onSurfaceVariant }]}>Kullanılabilir krediniz</Text><Text style={[styles.creditValue, { color: theme.colors.primary }]}>{credits ?? 0} kredi</Text></View><TouchableOpacity style={[styles.buyButton, { backgroundColor: theme.colors.primary }]} onPress={onBuyCredits}><Text style={{ color: theme.colors.onPrimary, fontWeight: '900' }}>Kredi Al</Text></TouchableOpacity></View>

    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Yayın süresi seçin</Text>
    <View style={styles.packages}>{PACKAGES.map((item) => { const active = item.days === form.durationDays; return <TouchableOpacity key={item.days} onPress={() => setForm((current) => ({ ...current, durationDays: item.days }))} style={[styles.package, { backgroundColor: active ? theme.colors.primary : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.outlineVariant }]}><Text style={[styles.packageDays, { color: active ? theme.colors.onPrimary : theme.colors.onSurface }]}>{item.days} gün</Text><Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }}>{item.credits} kredi</Text></TouchableOpacity>; })}</View>

    <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
      <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Reklam bilgileri</Text>
      {[['firma', 'Firma / marka *'], ['baslik', 'Reklam başlığı *'], ['aciklama', 'Açıklama'], ['telefon', 'Telefon'], ['link', 'İnternet bağlantısı']].map(([key, label]) => <View key={key}><Text style={[styles.label, { color: theme.colors.onSurface }]}>{label}</Text><TextInput value={(form as any)[key]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} multiline={key === 'aciklama'} keyboardType={key === 'telefon' ? 'phone-pad' : key === 'link' ? 'url' : 'default'} autoCapitalize={key === 'link' ? 'none' : 'sentences'} style={[styles.input, key === 'aciklama' && styles.multiline, { color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]} placeholderTextColor={theme.colors.onSurfaceVariant} /></View>)}
      <TouchableOpacity style={[styles.imageButton, { borderColor: theme.colors.primary }]} onPress={() => void chooseImage()}><AppIcon name="image-plus" size={22} color={theme.colors.primary} /><Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{form.gorselUrl ? 'Görseli Değiştir' : 'Reklam Görseli Seç'}</Text></TouchableOpacity>
      {!!form.gorselUrl && <Image source={{ uri: form.gorselUrl }} style={styles.preview} resizeMode="cover" />}
      <View style={[styles.rules, { backgroundColor: theme.colors.surfaceVariant }]}><Text style={[styles.rulesTitle, { color: theme.colors.onSurface }]}>Reklam yayın kuralları</Text><Text style={[styles.info, { color: theme.colors.onSurfaceVariant }]}>Yanıltıcı, yasa dışı, müstehcen, nefret veya şiddet içeren; kişisel verileri ifşa eden; izinsiz marka ya da telifli görsel kullanan reklamlar yayınlanmaz. İletişim ve fiyat bilgilerinin doğruluğu reklam verene aittir.</Text><View style={styles.ruleAccept}><Switch value={acceptedRules} onValueChange={setAcceptedRules} /><Text style={{ color: theme.colors.onSurface, flex: 1, fontWeight: '700' }}>Kuralları okudum ve kabul ediyorum.</Text></View></View>
      <Text style={[styles.info, { color: theme.colors.onSurfaceVariant }]}>{selected.credits} kredi başvuru sırasında ayrılır. Yönetici reddederse tamamı hesabınıza geri yüklenir.</Text>
      <TouchableOpacity disabled={sending} onPress={() => void submit()} style={[styles.submit, { backgroundColor: theme.colors.primary, opacity: sending ? 0.6 : 1 }]}>{sending ? <ActivityIndicator color={theme.colors.onPrimary} /> : <><AppIcon name="send-outline" size={21} color={theme.colors.onPrimary} /><Text style={{ color: theme.colors.onPrimary, fontWeight: '900' }}>Onaya Gönder</Text></>}</TouchableOpacity>
    </View>

    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Başvurularım</Text>
    {loading ? <ActivityIndicator color={theme.colors.primary} /> : applications.length === 0 ? <Text style={{ color: theme.colors.onSurfaceVariant }}>Henüz reklam başvurunuz yok.</Text> : applications.map((item) => <View key={item._id} style={[styles.application, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}><View style={{ flex: 1 }}><Text style={[styles.applicationTitle, { color: theme.colors.onSurface }]}>{item.baslik}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{item.durationDays} gün · {item.creditsCharged} kredi</Text>{!!item.adminNote && <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 5 }}>Not: {item.adminNote}</Text>}</View><Text style={[styles.status, { color: item.status === 'approved' ? theme.colors.primary : item.status === 'rejected' ? theme.colors.error : theme.colors.secondary }]}>{statusText[item.status] || item.status}</Text></View>)}
  </View>;
}

const styles = StyleSheet.create({
  creditCard: { borderRadius: 22, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }, creditLabel: { fontSize: 12, fontWeight: '700' }, creditValue: { fontSize: 24, fontWeight: '900', marginTop: 3 }, buyButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 10, marginTop: 3 }, packages: { flexDirection: 'row', gap: 8, marginBottom: 18 }, package: { flex: 1, minHeight: 74, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, packageDays: { fontSize: 17, fontWeight: '900', marginBottom: 4 },
  formCard: { borderWidth: 1, borderRadius: 24, padding: 16, marginBottom: 22 }, formTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12 }, label: { fontSize: 12, fontWeight: '800', marginBottom: 6, marginTop: 8 }, input: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, fontSize: 14 }, multiline: { minHeight: 94, paddingTop: 12, textAlignVertical: 'top' }, imageButton: { minHeight: 50, borderRadius: 15, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, preview: { width: '100%', height: 150, borderRadius: 16, marginTop: 12 }, info: { fontSize: 12, lineHeight: 18, marginTop: 14 }, submit: { minHeight: 54, borderRadius: 17, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  application: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 }, applicationTitle: { fontSize: 15, fontWeight: '900', marginBottom: 4 }, status: { fontSize: 12, fontWeight: '900' }
  ,rules: { borderRadius: 15, padding: 12, marginTop: 14 }, rulesTitle: { fontSize: 13, fontWeight: '900' }, ruleAccept: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }
});
