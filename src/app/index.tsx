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

// DÜZELTME: User headers ekleme yeteneği ile güncellendi
const fetchWithTimeout = async (url: string, options: RequestInit = {}, userSession?: UserSession | null, timeout = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const customHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (userSession) {
    customHeaders['user-id'] = userSession.userId;
    customHeaders['user-phone'] = userSession.phone;
    if (userSession.role === 'admin') {
      customHeaders['admin-secret'] = 'ADMIN_OZEL_SIFRESI_123';
    }
  }

  try {
    const response = await fetch(url, { ...options, headers: customHeaders, signal: controller.signal });
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
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'harvest' | 'collections' | 'expense' | 'gardens' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const [harvests, setHarvests] = useState<HarvestItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [gardens, setGardens] = useState<GardenItem[]>([]);

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

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingHarvest, setEditingHarvest] = useState<HarvestItem | null>(null);
  const [editTahsilatVal, setEditTahsilatVal] = useState('');

  const [bulkCollections, setBulkCollections] = useState<{ id: string; producer: string; tutar: string; aciklama: string }[]>([
    { id: '1', producer: '', tutar: '', aciklama: '' }
  ]);

  const isAdmin = currentUser?.role === 'admin';

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

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [resH, resE, resG] = await Promise.all([
        fetchWithTimeout(`${API_URL}/harvests`, {}, currentUser),
        fetchWithTimeout(`${API_URL}/expenses`, {}, currentUser),
        fetchWithTimeout(`${API_URL}/gardens`, {}, currentUser)
      ]);

      const rawH: HarvestItem[] = resH.ok ? await resH.json() : [];
      const rawE: ExpenseItem[] = resE.ok ? await resE.json() : [];
      const rawG: GardenItem[] = resG.ok ? await resG.json() : [];

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
            const res = await fetchWithTimeout(`${API_URL}/${endpoint}/${id}`, { method: 'DELETE' }, currentUser);
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
        body: JSON.stringify(payload)
      }, currentUser);

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
          body: JSON.stringify({ tahsilat: updatedPay })
        }, currentUser);

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
            body: JSON.stringify(payload)
          }, currentUser);
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
        body: JSON.stringify({ tahsilat: newTahsilat })
      }, currentUser);

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
        body: JSON.stringify({
          userId: currentUser?.userId,
          userPhone: currentUser?.phone,
          name: gForm.name.trim(),
          adaParsel: gForm.adaParsel.trim(),
          alan: gForm.alan.trim()
        })
      }, currentUser);

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
        body: JSON.stringify({
          userId: currentUser?.userId,
          userPhone: currentUser?.phone,
          tarih: eForm.date,
          kategori: eForm.kategori,
          aciklama: eForm.aciklama,
          tutar: parseFloat(eForm.tutar) || 0
        })
      }, currentUser);

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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1b4332" />

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

        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} colors={['#1b4332']} />}
        >
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
                placeholder={currentUser?.name || "Örn: Ahmet Yılmaz"}
              />

              <Text style={styles.label}>Miktar (KG)</Text>
              <TextInput
                style={styles.input}
                value={hForm.kg}
                onChangeText={(t) => setHForm({ ...hForm, kg: t })}
                keyboardType="numeric"
                placeholder="0"
              />

              <Text style={styles.label}>Firma / Çay Fabrikası</Text>
              <TextInput
                style={styles.input}
                value={hForm.firma}
                onChangeText={(t) => setHForm({ ...hForm, firma: t })}
                placeholder="Örn: Çaykur / Özel Firma"
              />

              <Text style={styles.label}>Birim Fiyat (TL)</Text>
              <TextInput
                style={styles.input}
                value={hForm.fiyat}
                onChangeText={(t) => setHForm({ ...hForm, fiyat: t })}
                keyboardType="numeric"
                placeholder="0.00"
              />

              <Text style={styles.label}>Alınan Peşin Tahsilat (TL)</Text>
              <TextInput
                style={styles.input}
                value={hForm.tahsilat}
                onChangeText={(t) => setHForm({ ...hForm, tahsilat: t })}
                keyboardType="numeric"
                placeholder="0.00"
              />

              <Text style={styles.label}>Bahçe Seçimi / Tanımı</Text>
              <TextInput
                style={styles.input}
                value={hForm.garden}
                onChangeText={(t) => setHForm({ ...hForm, garden: t })}
                placeholder="Örn: Derebaşı Bahçesi"
              />

              <Text style={styles.label}>Açıklama / Not</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                value={hForm.aciklama}
                onChangeText={(t) => setHForm({ ...hForm, aciklama: t })}
                multiline
                placeholder="Varsa ek notlar..."
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveHarvest}>
                <Text style={styles.submitBtnText}>💾 HASAT KAYDINI KAYDET</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'collections' && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>💵 TOPLU TAHSİLAT / ÖDEME GİRİŞİ</Text>
              {bulkCollections.map((item, index) => (
                <View key={item.id} style={styles.bulkRow}>
                  <Text style={styles.bulkRowIndex}>#{index + 1}</Text>
                  <View style={{ flex: 1, gap: 5 }}>
                    <TextInput
                      style={styles.inputSmall}
                      placeholder="Üretici Adı"
                      value={item.producer}
                      onChangeText={(t) => updateBulkRow(item.id, 'producer', t)}
                    />
                    <TextInput
                      style={styles.inputSmall}
                      placeholder="Tahsilat Tutarı (TL)"
                      keyboardType="numeric"
                      value={item.tutar}
                      onChangeText={(t) => updateBulkRow(item.id, 'tutar', t)}
                    />
                  </View>
                  {bulkCollections.length > 1 && (
                    <TouchableOpacity style={styles.removeRowBtn} onPress={() => removeBulkRow(item.id)}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={styles.addMoreBtn} onPress={addBulkRow}>
                  <Text style={styles.addMoreBtnText}>➕ Yeni Satır Ekle</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.submitBtn, { flex: 1, marginTop: 0 }]} onPress={handleSaveBulkCollections}>
                  <Text style={styles.submitBtnText}>💾 TÜMÜNÜ İŞLE</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'expense' && (
            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>📉 GİDER EKLE</Text>

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

                <Text style={styles.label}>Gider Tutarı (TL)</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.tutar}
                  onChangeText={(t) => setEForm({ ...eForm, tutar: t })}
                  keyboardType="numeric"
                  placeholder="0.00"
                />

                <Text style={styles.label}>Açıklama</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.aciklama}
                  onChangeText={(t) => setEForm({ ...eForm, aciklama: t })}
                  placeholder="Örn: Yevmiye ödemesi"
                />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}>
                  <Text style={styles.submitBtnText}>💾 GİDERİ KAYDET</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>GİDER LİSTESİ</Text>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>Kayıtlı gider bulunmuyor.</Text>
              ) : (
                expenses.map((item, index) => (
                  <View key={item._id || index} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{item.kategori || 'Gider'}</Text>
                      <Text style={styles.listSubText}>📅 {item.tarih || '-'} | 📝 {item.aciklama || 'Açıklama yok'}</Text>
                      <Text style={{ color: '#d62828', fontWeight: 'bold', marginTop: 3 }}>
                        -{formatTL(Number(item.tutar) || 0)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => item._id && handleDelete('expenses', item._id, 'Gider')}
                    >
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'gardens' && (
            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>🏡 BAHÇE EKLE</Text>

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
                  placeholder="Örn: 101 / 12"
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

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>KAYITLI BAHÇELER</Text>
              {gardens.length === 0 ? (
                <Text style={styles.emptyText}>Kayıtlı bahçe bulunmuyor.</Text>
              ) : (
                gardens.map((item, index) => (
                  <View key={item._id || index} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{item.name || 'İsimsiz Bahçe'}</Text>
                      <Text style={styles.listSubText}>📍 Ada/Parsel: {item.adaParsel || '-'}</Text>
                      <Text style={styles.listSubText}>📐 Alan: {item.alan || '-'}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => item._id && handleDelete('gardens', item._id, 'Bahçe')}
                    >
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'admin' && isAdmin && (
            <View>
              <Text style={styles.sectionTitle}>👑 ÜRETİCİ BAZLI GENEL RAPOR</Text>
              {getAdminProducerSummary().map((prod, idx) => {
                const rem = prod.totalSales - prod.totalPay;
                return (
                  <View key={idx} style={styles.adminCard}>
                    <Text style={styles.adminCardTitle}>👤 {prod.name}</Text>
                    <Text style={styles.listSubText}>📦 Toplam Teslimat: {prod.totalKg.toLocaleString('tr-TR')} KG ({prod.count} Kayıt)</Text>
                    <Text style={styles.listSubText}>💵 Toplam Tutar: {formatTL(prod.totalSales)}</Text>
                    <Text style={styles.listSubText}>🟢 Alınan Tahsilat: {formatTL(prod.totalPay)}</Text>
                    <Text style={{ fontWeight: 'bold', color: rem > 0 ? '#d62828' : '#2b9348', marginTop: 4 }}>
                      {rem > 0 ? `🔴 Bekleyen Toplam Alacak: ${formatTL(rem)}` : '🟢 Borç Bulunmuyor'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        <Modal visible={editModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>✏️ Tahsilat Tutarı Güncelle</Text>
              <Text style={{ marginBottom: 10, color: '#555' }}>
                {editingHarvest?.uretici || editingHarvest?.producerName} - {editingHarvest?.surum}
              </Text>

              <Text style={styles.label}>Ödenen / Alınan Tahsilat Tutarı (TL)</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f6',
  },
  authCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    alignItems: 'center',
  },
  authTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 8,
  },
  authSubTitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 20,
  },
  header: {
    backgroundColor: '#1b4332',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#b7e4c7',
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: '#d62828',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  logoutBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  navBar: {
    backgroundColor: '#2d6a4f',
    paddingVertical: 8,
  },
  navItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  navItemActive: {
    backgroundColor: '#ffffff',
  },
  navItemActiveAdmin: {
    backgroundColor: '#ffb703',
  },
  navText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  navTextActive: {
    color: '#1b4332',
    fontWeight: 'bold',
  },
  navTextActiveAdmin: {
    color: '#000000',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#ffffff',
    width: '48%',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statTitle: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b4332',
    marginTop: 4,
  },
  csvContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  csvExportBtn: {
    flex: 1,
    backgroundColor: '#2a9d8f',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  csvImportBtn: {
    flex: 1,
    backgroundColor: '#e76f51',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  csvBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  listItem: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1b4332',
  },
  listSubText: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginVertical: 20,
    fontStyle: 'italic',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  editBtn: {
    backgroundColor: '#3a86ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#d62828',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  formCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    elevation: 2,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
  },
  inputSmall: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  rowBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  groupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#e9ecef',
  },
  groupBtnActive: {
    backgroundColor: '#1b4332',
  },
  groupBtnText: {
    fontSize: 12,
    color: '#495057',
    fontWeight: '600',
  },
  groupBtnTextActive: {
    color: '#ffffff',
  },
  submitBtn: {
    backgroundColor: '#1b4332',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
  },
  bulkRowIndex: {
    fontWeight: 'bold',
    color: '#1b4332',
  },
  removeRowBtn: {
    backgroundColor: '#d62828',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreBtn: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  adminCard: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#ffb703',
    elevation: 2,
  },
  adminCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 8,
  },
});