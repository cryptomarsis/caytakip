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

interface HarvestItem {
  _id?: string;
  userId?: string;
  userPhone?: string;
  tarih?: string;
  surum?: string;
  uretici?: string;
  producerName?: string;
  kg?: number;
  weight?: number;
  firma?: string;
  fiyat?: number;
  tahsilat?: number;
  aciklama?: string;
  bahce?: string;
}

interface ExpenseItem {
  _id?: string;
  userId?: string;
  userPhone?: string;
  tarih?: string;
  kategori?: string;
  aciklama?: string;
  tutar?: number;
}

interface GardenItem {
  _id?: string;
  userId?: string;
  userPhone?: string;
  name?: string;
  adaParsel?: string;
  alan?: string;
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
  // Auth State'leri
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');

  // Navigasyon ve Yüklenme State'leri
  const [activeTab, setActiveTab] = useState<'dashboard' | 'harvest' | 'collections' | 'expense' | 'gardens' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // Veri Listeleri
  const [harvests, setHarvests] = useState<HarvestItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [gardens, setGardens] = useState<GardenItem[]>([]);

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
  const [editingHarvest, setEditingHarvest] = useState<HarvestItem | null>(null);
  const [editTahsilatVal, setEditTahsilatVal] = useState('');

  // Toplu Tahsilat State'i
  const [bulkCollections, setBulkCollections] = useState<{ id: string; producer: string; tutar: string; aciklama: string }[]>([
    { id: '1', producer: '', tutar: '', aciklama: '' }
  ]);

  const isAdmin = currentUser?.role === 'admin';

  // Oturum Kontrolü
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

  // Sunucudan Veri Çekme
  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [resH, resE, resG] = await Promise.all([
        fetchWithTimeout(`${API_URL}/harvests`),
        fetchWithTimeout(`${API_URL}/expenses`),
        fetchWithTimeout(`${API_URL}/gardens`)
      ]);

      let rawH: HarvestItem[] = resH.ok ? await resH.json() : [];
      let rawE: ExpenseItem[] = resE.ok ? await resE.json() : [];
      let rawG: GardenItem[] = resG.ok ? await resG.json() : [];

