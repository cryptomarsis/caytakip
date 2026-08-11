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
  StatusBar,
  Switch
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
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

const normalizePhone = (value: string) => {
  let p = String(value || '').replace(/\D/g, '');
  if (p.startsWith('90')) p = '0' + p.slice(2);
  if (p.length === 10 && p.startsWith('5')) p = '0' + p;
  return p;
};

const formatDisplayDate = (value: any) => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[3].padStart(2,'0')}.${m[2].padStart(2,'0')}.${m[1]}`;
  return s || '-';
};

const toServerDate = (value: string) => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s;
};


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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'harvest' | 'collections' | 'receivables' | 'expense' | 'gardens' | 'prices' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // Veri Listeleri
  const [harvests, setHarvests] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [gardens, setGardens] = useState<any[]>([]);
  const [factoryPrices, setFactoryPrices] = useState<any[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<string | null>(null);
  const [factoryFilter, setFactoryFilter] = useState<'Tümü' | 'Haftalık' | 'Aylık' | 'Peşin' | 'Vadeli'>('Tümü');
  const [ads, setAds] = useState<any[]>([]);

  const todayTR = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; })();
  const [priceForm, setPriceForm] = useState({ firma: 'ÇAYKUR', fiyat: '', tarih: todayTR, fiyatTuru: 'Peşin', vadeGun: '', gecerlilikBaslangic: '', politika: '', kaynak: '', aciklama: '' });

  const [adForm, setAdForm] = useState({
    slot: 'dashboard_middle',
    firma: '',
    kategori: 'Çay Firması',
    baslik: '',
    aciklama: '',
    telefon: '',
    link: '',
    gorselUrl: '',
    baslangic: '',
    bitis: ''
  });

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
    garden: '',
    isVadeli: false,
    vadeTarihi: ''
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

  // Özel Tahsilat Ekleme Formu State'leri (Belirli Hasada Ödeme Yapma)
  const [payHarvestId, setPayHarvestId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDesc, setPayDesc] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  // Ortak İstek Başlıklarını Oluşturan Yardımcı Fonksiyon (Madde 6)
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'user-id': currentUser?.userId || `usr_${currentUser?.phone || ''}`,
      'user-phone': normalizePhone(currentUser?.phone || '')
    };
  };

  // Uygulama Açılışında Oturumu Kontrol Et
  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const savedUser = await getSession();
        if (savedUser) {
          const profile = await syncProfile(savedUser.phone);
          const refreshedRole: UserSession['role'] =
            profile?.role === 'admin' || normalizePhone(savedUser.phone) === ADMIN_PHONE
              ? 'admin'
              : 'user';
          const refreshed: UserSession = profile
            ? {
                ...savedUser,
                userId: profile.userId || savedUser.userId,
                name: profile.name || savedUser.name,
                phone: normalizePhone(profile.phone || savedUser.phone),
                role: refreshedRole,
              }
            : savedUser;
          setCurrentUser(refreshed);
          await saveSession(refreshed);
        }
      } catch (error) {
        console.log('Oturum okuma hatası:', error);
      } finally {
        setInitialCheckDone(true);
      }
    };
    checkSavedSession();
  }, []);

  // Verileri Sunucudan Çek
  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [resH, resE, resG, resP, resA] = await Promise.all([
        fetchWithTimeout(`${API_URL}/harvests`, { headers }),
        fetchWithTimeout(`${API_URL}/expenses`, { headers }),
        fetchWithTimeout(`${API_URL}/gardens`, { headers }),
        fetchWithTimeout(`${API_URL}/factory-prices`, { headers }),
        fetchWithTimeout(`${API_URL}/ads`, { headers })
      ]);

      let rawH = resH.ok ? await resH.json() : [];
      let rawE = resE.ok ? await resE.json() : [];
      let rawG = resG.ok ? await resG.json() : [];
      let rawP = resP.ok ? await resP.json() : [];
      let rawA = resA.ok ? await resA.json() : [];

      if (!isAdmin) {
        const currentUserId = currentUser.userId;
        const uPhone = currentUser.phone;
        const uName = currentUser.name.toLowerCase().trim();

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
      setFactoryPrices(rawP || []);
      setAds(rawA || []);
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

  // DİNAMİK HESAPLAMALAR
  // 1. Bahçe Bazlı İstatistiklerin Dinamik Hesaplanması (Madde 1)
  const getGardenSummaries = () => {
    const map: { [key: string]: { name: string; toplamKg: number; toplamKazanc: number; toplamTahsilat: number } } = {};

    harvests.forEach((h) => {
      const gName = (h.bahce || h.garden || '').trim() || 'Belirtilmeyen Bahçe';
      if (!map[gName]) {
        map[gName] = { name: gName, toplamKg: 0, toplamKazanc: 0, toplamTahsilat: 0 };
      }
      const kg = Number(h.kg || h.weight) || 0;
      const fiyat = Number(h.fiyat) || 0;
      const pay = Number(h.tahsilat) || 0;

      map[gName].toplamKg += kg;
      map[gName].toplamKazanc += kg * fiyat;
      map[gName].toplamTahsilat += pay;
    });

    return Object.values(map);
  };

  // 2. Vadeli / Bekleyen Alacakların Dinamik Hesaplanması (Madde 2)
  const formatVadeMonth = (value: any) => {
    if (!value) return 'Vadesi Belirtilmeyenler';
    const s = String(value).trim();
    let year = 0, month = 0;
    let m = s.match(/^(\d{4})[-./](\d{1,2})/);
    if (m) { year = Number(m[1]); month = Number(m[2]); }
    else { m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/); if (m) { month = Number(m[2]); year = Number(m[3]); } }
    if (!year || !month) return s;
    const names = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    return `${names[month - 1] || 'Bilinmeyen Ay'} ${year}`;
  };

  const getReceivables = () => {
    const list = harvests.filter((h) => {
      const totalSale = (Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0);
      const pay = Number(h.tahsilat) || 0;
      const remaining = totalSale - pay;
      return h.isVadeli || remaining > 0;
    });

    const totalReceivables = list.reduce((acc, h) => {
      const totalSale = (Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0);
      const pay = Number(h.tahsilat) || 0;
      return acc + (totalSale - pay);
    }, 0);

    return { totalReceivables, list };
  };

  const getReceivablesByMonth = () => {
    const groups: { [key: string]: any[] } = {};
    receivablesSafe(harvests).forEach((h: any) => {
      const key = formatVadeMonth(h.vadeTarihi || h.tarih);
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return Object.entries(groups).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  };

  const receivablesSafe = (items: any[]) => (items || []).filter((h: any) => {
    const total = (Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0);
    const pay = Number(h.tahsilat) || 0;
    return h.isVadeli || total - pay > 0;
  });

  // Giriş Yap / Kayıt Ol İşlemleri
  const syncProfile = async (phone: string, fallbackName?: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    try {
      const res = await fetchWithTimeout(`${API_URL}/users/profile?phone=${encodeURIComponent(normalized)}`, { headers: { 'Content-Type': 'application/json', 'user-phone': normalized } });
      if (res.ok) return await res.json();
      return null;
    } catch (e) {
      console.warn('Profil senkronizasyonu:', e);
      return null;
    }
  };

  const saveProfile = async (phone: string, name: string) => {
    const normalized = normalizePhone(phone);
    const res = await fetchWithTimeout(`${API_URL}/users/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-phone': normalized },
      body: JSON.stringify({ phone: normalized, name: name.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Üretici profili kaydedilemedi.');
    return data;
  };

  const handleAuth = async () => {
    const cleanPhone = normalizePhone(authPhone);
    if (!cleanPhone || cleanPhone.length < 10) {
      Alert.alert('Eksik Bilgi', 'Lütfen geçerli bir telefon numarası girin.');
      return;
    }
    setLoading(true);
    try {
      let profile: any = null;
      if (authMode === 'register') {
        if (!authName.trim()) { Alert.alert('Eksik Bilgi', 'Lütfen Ad Soyad girin.'); return; }
        profile = await saveProfile(cleanPhone, authName);
      } else {
        profile = await syncProfile(cleanPhone);
        if (!profile && cleanPhone === ADMIN_PHONE) {
          profile = await saveProfile(cleanPhone, authName.trim() || 'Yönetici');
        }
        if (!profile) {
          Alert.alert('Kayıt Bulunamadı', 'Bu telefon numarasıyla kayıtlı üretici bulunamadı. Yeni Kayıt Ol bölümünden Ad Soyadınızı girerek kayıt oluşturun.');
          return;
        }
      }
      const userData: UserSession = {
        userId: profile.userId || `usr_${cleanPhone}`,
        name: profile.name || authName.trim() || (cleanPhone === ADMIN_PHONE ? 'Yönetici' : 'Üretici'),
        phone: normalizePhone(profile.phone || cleanPhone),
        role: profile.role === 'admin' || cleanPhone === ADMIN_PHONE ? 'admin' : 'user'
      };
      setCurrentUser(userData);
      await saveSession(userData);
      Alert.alert(authMode === 'register' ? 'Kayıt Başarılı' : 'Giriş Başarılı', `Hoş geldiniz, ${userData.name}!`);
    } catch (e: any) {
      Alert.alert('Profil Hatası', e?.message || 'Üretici profili kaydedilemedi.');
    } finally {
      setLoading(false);
    }
  };

  // Çıkış Yap
  const handleLogout = async () => {
    await clearSession();
    setCurrentUser(null);
  };

  // Genel Hesaplamalar
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
            const res = await fetchWithTimeout(`${API_URL}/${endpoint}/${id}`, {
              method: 'DELETE',
              headers: getAuthHeaders()
            });
            if (res.ok) {
              await fetchData();
            } else {
              const errData = await res.json().catch(() => null);
              Alert.alert('Hata', errData?.error || errData?.message || 'Silme işlemi gerçekleşmedi.');
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
        userId: currentUser?.userId || `usr_${currentUser?.phone}`,
        userPhone: currentUser?.phone || '',
        tarih: hForm.date || new Date().toISOString().split('T')[0],
        surum: hForm.surum || '1. Sürüm',
        uretici: producerName,
        producerName: producerName,
        kg: parseFloat(hForm.kg) || 0,
        weight: parseFloat(hForm.kg) || 0,
        firma: hForm.firma ? hForm.firma.trim() : '',
        fiyat: parseFloat(hForm.fiyat) || 0,
        tahsilat: parseFloat(hForm.tahsilat) || 0,
        aciklama: hForm.aciklama ? hForm.aciklama.trim() : '',
        bahce: hForm.garden ? hForm.garden.trim() : '',
        isVadeli: hForm.isVadeli,
        vadeTarihi: hForm.isVadeli ? hForm.vadeTarihi : ''
      };

      const res = await fetchWithTimeout(`${API_URL}/harvests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Hasat kaydı eklendi.');
        // Form Temizleme Mantığı Düzeltildi (Madde 5)
        setHForm({
          date: new Date().toISOString().split('T')[0],
          surum: '1. Sürüm',
          producer: '',
          kg: '',
          firma: '',
          fiyat: '',
          tahsilat: '0',
          aciklama: '',
          garden: '',
          isVadeli: false,
          vadeTarihi: ''
        });
        await fetchData();
        setActiveTab('dashboard');
      } else {
        const errData = await res.json().catch(() => null);
        const detailMessage = errData?.error || errData?.message || `Sunucu Hatası: ${res.status}`;
        Alert.alert('Kayıt Başarısız', detailMessage);
      }
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Belirli Bir Hasat Satışına Özel Tahsilat Ekleme
  const handleSpecificHarvestPayment = async () => {
    if (!payHarvestId) {
      Alert.alert('Eksik Bilgi', 'Lütfen tahsilat düşülecek satışı seçin.');
      return;
    }
    const amount = Number(String(payAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Eksik Bilgi', 'Geçerli ve 0’dan büyük bir tahsilat tutarı girin.');
      return;
    }

    const selected = harvests.find(h => h._id === payHarvestId);
    if (!selected) {
      Alert.alert('Hata', 'Seçilen satış kaydı bulunamadı. Listeyi yenileyip tekrar deneyin.');
      return;
    }

    const saleTotal = (Number(selected.kg || selected.weight) || 0) * (Number(selected.fiyat) || 0);
    const currentPay = Number(selected.tahsilat) || 0;
    const remaining = saleTotal - currentPay;

    if (amount > remaining + 0.01) {
      Alert.alert('Hata', `Tahsilat kalan borçtan fazla olamaz. Kalan: ${formatTL(remaining)}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/payments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          harvestId: payHarvestId,
          tutar: amount,
          aciklama: payDesc.trim(),
          tarih: new Date().toISOString().split('T')[0]
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert('Başarılı', 'Tahsilat başarıyla kaydedildi ve satıştan düşüldü.');
        setPayHarvestId('');
        setPayAmount('');
        setPayDesc('');
        await fetchData();
      } else {
        Alert.alert('Tahsilat Kaydedilemedi', data?.error || data?.message || `Sunucu hatası (${res.status}).`);
      }
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e?.message || 'Sunucuya ulaşılamadı.');
    } finally {
      setLoading(false);
    }
  };

  // Fabrika fiyatı kaydet
  const handleSaveFactoryPrice = async () => {
    if (!isAdmin) { Alert.alert('Yetki Yok', 'Bu işlemi sadece yönetici yapabilir.'); return; }
    const fiyat = Number(String(priceForm.fiyat).replace(',', '.'));
    const tarih = toServerDate(priceForm.tarih);
    const gecerlilikBaslangic = toServerDate(priceForm.gecerlilikBaslangic);
    if (!priceForm.firma.trim() || !Number.isFinite(fiyat) || fiyat < 0 || !tarih) {
      Alert.alert('Eksik Bilgi', 'Fabrika adı, fiyat ve fiyat tarihi zorunludur.'); return;
    }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/factory-prices`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...priceForm, firma: priceForm.firma.trim(), fiyat, tarih, gecerlilikBaslangic, vadeGun: Number(priceForm.vadeGun) || 0 }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert('Başarılı', 'Fabrika fiyatı kaydedildi.');
        setPriceForm({ ...priceForm, fiyat: '', vadeGun: '', gecerlilikBaslangic: '', politika: '', kaynak: '', aciklama: '' });
        await fetchData();
      } else Alert.alert('Hata', data?.error || 'Fiyat kaydedilemedi.');
    } catch (e: any) { Alert.alert('Hata', e.message); }
    finally { setLoading(false); }
  };

  const handleSaveAd = async () => {
    if (!adForm.firma.trim() || !adForm.baslik.trim()) {
      Alert.alert('Eksik Bilgi', 'Reklam veren firma ve reklam başlığı zorunludur.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/ads`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...adForm, firma: adForm.firma.trim(), baslik: adForm.baslik.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert('Başarılı', 'Reklam alanı yayına alındı.');
        setAdForm({ ...adForm, firma: '', baslik: '', aciklama: '', telefon: '', link: '', gorselUrl: '', baslangic: '', bitis: '' });
        await fetchData();
      } else {
        Alert.alert('Hata', data?.error || 'Reklam kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
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
        headers: getAuthHeaders(),
        body: JSON.stringify({ tahsilat: newTahsilat })
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Tahsilat tutarı güncellendi.');
        setEditModalVisible(false);
        setEditingHarvest(null);
        await fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        Alert.alert('Hata', errData?.error || errData?.message || 'Tahsilat güncellenemedi.');
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
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: currentUser?.userId || `usr_${currentUser?.phone}`,
          userPhone: currentUser?.phone || '',
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
        Alert.alert('Hata', errData?.error || errData?.message || 'Bahçe eklenemedi.');
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
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: currentUser?.userId || `usr_${currentUser?.phone}`,
          userPhone: currentUser?.phone || '',
          tarih: eForm.date || new Date().toISOString().split('T')[0],
          kategori: eForm.kategori,
          aciklama: eForm.aciklama ? eForm.aciklama.trim() : '',
          tutar: parseFloat(eForm.tutar) || 0
        })
      });

      if (res.ok) {
        Alert.alert('Başarılı', 'Gider eklendi.');
        setEForm({ ...eForm, aciklama: '', tutar: '' });
        await fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        Alert.alert('Hata', errData?.error || errData?.message || 'Gider eklenemedi.');
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
                  autoCorrect={false}
                  autoCapitalize="words"
                  keyboardType="default"
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

  const { totalReceivables, list: receivablesList } = getReceivables();
  const calculatedGardenSummaries = getGardenSummaries();

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
              style={[styles.navItem, activeTab === 'receivables' && styles.navItemActive]}
              onPress={() => setActiveTab('receivables')}
            >
              <Text style={[styles.navText, activeTab === 'receivables' && styles.navTextActive]}>⏳ Vadeli Alacaklar</Text>
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

            <TouchableOpacity
              style={[styles.navItem, activeTab === 'prices' && styles.navItemActive]}
              onPress={() => setActiveTab('prices')}
            >
              <Text style={[styles.navText, activeTab === 'prices' && styles.navTextActive]}>🏭 Fabrika Fiyatları</Text>
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
              {ads.filter(a => a.slot === 'dashboard_top' || a.slot === 'dashboard_middle').slice(0, 2).map((ad, i) => (
                <View key={ad._id || i} style={styles.adCard}>
                  <Text style={styles.adLabel}>SPONSORLU • {ad.kategori || 'REKLAM'}</Text>
                  <Text style={styles.adTitle}>{ad.baslik}</Text>
                  <Text style={styles.adText}>{ad.aciklama || ''}</Text>
                  <Text style={styles.adCompany}>📣 {ad.firma}{ad.telefon ? ` • ${ad.telefon}` : ''}</Text>
                </View>
              ))}

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
                        {item.isVadeli ? <Text style={styles.listSubText}>⏳ Vade: {formatDisplayDate(item.vadeTarihi)}</Text> : null}
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
                placeholder="GÜN.AY.YIL (Örn: 10.08.2026)"
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
                placeholder={currentUser?.name || "Üretici Adı"}
              />

              <Text style={styles.label}>Miktar (KG) *</Text>
              <TextInput
                style={styles.input}
                value={hForm.kg}
                onChangeText={(t) => setHForm({ ...hForm, kg: t })}
                placeholder="Örn: 1000"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Firma / Alıcı</Text>
              <TextInput
                style={styles.input}
                value={hForm.firma}
                onChangeText={(t) => setHForm({ ...hForm, firma: t })}
                placeholder="Örn: ÇAYKUR / Özel Fabrika"
              />

              <Text style={styles.label}>Birim Fiyat (TL)</Text>
              <TextInput
                style={styles.input}
                value={hForm.fiyat}
                onChangeText={(t) => setHForm({ ...hForm, fiyat: t })}
                placeholder="Örn: 20"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Tahsil Edilen Peşinat Tutar (TL)</Text>
              <TextInput
                style={styles.input}
                value={hForm.tahsilat}
                onChangeText={(t) => setHForm({ ...hForm, tahsilat: t })}
                placeholder="Örn: 0"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Bahçe</Text>
              <TextInput
                style={styles.input}
                value={hForm.garden}
                onChangeText={(t) => setHForm({ ...hForm, garden: t })}
                placeholder="Örn: Arka Bahçe"
              />

              {/* VADELİ SATIŞ OPSİYONU */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 }}>
                <Text style={{ fontWeight: 'bold', color: '#1b4332' }}>Vadeli Satış mı?</Text>
                <Switch
                  value={hForm.isVadeli}
                  onValueChange={(val) => setHForm({ ...hForm, isVadeli: val })}
                  trackColor={{ false: '#767577', true: '#2a9d8f' }}
                />
              </View>

              {/* Tarih Formatı Etiket Güncellemesi (Madde 3) */}
              {hForm.isVadeli && (
                <View>
                  <Text style={styles.label}>Vade Tarihi (Örn: GÜN.AY.YIL veya 15.09.2026)</Text>
                  <TextInput
                    style={styles.input}
                    value={hForm.vadeTarihi}
                    onChangeText={(t) => setHForm({ ...hForm, vadeTarihi: t })}
                    placeholder="GÜN.AY.YIL (Örn: 15.09.2026)"
                  />
                </View>
              )}

              <Text style={styles.label}>Açıklama</Text>
              <TextInput
                style={styles.input}
                value={hForm.aciklama}
                onChangeText={(t) => setHForm({ ...hForm, aciklama: t })}
                placeholder="Notlar..."
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveHarvest}>
                <Text style={styles.submitBtnText}>💾 HASAT KAYDINI KAYDET</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* TAHSİLAT TABI (Toplu Tahsilat Alanı Kaldırıldı - Madde 4) */}
          {activeTab === 'collections' && (
            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>🎯 ÇAY SATIŞINA ÖZEL TAHSİLAT</Text>
                <Text style={{ color: '#666', marginBottom: 10, fontSize: 13 }}>
                  Ödemenin düşülmesini istediğiniz çay satışını doğrudan seçin.
                </Text>

                <Text style={styles.label}>Ödeme Yapılacak Satışı Seçin</Text>
                <ScrollView style={{ maxHeight: 200, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 5, marginBottom: 10 }}>
                  {harvests.filter(h => ((Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0) - (Number(h.tahsilat) || 0)) > 0).length === 0 ? (
                    <Text style={{ padding: 10, color: '#888' }}>Bekleyen ödemesi olan satış yok.</Text>
                  ) : (
                    harvests
                      .filter(h => ((Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0) - (Number(h.tahsilat) || 0)) > 0)
                      .map((h) => {
                        const kalan = (Number(h.kg || h.weight) || 0) * (Number(h.fiyat) || 0) - (Number(h.tahsilat) || 0);
                        const isSelected = payHarvestId === h._id;
                        return (
                          <TouchableOpacity
                            key={h._id}
                            style={{
                              padding: 10,
                              backgroundColor: isSelected ? '#1b4332' : '#f8f9fa',
                              borderRadius: 6,
                              marginBottom: 5
                            }}
                            onPress={() => setPayHarvestId(h._id)}
                          >
                            <Text style={{ color: isSelected ? '#fff' : '#333', fontWeight: 'bold' }}>
                              {h.tarih || ''} - {h.firma || 'Firma Yok'} ({h.kg || h.weight} KG) {h.bahce ? `- ${h.bahce}` : ''}
                            </Text>
                            <Text style={{ color: isSelected ? '#e0e0e0' : '#666', fontSize: 12 }}>
                              Kalan Borç: {formatTL(kalan)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                  )}
                </ScrollView>

                <Text style={styles.label}>Tahsilat Tutarı (TL)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Örn: 5000"
                  keyboardType="numeric"
                  value={payAmount}
                  onChangeText={setPayAmount}
                />

                <Text style={styles.label}>Açıklama / Dekont Notu</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Örn: Banka havalesi"
                  value={payDesc}
                  onChangeText={setPayDesc}
                 autoCorrect={false} />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSpecificHarvestPayment}>
                  <Text style={styles.submitBtnText}>💳 SEÇİLİ SATIŞTAN DÜŞ VE KAYDET</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* VADELİ ALACAKLAR TABI - AYLIK GÖRÜNÜM */}
          {activeTab === 'receivables' && (
            <View>
              <Text style={styles.sectionTitle}>⏳ VADELİ ALACAKLAR • AYLIK TAKİP</Text>
              <View style={[styles.statCard, { borderLeftColor: '#d62828', marginBottom: 15 }]}>
                <Text style={styles.statTitle}>Toplam Bekleyen Vadeli / Açık Alacak</Text>
                <Text style={[styles.statValue, { color: '#d62828' }]}>{formatTL(totalReceivables)}</Text>
              </View>

              {getReceivablesByMonth().length === 0 ? (
                <Text style={styles.emptyText}>Bekleyen vadeli alacak kaydı bulunmuyor.</Text>
              ) : (
                getReceivablesByMonth().map(([month, items]: any) => {
                  const monthTotal = items.reduce((sum: number, item: any) => {
                    const total = (Number(item.kg || item.weight) || 0) * (Number(item.fiyat) || 0);
                    return sum + Math.max(0, total - (Number(item.tahsilat) || 0));
                  }, 0);
                  return (
                    <View key={month} style={styles.monthCard}>
                      <View style={styles.monthHeader}>
                        <Text style={styles.monthTitle}>📅 {month}</Text>
                        <Text style={styles.monthTotal}>{formatTL(monthTotal)}</Text>
                      </View>
                      {items.map((item: any, index: number) => {
                        const saleVal = (Number(item.kg || item.weight) || 0) * (Number(item.fiyat) || 0);
                        const payVal = Number(item.tahsilat) || 0;
                        const remaining = Math.max(0, saleVal - payVal);
                        return (
                          <View key={item._id || index} style={styles.listItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.listTitle}>🏭 {item.firma || 'Firma Belirtilmedi'}</Text>
                              <Text style={styles.listSubText}>
                                📅 Satış: {formatDisplayDate(item.tarih)} | ⚖️ {item.kg || item.weight || 0} KG | 💵 {item.fiyat || 0} TL/KG
                              </Text>
                              <Text style={styles.listSubText}>⏳ Vade: {formatDisplayDate(item.vadeTarihi)}</Text>
                              <Text style={styles.listSubText}>
                                Toplam: {formatTL(saleVal)} | Tahsilat: {formatTL(payVal)}
                              </Text>
                              <Text style={{ color: '#d62828', fontWeight: 'bold', marginTop: 2 }}>
                                🔴 Kalan: {formatTL(remaining)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* GİDERLER TABI */}
          {activeTab === 'expense' && (
            <View>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>📉 GİDER EKLE</Text>

                <Text style={styles.label}>Tarih</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.date}
                  onChangeText={(t) => setEForm({ ...eForm, date: t })}
                  placeholder="GÜN.AY.YIL"
                />

                <Text style={styles.label}>Kategori</Text>
                <View style={styles.rowBtnGroup}>
                  {['İşçilik', 'Gübre', 'Nakliye', 'Diğer'].map((kat) => (
                    <TouchableOpacity
                      key={kat}
                      style={[styles.groupBtn, eForm.kategori === kat && styles.groupBtnActive]}
                      onPress={() => setEForm({ ...eForm, kategori: kat })}
                    >
                      <Text style={[styles.groupBtnText, eForm.kategori === kat && styles.groupBtnTextActive]}>{kat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Tutar (TL) *</Text>
                <TextInput
                  style={styles.input}
                  value={eForm.tutar}
                  onChangeText={(t) => setEForm({ ...eForm, tutar: t })}
                  placeholder="Örn: 1500"
                  keyboardType="numeric"
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

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>GİDER LİSTESİ</Text>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bir gider yok.</Text>
              ) : (
                expenses.map((item, index) => (
                  <View key={item._id || index} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>
                        {item.kategori || 'Diğer'} - {formatTL(item.tutar)}
                      </Text>
                      <Text style={styles.listSubText}>📅 {item.tarih || 'Tarih Yok'}</Text>
                      {item.aciklama ? <Text style={styles.listSubText}>📝 {item.aciklama}</Text> : null}
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('expenses', item._id, 'Gider')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* FABRİKA FİYATLARI TABI */}
          {activeTab === 'prices' && (
            <View>
              <Text style={styles.sectionTitle}>🏭 FABRİKA ÇAY FİYATLARI & POLİTİKA TAKİBİ</Text>

              {isAdmin && <View style={styles.formCard}>
                <Text style={styles.formTitle}>➕ Yeni Fiyat / Politika Kaydı</Text>
                <Text style={styles.label}>Fabrika</Text>
                <TextInput style={styles.input} value={priceForm.firma} onChangeText={(t) => setPriceForm({ ...priceForm, firma: t })} autoCorrect={false} autoCapitalize="characters" keyboardType="default" placeholder="ÇAYKUR / EFOR / DOĞUŞ..." />
                <Text style={styles.label}>Fiyat (TL/KG)</Text>
                <TextInput style={styles.input} value={priceForm.fiyat} onChangeText={(t) => setPriceForm({ ...priceForm, fiyat: t })} keyboardType="decimal-pad" placeholder="Örn: 35,00" />
                <Text style={styles.label}>Fiyat Türü</Text>
                <View style={styles.rowBtnGroup}>
                  {['Haftalık','Aylık','Peşin','Vadeli'].map((tur) => <TouchableOpacity key={tur} style={[styles.groupBtn, priceForm.fiyatTuru === tur && styles.groupBtnActive]} onPress={() => setPriceForm({ ...priceForm, fiyatTuru: tur })}><Text style={[styles.groupBtnText, priceForm.fiyatTuru === tur && styles.groupBtnTextActive]}>{tur}</Text></TouchableOpacity>)}
                </View>
                {priceForm.fiyatTuru === 'Vadeli' && <><Text style={styles.label}>Vade (Gün)</Text><TextInput style={styles.input} value={priceForm.vadeGun} onChangeText={(t) => setPriceForm({ ...priceForm, vadeGun: t })} keyboardType="numeric" placeholder="Örn: 30" /></>}
                <Text style={styles.label}>Fiyat Tarihi</Text>
                <TextInput style={styles.input} value={priceForm.tarih} onChangeText={(t) => setPriceForm({ ...priceForm, tarih: t })} placeholder="GG.AA.YYYY" keyboardType="default" />
                <Text style={styles.label}>Geçerlilik Başlangıcı (opsiyonel)</Text>
                <TextInput style={styles.input} value={priceForm.gecerlilikBaslangic} onChangeText={(t) => setPriceForm({ ...priceForm, gecerlilikBaslangic: t })} placeholder="GG.AA.YYYY" keyboardType="default" />
                <Text style={styles.label}>Fiyat Politikası / Açıklama</Text>
                <TextInput style={styles.input} value={priceForm.politika} onChangeText={(t) => setPriceForm({ ...priceForm, politika: t })} autoCorrect={false} placeholder="Prim, vade, kampanya, kota vb." />
                <Text style={styles.label}>Kaynak</Text>
                <TextInput style={styles.input} value={priceForm.kaynak} onChangeText={(t) => setPriceForm({ ...priceForm, kaynak: t })} autoCorrect={false} placeholder="Firma duyurusu / WhatsApp / telefon..." />
                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveFactoryPrice}><Text style={styles.submitBtnText}>💾 FİYATI KAYDET</Text></TouchableOpacity>
              </View>} 

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>FABRİKALAR</Text>
              <View style={styles.rowBtnGroup}>
                {Array.from(new Set(factoryPrices.map((p: any) => String(p.firma || '').trim()).filter(Boolean))).map((firma) => <TouchableOpacity key={firma} style={[styles.groupBtn, selectedFactory === firma && styles.groupBtnActive]} onPress={() => setSelectedFactory(selectedFactory === firma ? null : firma)}><Text style={[styles.groupBtnText, selectedFactory === firma && styles.groupBtnTextActive]}>{firma}</Text></TouchableOpacity>)}
              </View>
              {selectedFactory && <>
                <View style={styles.rowBtnGroup}>
                  {['Tümü','Haftalık','Aylık','Peşin','Vadeli'].map((tur: any) => <TouchableOpacity key={tur} style={[styles.groupBtn, factoryFilter === tur && styles.groupBtnActive]} onPress={() => setFactoryFilter(tur)}><Text style={[styles.groupBtnText, factoryFilter === tur && styles.groupBtnTextActive]}>{tur}</Text></TouchableOpacity>)}
                </View>
                <Text style={styles.sectionTitle}>🏭 {selectedFactory} • FİYAT GEÇMİŞİ</Text>
              </>}

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>GÜNCEL / SON KAYITLAR</Text>
              {factoryPrices.length === 0 ? (
                <Text style={styles.emptyText}>Henüz fabrika fiyatı eklenmedi.</Text>
              ) : (
                factoryPrices
                  .filter((p: any) => !selectedFactory || String(p.firma || '').trim() === selectedFactory)
                  .filter((p: any) => factoryFilter === 'Tümü' || String(p.fiyatTuru || 'Peşin') === factoryFilter)
                  .map((p: any, index: number) => (
                    <View key={p._id || index} style={styles.priceCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listTitle}>🏭 {p.firma}</Text>
                        <Text style={styles.priceValue}>{formatTL(Number(p.fiyat) || 0)} / KG</Text>
                        <Text style={styles.listSubText}>📌 {p.fiyatTuru || 'Peşin'}{p.vadeGun ? ` • ${p.vadeGun} Gün` : ''} • 📅 {formatDisplayDate(p.tarih)}</Text>
                        {p.gecerlilikBaslangic ? <Text style={styles.listSubText}>⏱️ Geçerlilik başlangıcı: {formatDisplayDate(p.gecerlilikBaslangic)}</Text> : null}
                        {p.politika ? <Text style={styles.listSubText}>📝 {p.politika}</Text> : null}
                        {p.kaynak ? <Text style={styles.listSubText}>🔎 Kaynak: {p.kaynak}</Text> : null}
                      </View>
                      {isAdmin && <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('factory-prices', p._id, 'Fiyat')}><Text style={styles.actionBtnText}>🗑️</Text></TouchableOpacity>}
                    </View>
                  ))
              )}

              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>ℹ️ Takip Mantığı</Text>
                <Text style={styles.infoText}>ÇAYKUR, EFOR, DOĞUŞ ve diğer alıcıların fiyatlarını ve fiyat politikalarını tarihleriyle kaydedin. Böylece Haziran–Temmuz–Ağustos dönemlerinde hangi firmanın hangi fiyatı uyguladığını karşılaştırabilirsiniz.</Text>
              </View>
            </View>
          )}

          {/* BAHÇELER TABI (Dinamik Bahçe Toplamları Entegre Edildi - Madde 1) */}
          {activeTab === 'gardens' && (
            <View>
              <Text style={styles.sectionTitle}>📊 BAHÇE BAZLI TOPLAM TOPLAMA VE KAZANÇ</Text>
              {calculatedGardenSummaries.length === 0 ? (
                <Text style={styles.emptyText}>Henüz bahçelerden yapılmış bir hasat verisi bulunamadı.</Text>
              ) : (
                calculatedGardenSummaries.map((g, idx) => (
                  <View key={idx} style={[styles.listItem, { borderLeftWidth: 4, borderLeftColor: '#1b4332' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>🏡 {g.name}</Text>
                      <Text style={styles.listSubText}>⚖️ Toplam Hasat: {g.toplamKg.toLocaleString('tr-TR')} KG</Text>
                      <Text style={styles.listSubText}>💰 Toplam Kazanç: {formatTL(g.toplamKazanc)}</Text>
                      <Text style={styles.listSubText}>💵 Toplam Tahsilat: {formatTL(g.toplamTahsilat)}</Text>
                    </View>
                  </View>
                ))
              )}

              <View style={[styles.formCard, { marginTop: 20 }]}>
                <Text style={styles.formTitle}>🏡 YENİ BAHÇE TANIMLA</Text>

                <Text style={styles.label}>Bahçe Adı</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.name}
                  onChangeText={(t) => setGForm({ ...gForm, name: t })}
                  placeholder="Örn: Arka Bahçe"
                />

                <Text style={styles.label}>Ada / Parsel</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.adaParsel}
                  onChangeText={(t) => setGForm({ ...gForm, adaParsel: t })}
                  placeholder="Örn: 101/12"
                />

                <Text style={styles.label}>Alan (Dönüm / m²)</Text>
                <TextInput
                  style={styles.input}
                  value={gForm.alan}
                  onChangeText={(t) => setGForm({ ...gForm, alan: t })}
                  placeholder="Örn: 5 Dönüm"
                />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveGarden}>
                  <Text style={styles.submitBtnText}>💾 BAHÇEYİ KAYDET</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>KAYITLI BAHÇE LİSTESİ</Text>
              {gardens.length === 0 ? (
                <Text style={styles.emptyText}>Henüz kaydedilmiş bir bahçe yok.</Text>
              ) : (
                gardens.map((item, index) => (
                  <View key={item._id || index} style={styles.listItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>🏡 {item.name || 'İsimsiz Bahçe'}</Text>
                      {item.adaParsel ? <Text style={styles.listSubText}>📍 Ada/Parsel: {item.adaParsel}</Text> : null}
                      {item.alan ? <Text style={styles.listSubText}>📐 Alan: {item.alan}</Text> : null}
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('gardens', item._id, 'Bahçe')}>
                      <Text style={styles.actionBtnText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ADMIN PANELİ TABI */}
          {activeTab === 'admin' && isAdmin && (
            <View>
              <Text style={styles.sectionTitle}>📢 REKLAM YÖNETİMİ</Text>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Yeni Reklam Alanı</Text>
                <Text style={styles.label}>Reklam Veren Firma</Text>
                <TextInput style={styles.input} value={adForm.firma} onChangeText={(t) => setAdForm({ ...adForm, firma: t })} placeholder="Örn: Çay Gübre Ltd." />
                <Text style={styles.label}>Kategori</Text>
                <TextInput style={styles.input} value={adForm.kategori} onChangeText={(t) => setAdForm({ ...adForm, kategori: t })} placeholder="Çay firması / Gübre / Motor..." />
                <Text style={styles.label}>Reklam Başlığı</Text>
                <TextInput style={styles.input} value={adForm.baslik} onChangeText={(t) => setAdForm({ ...adForm, baslik: t })} placeholder="Kısa reklam başlığı" />
                <Text style={styles.label}>Reklam Metni</Text>
                <TextInput style={styles.input} value={adForm.aciklama} onChangeText={(t) => setAdForm({ ...adForm, aciklama: t })} placeholder="Kampanya / ürün / iletişim bilgisi" />
                <Text style={styles.label}>Telefon</Text>
                <TextInput style={styles.input} value={adForm.telefon} onChangeText={(t) => setAdForm({ ...adForm, telefon: t })} keyboardType="phone-pad" placeholder="05..." />
                <Text style={styles.label}>Görsel URL (opsiyonel)</Text>
                <TextInput style={styles.input} value={adForm.gorselUrl} onChangeText={(t) => setAdForm({ ...adForm, gorselUrl: t })} placeholder="https://..." />
                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveAd}>
                  <Text style={styles.submitBtnText}>📢 REKLAMI YAYINA AL</Text>
                </TouchableOpacity>
              </View>

              {ads.map((ad, index) => (
                <View key={ad._id || index} style={styles.adCard}>
                  <Text style={styles.adLabel}>{ad.kategori || 'REKLAM'}</Text>
                  <Text style={styles.adTitle}>{ad.baslik}</Text>
                  <Text style={styles.adText}>{ad.aciklama || ''}</Text>
                  <Text style={styles.adCompany}>📣 {ad.firma}{ad.telefon ? ` • ${ad.telefon}` : ''}</Text>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('ads', ad._id, 'Reklam')}>
                    <Text style={styles.actionBtnText}>🗑️ Reklamı Kaldır</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.sectionTitle}>👑 ÜRETİCİ BAZLI GENEL ÖZET</Text>
              {getAdminProducerSummary().length === 0 ? (
                <Text style={styles.emptyText}>Gösterilecek üretici verisi bulunamadı.</Text>
              ) : (
                getAdminProducerSummary().map((p, idx) => {
                  const rem = p.totalSales - p.totalPay;
                  return (
                    <View key={idx} style={styles.listItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listTitle}>👤 {p.name}</Text>
                        <Text style={styles.listSubText}>
                          📦 Toplam Hasat Sayısı: {p.count} | ⚖️ {p.totalKg.toLocaleString('tr-TR')} KG
                        </Text>
                        <Text style={styles.listSubText}>
                          💵 Satış: {formatTL(p.totalSales)} | 🟢 Tahsilat: {formatTL(p.totalPay)}
                        </Text>
                        <Text style={{ color: rem > 0 ? '#d62828' : '#2b9348', fontWeight: 'bold', marginTop: 2 }}>
                          {rem > 0 ? `🔴 Kalan Bakiye: ${formatTL(rem)}` : '🟢 Borcu Yok'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>

        {/* TAHSİLAT DÜZENLEME MODALI */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>✏️ Tahsilat Düzenle</Text>
              {editingHarvest && (
                <Text style={{ color: '#555', marginBottom: 10 }}>
                  {editingHarvest.uretici || editingHarvest.producerName} - Toplam Tutar:{' '}
                  {formatTL((Number(editingHarvest.kg || editingHarvest.weight) || 0) * (Number(editingHarvest.fiyat) || 0))}
                </Text>
              )}
              <Text style={styles.label}>Yeni Tahsilat Tutarı (TL)</Text>
              <TextInput
                style={styles.input}
                value={editTahsilatVal}
                onChangeText={setEditTahsilatVal}
                keyboardType="numeric"
                placeholder="0"
              />
              <View style={styles.modalBtnGroup}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.modalBtnText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleUpdateCollection}>
                  <Text style={styles.modalBtnText}>Kaydet</Text>
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
    shadowOffset: { width: 0, height: 4 },
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
  label: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginTop: 8
  },
  input: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dde2e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    marginBottom: 6
  },
  submitBtn: {
    width: '100%',
    backgroundColor: '#1b4332',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15
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
    fontWeight: 'bold',
    fontSize: 16
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
    fontSize: 12,
    fontWeight: 'bold'
  },
  navBar: {
    backgroundColor: '#2d6a4f',
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  navItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 6
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12
  },
  statsGrid: {
    gap: 10
  },
  statCard: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2
  },
  statTitle: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600'
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 4
  },
  adCard: {
    backgroundColor: '#fff8e6',
    borderWidth: 1,
    borderColor: '#f4c95d',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12
  },
  adLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#9a6700',
    marginBottom: 4
  },
  adTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332'
  },
  adText: {
    fontSize: 12,
    color: '#555',
    marginTop: 5
  },
  adCompany: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6c4f00',
    marginTop: 8
  },
  monthCard: {
    backgroundColor: '#eef7f1',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332'
  },
  monthTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#d62828'
  },
  priceCard: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#2a9d8f'
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b4332',
    marginVertical: 3
  },
  infoCard: {
    backgroundColor: '#eaf4ff',
    padding: 14,
    borderRadius: 10,
    marginTop: 16
  },
  infoTitle: {
    fontWeight: 'bold',
    color: '#1d3557',
    marginBottom: 5
  },
  infoText: {
    color: '#4a5568',
    fontSize: 12,
    lineHeight: 18
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20
  },
  listItem: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1b4332'
  },
  listSubText: {
    fontSize: 12,
    color: '#555',
    marginTop: 2
  },
  editBtn: {
    backgroundColor: '#ffb703',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  deleteBtn: {
    backgroundColor: '#e63946',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  formCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12
  },
  rowBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 6
  },
  groupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f8f9fa'
  },
  groupBtnActive: {
    backgroundColor: '#1b4332',
    borderColor: '#1b4332'
  },
  groupBtnText: {
    fontSize: 12,
    color: '#333'
  },
  groupBtnTextActive: {
    color: '#ffffff',
    fontWeight: 'bold'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12
  },
  modalBtnGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16
  },
  modalCancelBtn: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  modalSaveBtn: {
    backgroundColor: '#1b4332',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  modalBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13
  }
});