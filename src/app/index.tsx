import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  StatusBar
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const API_URL = "https://cay-ureticisi-takip.onrender.com/api";
const ADMIN_PHONE = "05432037007";
const SESSION_KEY = '@cay_takip_user_session';

// ==========================================
// TYPES
// ==========================================
interface UserSession {
  userId: string;
  name: string;
  phone: string;
  role: 'admin' | 'user';
}

// ==========================================
// HELPERS & STORAGE SERVICES
// ==========================================
const saveSession = async (user: UserSession) => {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Session save error:', e);
  }
};

const getSession = async (): Promise<UserSession | null> => {
  try {
    const jsonValue = await AsyncStorage.getItem(SESSION_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error('Session read error:', e);
    return null;
  }
};

const clearSession = async () => {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.error('Session clear error:', e);
  }
};

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

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function App() {
  // Kullanıcı Giriş / Kayıt State'leri
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');

  // Navigasyon ve Yüklenme State'leri
  const [activeTab, setActiveTab] = useState<'dashboard' | 'harvest' | 'collections' | 'expense' | 'gardens' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

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

  // Tahsilat Düzenleme Modal State'leri
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingHarvest, setEditingHarvest] = useState<any>(null);
  const [editTahsilatVal, setEditTahsilatVal] = useState('');

  // Toplu Tahsilat State'leri
  const [bulkCollections, setBulkCollections] = useState<{ id: string; producer: string; tutar: string; aciklama: string }[]>([
    { id: '1', producer: '', tutar: '', aciklama: '' }
  ]);

  const isAdmin = currentUser?.role === 'admin';

  // Uygulama Açılışında Oturumu Kontrol Et
  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const savedUser = await getSession();
        if (savedUser) {
          setCurrentUser(savedUser);
        }
      } catch (error) {
        console.log('Oturum okuma hatası:', error);
      } finally {
        setInitialCheckDone(true);
      }
    };
    checkSavedSession();
  }, []);

  // Verileri Sunucudan Çek ve userId / Telefon Filtrelemesi Yap
  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [resH, resE, resG] = await Promise.all([
        fetchWithTimeout(`${API_URL}/harvests`),
        fetchWithTimeout(`${API_URL}/expenses`),
        fetchWithTimeout(`${API_URL}/gardens`)
      ]);

      let rawH = resH.ok ? await resH.json() : [];
      let rawE = resE.ok ? await resE.json() : [];
      let rawG = resG.ok ? await resG.json() : [];

      if (!isAdmin) {
        const currentUserId = currentUser.userId;
        const uPhone = currentUser.phone;
        const uName = currentUser.name.toLowerCase().trim();

        // userId öncelikli, geriye dönük uyumluluk için telefon/isim eşleşmesi desteği
        rawH = (rawH || []).filter((h: any) => {
          if (h.userId) return h.userId === currentUserId;
          if (!h.userPhone && !h.uretici && !h.producerName) return true;
          const matchPhone = h.userPhone === uPhone;
          const matchName =
            (h.uretici && h.uretici.toLowerCase().trim().includes(uName)) ||
            (h.producerName && h.producerName.toLowerCase().trim().includes(uName));
          return matchPhone || matchName || !h.userPhone;
        });

        rawE = (rawE || []).filter((e: any) => (e.userId ? e.userId === currentUserId : !e.userPhone || e.userPhone === uPhone));
        rawG = (rawG || []).filter((g: any) => (g.userId ? g.userId === currentUserId : !g.userPhone || g.userPhone === uPhone));
      }

      setHarvests(rawH || []);
      setExpenses(rawE || []);
      setGardens(rawG || []);
    } catch (err: any) {
      console.log('Veri çekme hatası:', err.message);
      Alert.alert('Bağlantı Kurulamadı', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  // Giriş Yap / Kayıt Ol İşlemleri (userId Oluşturma Dahil)
  const handleAuth = async () => {
    const cleanPhone = authPhone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      Alert.alert('Eksik Bilgi', 'Lütfen en az 10 haneli geçerli bir telefon numarası girin.');
      return;
    }

    const isAdminUser = cleanPhone === ADMIN_PHONE || authName.toLowerCase().includes('admin');
    const userRole: 'admin' | 'user' = isAdminUser ? 'admin' : 'user';

    const generatedUserId = `usr_${cleanPhone}`;

    const userData: UserSession = {
      userId: generatedUserId,
      name: authName.trim() || (isAdminUser ? 'Yönetici' : 'Üretici'),
      phone: cleanPhone,
      role: userRole
    };

    if (authMode === 'register') {
      if (!authName.trim()) {
        Alert.alert('Eksik Bilgi', 'Lütfen Adınız ve Soyadınızı girin.');
        return;
      }
      setCurrentUser(userData);
      await saveSession(userData);
      Alert.alert('Kayıt Başarılı', `Hoş geldiniz, ${authName.trim()}! ${isAdminUser ? '(Admin Yetkisi Tanımlandı)' : ''}`);
    } else {
      setCurrentUser(userData);
      await saveSession(userData);
      Alert.alert('Giriş Başarılı', 'Uygulamaya giriş yapıldı.');
    }
  };

  // Çıkış Yap İşlemi
  const handleLogout = async () => {
    await clearSession();
    setCurrentUser(null);
  };

  // Hesaplamalar
  const totalKg = (harvests || []).reduce((acc, c) => acc + (Number(c.kg || c.weight) || 0), 0);
  const totalSales = (harvests || []).reduce((acc, c) => acc + ((Number(c.kg || c.weight) || 0) * (Number(c.fiyat) || 0)), 0);
  const totalPay = (harvests || []).reduce((acc, c) => acc + (Number(c.tahsilat) || 0), 0);
  const totalExp = (expenses || []).reduce((acc, c) => acc + (Number(c.tutar) || 0), 0);
  const pendingCollection = totalSales - totalPay;
  const netProfit = totalSales - totalExp;

  // Admin Paneli İçin Üretici Bazlı Gruplama
  const getAdminProducerSummary = () => {
    const summaryMap: { [key: string]: { name: string; totalKg: number; totalSales: number; totalPay: number; count: number } } = {};

    harvests.forEach(h => {
      const key = h.userId || (h.uretici || h.producerName || 'Bilinmeyen Üretici').trim();
      const pName = (h.uretici || h.producerName || 'Bilinmeyen Üretici').trim();

      if (!summaryMap[key]) {
        summaryMap[key] = { name: pName, totalKg: 0, totalSales: 0, totalPay: 0, count: 0 };
      }
      const kg = Number(h.kg || h.weight) || 0;
      const fiyat = Number(h.fiyat) || 0;
      const pay = Number(h.tahsilat) || 0;

      summaryMap[key].totalKg += kg;
      summaryMap[key].totalSales += kg * fiyat;
      summaryMap[key].totalPay += pay;
      summaryMap[key].count += 1;
    });

    return Object.values(summaryMap);
  };

  // Silme Fonksiyonu
  const handleDelete = (endpoint: string, id: string, title: string) => {
    Alert.alert(`${title} Silinsin mi?`, 'Bu işlem geri alınamaz.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const res = await fetchWithTimeout(`${API_URL}/${endpoint}/${id}`, { method: 'DELETE' });
            if (res.ok) {
              await fetchData();
            } else {
              Alert.alert('Hata', 'Silme işlemi gerçekleşmedi.');
              setLoading(false);
            }
          } catch (e: any) {
            Alert.alert('Hata', e.message);
            setLoading(false);
          }
        }
      }
    ]);
  };

  // Hasat Kaydetme
  const handleSaveHarvest = async () => {
    const producerName = hForm.producer.trim() || currentUser?.name || 'Üretici';
    if (!hForm.kg.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen KG alanını doldurun.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        userId: currentUser?.userId,
        userPhone: currentUser?.phone,
        tarih: hForm.date,
        surum: hForm.surum,
        uretici: producerName,
        producerName: producerName,
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
        await fetchData();
        setActiveTab('dashboard');
      } else {
        const errData = await res.json().catch(() => null);
        Alert.alert('Kayıt Başarısız', errData?.message || `Sunucu Hatası: ${res.status}`);
      }
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Tahsilat Ekleme
  const processSingleCollection = async (selectedProdName: string, payAmount: number) => {
    const targetHarvests = harvests.filter(h => {
      const pName = (h.uretici || h.producerName || '').trim().toLowerCase();
      return pName === selectedProdName.trim().toLowerCase();
    });

    if (targetHarvests.length === 0) return false;

    let remainingPayment = payAmount;
    for (const h of targetHarvests) {
      if (remainingPayment <= 0) break;

      const totalSale = (Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0);
      const currentPay = Number(h.tahsilat) || 0;
      const remainingDebt = totalSale - currentPay;

      if (remainingDebt > 0) {
        const addPay = Math.min(remainingDebt, remainingPayment);
        const updatedPay = currentPay + addPay;

        await fetchWithTimeout(`${API_URL}/harvests/${h._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tahsilat: updatedPay })
        });

        remainingPayment -= addPay;
      }
    }
    return true;
  };

  // Toplu Tahsilat İşleme
  const handleSaveBulkCollections = async () => {
    const validItems = bulkCollections.filter(item => item.producer.trim() && !isNaN(parseFloat(item.tutar)) && parseFloat(item.tutar) > 0);

    if (validItems.length === 0) {
      Alert.alert('Eksik Bilgi', 'Lütfen en az bir geçerli üretici ve tutar girin.');
      return;
    }

    setLoading(true);
    try {
      let processedCount = 0;
      for (const item of validItems) {
        const success = await processSingleCollection(item.producer, parseFloat(item.tutar));
        if (success) processedCount++;
      }

      Alert.alert('Başarılı', `${processedCount} adet tahsilat işlemi başarıyla tamamlandı.`);
      setBulkCollections([{ id: '1', producer: '', tutar: '', aciklama: '' }]);
      await fetchData();
    } catch (e: any) {
      Alert.alert('İşlem Başarısız', e.message);
    } finally {
      setLoading(false);
    }
  };

  const addBulkRow = () => {
    setBulkCollections([
      ...bulkCollections,
      { id: Date.now().toString(), producer: '', tutar: '', aciklama: '' }
    ]);
  };

  const removeBulkRow = (id: string) => {
    if (bulkCollections.length === 1) return;
    setBulkCollections(bulkCollections.filter(item => item.id !== id));
  };

  const updateBulkRow = (id: string, field: string, value: string) => {
    setBulkCollections(bulkCollections.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // CSV Dışa Aktarma
  const exportToCSV = async () => {
    try {
      let csvContent = 'Tarih,Surum,Uretici,KG,Firma,Fiyat,Tahsilat,Bahce,Aciklama\n';
      harvests.forEach(h => {
        csvContent += `"${h.tarih || ''}","${h.surum || ''}","${h.uretici || h.producerName || ''}",${h.kg || h.weight || 0},"${h.firma || ''}",${h.fiyat || 0},${h.tahsilat || 0},"${h.bahce || ''}","${h.aciklama || ''}"\n`;
      });

      const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const fileUri = baseDir + `hasat_listesi_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Başarılı', `Dosya oluşturuldu: ${fileUri}`);
      }
    } catch (error: any) {
      Alert.alert('Hata', 'CSV aktarımı başarısız: ' + error.message);
    }
  };

  // CSV İçe Aktarma
  const importFromCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });

      const lines = fileContent.split('\n');
      if (lines.length <= 1) {
        Alert.alert('Hata', 'Dosya boş veya geçersiz formatta.');
        return;
      }

      setLoading(true);
      let importedCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length < 4) continue;

        const payload = {
          userId: currentUser?.userId,
          userPhone: currentUser?.phone,
          tarih: cols[0] || new Date().toISOString().split('T')[0],
          surum: cols[1] || '1. Sürüm',
          uretici: cols[2],
          producerName: cols[2],
          kg: parseFloat(cols[3]) || 0,
          weight: parseFloat(cols[3]) || 0,
          firma: cols[4] || '',
          fiyat: parseFloat(cols[5]) || 0,
          tahsilat: parseFloat(cols[6]) || 0,
          bahce: cols[7] || '',
          aciklama: cols[8] || ''
        };

        if (payload.uretici) {
          await fetchWithTimeout(`${API_URL}/harvests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          importedCount++;
        }
      }

      Alert.alert('Başarılı', `${importedCount} adet kayıt içe aktarıldı.`);
      await fetchData();
    } catch (error: any) {
      Alert.alert('Hata', 'İçe aktarım başarısız: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Tahsilat Düzenleme Modalı Aç
  const openEditModal = (harvestItem: any) => {
    setEditingHarvest(harvestItem);
    setEditTahsilatVal(String(harvestItem.tahsilat || 0));
    setEditModalVisible(true);
  };

  const handleUpdateCollection = async () => {
    if (!editingHarvest) return;
    const newTahsilat = parseFloat(editTahsilatVal);
    if (isNaN(newTahsilat) || newTahsilat < 0) {
      Alert.alert('Hata', 'Lütfen geçerli bir tutar girin.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/harvests/${editingHarvest._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahsilat: newTahsilat })
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Tahsilat tutarı güncellendi.');
        setEditModalVisible(false);
        setEditingHarvest(null);
        await fetchData();
      } else {
        Alert.alert('Hata', 'Tahsilat güncellenemedi.');
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
        body: JSON.stringify({
          userId: currentUser?.userId,
          userPhone: currentUser?.phone,
          name: gForm.name.trim(),
          adaParsel: gForm.adaParsel.trim(),
          alan: gForm.alan.trim()
        })
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Bahçe eklendi.');
        setGForm({ name: '', adaParsel: '', alan: '' });
        await fetchData();
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
          userId: currentUser?.userId,
          userPhone: currentUser?.phone,
          tarih: eForm.date,
          kategori: eForm.kategori,
          aciklama: eForm.aciklama,
          tutar: parseFloat(eForm.tutar) || 0
        })
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Gider eklendi.');
        setEForm({ ...eForm, aciklama: '', tutar: '' });
        await fetchData();
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

  // Açılış Yükleniyor Kontrolü
  if (!initialCheckDone) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1b4332" />
      </View>
    );
  }

  // GİRİŞ / KAYIT EKRANI
  if (!currentUser) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { justifyContent: 'center', padding: 20 }]}>
          <StatusBar barStyle="light-content" backgroundColor="#1b4332" />
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>🍃 ÇAY ÜRETİCİ SİSTEMİ</Text>
            <Text style={styles.authSubTitle}>
              {authMode === 'login' ? 'Telefon Numarası ile Giriş Yap' : 'Yeni Üretici Kaydı Oluştur'}
            </Text>

            {authMode === 'register' && (
              <View style={{ width: '100%' }}>
                <Text style={styles.label}>Ad Soyad</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ahmet Yılmaz"
                  value={authName}
                  onChangeText={setAuthName}
                />
              </View>
            )}

            <Text style={styles.label}>Telefon Numarası</Text>
            <TextInput
              style={styles.input}
              placeholder="05XXXXXXXXX"
              keyboardType="phone-pad"
              value={authPhone}
              onChangeText={setAuthPhone}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAuth}>
              <Text style={styles.submitBtnText}>
                {authMode === 'login' ? '📱 GİRİŞ YAP' : '📝 KAYIT OL VE GİRİŞ YAP'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 15 }}
              onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            >
              <Text style={{ color: '#1b4332', fontWeight: 'bold', textDecorationLine: 'underline' }}>
                {authMode === 'login'
                  ? 'Hesabınız yok mu? Telefonla Kayıt Olun'
                  : 'Zaten hesabınız var mı? Giriş Yapın'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ANA UYGULAMA EKRANI
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1b4332" />

        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>🍃 ÇAY ÜRETİCİSİ YÖNETİM SİSTEMİ</Text>
            <Text style={styles.headerSubtitle}>
              Hoş geldin, {currentUser.name} {isAdmin ? '(Yönetici)' : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Çıkış</Text>
          </TouchableOpacity>
        </View>

        {/* TAB MENÜSÜ */}
        <View style={styles.navBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'dashboard' && styles.navItemActive]}
              onPress={() => setActiveTab('dashboard')}
            >
              <Text style={[styles.navText, activeTab === 'dashboard' && styles.navTextActive]}>📊 Özet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === 'harvest' && styles.navItemActive]}
              onPress={() => setActiveTab('harvest')}
            >
              <Text style={[styles.navText, activeTab === 'harvest' && styles.navTextActive]}>🌱 Hasat Ekle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === 'collections' && styles.navItemActive]}
              onPress={() => setActiveTab('collections')}
            >
              <Text style={[styles.navText, activeTab === 'collections' && styles.navTextActive]}>💵 Tahsilat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === 'expense' && styles.navItemActive]}
              onPress={() => setActiveTab('expense')}
            >
              <Text style={[styles.navText, activeTab === 'expense' && styles.navTextActive]}>📉 Giderler</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === 'gardens' && styles.navItemActive]}
              onPress={() => setActiveTab('gardens')}
            >
              <Text style={[styles.navText, activeTab === 'gardens' && styles.navTextActive]}>🏡 Bahçeler</Text>
            </TouchableOpacity>

            {/* ADMIN SEKMESİ */}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.navItem, activeTab === 'admin' && styles.navItemActiveAdmin]}
                onPress={() => setActiveTab('admin')}
              >
                <Text style={[styles.navText, activeTab === 'admin' && styles.navTextActiveAdmin]}>👑 Admin Paneli</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* İÇERİK ALANI */}
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} colors={['#1b4332']} />}
        >
          {/* DASHBOARD TABI */}
          {activeTab === 'dashboard' && (
            <View>
              <Text style={styles.sectionTitle}>GENEL ÖZET PANELİ</Text>

              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderLeftColor: '#2a9d8f' }]}>
                  <Text style={styles.statTitle}>Toplam Hasat</Text>
                  <Text style={styles.statValue}>{totalKg.toLocaleString('tr-TR')} KG</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#e76f51' }]}>
                  <Text style={styles.statTitle}>Toplam Satış Tutarı</Text>
                  <Text style={styles.statValue}>{formatTL(totalSales)}</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#38b000' }]}>
                  <Text style={styles.statTitle}>Yapılan Tahsilat</Text>
                  <Text style={styles.statValue}>{formatTL(totalPay)}</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#d62828' }]}>
                  <Text style={styles.statTitle}>Kalan Alacak / Bekleyen</Text>
                  <Text style={[styles.statValue, { color: pendingCollection > 0 ? '#d62828' : '#2b9348' }]}>
                    {formatTL(pendingCollection)}
                  </Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#f4a261' }]}>
                  <Text style={styles.statTitle}>Toplam Gider</Text>
                  <Text style={styles.statValue}>{formatTL(totalExp)}</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#1d3557' }]}>
                  <Text style={styles.statTitle}>Net Kar / Bakiye</Text>
                  <Text style={[styles.statValue, { color: netProfit >= 0 ? '#2b9348' : '#d62828' }]}>
                    {formatTL(netProfit)}
                  </Text>
                </View>
              </View>

              {/* CSV AKTARIM BUTONLARI */}
              <View style={styles.csvContainer}>
                <TouchableOpacity style={styles.csvExportBtn} onPress={exportToCSV}>
                  <Text style={styles.csvBtnText}>📄 CSV İndir / Paylaş</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.csvImportBtn} onPress={importFromCSV}>
                  <Text style={styles.csvBtnText}>📥 CSV İçe Aktar</Text>
                </TouchableOpacity>
              </View>

              {/* RECENT HARVESTS LIST */}
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>SON HASAT KAYITLARI</Text>
              {harvests.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bir hasat yok.</Text>
              ) : (
                harvests.slice(0, 10).map((item, index) => {
                  const saleVal = (Number(item.kg || item.weight) || 0) * (Number(item.fiyat) || 0);
                  const payVal = Number(item.tahsilat) || 0;
                  const remaining = saleVal - payVal;

                  return (
                    <View key={item._id || index} style={styles.listItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listTitle}>
                          {item.uretici || item.producerName || 'Bilinmeyen Üretici'} ({item.surum || '1. Sürüm'})
                        </Text>
                        <Text style={styles.listSubText}>
                          📅 {item.tarih || 'Tarih Yok'} | ⚖️ {item.kg || item.weight || 0} KG | 💵 Fiyat: {item.fiyat || 0} TL
                        </Text>
                        {item.bahce ? <Text style={styles.listSubText}>🏡 Bahçe: {item.bahce}</Text> : null}
                        <Text style={styles.listSubText}>
                          💰 Toplam: {formatTL(saleVal)} | 🟢 Ödenen: {formatTL(payVal)}
                        </Text>
                        <Text style={{ color: remaining > 0 ? '#d62828' : '#2b9348', fontWeight: 'bold', marginTop: 2 }}>
                          {remaining > 0 ? `🔴 Kalan Borç: ${formatTL(remaining)}` : '🟢 Tamamı Ödendi'}
                        </Text>
                      </View>
                      <View style={{ gap: 5 }}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                          <Text style={styles.actionBtnText}>✏️ Ödeme</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('harvests', item._id, 'Hasat')}>
                          <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* HASAT EKLE TABI */}
          {activeTab === 'harvest' && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>🌱 YENİ HASAT / SATIŞ KAYDI</Text>

              <Text style={styles.label}>Tarih</Text>
              <TextInput
                style={styles.input}
                value={hForm.date}
                onChangeText={(t) => setHForm({ ...hForm, date: t })}
                placeholder="YYYY-MM-DD"
              />

              <Text style={styles.label}>Sürüm Seçimi</Text>
              <View style={styles.rowBtnGroup}>
                {['1. Sürüm', '2. Sürüm', '3. Sürüm', '4. Sürüm'].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.groupBtn, hForm.surum === s && styles.groupBtnActive]}
                    onPress={() => setHForm({ ...hForm, surum: s })}
                  >
                    <Text style={[styles.groupBtnText, hForm.surum === s && styles.groupBtnTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Üretici Adı</Text>
              <TextInput
                style={styles.input}
                value={hForm.producer}
                onChangeText={(t) => setHForm({ ...hForm, producer: t })}
                placeholder={currentUser.name}
              />

              <Text style={styles.label}>Miktar (KG)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={hForm.kg}
                onChangeText={(t) => setHForm({ ...hForm, kg: t })}
                placeholder="Örn: 250"
              />

              <Text style={styles.label}>Firma / Çay Fabrikası</Text>
              <TextInput
                style={styles.input}
                value={hForm.firma}
                onChangeText={(t) => setHForm({ ...hForm, firma: t })}
                placeholder="Örn: ÇAYKUR / Özel Fabrika"
              />

              <Text style={styles.label}>Birim Fiyat (TL/KG)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={hForm.fiyat}
                onChangeText={(t) => setHForm({ ...hForm, fiyat: t })}
                placeholder="Örn: 19.00"
              />

              <Text style={styles.label}>Peşin Tahsil Edilen Tutar (TL)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={hForm.tahsilat}
                onChangeText={(t) => setHForm({ ...hForm, tahsilat: t })}
                placeholder="0"
              />

              <Text style={styles.label}>Bahçe Seçimi / Tanımı</Text>
              <TextInput
                style={styles.input}
                value={hForm.garden}
                onChangeText={(t) => setHForm({ ...hForm, garden: t })}
                placeholder="Örn: Derebaşı Bahçe"
              />

              <Text style={styles.label}>Açıklama / Not</Text>
              <TextInput
                style={styles.input}
                value={hForm.aciklama}
                onChangeText={(t) => setHForm({ ...hForm, aciklama: t })}
                placeholder="İsteğe bağlı not..."
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveHarvest}>
                <Text style={styles.submitBtnText}>💾 HASAT KAYDINI KAYDET</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* TAHSİLAT TABI */}
          {activeTab === 'collections' && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>💵 TOPLU / TEKİL TAHSİLAT GİRİŞİ</Text>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 15 }}>
                Aşağıdaki alandan üreticilerin aldığı ödemeleri toplu olarak girebilirsiniz. Sistem otomatik olarak eski borçlardan düşecektir.
              </Text>

              {bulkCollections.map((item, index) => (
                <View key={item.id} style={styles.bulkRow}>
                  <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Ödeme #{index + 1}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Üretici Adı Soyadı"
                    value={item.producer}
                    onChangeText={(v) => updateBulkRow(item.id, 'producer', v)}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Tahsil Edilen Tutar (TL)"
                    keyboardType="numeric"
                    value={item.tutar}
                    onChangeText={(v) => updateBulkRow(item.id, 'tutar', v)}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Açıklama (Opsiyonel)"
                    value={item.aciklama}
                    onChangeText={(v) => updateBulkRow(item.id, 'aciklama', v)}
                  />

                  {bulkCollections.length > 1 && (
                    <TouchableOpacity style={styles.removeRowBtn} onPress={() => removeBulkRow(item.id)}>
                      <Text style={{ color: '#d62828', fontWeight: 'bold' }}>❌ Bu Satırı Sil</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.addRowBtn} onPress={addBulkRow}>
                <Text style={styles.addRowBtnText}>➕ Yeni Satır Ekle</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.submitBtn, { marginTop: 15 }]} onPress={handleSaveBulkCollections}>
                <Text style={styles.submitBtnText}>💰 TAHSİLATLARI İŞLE</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* GİDERLER TABI */}
          {activeTab === 'expense' && (
            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>📉 YENİ GİDER KAYDI</Text>

                <Text style={styles.label}>Tarih</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.date}
                  onChangeText={(t) => setEForm({ ...eForm, date: t })}
                  placeholder="YYYY-MM-DD"
                />

                <Text style={styles.label}>Kategori</Text>
                <View style={styles.rowBtnGroup}>
                  {['İşçilik', 'Gübre', 'Ulaşım', 'Yemek', 'Diğer'].map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.groupBtn, eForm.kategori === cat && styles.groupBtnActive]}
                      onPress={() => setEForm({ ...eForm, kategori: cat })}
                    >
                      <Text style={[styles.groupBtnText, eForm.kategori === cat && styles.groupBtnTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Tutar (TL)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={eForm.tutar}
                  onChangeText={(t) => setEForm({ ...eForm, tutar: t })}
                  placeholder="0.00"
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

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>KAYITLI GİDERLER</Text>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bir gider bulunmuyor.</Text>
              ) : (
                expenses.map((exp, idx) => (
                  <View key={exp._id || idx} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>🏷️ {exp.kategori || 'Genel Gider'}</Text>
                      <Text style={styles.listSubText}>📅 {exp.tarih || 'Tarih Yok'} | {exp.aciklama}</Text>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#d62828', marginTop: 3 }}>
                        {formatTL(exp.tutar)}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('expenses', exp._id, 'Gider')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* BAHÇELER TABI */}
          {activeTab === 'gardens' && (
            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>🏡 YENİ BAHÇE EKLE</Text>

                <Text style={styles.label}>Bahçe Adı / Tanımı</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.name}
                  onChangeText={(t) => setGForm({ ...gForm, name: t })}
                  placeholder="Örn: Ev Arkası Çaylık"
                />

                <Text style={styles.label}>Ada / Parsel No</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.adaParsel}
                  onChangeText={(t) => setGForm({ ...gForm, adaParsel: t })}
                  placeholder="Örn: 102/4"
                />

                <Text style={styles.label}>Alan (Dönüm / m²)</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.alan}
                  onChangeText={(t) => setGForm({ ...gForm, alan: t })}
                  placeholder="Örn: 3 Dönüm"
                />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveGarden}>
                  <Text style={styles.submitBtnText}>💾 BAHÇEYİ KAYDET</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>KAYITLI BAHÇELERİM</Text>
              {gardens.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bir bahçe bulunmuyor.</Text>
              ) : (
                gardens.map((g, idx) => (
                  <View key={g._id || idx} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>🏡 {g.name || 'İsimsiz Bahçe'}</Text>
                      <Text style={styles.listSubText}>📍 Ada/Parsel: {g.adaParsel || 'Girilmedi'}</Text>
                      <Text style={styles.listSubText}>📐 Alan: {g.alan || 'Girilmedi'}</Text>
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('gardens', g._id, 'Bahçe')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ADMIN PANENİ TABI */}
          {activeTab === 'admin' && isAdmin && (
            <View>
              <Text style={styles.sectionTitle}>👑 YÖNETİCİ ÖZETİ (TÜM ÜRETİCİLER)</Text>

              {getAdminProducerSummary().map((p, idx) => {
                const pRemaining = p.totalSales - p.totalPay;
                return (
                  <View key={idx} style={[styles.listItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <Text style={[styles.listTitle, { fontSize: 18, color: '#1b4332' }]}>👤 {p.name}</Text>
                    <Text style={styles.listSubText}>📊 Toplam Kayıt Sayısı: {p.count}</Text>
                    <Text style={styles.listSubText}>⚖️ Toplam Hasat: {p.totalKg.toLocaleString('tr-TR')} KG</Text>
                    <Text style={styles.listSubText}>💰 Toplam Ciro: {formatTL(p.totalSales)}</Text>
                    <Text style={styles.listSubText}>🟢 Toplam Ödenen: {formatTL(p.totalPay)}</Text>
                    <Text style={{ fontWeight: 'bold', color: pRemaining > 0 ? '#d62828' : '#2b9348', marginTop: 4 }}>
                      {pRemaining > 0 ? `🔴 Toplam Kalan Borç: ${formatTL(pRemaining)}` : '🟢 Borcu Yok / Ödendi'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* TAHSİLAT DÜZENLEME MODALI */}
        <Modal visible={editModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>✏️ Ödeme / Tahsilat Güncelle</Text>

              {editingHarvest && (
                <View style={{ width: '100%', marginBottom: 15 }}>
                  <Text style={styles.listSubText}>Üretici: {editingHarvest.uretici || editingHarvest.producerName}</Text>
                  <Text style={styles.listSubText}>
                    Toplam Tutarı: {formatTL((Number(editingHarvest.kg || editingHarvest.weight) || 0) * (Number(editingHarvest.fiyat) || 0))}
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Ödenen / Tahsil Edilen Yeni Tutar (TL)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={editTahsilatVal}
                onChangeText={setEditTahsilatVal}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 15, width: '100%' }}>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 1, backgroundColor: '#6c757d' }]}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.submitBtnText}>İptal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 1 }]}
                  onPress={handleUpdateCollection}
                >
                  <Text style={styles.submitBtnText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8'
  },
  authCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5
  },
  authTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 8
  },
  authSubTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20
  },
  header: {
    backgroundColor: '#1b4332',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  headerSubtitle: {
    color: '#b7e4c7',
    fontSize: 12,
    marginTop: 2
  },
  logoutBtn: {
    backgroundColor: '#d62828',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  logoutBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12
  },
  navBar: {
    backgroundColor: '#2d6a4f',
    paddingVertical: 8
  },
  navItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'transparent'
  },
  navItemActive: {
    backgroundColor: '#ffffff'
  },
  navItemActiveAdmin: {
    backgroundColor: '#ffb703'
  },
  navText: {
    color: '#d8f3dc',
    fontWeight: '600',
    fontSize: 13
  },
  navTextActive: {
    color: '#1b4332',
    fontWeight: 'bold'
  },
  navTextActiveAdmin: {
    color: '#000000',
    fontWeight: 'bold'
  },
  content: {
    flex: 1,
    padding: 16
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between'
  },
  statCard: {
    backgroundColor: '#ffffff',
    width: '48%',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 5,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5
  },
  statTitle: {
    fontSize: 12,
    color: '#666'
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 4
  },
  csvContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15
  },
  csvExportBtn: {
    flex: 1,
    backgroundColor: '#2a9d8f',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  csvImportBtn: {
    flex: 1,
    backgroundColor: '#e76f51',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  csvBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12
  },
  listItem: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3
  },
  listTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#212529'
  },
  listSubText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  editBtn: {
    backgroundColor: '#3a86ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center'
  },
  deleteBtn: {
    backgroundColor: '#d62828',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center'
  },
  formCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    elevation: 2
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 15
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    marginTop: 10,
    marginBottom: 4,
    width: '100%'
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#212529',
    width: '100%'
  },
  rowBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4
  },
  groupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#e9ecef'
  },
  groupBtnActive: {
    backgroundColor: '#1b4332'
  },
  groupBtnText: {
    fontSize: 12,
    color: '#495057'
  },
  groupBtnTextActive: {
    color: '#ffffff',
    fontWeight: 'bold'
  },
  submitBtn: {
    backgroundColor: '#1b4332',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14
  },
  emptyText: {
    textAlign: 'center',
    color: '#8d99ae',
    marginVertical: 20,
    fontStyle: 'italic'
  },
  bulkRow: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    gap: 8
  },
  removeRowBtn: {
    alignSelf: 'flex-end',
    marginTop: 4
  },
  addRowBtn: {
    backgroundColor: '#e9ecef',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5
  },
  addRowBtnText: {
    color: '#1b4332',
    fontWeight: 'bold',
    fontSize: 13
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#ffffff',
    width: '100%',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 15
  }
});