      if (!isAdmin) {
        const currentUserId = currentUser.userId;
        const uPhone = currentUser.phone;
        const uName = currentUser.name.toLowerCase().trim();

        rawH = (rawH || []).filter((h) => {
          if (h.userId) return h.userId === currentUserId;
          if (!h.userPhone && !h.uretici && !h.producerName) return true;
          const matchPhone = h.userPhone === uPhone;
          const matchName =
            (h.uretici && h.uretici.toLowerCase().trim().includes(uName)) ||
            (h.producerName && h.producerName.toLowerCase().trim().includes(uName));
          return matchPhone || matchName || !h.userPhone;
        });

        rawE = (rawE || []).filter((e) => (e.userId ? e.userId === currentUserId : !e.userPhone || e.userPhone === uPhone));
        rawG = (rawG || []).filter((g) => (g.userId ? g.userId === currentUserId : !g.userPhone || g.userPhone === uPhone));
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

  // Auth İşlemleri
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

    if (authMode === 'register' && !authName.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen Adınız ve Soyadınızı girin.');
      return;
    }

    setCurrentUser(userData);
    await saveSession(userData);
    Alert.alert('Başarılı', `Hoş geldiniz, ${userData.name}! ${isAdminUser ? '(Admin Yetkisi Tanımlandı)' : ''}`);
  };

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
      Alert.alert('Eksik Bilgi', 'Lütfen KG (Miktar) alanını doldurun.');
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
        firma: hForm.firma.trim() || '',
        fiyat: parseFloat(hForm.fiyat) || 0,
        tahsilat: parseFloat(hForm.tahsilat) || 0,
        aciklama: hForm.aciklama.trim() || '',
        bahce: hForm.garden.trim() || ''
      };

      const res = await fetchWithTimeout(`${API_URL}/harvests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Hasat kaydı eklendi.');
        setHForm({
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

  // Tahsilat İşlemleri
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

      if (remainingDebt > 0 && h._id) {
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

      Alert.alert('Başarılı', `${processedCount} adet tahsilat işlemi tamamlandı.`);
      setBulkCollections([{ id: '1', producer: '', tutar: '', aciklama: '' }]);
      await fetchData();
    } catch (e: any) {
      Alert.alert('İşlem Başarısız', e.message);
    } finally {
      setLoading(false);
    }
  };

  const addBulkRow = () => {
    setBulkCollections([...bulkCollections, { id: Date.now().toString(), producer: '', tutar: '', aciklama: '' }]);
  };

  const removeBulkRow = (id: string) => {
    if (bulkCollections.length === 1) return;
    setBulkCollections(bulkCollections.filter(item => item.id !== id));
  };

  const updateBulkRow = (id: string, field: string, value: string) => {
    setBulkCollections(bulkCollections.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // CSV Aktarımı
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

  const importFromCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });

      const lines = fileContent.split('\n');
      if (lines.length <= 1) {
        Alert.alert('Hata', 'Dosya boş veya geçersiz.');
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

      Alert.alert('Başarılı', `${importedCount} kayıt içe aktarıldı.`);
      await fetchData();
    } catch (error: any) {
      Alert.alert('Hata', 'İçe aktarım başarısız: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (harvestItem: HarvestItem) => {
    setEditingHarvest(harvestItem);
    setEditTahsilatVal(String(harvestItem.tahsilat || 0));
    setEditModalVisible(true);
  };

  const handleUpdateCollection = async () => {
    if (!editingHarvest || !editingHarvest._id) return;
    const newTahsilat = parseFloat(editTahsilatVal);
    if (isNaN(newTahsilat) || newTahsilat < 0) {
      Alert.alert('Hata', 'Geçerli bir tutar girin.');
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

  if (!initialCheckDone) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1b4332" />
      </View>
    );
  }

  // LOGIN / REGISTER SCREEN
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

  // MAIN APP SCREEN
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

        {/* TAB BAR */}
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

        {/* CONTENT */}
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} colors={['#1b4332']} />}
        >
          {/* DASHBOARD TAB */}
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

              <View style={styles.csvContainer}>
                <TouchableOpacity style={styles.csvExportBtn} onPress={exportToCSV}>
                  <Text style={styles.csvBtnText}>📄 CSV İndir / Paylaş</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.csvImportBtn} onPress={importFromCSV}>
                  <Text style={styles.csvBtnText}>📥 CSV İçe Aktar</Text>
                </TouchableOpacity>
              </View>

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
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => item._id && handleDelete('harvests', item._id, 'Hasat')}>
                          <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* HARVEST TAB */}
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
                    <Text style={[styles.groupBtnText, hForm.surum === s && styles.groupBtnTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {isAdmin && (
                <View style={{ width: '100%' }}>
                  <Text style={styles.label}>Üretici Adı / Telefonu</Text>
                  <TextInput
                    style={styles.input}
                    value={hForm.producer}
                    onChangeText={(t) => setHForm({ ...hForm, producer: t })}
                    placeholder="Ahmet Yılmaz (Boş bırakılırsa kendiniz kaydolur)"
                  />
                </View>
              )}

              <Text style={styles.label}>Bahçe Seçimi / Tanımı (İsteğe Bağlı)</Text>
              <TextInput
                style={styles.input}
                value={hForm.garden}
                onChangeText={(t) => setHForm({ ...hForm, garden: t })}
                placeholder="Örn: Ev Arkası Bahçe veya Ada/Parsel"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Miktar (KG) *</Text>
                  <TextInput
                    style={styles.input}
                    value={hForm.kg}
                    onChangeText={(t) => setHForm({ ...hForm, kg: t })}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Birim Fiyat (TL)</Text>
                  <TextInput
                    style={styles.input}
                    value={hForm.fiyat}
                    onChangeText={(t) => setHForm({ ...hForm, fiyat: t })}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Teslim Edilen Firma</Text>
                  <TextInput
                    style={styles.input}
                    value={hForm.firma}
                    onChangeText={(t) => setHForm({ ...hForm, firma: t })}
                    placeholder="Örn: ÇAYKUR / Özel Fabrika"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Peşin Tahsilat (TL)</Text>
                  <TextInput
                    style={styles.input}
                    value={hForm.tahsilat}
                    onChangeText={(t) => setHForm({ ...hForm, tahsilat: t })}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.label}>Açıklama / Not</Text>
              <TextInput
                style={[styles.input, { height: 70 }]}
                value={hForm.aciklama}
                onChangeText={(t) => setHForm({ ...hForm, aciklama: t })}
                placeholder="Ek notlar veya açıklamalar..."
                multiline
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveHarvest}>
                <Text style={styles.submitBtnText}>💾 HASAT KAYDINI KAYDET</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* COLLECTIONS TAB */}
          {activeTab === 'collections' && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>💵 TOPLU / TEKİL TAHSİLAT GİRİŞİ</Text>
              <Text style={{ marginBottom: 15, color: '#666', fontSize: 13 }}>
                Üreticilerin biriken borçlarına karşılık yapılan ödemeleri buradan girebilirsiniz.
              </Text>

              {bulkCollections.map((row, index) => (
                <View key={row.id} style={{ marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: 'bold', color: '#1b4332' }}>Kayıt #{index + 1}</Text>
                    {bulkCollections.length > 1 && (
                      <TouchableOpacity onPress={() => removeBulkRow(row.id)}>
                        <Text style={{ color: '#d62828', fontWeight: 'bold' }}>✕ Kaldır</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.label}>Üretici Adı</Text>
                  <TextInput
                    style={styles.input}
                    value={row.producer}
                    onChangeText={(t) => updateBulkRow(row.id, 'producer', t)}
                    placeholder="Üretici Adı"
                  />

                  <Text style={styles.label}>Tahsilat Tutarı (TL)</Text>
                  <TextInput
                    style={styles.input}
                    value={row.tutar}
                    onChangeText={(t) => updateBulkRow(row.id, 'tutar', t)}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
              ))}

              <TouchableOpacity style={[styles.csvExportBtn, { marginBottom: 15, backgroundColor: '#2a9d8f' }]} onPress={addBulkRow}>
                <Text style={styles.csvBtnText}>➕ Yeni Tahsilat Satırı Ekle</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveBulkCollections}>
                <Text style={styles.submitBtnText}>💾 TAHSİLATLARI İŞLE</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* EXPENSE TAB */}
          {activeTab === 'expense' && (
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
                    <Text style={[styles.groupBtnText, eForm.kategori === cat && styles.groupBtnTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Tutar (TL) *</Text>
              <TextInput
                style={styles.input}
                value={eForm.tutar}
                onChangeText={(t) => setEForm({ ...eForm, tutar: t })}
                placeholder="0.00"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Açıklama</Text>
              <TextInput
                style={styles.input}
                value={eForm.aciklama}
                onChangeText={(t) => setEForm({ ...eForm, aciklama: t })}
                placeholder="Gider detayını yazın..."
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}>
                <Text style={styles.submitBtnText}>💾 GİDERİ KAYDET</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>GİDER GEÇMİŞİ</Text>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş gider yok.</Text>
              ) : (
                expenses.map((item, idx) => (
                  <View key={item._id || idx} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{item.kategori} Gideri</Text>
                      <Text style={styles.listSubText}>📅 {item.tarih || 'Tarih Yok'} | 📝 {item.aciklama || 'Açıklama Yok'}</Text>
                      <Text style={{ color: '#d62828', fontWeight: 'bold', marginTop: 3 }}>-{formatTL(Number(item.tutar) || 0)}</Text>
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => item._id && handleDelete('expenses', item._id, 'Gider')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* GARDENS TAB */}
          {activeTab === 'gardens' && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>🏡 BAHÇE / PARSEL TANIMI</Text>

              <Text style={styles.label}>Bahçe Adı / Tanımı</Text>
              <TextInput
                style={styles.input}
                value={gForm.name}
                onChangeText={(t) => setGForm({ ...gForm, name: t })}
                placeholder="Örn: Dere Boyu Bahçesi"
              />

              <Text style={styles.label}>Ada / Parsel No</Text>
              <TextInput
                style={styles.input}
                value={gForm.adaParsel}
                onChangeText={(t) => setGForm({ ...gForm, adaParsel: t })}
                placeholder="Örn: 101 / 12"
              />

              <Text style={styles.label}>Alan (Dönüm / m²)</Text>
              <TextInput
                style={styles.input}
                value={gForm.alan}
                onChangeText={(t) => setGForm({ ...gForm, alan: t })}
                placeholder="Örn: 5 Dönüm"
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveGarden}>
                <Text style={styles.submitBtnText}>💾 BAHÇE EKLE</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>KAYITLI BAHÇELER</Text>
              {gardens.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bahçe yok.</Text>
              ) : (
                gardens.map((item, idx) => (
                  <View key={item._id || idx} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{item.name || 'İsimsiz Bahçe'}</Text>
                      <Text style={styles.listSubText}>📍 Ada/Parsel: {item.adaParsel || '-'}</Text>
                      <Text style={styles.listSubText}>📐 Alan: {item.alan || '-'}</Text>
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => item._id && handleDelete('gardens', item._id, 'Bahçe')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ADMIN TAB */}
          {activeTab === 'admin' && isAdmin && (
            <View style={{ gap: 15 }}>
              <Text style={styles.sectionTitle}>👑 YÖNETİCİ GENEL ÖZETİ</Text>
              {getAdminProducerSummary().map((prod, idx) => {
                const rem = prod.totalSales - prod.totalPay;
                return (
                  <View key={idx} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>👤 {prod.name}</Text>
                      <Text style={styles.listSubText}>
                        📊 {prod.count} Kayıt | ⚖️ {prod.totalKg.toLocaleString('tr-TR')} KG
                      </Text>
                      <Text style={styles.listSubText}>
                        💰 Toplam Satış: {formatTL(prod.totalSales)} | 🟢 Ödenen: {formatTL(prod.totalPay)}
                      </Text>
                      <Text style={{ color: rem > 0 ? '#d62828' : '#2b9348', fontWeight: 'bold', marginTop: 2 }}>
                        {rem > 0 ? `🔴 Kalan Bakiye: ${formatTL(rem)}` : '🟢 Borcu Yok'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* TAHSİLAT MODAL */}
        <Modal visible={editModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.formTitle}>✏️ Tahsilat Tutarını Güncelle</Text>
              <Text style={{ marginBottom: 10, color: '#555' }}>
                {editingHarvest?.uretici || editingHarvest?.producerName} - {editingHarvest?.surum}
              </Text>

              <Text style={styles.label}>Yeni Toplam Tahsilat Tutarı (TL)</Text>
              <TextInput
                style={styles.input}
                value={editTahsilatVal}
                onChangeText={setEditTahsilatVal}
                keyboardType="numeric"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
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
                  <Text style={styles.submitBtnText}>Güncelle</Text>
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
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  header: {
    backgroundColor: '#1b4332',
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerSubtitle: { color: '#b7e4c7', fontSize: 12, marginTop: 2 },
  logoutBtn: { backgroundColor: '#d62828', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  logoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  navBar: { backgroundColor: '#2d6a4f', paddingVertical: 8, paddingHorizontal: 5 },
  navItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 6 },
  navItemActive: { backgroundColor: '#b7e4c7' },
  navItemActiveAdmin: { backgroundColor: '#e76f51' },
  navText: { color: '#d8f3dc', fontSize: 13, fontWeight: '600' },
  navTextActive: { color: '#1b4332', fontWeight: 'bold' },
  navTextActiveAdmin: { color: '#fff', fontWeight: 'bold' },
  content: { flex: 1, padding: 15 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#1b4332', marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  statTitle: { fontSize: 11, color: '#666', fontWeight: '600' },
  statValue: { fontSize: 14, fontWeight: 'bold', color: '#2b2d42', marginTop: 4 },
  csvContainer: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  csvExportBtn: { flex: 1, backgroundColor: '#1d3557', padding: 10, borderRadius: 6, alignItems: 'center' },
  csvImportBtn: { flex: 1, backgroundColor: '#457b9d', padding: 10, borderRadius: 6, alignItems: 'center' },
  csvBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  formCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2, marginBottom: 20 },
  formTitle: { fontSize: 16, fontWeight: 'bold', color: '#1b4332', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#495057', marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#212529'
  },
  rowBtnGroup: { flexDirection: 'row', gap: 5, marginVertical: 5, flexWrap: 'wrap' },
  groupBtn: { flex: 1, minWidth: '22%', backgroundColor: '#e9ecef', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  groupBtnActive: { backgroundColor: '#1b4332' },
  groupBtnText: { fontSize: 11, color: '#495057', fontWeight: 'bold' },
  groupBtnTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: '#1b4332', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 15 },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  listItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 1
  },
  listTitle: { fontSize: 14, fontWeight: 'bold', color: '#1b4332' },
  listSubText: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  editBtn: { backgroundColor: '#e76f51', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  deleteBtn: { backgroundColor: '#d62828', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  actionBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#8d99ae', marginVertical: 15, fontStyle: 'italic' },
  authCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 3, alignItems: 'center' },
  authTitle: { fontSize: 20, fontWeight: 'bold', color: '#1b4332', marginBottom: 5 },
  authSubTitle: { fontSize: 13, color: '#6c757d', marginBottom: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 10, padding: 20 }
});