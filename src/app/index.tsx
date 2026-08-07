import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  StatusBar,
  ScrollView,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const API_URL = 'https://cay-ureticisi-takip.onrender.com/api';

// Sunucunun uyanma ve yanıt verme süresi için 60 saniye zaman aşımı
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Sunucu yanıt vermekte gecikti. Lütfen birkaç saniye sonra tekrar deneyin.');
    }
    throw new Error('İnternet veya sunucu bağlantısı kurulamadı.');
  }
};

const formatTL = (val: number) =>
  `${(val || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'harvest' | 'collections' | 'expense' | 'producers' | 'gardens'>('dashboard');
  const [loading, setLoading] = useState(false);

  // Veri Listeleri
  const [harvests, setHarvests] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [gardens, setGardens] = useState<any[]>([]);

  // Form State'leri
  const [hForm, setHForm] = useState({
    date: new Date().toISOString().split('T')[0],
    surum: '1. Sürüm',
    producer: '',
    kg: '',
    firma: '',
    fiyat: '',
    tahsilat: '0',
    aciklama: '',
    garden: ''
  });

  const [eForm, setEForm] = useState({
    date: new Date().toISOString().split('T')[0],
    kategori: 'İşçilik',
    aciklama: '',
    tutar: ''
  });

  const [gForm, setGForm] = useState({ name: '', adaParsel: '', alan: '' });
  const [selectedProducer, setSelectedProducer] = useState('');

  // Verileri Sunucudan Çek
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resH, resE, resG] = await Promise.all([
        fetchWithTimeout(`${API_URL}/harvests`),
        fetchWithTimeout(`${API_URL}/expenses`),
        fetchWithTimeout(`${API_URL}/gardens`)
      ]);

      if (resH.ok) setHarvests(await resH.json());
      if (resE.ok) setExpenses(await resE.json());
      if (resG.ok) setGardens(await resG.json());
    } catch (err: any) {
      console.log('Veri çekme hatası:', err.message);
      Alert.alert('Bağlantı Kurulamadı', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Hesaplamalar
  const totalKg = harvests.reduce((acc, c) => acc + (Number(c.kg || c.weight) || 0), 0);
  const totalSales = harvests.reduce((acc, c) => acc + ((Number(c.kg || c.weight) || 0) * (Number(c.fiyat) || 0)), 0);
  const totalPay = harvests.reduce((acc, c) => acc + (Number(c.tahsilat) || 0), 0);
  const totalExp = expenses.reduce((acc, c) => acc + (Number(c.tutar) || 0), 0);
  const pendingCollection = totalSales - totalPay;
  const netProfit = totalSales - totalExp;

  const producers = Array.from(new Set(harvests.map(h => h.uretici || h.producerName).filter(Boolean)));

  // Genel Silme Fonksiyonu
  const handleDelete = (endpoint: string, id: string, title: string) => {
    Alert.alert(`${title} Silinsin mi?`, 'Bu işlem geri alınamaz.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await fetchWithTimeout(`${API_URL}/${endpoint}/${id}`, { method: 'DELETE' });
            fetchData();
          } catch (e: any) {
            Alert.alert('Hata', e.message);
            setLoading(false);
          }
        }
      }
    ]);
  };

  // Hasat Kaydetme (Gelişmiş Hata Yakalama Eklendi)
  const handleSaveHarvest = async () => {
    if (!hForm.producer.trim() || !hForm.kg.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen üretici adı ve KG alanlarını doldurun.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        tarih: hForm.date,
        surum: hForm.surum,
        uretici: hForm.producer.trim(),
        producerName: hForm.producer.trim(),
        kg: parseFloat(hForm.kg) || 0,
        weight: parseFloat(hForm.kg) || 0,
        firma: hForm.firma || '',
        fiyat: parseFloat(hForm.fiyat) || 0,
        tahsilat: parseFloat(hForm.tahsilat) || 0,
        aciklama: hForm.aciklama || '',
        bahce: hForm.garden.trim() || ''
      };

      const res = await fetchWithTimeout(`${API_URL}/harvests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Hasat kaydı eklendi.');
        setHForm({ ...hForm, producer: '', kg: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '' });
        fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        const errorMsg = errData?.message || errData?.error || `Sunucu Yanıt Kodu: ${res.status}`;
        Alert.alert('Kayıt Başarısız', `Sunucu Hatası: ${errorMsg}`);
      }
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Bahçe Kaydetme
  const handleSaveGarden = async () => {
    if (!gForm.name.trim() && !gForm.adaParsel.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen Bahçe Adı veya Ada/Parsel girin.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/gardens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gForm.name.trim(), adaParsel: gForm.adaParsel.trim(), alan: gForm.alan.trim() })
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Bahçe eklendi.');
        setGForm({ name: '', adaParsel: '', alan: '' });
        fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        Alert.alert('Hata', errData?.message || 'Bahçe eklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Gider Kaydetme
  const handleSaveExpense = async () => {
    if (!eForm.tutar.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen tutar girin.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarih: eForm.date,
          kategori: eForm.kategori,
          aciklama: eForm.aciklama,
          tutar: parseFloat(eForm.tutar) || 0
        })
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Gider eklendi.');
        setEForm({ ...eForm, aciklama: '', tutar: '' });
        fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        Alert.alert('Hata', errData?.message || 'Gider eklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1b4332" />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>🍃 ÇAY ÜRETİCİSİ YÖNETİM SİSTEMİ</Text>
          <Text style={styles.headerSub}>MOBİL SEZON TAKİP</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        >
          {/* ÖZET SEKMESİ */}
          {activeTab === 'dashboard' && (
            <View>
              <Text style={styles.sectionTitle}>📊 Sezon Özeti</Text>
              <View style={styles.grid}>
                <View style={[styles.card, { backgroundColor: '#2d6a4f' }]}>
                  <Text style={styles.cardLabel}>TOPLAM ÜRETİM</Text>
                  <Text style={styles.cardValue}>{totalKg.toLocaleString('tr-TR')} KG</Text>
                </View>
                <View style={[styles.card, { backgroundColor: '#1b4332' }]}>
                  <Text style={styles.cardLabel}>SATIŞ GELİRİ</Text>
                  <Text style={styles.cardValue}>{formatTL(totalSales)}</Text>
                </View>
                <View style={[styles.card, { backgroundColor: '#2a9d8f' }]}>
                  <Text style={styles.cardLabel}>TAHSİLAT</Text>
                  <Text style={styles.cardValue}>{formatTL(totalPay)}</Text>
                </View>
                <View style={[styles.card, { backgroundColor: '#e76f51' }]}>
                  <Text style={styles.cardLabel}>BEKLEYEN ALACAK</Text>
                  <Text style={styles.cardValue}>{formatTL(pendingCollection)}</Text>
                </View>
                <View style={[styles.card, { backgroundColor: '#e63946' }]}>
                  <Text style={styles.cardLabel}>TOPLAM GİDER</Text>
                  <Text style={styles.cardValue}>{formatTL(totalExp)}</Text>
                </View>
                <View style={[styles.card, { backgroundColor: '#52b788' }]}>
                  <Text style={styles.cardLabel}>NET KAZANÇ</Text>
                  <Text style={styles.cardValue}>{formatTL(netProfit)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* HASAT SEKMESİ */}
          {activeTab === 'harvest' && (
            <View>
              <View style={styles.formContainer}>
                <Text style={styles.sectionTitle}>🍃 Yeni Hasat Girişi</Text>

                <Text style={styles.label}>Tarih</Text>
                <TextInput style={styles.input} value={hForm.date} onChangeText={t => setHForm({ ...hForm, date: t })} />

                <Text style={styles.label}>Sürüm</Text>
                <TextInput style={styles.input} value={hForm.surum} onChangeText={t => setHForm({ ...hForm, surum: t })} placeholder="1. Sürüm" />

                <Text style={styles.label}>Üretici Adı</Text>
                <TextInput style={styles.input} value={hForm.producer} onChangeText={t => setHForm({ ...hForm, producer: t })} placeholder="Ahmet Yılmaz" />

                <Text style={styles.label}>Bahçe İsmi / Seçimi</Text>
                {gardens.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {gardens.map((g, idx) => {
                      const gLabel = g.name || g.adaParsel;
                      const isSelected = hForm.garden === gLabel;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.chip, isSelected && styles.activeChip]}
                          onPress={() => setHForm({ ...hForm, garden: isSelected ? '' : gLabel })}
                        >
                          <Text style={[styles.chipText, isSelected && styles.activeChipText]}>🏡 {gLabel}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
                <TextInput
                  style={styles.input}
                  value={hForm.garden}
                  onChangeText={t => setHForm({ ...hForm, garden: t })}
                  placeholder="Örn: A Bahçesi, Dere İçi..."
                />

                <Text style={styles.label}>Toplanan KG</Text>
                <TextInput style={styles.input} value={hForm.kg} onChangeText={t => setHForm({ ...hForm, kg: t })} keyboardType="numeric" placeholder="0.00" />

                <Text style={styles.label}>Satış Firması</Text>
                <TextInput style={styles.input} value={hForm.firma} onChangeText={t => setHForm({ ...hForm, firma: t })} placeholder="ÇAYKUR / Özel" />

                <Text style={styles.label}>Satış Fiyatı (TL/KG)</Text>
                <TextInput style={styles.input} value={hForm.fiyat} onChangeText={t => setHForm({ ...hForm, fiyat: t })} keyboardType="numeric" placeholder="0.00" />

                <Text style={styles.label}>Tahsilat (TL)</Text>
                <TextInput style={styles.input} value={hForm.tahsilat} onChangeText={t => setHForm({ ...hForm, tahsilat: t })} keyboardType="numeric" placeholder="0.00" />

                <TouchableOpacity style={[styles.submitBtn, loading && styles.disabledBtn]} onPress={handleSaveHarvest} disabled={loading}>
                  {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitBtnText}>💾 HASADI KAYDET</Text>}
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>📋 Hasat Kayıtları</Text>
              {harvests.map((h, i) => (
                <View key={h._id || i} style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{h.uretici || h.producerName}</Text>
                    <Text style={styles.itemSub}>{h.tarih} | {h.surum} {h.bahce ? `| 🏡 ${h.bahce}` : ''}</Text>
                    <Text style={styles.itemDetail}>{h.kg || h.weight} KG - {formatTL((h.kg || h.weight) * (h.fiyat || 0))}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete('harvests', h._id, 'Hasat')}>
                    <Text style={styles.deleteText}>🗑️ Sil</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* BAHÇE SEKMESİ */}
          {activeTab === 'gardens' && (
            <View>
              <Text style={styles.sectionTitle}>🏡 Yeni Bahçe Tanımla</Text>
              <View style={styles.formContainer}>
                <Text style={styles.label}>Bahçe Adı / Özel İsim</Text>
                <TextInput style={styles.input} value={gForm.name} onChangeText={t => setGForm({ ...gForm, name: t })} placeholder="Örn: A Bahçesi" />

                <Text style={styles.label}>Ada / Parsel Bilgisi</Text>
                <TextInput style={styles.input} value={gForm.adaParsel} onChangeText={t => setGForm({ ...gForm, adaParsel: t })} placeholder="Örn: Ada 102 / Parsel 4" />

                <Text style={styles.label}>Alan (Dönüm / m²)</Text>
                <TextInput style={styles.input} value={gForm.alan} onChangeText={t => setGForm({ ...gForm, alan: t })} placeholder="Örn: 4 Dönüm" />

                <TouchableOpacity style={[styles.submitBtn, loading && styles.disabledBtn]} onPress={handleSaveGarden} disabled={loading}>
                  {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitBtnText}>➕ BAHÇEYİ EKLE</Text>}
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>📊 Bahçelere Göre Toplam Çay Rekoltesi</Text>
              {gardens.map((g, i) => {
                const gardenName = g.name || g.adaParsel;
                const gardenHarvests = harvests.filter(h => h.bahce && h.bahce.toLowerCase().trim() === gardenName.toLowerCase().trim());
                const totalGardenKg = gardenHarvests.reduce((acc, c) => acc + (Number(c.kg || c.weight) || 0), 0);

                return (
                  <View key={g._id || i} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>🏡 {g.name ? g.name : 'İsimsiz Bahçe'}</Text>
                      {g.adaParsel ? <Text style={styles.itemSub}>📍 {g.adaParsel}</Text> : null}
                      <Text style={{ fontSize: 11, color: '#2d6a4f', marginTop: 4 }}>{gardenHarvests.length} ayrı kayıt bulundu</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                      <Text style={[styles.cardValue, { color: '#1b4332', fontSize: 18, fontWeight: 'bold' }]}>
                        {totalGardenKg.toLocaleString('tr-TR')} KG
                      </Text>
                      <Text style={{ fontSize: 10, color: '#666' }}>Toplam Çay</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete('gardens', g._id, 'Bahçe')}>
                      <Text style={styles.deleteText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* TAHSİLAT SEKMESİ */}
          {activeTab === 'collections' && (
            <View>
              <Text style={styles.sectionTitle}>💰 Tahsilat Yönetimi</Text>
              {harvests.map((h, i) => {
                const sale = (Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0);
                const currentTahsilat = Number(h.tahsilat) || 0;
                const rem = sale - currentTahsilat;

                return (
                  <View key={h._id || i} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{h.uretici || h.producerName}</Text>
                      <Text style={styles.itemSub}>{h.tarih} | {h.surum}</Text>
                      <Text style={styles.itemDetail}>Satış: {formatTL(sale)} | Tahsilat: {formatTL(currentTahsilat)}</Text>
                    </View>
                    <Text style={styles.kalanBadge}>Kalan: {formatTL(rem)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* GİDER SEKMESİ */}
          {activeTab === 'expense' && (
            <View>
              <Text style={styles.sectionTitle}>💸 Gider Yönetimi</Text>
              <View style={styles.formContainer}>
                <Text style={styles.label}>Kategori</Text>
                <TextInput style={styles.input} value={eForm.kategori} onChangeText={t => setEForm({ ...eForm, kategori: t })} placeholder="İşçilik, Gübre..." />

                <Text style={styles.label}>Açıklama</Text>
                <TextInput style={styles.input} value={eForm.aciklama} onChangeText={t => setEForm({ ...eForm, aciklama: t })} placeholder="Detaylar..." />

                <Text style={styles.label}>Tutar (TL)</Text>
                <TextInput style={styles.input} value={eForm.tutar} onChangeText={t => setEForm({ ...eForm, tutar: t })} keyboardType="numeric" placeholder="0.00" />

                <TouchableOpacity style={[styles.submitBtn, loading && styles.disabledBtn]} onPress={handleSaveExpense} disabled={loading}>
                  {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitBtnText}>💾 GİDERİ KAYDET</Text>}
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>Geçmiş Giderler</Text>
              {expenses.map((e, i) => (
                <View key={e._id || i} style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{e.kategori}</Text>
                    <Text style={styles.itemSub}>{e.tarih} | {e.aciklama}</Text>
                  </View>
                  <Text style={styles.expensePrice}>-{formatTL(e.tutar)}</Text>
                  <TouchableOpacity onPress={() => handleDelete('expenses', e._id, 'Gider')} style={{ marginLeft: 10 }}>
                    <Text style={styles.deleteText}>🗑️ Sil</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ÜRETİCİ SEKMESİ */}
          {activeTab === 'producers' && (
            <View>
              <Text style={styles.sectionTitle}>👥 Üretici Kartları</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                {producers.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, selectedProducer === p && styles.activeChip]}
                    onPress={() => setSelectedProducer(p)}
                  >
                    <Text style={[styles.chipText, selectedProducer === p && styles.activeChipText]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {selectedProducer !== '' && (
                <View>
                  <Text style={styles.itemTitle}>{selectedProducer} - İşlem Geçmişi</Text>
                  {harvests.filter(h => (h.uretici || h.producerName) === selectedProducer).map((h, i) => (
                    <View key={i} style={styles.listItem}>
                      <Text style={styles.itemSub}>{h.tarih} | {h.kg || h.weight} KG {h.bahce ? `| 🏡 ${h.bahce}` : ''}</Text>
                      <Text style={styles.itemTitle}>{formatTL((h.kg || h.weight) * (h.fiyat || 0))}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* NAVİGASYON BARI */}
        <View style={styles.navBar}>
          {[
            { id: 'dashboard', icon: '📊', label: 'Özet' },
            { id: 'harvest', icon: '🍃', label: 'Hasat' },
            { id: 'gardens', icon: '🏡', label: 'Bahçe' },
            { id: 'collections', icon: '💰', label: 'Tahsilat' },
            { id: 'expense', icon: '💸', label: 'Gider' },
            { id: 'producers', icon: '👥', label: 'Üretici' }
          ].map(tab => (
            <TouchableOpacity key={tab.id} style={styles.navItem} onPress={() => setActiveTab(tab.id as any)}>
              <Text style={[styles.navIcon, activeTab === tab.id && styles.activeNav]}>{tab.icon}</Text>
              <Text style={[styles.navText, activeTab === tab.id && styles.activeNav]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  header: { backgroundColor: '#1b4332', padding: 14, alignItems: 'center' },
  headerTitle: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  headerSub: { color: '#d8f3dc', fontSize: 10, fontWeight: '600', marginTop: 2 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 30 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#081c15', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48%', padding: 14, borderRadius: 10, marginBottom: 10 },
  cardLabel: { color: '#ffffff', fontSize: 10, fontWeight: 'bold', opacity: 0.9 },
  cardValue: { color: '#ffffff', fontSize: 15, fontWeight: 'bold', marginTop: 4 },
  formContainer: { backgroundColor: '#ffffff', padding: 14, borderRadius: 10, borderBottomWidth: 1, borderColor: '#e0e0e0', marginBottom: 10 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#333', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, fontSize: 14, backgroundColor: '#fff', marginBottom: 6 },
  submitBtn: { backgroundColor: '#2d6a4f', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  disabledBtn: { backgroundColor: '#a5d6a7' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  listItem: { backgroundColor: '#fff', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  itemTitle: { fontSize: 14, fontWeight: 'bold', color: '#1b4332' },
  itemSub: { fontSize: 11, color: '#666', marginTop: 2 },
  itemDetail: { fontSize: 12, color: '#333', marginTop: 4 },
  kalanBadge: { fontSize: 11, fontWeight: 'bold', color: '#e63946', backgroundColor: '#ffe3e3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  expensePrice: { fontSize: 14, fontWeight: 'bold', color: '#e63946' },
  chip: { backgroundColor: '#e0e0e0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6 },
  activeChip: { backgroundColor: '#1b4332' },
  chipText: { fontSize: 11, color: '#333' },
  activeChipText: { color: '#fff', fontWeight: 'bold' },
  navBar: { flexDirection: 'row', backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e0e0e0', paddingVertical: 6 },
  navItem: { flex: 1, alignItems: 'center' },
  navIcon: { fontSize: 16, opacity: 0.5 },
  navText: { fontSize: 9, color: '#666', marginTop: 2 },
  activeNav: { color: '#1b4332', opacity: 1, fontWeight: 'bold' },
  deleteText: { color: '#e63946', fontSize: 12, fontWeight: 'bold' }
});