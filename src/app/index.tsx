import React, { useState, useEffect, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, StatusBar, Switch, Platform } from 'react-native';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { API_URL, fetchWithTimeout } from '../services/api';
import { saveSession, getSession, clearSession } from '../services/session';
import { clearOfflineData, discardOfflineRequest, enqueueOfflineRequest, getDataSnapshot, getFailedRequestCount, getOfflineRequests, getPendingRequestCount, retryOfflineRequest, saveDataSnapshot, syncOfflineRequests } from '../services/offlineQueue';
import { UserSession, HarvestRecord, ExpenseRecord, GardenRecord, FactoryPriceRecord, AdRecord } from '../types';
import { formatTL, normalizePhone, formatDisplayDate, toServerDate, parseMoney } from '../utils/format';
import { styles } from '../styles/styles';
import DashboardScreen from '../screens/DashboardScreen';
import HarvestScreen from '../screens/HarvestScreen';
import CollectionsScreen from '../screens/CollectionsScreen';
import ReceivablesScreen from '../screens/ReceivablesScreen';
import ExpenseScreen from '../screens/ExpenseScreen';
import FactoryPricesScreen from '../screens/FactoryPricesScreen';
import GardensScreen from '../screens/GardensScreen';
import AdminScreen from '../screens/AdminScreen';
import ReportsScreen from '../screens/ReportsScreen';
import MoreScreen from '../screens/MoreScreen';
import SettingsScreen from '../screens/SettingsScreen';

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function App() {
  // Kullanıcı Giriş / Kayıt State'leri
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [useOtpFlow, setUseOtpFlow] = useState(false);

  // Navigasyon ve Yüklenme State'leri
  const [activeTab, setActiveTab] = useState<'dashboard' | 'harvest' | 'collections' | 'receivables' | 'more' | 'expense' | 'gardens' | 'prices' | 'reports' | 'settings' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const isSyncingOfflineQueue = useRef(false);

  // Veri Listeleri
  const [harvests, setHarvests] = useState<HarvestRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [gardens, setGardens] = useState<GardenRecord[]>([]);
  const [factoryPrices, setFactoryPrices] = useState<FactoryPriceRecord[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<string | null>(null);
  const [factoryFilter, setFactoryFilter] = useState<'Tümü' | 'Haftalık' | 'Aylık' | 'Peşin' | 'Vadeli'>('Tümü');
  const [ads, setAds] = useState<AdRecord[]>([]);

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
  const [editingHarvest, setEditingHarvest] = useState<HarvestRecord | null>(null);
  const [editTahsilatVal, setEditTahsilatVal] = useState('');

  // Özel Tahsilat Ekleme Formu State'leri (Belirli Hasada Ödeme Yapma)
  const [payHarvestId, setPayHarvestId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDesc, setPayDesc] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  // Ortak İstek Başlıklarını Oluşturan Yardımcı Fonksiyon (Madde 6)
  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {})
  });

  const refreshAccessToken = async (): Promise<UserSession | null> => {
    if (!currentUser?.refreshToken) return null;
    try {
      const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentUser.refreshToken })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token || !data?.refreshToken) { await clearSession(); setCurrentUser(null); return null; }
      const nextUser: UserSession = { ...currentUser, userId: data.userId || currentUser.userId, name: data.name || currentUser.name, phone: normalizePhone(data.phone || currentUser.phone), role: data.role === 'admin' ? 'admin' : 'user', token: data.token, refreshToken: data.refreshToken };
      setCurrentUser(nextUser); await saveSession(nextUser); return nextUser;
    } catch { return null; }
  };

  const authFetch = async (url: string, options: RequestInit = {}, timeout = 60000) => {
    const makeOptions = (user: UserSession) => ({ ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${user.token}` } });
    if (!currentUser?.token) throw new Error('Oturum bulunamadı.');
    let res = await fetchWithTimeout(url, makeOptions(currentUser), timeout);
    if (res.status !== 401) return res;
    const nextUser = await refreshAccessToken();
    if (!nextUser) return res;
    return fetchWithTimeout(url, makeOptions(nextUser), timeout);
  };

  const refreshPendingSyncCount = async () => {
    if (!currentUser?.userId) return;
    setPendingSyncCount(await getPendingRequestCount(currentUser.userId));
    setFailedSyncCount(await getFailedRequestCount(currentUser.userId));
  };

  const queueOfflineRequest = async (endpoint: string, body: Record<string, unknown>) => {
    if (!currentUser?.userId) throw new Error('Oturum bulunamadı.');
    await enqueueOfflineRequest({ userId: currentUser.userId, endpoint, method: 'POST', body });
    await refreshPendingSyncCount();
  };

  const postOrQueue = async (endpoint: string, body: Record<string, unknown>) => {
    const network = await NetInfo.fetch();
    if (!network.isConnected || network.isInternetReachable === false) {
      await queueOfflineRequest(endpoint, body);
      return { queued: true as const };
    }

    try {
      const response = await authFetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Idempotency-Key': `online-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
        body: JSON.stringify(body)
      });
      return { queued: false as const, response };
    } catch (error) {
      const latestNetwork = await NetInfo.fetch();
      if (!latestNetwork.isConnected || latestNetwork.isInternetReachable === false) {
        await queueOfflineRequest(endpoint, body);
        return { queued: true as const };
      }
      throw error;
    }
  };

  const syncOfflineQueue = async () => {
    if (!currentUser?.userId || isSyncingOfflineQueue.current) return { synced: 0, pending: 0 };
    const network = await NetInfo.fetch();
    if (!network.isConnected || network.isInternetReachable === false) return { synced: 0, pending: await getPendingRequestCount(currentUser.userId) };

    isSyncingOfflineQueue.current = true;
    try {
      const result = await syncOfflineRequests(currentUser.userId, (request) => authFetch(`${API_URL}${request.endpoint}`, {
        method: request.method,
        headers: { ...getAuthHeaders(), 'Idempotency-Key': request.id },
        body: JSON.stringify(request.body)
      }));
      setPendingSyncCount(result.pending);
      setFailedSyncCount(await getFailedRequestCount(currentUser.userId));
      return result;
    } finally {
      isSyncingOfflineQueue.current = false;
    }
  };

  const manageFailedOfflineRequests = async () => {
    if (!currentUser?.userId) return;
    const failed = (await getOfflineRequests(currentUser.userId)).filter((item) => item.status === 'failed');
    if (!failed.length) return;
    const first = failed[0];
    Alert.alert(
      'Gönderilemeyen kayıt var',
      `${failed.length} kayıt sunucu tarafından kabul edilmedi. İlk hata: ${first.lastError || 'Bilinmeyen hata'}`,
      [
        { text: 'Kapat', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: async () => { await discardOfflineRequest(currentUser.userId, first.id); await refreshPendingSyncCount(); } },
        { text: 'Tekrar Dene', onPress: async () => { await retryOfflineRequest(currentUser.userId, first.id); await syncOfflineQueue(); await refreshPendingSyncCount(); } }
      ]
    );
  };

  // Uygulama Açılışında Oturumu Kontrol Et
  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const savedUser = await getSession();
        if (savedUser?.token && savedUser?.refreshToken) { setCurrentUser(savedUser); } else if (savedUser) { await clearSession(); }
      } catch (error) {
        console.log('Oturum okuma hatası:', error);
      } finally {
        setInitialCheckDone(true);
      }
    };
    checkSavedSession();
  }, []);

  // Verileri Sunucudan Çek
  const setupNotifications = async () => {
    try {
      // Expo Go Android'de remote push token desteği yoktur (SDK 53+).
      // Development/production build'de ise bildirim sistemi normal şekilde çalışır.
      if (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient') {
        console.log('Push bildirimleri Expo Go geliştirme ortamında atlandı.');
        return;
      }

      const Notifications = require('expo-notifications');

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false
        })
      });

      const permissions = await Notifications.getPermissionsAsync();
      let finalStatus = permissions.status;

      if (finalStatus !== 'granted') {
        finalStatus = (await Notifications.requestPermissionsAsync()).status;
      }

      if (finalStatus !== 'granted') {
        console.log('Bildirim izni verilmedi.');
        return;
      }

      if (Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync('cay-takip', {
          name: 'Çay Takip Bildirimleri',
          importance: Notifications.AndroidImportance?.HIGH ?? 4
        });
      }

    } catch (e) {
      console.log('Bildirim kurulumu atlandı:', e);
    }
  };

  const scheduleDueNotifications = async (items: HarvestRecord[]) => {
    if (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient') {
      return;
    }

    try {
      const Notifications = require('expo-notifications');
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') return;
      const now = new Date();
      if (Notifications.cancelAllScheduledNotificationsAsync) await Notifications.cancelAllScheduledNotificationsAsync();
      for (const h of items) {
        if (!h.isVadeli || !h.vadeTarihi) continue;
        const raw = String(h.vadeTarihi);
        const m = raw.match(/^(\d{4})[-.](\d{1,2})(?:[-.](\d{1,2}))?/);
        if (!m) continue;
        const due = new Date(Number(m[1]), Number(m[2])-1, Number(m[3] || 1), 9, 0, 0);
        const reminder = new Date(due.getTime() - 24*60*60*1000);
        if (reminder <= now || due <= now) continue;
        await Notifications.scheduleNotificationAsync({ content:{ title:'⏰ Çay Takip - Vade Yaklaşıyor', body:`${h.firma || 'Fabrika'} için ${h.uretici || h.producerName || 'üretici'} kaydının vadesi ${formatDisplayDate(h.vadeTarihi)}.`, data:{type:'vade',harvestId:h._id}, sound:'default' }, trigger: reminder });
      }
    } catch (e) { console.log('Vade bildirimi planlanamadı:', e); }
  };

  const fetchData = async () => {
    if (!currentUser?.token) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const results = await Promise.allSettled([
        authFetch(`${API_URL}/harvests`, { headers }),
        authFetch(`${API_URL}/expenses`, { headers }),
        authFetch(`${API_URL}/gardens`, { headers }),
        authFetch(`${API_URL}/factory-prices`, { headers }),
        authFetch(`${API_URL}/ads`, { headers })
      ]);
      const parse = async (r: PromiseSettledResult<Response>) => r.status === 'fulfilled' && r.value.ok ? r.value.json() : [];
      const [rawH, rawE, rawG, rawP, rawA] = await Promise.all(results.map(parse));
      const allRequestsSucceeded = results.every((r) => r.status === 'fulfilled' && r.value.ok);
      const allRequestsFailed = results.every((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));

      if (allRequestsFailed) {
        const snapshot = await getDataSnapshot(currentUser.userId);
        if (snapshot) {
          setHarvests(snapshot.harvests as HarvestRecord[]);
          setExpenses(snapshot.expenses as ExpenseRecord[]);
          setGardens(snapshot.gardens as GardenRecord[]);
          setFactoryPrices(snapshot.factoryPrices as FactoryPriceRecord[]);
          setAds(snapshot.ads as AdRecord[]);
          Alert.alert('Çevrimdışı Mod', 'Son senkronize edilen veriler gösteriliyor. Yeni kayıtlar bağlantı geldiğinde gönderilecek.');
          return;
        }
      }

      setHarvests(rawH || []); setExpenses(rawE || []); setGardens(rawG || []); setFactoryPrices(rawP || []); setAds(rawA || []);
      if (allRequestsSucceeded) {
        await saveDataSnapshot(currentUser.userId, {
          harvests: rawH || [], expenses: rawE || [], gardens: rawG || [], factoryPrices: rawP || [], ads: rawA || []
        });
      }
      await scheduleDueNotifications(rawH || []);
      const failedSources = results.map((r, i) => (r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)) ? ['hasatlar','giderler','bahçeler','fabrika fiyatları','reklamlar'][i] : null).filter(Boolean);
      if (failedSources.length === results.length) { Alert.alert('Veriler Güncellenemedi', 'Sunucuya bağlanılamadı.'); }
    } catch (err: any) { Alert.alert('Bağlantı Kurulamadı', err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (currentUser) {
      setupNotifications();
      refreshPendingSyncCount();
      syncOfflineQueue().then((result) => {
        if (result.synced > 0) fetchData();
      });
      fetchData();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        syncOfflineQueue().then((result) => {
          if (result.synced > 0) fetchData();
        });
      }
    });
    return unsubscribe;
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
  const syncProfile = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    try {
      const res = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: normalized })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error: any = new Error(data?.error || 'Giriş yapılamadı.');
        error.code = data?.code;
        throw error;
      }
      return data;
    } catch (e) { console.warn('Profil senkronizasyonu:', e); throw e; }
  };

  const saveProfile = async (phone: string, name: string) => {
    const normalized = normalizePhone(phone);
    const res = await fetchWithTimeout(`${API_URL}/users/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalized, name: name.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: any = new Error(data?.error || 'Üretici profili kaydedilemedi.');
      error.code = data?.code;
      throw error;
    }
    return data;
  };

  const handleAuth = async () => {
    const cleanPhone = normalizePhone(authPhone);
    if (!cleanPhone || cleanPhone.length !== 11) { Alert.alert('Eksik Bilgi', 'Lütfen geçerli bir telefon numarası girin.'); return; }
    if (authMode === 'register' && !authName.trim()) { Alert.alert('Eksik Bilgi', 'Lütfen Ad Soyad girin.'); return; }
    setLoading(true);
    try {
      const profile = authMode === 'register' ? await saveProfile(cleanPhone, authName) : await syncProfile(cleanPhone);
      if (!profile?.token) {
        Alert.alert('Giriş Başarısız', authMode === 'login' ? 'Kayıt bulunamadı veya oturum oluşturulamadı.' : 'Profil kaydedildi ancak güvenli oturum oluşturulamadı.');
        return;
      }
      const userData: UserSession = {
        userId: profile.userId,
        name: profile.name || authName.trim() || 'Üretici',
        phone: normalizePhone(profile.phone || cleanPhone),
        role: profile.role === 'admin' ? 'admin' : 'user',
        token: profile.token,
        refreshToken: profile.refreshToken
      };
      setCurrentUser(userData); await saveSession(userData);
      Alert.alert(authMode === 'register' ? 'Kayıt Başarılı' : 'Giriş Başarılı', `Hoş geldiniz, ${userData.name}!`);
    } catch (e: any) {
      if (e?.code === 'OTP_REQUIRED') {
        setUseOtpFlow(true);
        Alert.alert('SMS Doğrulama Gerekli', 'Bu hesap için SMS kodu ile güvenli giriş yapın.');
      } else Alert.alert('Profil Hatası', e?.message || 'Giriş işlemi başarısız.');
    }
    finally { setLoading(false); }
  };

  const requestOtp = async () => {
    const phone = normalizePhone(authPhone);
    if (!phone || phone.length !== 11) { Alert.alert('Eksik Bilgi', 'Lütfen geçerli bir telefon numarası girin.'); return; }
    if (authMode === 'register' && !authName.trim()) { Alert.alert('Eksik Bilgi', 'Lütfen Ad Soyad girin.'); return; }
    setLoading(true);
    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/request-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, purpose: authMode })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Doğrulama kodu gönderilemedi.');
      setOtpSent(true);
      setUseOtpFlow(true);
      Alert.alert('Kod Gönderildi', 'Telefonunuza gelen 6 haneli doğrulama kodunu girin.');
    } catch (error: any) { Alert.alert('SMS Doğrulama', error?.message || 'Kod gönderilemedi.'); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    const phone = normalizePhone(authPhone);
    if (!/^\d{6}$/.test(otpCode.replace(/\D/g, ''))) { Alert.alert('Eksik Bilgi', 'Lütfen SMS ile gelen 6 haneli kodu girin.'); return; }
    setLoading(true);
    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, name: authName.trim(), purpose: authMode, code: otpCode })
      });
      const profile = await response.json().catch(() => ({}));
      if (!response.ok || !profile?.token) throw new Error(profile?.error || 'Doğrulama tamamlanamadı.');
      const userData: UserSession = { userId: profile.userId, name: profile.name || authName.trim() || 'Üretici', phone: normalizePhone(profile.phone || phone), role: profile.role === 'admin' ? 'admin' : 'user', token: profile.token, refreshToken: profile.refreshToken };
      setCurrentUser(userData); await saveSession(userData);
      setOtpCode(''); setOtpSent(false);
      Alert.alert('Doğrulama Başarılı', `Hoş geldiniz, ${userData.name}!`);
    } catch (error: any) { Alert.alert('SMS Doğrulama', error?.message || 'Kod doğrulanamadı.'); }
    finally { setLoading(false); }
  };

  // Çıkış Yap
  const handleLogout = async () => {
    try {
      if (currentUser?.refreshToken) await fetchWithTimeout(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: currentUser.refreshToken }) });
    } catch {}
    await clearSession();
    setCurrentUser(null);
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await authFetch(`${API_URL}/users/me`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Hesap silinemedi.');
      if (currentUser?.userId) await clearOfflineData(currentUser.userId);
      await clearSession();
      setCurrentUser(null);
      Alert.alert('Hesap Silindi', 'Hesabınız ve ilişkili kayıtlarınız silindi.');
    } catch (error: any) { Alert.alert('Hesap Silme', error?.message || 'Hesap silinemedi.'); throw error; }
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
            const res = await authFetch(`${API_URL}/${endpoint}/${id}`, {
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
    if (!hForm.kg.trim() || !hForm.firma.trim() || !hForm.fiyat.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen miktar, firma ve birim fiyat alanlarını doldurun.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        tarih: hForm.date || new Date().toISOString().split('T')[0],
        surum: hForm.surum || '1. Sürüm',
        uretici: producerName,
        producerName: producerName,
        kg: parseMoney(hForm.kg),
        weight: parseMoney(hForm.kg),
        firma: hForm.firma ? hForm.firma.trim() : '',
        fiyat: parseMoney(hForm.fiyat),
        tahsilat: parseMoney(hForm.tahsilat),
        aciklama: hForm.aciklama ? hForm.aciklama.trim() : '',
        bahce: hForm.garden ? hForm.garden.trim() : '',
        isVadeli: hForm.isVadeli,
        vadeTarihi: hForm.isVadeli ? hForm.vadeTarihi : ''
      };

      const result = await postOrQueue('/harvests', payload);
      if (result.queued) {
        Alert.alert('Çevrimdışı Kaydedildi', 'Hasat kaydı telefonda saklandı; internet gelince otomatik gönderilecek.');
        setHForm({ date: new Date().toISOString().split('T')[0], surum: '1. Sürüm', producer: '', kg: '', firma: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '', isVadeli: false, vadeTarihi: '' });
        setActiveTab('dashboard');
        return;
      }
      const res = result.response;

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
    const amount = parseMoney(payAmount);
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
      const result = await postOrQueue('/payments', {
        harvestId: payHarvestId,
        tutar: amount,
        aciklama: payDesc.trim(),
        tarih: new Date().toISOString().split('T')[0]
      });
      if (result.queued) {
        Alert.alert('Çevrimdışı Kaydedildi', 'Tahsilat telefonda saklandı; internet gelince otomatik gönderilecek.');
        setPayHarvestId(''); setPayAmount(''); setPayDesc('');
        return;
      }
      const res = result.response;

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
    const fiyat = parseMoney(priceForm.fiyat);
    const tarih = toServerDate(priceForm.tarih);
    const gecerlilikBaslangic = toServerDate(priceForm.gecerlilikBaslangic);
    if (!priceForm.firma.trim() || !Number.isFinite(fiyat) || fiyat < 0 || !tarih) {
      Alert.alert('Eksik Bilgi', 'Fabrika adı, fiyat ve fiyat tarihi zorunludur.'); return;
    }
    setLoading(true);
    try {
      const result = await postOrQueue('/factory-prices', { ...priceForm, firma: priceForm.firma.trim(), fiyat, tarih, gecerlilikBaslangic, vadeGun: Number(priceForm.vadeGun) || 0 });
      if (result.queued) {
        Alert.alert('Çevrimdışı Kaydedildi', 'Fabrika fiyatı telefonda saklandı; internet gelince otomatik gönderilecek.');
        setPriceForm({ ...priceForm, fiyat: '', vadeGun: '', gecerlilikBaslangic: '', politika: '', kaynak: '', aciklama: '' });
        return;
      }
      const res = result.response;
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
      const result = await postOrQueue('/ads', { ...adForm, firma: adForm.firma.trim(), baslik: adForm.baslik.trim() });
      if (result.queued) {
        Alert.alert('Çevrimdışı Kaydedildi', 'Reklam kaydı telefonda saklandı; internet gelince otomatik gönderilecek.');
        setAdForm({ ...adForm, firma: '', baslik: '', aciklama: '', telefon: '', link: '', gorselUrl: '', baslangic: '', bitis: '' });
        return;
      }
      const res = result.response;
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
  const openEditModal = (harvestItem: HarvestRecord) => {
    setEditingHarvest(harvestItem);
    setEditTahsilatVal(String(harvestItem.tahsilat || 0));
    setEditModalVisible(true);
  };

  const handleUpdateCollection = async () => {
    if (!editingHarvest) return;
    const newTahsilat = parseMoney(editTahsilatVal);
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
      const result = await postOrQueue('/gardens', {
        name: gForm.name.trim(),
        adaParsel: gForm.adaParsel.trim(),
        alan: gForm.alan.trim()
      });
      if (result.queued) {
        Alert.alert('Çevrimdışı Kaydedildi', 'Bahçe kaydı telefonda saklandı; internet gelince otomatik gönderilecek.');
        setGForm({ name: '', adaParsel: '', alan: '' });
        return;
      }
      const res = result.response;

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
      const result = await postOrQueue('/expenses', {
        tarih: eForm.date || new Date().toISOString().split('T')[0],
        kategori: eForm.kategori,
        aciklama: eForm.aciklama ? eForm.aciklama.trim() : '',
        tutar: parseMoney(eForm.tutar)
      });
      if (result.queued) {
        Alert.alert('Çevrimdışı Kaydedildi', 'Gider kaydı telefonda saklandı; internet gelince otomatik gönderilecek.');
        setEForm({ ...eForm, aciklama: '', tutar: '' });
        return;
      }
      const res = result.response;

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
              {authMode === 'login' ? 'Telefon numaranızla devam edin' : 'Yeni üretici kaydı oluşturun'}
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

            {otpSent && <>
              <Text style={styles.label}>SMS Doğrulama Kodu</Text>
              <TextInput style={styles.input} placeholder="6 haneli kod" keyboardType="number-pad" maxLength={6} value={otpCode} onChangeText={setOtpCode} />
              <TouchableOpacity style={styles.submitBtn} onPress={verifyOtp}><Text style={styles.submitBtnText}>KODU DOĞRULA</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={requestOtp}><Text style={styles.secondaryBtnText}>Kodu yeniden gönder</Text></TouchableOpacity>
            </>}
            {!otpSent && <>
              <TouchableOpacity style={styles.submitBtn} onPress={useOtpFlow ? requestOtp : handleAuth}>
                <Text style={styles.submitBtnText}>{useOtpFlow ? 'SMS KODU GÖNDER' : authMode === 'login' ? 'GİRİŞ YAP' : 'KAYIT OL VE GİRİŞ YAP'}</Text>
              </TouchableOpacity>
              {!useOtpFlow && <TouchableOpacity style={styles.secondaryBtn} onPress={() => setUseOtpFlow(true)}><Text style={styles.secondaryBtnText}>SMS kodu ile güvenli giriş</Text></TouchableOpacity>}
            </>}

            <TouchableOpacity
              style={{ marginTop: 15 }}
              onPress={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setOtpSent(false); setOtpCode(''); }}
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
            <Text style={styles.headerTitle}>🍃 Çay Takip</Text>
            <Text style={styles.headerSubtitle}>
              Hoş geldin, {currentUser.name} {isAdmin ? '(Yönetici)' : ''}
            </Text>
            {pendingSyncCount > 0 && (
              <Text style={styles.headerSubtitle}>⏳ {pendingSyncCount} kayıt senkronizasyon bekliyor</Text>
            )}
            {failedSyncCount > 0 && <TouchableOpacity onPress={manageFailedOfflineRequests}><Text style={styles.headerWarning}>⚠️ {failedSyncCount} kayıt için işlem gerekli</Text></TouchableOpacity>}
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
              <Text style={[styles.navText, activeTab === 'dashboard' && styles.navTextActive]}>🏠 Ana Sayfa</Text>
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
              <Text style={[styles.navText, activeTab === 'collections' && styles.navTextActive]}>💳 Ödeme Al</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === 'receivables' && styles.navItemActive]}
              onPress={() => setActiveTab('receivables')}
            >
              <Text style={[styles.navText, activeTab === 'receivables' && styles.navTextActive]}>⏳ Alacaklar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.navItem, activeTab === 'more' && styles.navItemActive]} onPress={() => setActiveTab('more')}>
              <Text style={[styles.navText, activeTab === 'more' && styles.navTextActive]}>☰ Diğer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* İÇERİK ALANI */}
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} colors={['#1b4332']} />}
        >
          {activeTab === 'dashboard' && (
            <DashboardScreen
              ads={ads}
              harvests={harvests}
              totalKg={totalKg}
              totalSales={totalSales}
              totalPay={totalPay}
              pendingCollection={pendingCollection}
              totalExp={totalExp}
              netProfit={netProfit}
              openEditModal={openEditModal}
              handleDelete={handleDelete}
              onNavigate={setActiveTab}
            />
          )}

          {/* HASAT EKLE TABI */}
          {activeTab === 'harvest' && (
            <HarvestScreen
              currentUser={currentUser}
              hForm={hForm}
              handleSaveHarvest={handleSaveHarvest}
              setHForm={setHForm}
            />
          )}

          {/* TAHSİLAT TABI */}
          {activeTab === 'collections' && (
            <CollectionsScreen
              handleSpecificHarvestPayment={handleSpecificHarvestPayment}
              harvests={harvests}
              payAmount={payAmount}
              payDesc={payDesc}
              payHarvestId={payHarvestId}
              setPayAmount={setPayAmount}
              setPayDesc={setPayDesc}
              setPayHarvestId={setPayHarvestId}
            />
          )}

          {/* VADELİ ALACAKLAR TABI - AYLIK GÖRÜNÜM */}
          {activeTab === 'receivables' && (
            <ReceivablesScreen
              getReceivablesByMonth={getReceivablesByMonth}
              totalReceivables={totalReceivables}
            />
          )}

          {activeTab === 'more' && <MoreScreen isAdmin={Boolean(isAdmin)} onNavigate={(tab) => setActiveTab(tab)} />}

          {/* GİDERLER TABI */}
          {activeTab === 'expense' && (
            <ExpenseScreen
              eForm={eForm}
              expenses={expenses}
              handleDelete={handleDelete}
              handleSaveExpense={handleSaveExpense}
              setEForm={setEForm}
            />
          )}

          {/* FABRİKA FİYATLARI TABI */}
          {activeTab === 'prices' && (
            <FactoryPricesScreen
              factoryFilter={factoryFilter}
              factoryPrices={factoryPrices}
              handleDelete={handleDelete}
              handleSaveFactoryPrice={handleSaveFactoryPrice}
              isAdmin={isAdmin}
              priceForm={priceForm}
              selectedFactory={selectedFactory}
              setFactoryFilter={setFactoryFilter}
              setPriceForm={setPriceForm}
              setSelectedFactory={setSelectedFactory}
            />
          )}

          {/* BAHÇELER TABI */}
          {activeTab === 'gardens' && (
            <GardensScreen
              gForm={gForm}
              gardens={gardens}
              calculatedGardenSummaries={calculatedGardenSummaries}
              handleDelete={handleDelete}
              handleSaveGarden={handleSaveGarden}
              setGForm={setGForm}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsScreen
              harvests={harvests}
              expenses={expenses}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'settings' && <SettingsScreen currentUser={currentUser} onDeleteAccount={handleDeleteAccount} />}

          {/* ADMIN PANELİ TABI */}
          {activeTab === 'admin' && isAdmin && (
            <AdminScreen
              adForm={adForm}
              ads={ads}
              getAdminProducerSummary={getAdminProducerSummary}
              handleDelete={handleDelete}
              handleSaveAd={handleSaveAd}
              setAdForm={setAdForm}
              totalKg={totalKg}
              totalPay={totalPay}
              totalSales={totalSales}
              currentUser={currentUser}
            />
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
