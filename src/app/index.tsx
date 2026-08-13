import React, { useState, useEffect, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, StatusBar, Switch, Platform, useWindowDimensions } from 'react-native';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { API_URL, fetchWithTimeout } from '../services/api';
import { saveSession, getSession, clearSession } from '../services/session';
import { clearOfflineData, discardOfflineRequest, enqueueOfflineRequest, getDataSnapshot, getFailedRequestCount, getOfflineRequests, getPendingRequestCount, retryOfflineRequest, saveDataSnapshot, syncOfflineRequests } from '../services/offlineQueue';
import { UserSession, HarvestRecord, PaymentRecord, ExpenseRecord, GardenRecord, FactoryPriceRecord, AdRecord } from '../types';
import { formatTL, normalizePhone, formatDisplayDate, toServerDate, parseMoney, todayDisplayDate, calculateAgriculturalDeductions, netTotalOf, remainingTotalOf } from '../utils/format';
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
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 960;
  // Kullanıcı Giriş / Kayıt State'leri
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authPinConfirm, setAuthPinConfirm] = useState('');
  const [authFeedback, setAuthFeedback] = useState<{ title: string; message: string; type: 'error' | 'info' } | null>(null);
  const [operationFeedback, setOperationFeedback] = useState<{ title: string; message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ endpoint: string; id: string; title: string; status: 'confirming' | 'deleting' | 'error'; message?: string } | null>(null);

  // Navigasyon ve Yüklenme State'leri
  const [activeTab, setActiveTab] = useState<'dashboard' | 'harvest' | 'collections' | 'receivables' | 'more' | 'expense' | 'gardens' | 'prices' | 'reports' | 'settings' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const isSyncingOfflineQueue = useRef(false);

  // Veri Listeleri
  const [harvests, setHarvests] = useState<HarvestRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [gardens, setGardens] = useState<GardenRecord[]>([]);
  const [factoryPrices, setFactoryPrices] = useState<FactoryPriceRecord[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<string | null>(null);
  const [factoryFilter, setFactoryFilter] = useState<'Tümü' | 'Haftalık' | 'Aylık' | 'Peşin' | 'Vadeli'>('Tümü');
  const [ads, setAds] = useState<AdRecord[]>([]);

  const todayTR = todayDisplayDate();
  const [priceForm, setPriceForm] = useState({ firma: 'ÇAYKUR', fiyat: '', tarih: todayTR, fiyatTuru: 'Peşin', vadeGun: '', gecerlilikBaslangic: '', politika: '', kaynak: '', aciklama: '' });

  const [adForm, setAdForm] = useState({
    slot: 'dashboard_top',
    firma: '',
    kategori: 'Sponsorlu',
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
    date: todayTR,
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
    date: todayTR,
    kategori: 'İşçilik',
    aciklama: '',
    tutar: ''
  });

  const [gForm, setGForm] = useState({ name: '', adaParsel: '', alan: '' });

  // Hasat kaydı düzenleme modalı
  const [editingHarvest, setEditingHarvest] = useState<HarvestRecord | null>(null);
  const [harvestEditModalVisible, setHarvestEditModalVisible] = useState(false);
  const [editHarvestForm, setEditHarvestForm] = useState({
    date: '', surum: '1. Sürüm', producer: '', kg: '', firma: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '', isVadeli: false, vadeTarihi: ''
  });

  // Özel Tahsilat Ekleme Formu State'leri (Belirli Hasada Ödeme Yapma)
  const [payHarvestId, setPayHarvestId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDesc, setPayDesc] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const desktopMenuItems = [
    { group: 'GENEL', tab: 'dashboard' as const, icon: '⌂', label: 'Ana Sayfa', helper: 'Genel durum ve özet' },
    { group: 'GENEL', tab: 'harvest' as const, icon: '＋', label: 'Hasat Ekle', helper: 'Yeni hasat kaydı' },
    { group: 'ÖDEMELER', tab: 'collections' as const, icon: '₺', label: 'Ödeme Al', helper: 'Tahsilat işlemleri' },
    { group: 'ÖDEMELER', tab: 'receivables' as const, icon: '◷', label: 'Alacaklar', helper: 'Bekleyen ödemeler' },
    { group: 'ÖDEMELER', tab: 'expense' as const, icon: '−', label: 'Giderler', helper: 'Masraf kaydı ve listesi' },
    { group: 'TAKİP', tab: 'gardens' as const, icon: '♧', label: 'Bahçeler', helper: 'Bahçe bilgileri' },
    { group: 'TAKİP', tab: 'prices' as const, icon: '◈', label: 'Fabrika Fiyatları', helper: 'Güncel fiyat karşılaştırması' },
    { group: 'TAKİP', tab: 'reports' as const, icon: '▤', label: 'Raporlar', helper: 'PDF, Excel ve analizler' },
    { group: 'HESAP', tab: 'more' as const, icon: '☰', label: 'Diğer', helper: 'Tüm bölümlere kısa yol' },
    { group: 'HESAP', tab: 'settings' as const, icon: '⚙', label: 'Ayarlar', helper: 'Şifre ve hesap işlemleri' },
    ...(isAdmin ? [{ group: 'YÖNETİM', tab: 'admin' as const, icon: '★', label: 'Yönetim', helper: 'Yönetici paneli' }] : []),
  ];
  const activeDesktopMenu = desktopMenuItems.find((item) => item.tab === activeTab);

  const showAuthFeedback = (title: string, message: string, type: 'error' | 'info' = 'error') => {
    setAuthFeedback({ title, message, type });
    // react-native-web'de Alert.alert boş bir fonksiyondur. Bilgisayarda
    // mesajı doğrudan giriş ekranında gösteriyoruz; mobildeki uyarı korunur.
    if (Platform.OS !== 'web') Alert.alert(title, message);
  };

  // Electron/RN Web'de Alert.alert görünür bir pencere açmaz. Kayıt, silme ve
  // sunucu hatalarının bilgisayarda da anlaşılır olması için aynı mesajı ekranda gösteririz.
  const showOperationFeedback = (title: string, message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setOperationFeedback({ title, message, type });
    if (Platform.OS !== 'web') Alert.alert(title, message);
  };

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
    // Electron'da NetInfo her zaman doğru durum döndürmeyebiliyor. Bilgisayarda
    // kaydı çevrimdışı kuyruğa atmadan önce gerçek sunucu isteğini denemek gerekir.
    const isDefinitelyOffline = Platform.OS !== 'web' && (!network.isConnected || network.isInternetReachable === false);
    if (isDefinitelyOffline) {
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
      const wentOffline = Platform.OS !== 'web' && (!latestNetwork.isConnected || latestNetwork.isInternetReachable === false);
      if (wentOffline) {
        await queueOfflineRequest(endpoint, body);
        return { queued: true as const };
      }
      throw error;
    }
  };

  const syncOfflineQueue = async () => {
    if (!currentUser?.userId || isSyncingOfflineQueue.current) return { synced: 0, pending: 0 };
    const network = await NetInfo.fetch();
    if (Platform.OS !== 'web' && (!network.isConnected || network.isInternetReachable === false)) return { synced: 0, pending: await getPendingRequestCount(currentUser.userId) };

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
        authFetch(`${API_URL}/payments?limit=300`, { headers }),
        authFetch(`${API_URL}/expenses`, { headers }),
        authFetch(`${API_URL}/gardens`, { headers }),
        authFetch(`${API_URL}/factory-prices`, { headers }),
        authFetch(`${API_URL}/ads`, { headers })
      ]);
      const parse = async (r: PromiseSettledResult<Response>) => r.status === 'fulfilled' && r.value.ok ? r.value.json() : [];
      const [rawH, rawPayments, rawE, rawG, rawP, rawA] = await Promise.all(results.map(parse));
      const allRequestsSucceeded = results.every((r) => r.status === 'fulfilled' && r.value.ok);
      const allRequestsFailed = results.every((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));

      if (allRequestsFailed) {
        const snapshot = await getDataSnapshot(currentUser.userId);
        if (snapshot) {
          setHarvests(snapshot.harvests as HarvestRecord[]);
          setPayments((snapshot.payments || []) as PaymentRecord[]);
          setExpenses(snapshot.expenses as ExpenseRecord[]);
          setGardens(snapshot.gardens as GardenRecord[]);
          setFactoryPrices(snapshot.factoryPrices as FactoryPriceRecord[]);
          setAds(snapshot.ads as AdRecord[]);
          showOperationFeedback('Çevrimdışı Mod', 'Son senkronize edilen veriler gösteriliyor. Yeni kayıtlar bağlantı geldiğinde gönderilecek.', 'info');
          return;
        }
      }

      setHarvests(rawH || []); setPayments(rawPayments || []); setExpenses(rawE || []); setGardens(rawG || []); setFactoryPrices(rawP || []); setAds(rawA || []);
      if (allRequestsSucceeded) {
        await saveDataSnapshot(currentUser.userId, {
          harvests: rawH || [], payments: rawPayments || [], expenses: rawE || [], gardens: rawG || [], factoryPrices: rawP || [], ads: rawA || []
        });
      }
      await scheduleDueNotifications(rawH || []);
      const failedSources = results.map((r, i) => (r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)) ? ['hasatlar','tahsilatlar','giderler','bahçeler','fabrika fiyatları','reklamlar'][i] : null).filter(Boolean);
      if (failedSources.length === results.length) { showOperationFeedback('Veriler Güncellenemedi', 'Sunucuya bağlanılamadı.', 'error'); }
    } catch (err: any) { showOperationFeedback('Bağlantı Kurulamadı', err.message || 'Sunucuya ulaşılamadı.', 'error'); }
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
      const pay = Number(h.tahsilat) || 0;

      map[gName].toplamKg += kg;
      map[gName].toplamKazanc += netTotalOf(h);
      map[gName].toplamTahsilat += pay;
    });

    return Object.values(map);
  };

  // Vadeli / Bekleyen Alacakların Dinamik Hesaplanması
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
    const list = harvests.filter((h) => remainingTotalOf(h) > 0.01);
    const totalReceivables = list.reduce((acc, h) => acc + remainingTotalOf(h), 0);

    return { totalReceivables, list };
  };

  const receivablesSafe = (items: any[]) => (items || []).filter((h: any) => remainingTotalOf(h) > 0.01);

  const getReceivablesByMonth = () => {
    const groups: { [key: string]: any[] } = {};
    receivablesSafe(harvests).forEach((h: any) => {
      const key = formatVadeMonth(h.vadeTarihi || h.tarih);
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return Object.entries(groups).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  };

  // Giriş Yap / Kayıt Ol İşlemleri
  const syncProfile = async (phone: string, pin: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    try {
      const res = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: normalized, pin })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error: any = new Error(data?.error || 'Giriş yapılamadı.');
        error.code = data?.code;
        throw error;
      }
      return data;
    } catch (e) { throw e; }
  };

  const saveProfile = async (phone: string, name: string, pin: string) => {
    const normalized = normalizePhone(phone);
    const res = await fetchWithTimeout(`${API_URL}/users/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalized, name: name.trim(), pin })
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
    const cleanPin = authPin.replace(/\D/g, '');
    setAuthFeedback(null);
    if (!cleanPhone || cleanPhone.length !== 11) { showAuthFeedback('Eksik Bilgi', 'Lütfen geçerli bir telefon numarası girin.'); return; }
    if (authMode === 'register' && !authName.trim()) { showAuthFeedback('Eksik Bilgi', 'Lütfen Ad Soyad girin.'); return; }
    if (!/^\d{6}$/.test(cleanPin)) { showAuthFeedback('Eksik Bilgi', 'Lütfen 6 haneli giriş şifrenizi belirleyin.'); return; }
    if (authMode === 'register' && cleanPin !== authPinConfirm.replace(/\D/g, '')) { showAuthFeedback('Şifre Eşleşmiyor', 'Giriş şifreleri aynı olmalıdır.'); return; }
    setLoading(true);
    try {
      const profile = authMode === 'register' ? await saveProfile(cleanPhone, authName, cleanPin) : await syncProfile(cleanPhone, cleanPin);
      if (!profile?.token) {
        showAuthFeedback('Giriş Başarısız', authMode === 'login' ? 'Kayıt bulunamadı veya oturum oluşturulamadı.' : 'Profil kaydedildi ancak güvenli oturum oluşturulamadı.');
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
      if (Platform.OS !== 'web') Alert.alert(authMode === 'register' ? 'Kayıt Başarılı' : 'Giriş Başarılı', `Hoş geldiniz, ${userData.name}!`);
    } catch (e: any) {
      if (e?.code === 'PIN_SETUP_REQUIRED') {
        setAuthMode('register');
        setAuthPin('');
        setAuthPinConfirm('');
        showAuthFeedback('İlk Giriş Şifresi', 'Bu eski hesap için henüz giriş şifresi yok. Aşağıdaki kayıt ekranında aynı telefon numaranızı ve yeni 6 haneli şifrenizi girin.', 'info');
      }
      else showAuthFeedback('Giriş Yapılamadı', e?.message || 'Giriş işlemi başarısız.');
    }
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

  const handleChangePin = async (currentPin: string, newPin: string) => {
    if (!currentUser) throw new Error('Oturum bulunamadı.');
    const response = await authFetch(`${API_URL}/users/me/pin`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPin, newPin })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.token) throw new Error(data?.error || 'Giriş şifresi güncellenemedi.');
    const refreshedUser: UserSession = {
      ...currentUser,
      token: data.token,
      refreshToken: data.refreshToken || currentUser.refreshToken,
      name: data.name || currentUser.name,
      phone: normalizePhone(data.phone || currentUser.phone),
      role: data.role === 'admin' ? 'admin' : 'user'
    };
    setCurrentUser(refreshedUser);
    await saveSession(refreshedUser);
  };

  // Genel Hesaplamalar
  const totalKg = (harvests || []).reduce((acc, c) => acc + (Number(c.kg || c.weight) || 0), 0);
  const totalSales = (harvests || []).reduce((acc, c) => acc + netTotalOf(c), 0);
  const totalPay = (harvests || []).reduce((acc, c) => acc + (Number(c.tahsilat) || 0), 0);
  const totalExp = (expenses || []).reduce((acc, c) => acc + (Number(c.tutar) || 0), 0);
  const pendingCollection = (harvests || []).reduce((acc, c) => acc + remainingTotalOf(c), 0);
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
      const pay = Number(h.tahsilat) || 0;

      summaryMap[key].totalKg += kg;
      summaryMap[key].totalSales += netTotalOf(h);
      summaryMap[key].totalPay += pay;
      summaryMap[key].count += 1;
    });

    return Object.values(summaryMap);
  };

  // Silme onayı React Native'in kendi penceresiyle gösterilir. Böylece Android,
  // web ve masaüstünde aynı şekilde çalışır.
  const handleDelete = (endpoint: string, id: string, title: string) => {
    if (!id) {
      showOperationFeedback('Kayıt Bulunamadı', 'Silinecek kayıt bilgisi eksik. Sayfayı yenileyip tekrar deneyin.', 'error');
      return;
    }
    setDeleteConfirmation({ endpoint, id, title, status: 'confirming' });
  };

  const confirmDelete = async () => {
    const target = deleteConfirmation;
    if (!target || target.status === 'deleting') return;
    setDeleteConfirmation({ ...target, status: 'deleting' });
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/${target.endpoint}/${target.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || 'Silme işlemi gerçekleşmedi.');
      if (target.endpoint === 'ads') setAds((items) => items.filter((item) => item._id !== target.id));
      setDeleteConfirmation(null);
      showOperationFeedback('Silindi', `${target.title} kaydı kaldırıldı.`, 'success');
      await fetchData();
    } catch (error: any) {
      setDeleteConfirmation({ ...target, status: 'error', message: error?.message || 'Silme işlemi tamamlanamadı.' });
      setLoading(false);
    }
  };

  // Hasat Kaydetme
  const handleSaveHarvest = async () => {
    const producerName = hForm.producer.trim() || currentUser?.name || 'Üretici';
    const tarih = toServerDate(hForm.date);
    const vadeTarihi = hForm.isVadeli ? toServerDate(hForm.vadeTarihi) : '';
    if (!hForm.kg.trim() || !hForm.firma.trim() || !hForm.fiyat.trim()) {
      showOperationFeedback('Eksik Bilgi', 'Lütfen miktar, firma ve birim fiyat alanlarını doldurun.', 'error');
      return;
    }
    if (!tarih) { showOperationFeedback('Tarih Hatası', 'Tarihi GG.AA.YYYY biçiminde girin.', 'error'); return; }
    if (hForm.isVadeli && !vadeTarihi) { showOperationFeedback('Tarih Hatası', 'Vade tarihini GG.AA.YYYY biçiminde girin.', 'error'); return; }
    const amounts = calculateAgriculturalDeductions(hForm.kg, hForm.fiyat);
    const tahsilat = parseMoney(hForm.tahsilat);
    if (tahsilat > amounts.netTutar + 0.01) {
      showOperationFeedback('Tahsilat Hatası', `Tahsilat net alacaktan fazla olamaz. Net alacak: ${formatTL(amounts.netTutar)}`, 'error');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        tarih,
        surum: hForm.surum || '1. Sürüm',
        uretici: producerName,
        producerName: producerName,
        kg: parseMoney(hForm.kg),
        weight: parseMoney(hForm.kg),
        firma: hForm.firma ? hForm.firma.trim() : '',
        fiyat: parseMoney(hForm.fiyat),
        brutTutar: amounts.brutTutar,
        gelirVergisiOrani: amounts.gelirVergisiOrani,
        gelirVergisiKesintisi: amounts.gelirVergisiKesintisi,
        kesintiTutar: amounts.kesintiTutar,
        tahsilat,
        aciklama: hForm.aciklama ? hForm.aciklama.trim() : '',
        bahce: hForm.garden ? hForm.garden.trim() : '',
        isVadeli: hForm.isVadeli,
        vadeTarihi
      };

      const result = await postOrQueue('/harvests', payload);
      if (result.queued) {
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Hasat kaydı telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setHForm({ date: todayDisplayDate(), surum: '1. Sürüm', producer: '', kg: '', firma: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '', isVadeli: false, vadeTarihi: '' });
        setActiveTab('dashboard');
        return;
      }
      const res = result.response;

      if (res.ok) {
        showOperationFeedback('Başarılı', 'Hasat kaydı eklendi.', 'success');
        // Form Temizleme Mantığı Düzeltildi (Madde 5)
        setHForm({
          date: todayDisplayDate(),
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
        showOperationFeedback('Kayıt Başarısız', detailMessage, 'error');
      }
    } catch (e: any) {
      showOperationFeedback('Bağlantı Hatası', e.message || 'Sunucuya ulaşılamadı.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Belirli Bir Hasat Satışına Özel Tahsilat Ekleme
  const handleSpecificHarvestPayment = async () => {
    if (!payHarvestId) {
      showOperationFeedback('Eksik Bilgi', 'Lütfen tahsilat düşülecek satışı seçin.', 'error');
      return;
    }
    const amount = parseMoney(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showOperationFeedback('Eksik Bilgi', 'Geçerli ve 0’dan büyük bir tahsilat tutarı girin.', 'error');
      return;
    }

    const selected = harvests.find(h => h._id === payHarvestId);
    if (!selected) {
      showOperationFeedback('Hata', 'Seçilen satış kaydı bulunamadı. Listeyi yenileyip tekrar deneyin.', 'error');
      return;
    }

    const saleTotal = netTotalOf(selected);
    const remaining = remainingTotalOf(selected);

    if (amount > remaining + 0.01) {
      showOperationFeedback('Hata', `Tahsilat kalan borçtan fazla olamaz. Kalan: ${formatTL(remaining)}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await postOrQueue('/payments', {
        harvestId: payHarvestId,
        tutar: amount,
        aciklama: payDesc.trim(),
        tarih: toServerDate(todayDisplayDate())
      });
      if (result.queued) {
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Tahsilat telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setPayHarvestId(''); setPayAmount(''); setPayDesc('');
        return;
      }
      const res = result.response;

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showOperationFeedback('Başarılı', 'Tahsilat başarıyla kaydedildi ve satıştan düşüldü.', 'success');
        setPayHarvestId('');
        setPayAmount('');
        setPayDesc('');
        await fetchData();
      } else {
        showOperationFeedback('Tahsilat Kaydedilemedi', data?.error || data?.message || `Sunucu hatası (${res.status}).`, 'error');
      }
    } catch (e: any) {
      showOperationFeedback('Bağlantı Hatası', e?.message || 'Sunucuya ulaşılamadı.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Ana sayfadaki ödeme düğmesi, tahsilatı doğrudan değiştirmek yerine seçili
  // hasatla ödeme ekranını açar. Böylece her yeni ödeme geçmişe ayrı kayıt olur.
  const openPaymentForHarvest = (harvest: HarvestRecord) => {
    if (remainingTotalOf(harvest) <= 0.01) {
      showOperationFeedback('Ödeme Tamamlandı', 'Bu hasat kaydının açık alacağı bulunmuyor.', 'info');
      return;
    }
    setPayHarvestId(harvest._id);
    setPayAmount('');
    setPayDesc('');
    setActiveTab('collections');
  };

  // Fabrika fiyatı kaydet
  const handleSaveFactoryPrice = async () => {
    if (!isAdmin) { showOperationFeedback('Yetki Yok', 'Bu işlemi sadece yönetici yapabilir.', 'error'); return; }
    const fiyat = parseMoney(priceForm.fiyat);
    const tarih = toServerDate(priceForm.tarih);
    const gecerlilikBaslangic = toServerDate(priceForm.gecerlilikBaslangic);
    if (!priceForm.firma.trim() || !Number.isFinite(fiyat) || fiyat < 0 || !tarih) {
      showOperationFeedback('Eksik Bilgi', 'Fabrika adı, fiyat ve fiyat tarihi zorunludur.', 'error'); return;
    }
    setLoading(true);
    try {
      const result = await postOrQueue('/factory-prices', { ...priceForm, firma: priceForm.firma.trim(), fiyat, tarih, gecerlilikBaslangic, vadeGun: Number(priceForm.vadeGun) || 0 });
      if (result.queued) {
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Fabrika fiyatı telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setPriceForm({ ...priceForm, fiyat: '', vadeGun: '', gecerlilikBaslangic: '', politika: '', kaynak: '', aciklama: '' });
        return;
      }
      const res = result.response;
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showOperationFeedback('Başarılı', 'Fabrika fiyatı kaydedildi.', 'success');
        setPriceForm({ ...priceForm, fiyat: '', vadeGun: '', gecerlilikBaslangic: '', politika: '', kaynak: '', aciklama: '' });
        await fetchData();
      } else showOperationFeedback('Hata', data?.error || 'Fiyat kaydedilemedi.', 'error');
    } catch (e: any) { showOperationFeedback('Hata', e.message || 'Fiyat kaydedilemedi.', 'error'); }
    finally { setLoading(false); }
  };

  const handleSaveAd = async () => {
    if (!adForm.firma.trim()) {
      showOperationFeedback('Eksik Bilgi', 'Banner için firma veya marka adı zorunludur.', 'error');
      return;
    }
    setLoading(true);
    try {
      const firma = adForm.firma.trim();
      const result = await postOrQueue('/ads', {
        ...adForm,
        firma,
        baslik: adForm.baslik.trim() || firma,
        aciklama: adForm.aciklama.trim(),
        telefon: adForm.telefon.trim(),
        link: adForm.link.trim(),
        gorselUrl: adForm.gorselUrl.trim()
      });
      if (result.queued) {
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Banner telefonda saklandı; internet gelince otomatik yayınlanacak.', 'info');
        setAdForm({ ...adForm, firma: '', baslik: '', aciklama: '', telefon: '', link: '', gorselUrl: '', baslangic: '', bitis: '' });
        return;
      }
      const res = result.response;
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showOperationFeedback('Başarılı', 'Banner ana sayfada yayına alındı.', 'success');
        setAdForm({ ...adForm, firma: '', baslik: '', aciklama: '', telefon: '', link: '', gorselUrl: '', baslangic: '', bitis: '' });
        await fetchData();
      } else {
        showOperationFeedback('Hata', data?.error || 'Banner kaydedilemedi.', 'error');
      }
    } catch (e: any) {
      showOperationFeedback('Hata', e.message || 'Banner kaydedilemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openHarvestEditModal = (harvestItem: HarvestRecord) => {
    setEditingHarvest(harvestItem);
    setEditHarvestForm({
      date: formatDisplayDate(harvestItem.tarih),
      surum: harvestItem.surum || '1. Sürüm',
      producer: harvestItem.producerName || harvestItem.uretici || currentUser?.name || '',
      kg: String(harvestItem.kg ?? harvestItem.weight ?? ''),
      firma: harvestItem.firma || '',
      fiyat: String(harvestItem.fiyat ?? ''),
      tahsilat: String(harvestItem.tahsilat ?? 0),
      aciklama: harvestItem.aciklama || '',
      garden: harvestItem.garden || harvestItem.bahce || '',
      isVadeli: Boolean(harvestItem.isVadeli),
      vadeTarihi: formatDisplayDate(harvestItem.vadeTarihi)
    });
    setHarvestEditModalVisible(true);
  };

  const handleUpdateHarvest = async () => {
    if (!editingHarvest) return;
    const tarih = toServerDate(editHarvestForm.date);
    const vadeTarihi = editHarvestForm.isVadeli ? toServerDate(editHarvestForm.vadeTarihi) : '';
    const kg = parseMoney(editHarvestForm.kg);
    const fiyat = parseMoney(editHarvestForm.fiyat);
    // Tahsilatlar ödeme ekranından girilir ve her biri ayrı geçmiş kaydı oluşturur.
    // Hasat düzenleme ekranı mevcut tahsilat toplamını değiştirmez.
    const tahsilat = Number(editingHarvest.tahsilat) || 0;
    const amounts = calculateAgriculturalDeductions(kg, fiyat);
    if (!tarih) { showOperationFeedback('Tarih Hatası', 'Tarihi GG.AA.YYYY biçiminde girin.', 'error'); return; }
    if (editHarvestForm.isVadeli && !vadeTarihi) { showOperationFeedback('Tarih Hatası', 'Vade tarihini GG.AA.YYYY biçiminde girin.', 'error'); return; }
    if (!Number.isFinite(kg) || kg <= 0 || !editHarvestForm.firma.trim() || !Number.isFinite(fiyat) || fiyat < 0) {
      showOperationFeedback('Eksik Bilgi', 'KG, firma ve birim fiyat alanlarını geçerli şekilde doldurun.', 'error');
      return;
    }
    if (tahsilat > amounts.netTutar + 0.01) {
      showOperationFeedback('Tahsilat Hatası', 'Tahsilat tutarı net alacak tutarından fazla olamaz.', 'error');
      return;
    }
    const producerName = isAdmin ? (editHarvestForm.producer.trim() || editingHarvest.producerName || editingHarvest.uretici || currentUser?.name || 'Üretici') : (editingHarvest.producerName || editingHarvest.uretici || currentUser?.name || 'Üretici');
    setLoading(true);
    try {
      const response = await authFetch(`${API_URL}/harvests/${editingHarvest._id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tarih, surum: editHarvestForm.surum, uretici: producerName, producerName,
          kg, weight: kg, firma: editHarvestForm.firma.trim(), fiyat, tahsilat,
          brutTutar: amounts.brutTutar, gelirVergisiOrani: amounts.gelirVergisiOrani,
          gelirVergisiKesintisi: amounts.gelirVergisiKesintisi, kesintiTutar: amounts.kesintiTutar,
          aciklama: editHarvestForm.aciklama.trim(), bahce: editHarvestForm.garden.trim(),
          isVadeli: editHarvestForm.isVadeli, vadeTarihi
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Hasat kaydı güncellenemedi.');
      setHarvestEditModalVisible(false);
      setEditingHarvest(null);
      showOperationFeedback('Başarılı', 'Hasat kaydı güncellendi.', 'success');
      await fetchData();
    } catch (error: any) {
      showOperationFeedback('Hasat Düzenleme', error?.message || 'Hasat kaydı güncellenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Bahçe Kaydetme
  const handleSaveGarden = async () => {
    if (!gForm.name.trim() && !gForm.adaParsel.trim()) {
      showOperationFeedback('Eksik Bilgi', 'Lütfen bahçe adı veya ada/parsel girin.', 'error');
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
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Bahçe kaydı telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setGForm({ name: '', adaParsel: '', alan: '' });
        return;
      }
      const res = result.response;

      if (res.ok) {
        showOperationFeedback('Başarılı', 'Bahçe eklendi.', 'success');
        setGForm({ name: '', adaParsel: '', alan: '' });
        await fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        showOperationFeedback('Hata', errData?.error || errData?.message || 'Bahçe eklenemedi.', 'error');
      }
    } catch (e: any) {
      showOperationFeedback('Bağlantı Hatası', e.message || 'Sunucuya ulaşılamadı.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Gider Kaydetme
  const handleSaveExpense = async () => {
    const tutar = parseMoney(eForm.tutar);
    if (!eForm.tutar.trim() || !Number.isFinite(tutar) || tutar <= 0) {
      showOperationFeedback('Eksik Bilgi', 'Lütfen 0’dan büyük geçerli bir tutar girin.', 'error');
      return;
    }
    const tarih = toServerDate(eForm.date);
    if (!tarih) { showOperationFeedback('Tarih Hatası', 'Tarihi GG.AA.YYYY biçiminde girin.', 'error'); return; }
    setLoading(true);
    try {
      const result = await postOrQueue('/expenses', {
        tarih,
        kategori: eForm.kategori,
        aciklama: eForm.aciklama ? eForm.aciklama.trim() : '',
        tutar
      });
      if (result.queued) {
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Gider kaydı telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setEForm({ ...eForm, aciklama: '', tutar: '' });
        return;
      }
      const res = result.response;

      if (res.ok) {
        showOperationFeedback('Başarılı', 'Gider eklendi.', 'success');
        setEForm({ ...eForm, aciklama: '', tutar: '' });
        await fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        showOperationFeedback('Hata', errData?.error || errData?.message || 'Gider eklenemedi.', 'error');
      }
    } catch (e: any) {
      showOperationFeedback('Bağlantı Hatası', e.message || 'Sunucuya ulaşılamadı.', 'error');
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
            <Text style={styles.authTitle}>🍃 ÇAYLIK</Text>
            <Text style={styles.authSubTitle}>
              {authMode === 'login' ? 'Telefon ve giriş şifrenizle devam edin' : 'Yeni üretici kaydı oluşturun'}
            </Text>
            {authFeedback && (
              <View style={{ width: '100%', marginBottom: 14, padding: 12, borderRadius: 10, backgroundColor: authFeedback.type === 'error' ? '#FDECEC' : '#E9F5EE', borderWidth: 1, borderColor: authFeedback.type === 'error' ? '#F2B8B5' : '#B7DCC7' }}>
                <Text style={{ color: authFeedback.type === 'error' ? '#A0221D' : '#1B5E3C', fontWeight: '800', marginBottom: 3 }}>{authFeedback.title}</Text>
                <Text style={{ color: '#39443E', lineHeight: 20 }}>{authFeedback.message}</Text>
              </View>
            )}

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

            <Text style={styles.label}>6 Haneli Giriş Şifresi</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: 123456"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              value={authPin}
              onChangeText={setAuthPin}
            />
            {authMode === 'register' && <>
              <Text style={styles.label}>Giriş Şifresi Tekrar</Text>
              <TextInput
                style={styles.input}
                placeholder="6 haneyi tekrar yazın"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                value={authPinConfirm}
                onChangeText={setAuthPinConfirm}
              />
              <Text style={styles.formHelp}>Bu şifreyi not edin; telefon numaranızla birlikte girişte kullanacaksınız.</Text>
            </>}
            <TouchableOpacity disabled={loading} style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleAuth}>
              <Text style={styles.submitBtnText}>{loading ? 'LÜTFEN BEKLEYİN...' : authMode === 'login' ? 'GİRİŞ YAP' : 'KAYIT OL VE GİRİŞ YAP'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 15 }}
              onPress={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthPin(''); setAuthPinConfirm(''); setAuthFeedback(null); }}
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
        <View style={isDesktop ? styles.desktopShell : styles.mobileShell}>
          {isDesktop && (
            <View style={styles.desktopSidebar}>
              <View style={styles.desktopBrand}>
                <View style={styles.desktopBrandMark}><Text style={styles.desktopBrandMarkText}>Ç</Text></View>
                <View>
                  <Text style={styles.desktopBrandTitle}>Çaylık</Text>
                  <Text style={styles.desktopBrandSubtitle}>Üretici takip sistemi</Text>
                </View>
              </View>

              <ScrollView style={styles.desktopMenuScroll} contentContainerStyle={styles.desktopMenuContent} showsVerticalScrollIndicator={false}>
                {desktopMenuItems.map((item, index) => {
                  const previous = desktopMenuItems[index - 1];
                  const showGroup = !previous || previous.group !== item.group;
                  const active = activeTab === item.tab;
                  return (
                    <React.Fragment key={item.tab}>
                      {showGroup && <Text style={styles.desktopMenuGroup}>{item.group}</Text>}
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[styles.desktopNavItem, active && styles.desktopNavItemActive]}
                        onPress={() => setActiveTab(item.tab)}
                      >
                        <View style={[styles.desktopNavIcon, active && styles.desktopNavIconActive]}><Text style={[styles.desktopNavIconText, active && styles.desktopNavIconTextActive]}>{item.icon}</Text></View>
                        <View style={styles.desktopNavCopy}>
                          <Text style={[styles.desktopNavText, active && styles.desktopNavTextActive]}>{item.label}</Text>
                          <Text style={[styles.desktopNavHint, active && styles.desktopNavHintActive]}>{item.helper}</Text>
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </ScrollView>

              <View style={styles.desktopSidebarFooter}>
                <Text style={styles.desktopFooterName}>{currentUser.name}</Text>
                <Text style={styles.desktopFooterMeta}>{isAdmin ? 'Yönetici hesabı' : 'Üretici hesabı'}</Text>
                {pendingSyncCount > 0 && <Text style={styles.desktopFooterSync}>⏳ {pendingSyncCount} kayıt gönderilecek</Text>}
                {failedSyncCount > 0 && <TouchableOpacity onPress={manageFailedOfflineRequests}><Text style={styles.desktopFooterWarning}>⚠ {failedSyncCount} kayıt için işlem gerekli</Text></TouchableOpacity>}
              </View>
            </View>
          )}

          <View style={styles.appMain}>

        {/* HEADER */}
        <View style={[styles.header, isDesktop && styles.desktopHeader]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, isDesktop && styles.desktopHeaderTitle]}>{isDesktop ? activeDesktopMenu?.label || 'Çaylık' : '🍃 Çaylık'}</Text>
            <Text style={[styles.headerSubtitle, isDesktop && styles.desktopHeaderSubtitle]}>
              {isDesktop ? `${activeDesktopMenu?.helper || 'Çay üretimi takibi'} · ${currentUser.name}` : <>Hoş geldin, {currentUser.name} {isAdmin ? '(Yönetici)' : ''}</>}
            </Text>
            {pendingSyncCount > 0 && (
              <Text style={[styles.headerSubtitle, isDesktop && styles.desktopHeaderSubtitle]}>⏳ {pendingSyncCount} kayıt senkronizasyon bekliyor</Text>
            )}
            {failedSyncCount > 0 && <TouchableOpacity onPress={manageFailedOfflineRequests}><Text style={styles.headerWarning}>⚠️ {failedSyncCount} kayıt için işlem gerekli</Text></TouchableOpacity>}
          </View>
          <TouchableOpacity style={[styles.logoutBtn, isDesktop && styles.desktopLogoutBtn]} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Çıkış</Text>
          </TouchableOpacity>
        </View>

        {operationFeedback && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setOperationFeedback(null)}
            style={[
              styles.operationFeedback,
              operationFeedback.type === 'error' && styles.operationFeedbackError,
              operationFeedback.type === 'success' && styles.operationFeedbackSuccess
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.operationFeedbackTitle}>{operationFeedback.title}</Text>
              <Text style={styles.operationFeedbackText}>{operationFeedback.message}</Text>
            </View>
            <Text style={styles.operationFeedbackClose}>×</Text>
          </TouchableOpacity>
        )}

        {/* TAB MENÜSÜ */}
        {!isDesktop && <View style={styles.navBar}>
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
        </View>}

        {/* İÇERİK ALANI */}
        <ScrollView
          style={[styles.content, isDesktop && styles.desktopScroll]}
          contentContainerStyle={isDesktop ? styles.desktopContent : undefined}
          showsVerticalScrollIndicator={isDesktop}
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
              openPaymentForHarvest={openPaymentForHarvest}
              openHarvestEditModal={openHarvestEditModal}
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
              payments={payments}
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

          {activeTab === 'settings' && <SettingsScreen currentUser={currentUser} onChangePin={handleChangePin} onDeleteAccount={handleDeleteAccount} />}

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
          </View>
        </View>

        <Modal
          visible={Boolean(deleteConfirmation)}
          transparent
          animationType="fade"
          onRequestClose={() => deleteConfirmation?.status !== 'deleting' && setDeleteConfirmation(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, styles.deleteConfirmModal]}>
              <Text style={styles.modalTitle}>{deleteConfirmation?.title || 'Kayıt'} silinsin mi?</Text>
              <Text style={styles.formHelp}>Bu işlem geri alınamaz.</Text>
              {deleteConfirmation?.status === 'error' && (
                <View style={styles.deleteConfirmError}>
                  <Text style={styles.deleteConfirmErrorText}>{deleteConfirmation.message}</Text>
                </View>
              )}
              <View style={styles.modalBtnGroup}>
                <TouchableOpacity
                  disabled={deleteConfirmation?.status === 'deleting'}
                  style={[styles.modalCancelBtn, deleteConfirmation?.status === 'deleting' && styles.buttonDisabled]}
                  onPress={() => setDeleteConfirmation(null)}
                >
                  <Text style={styles.modalBtnText}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={deleteConfirmation?.status === 'deleting'}
                  style={[styles.deleteConfirmButton, deleteConfirmation?.status === 'deleting' && styles.buttonDisabled]}
                  onPress={confirmDelete}
                >
                  <Text style={styles.modalBtnText}>{deleteConfirmation?.status === 'deleting' ? 'Siliniyor…' : deleteConfirmation?.status === 'error' ? 'Tekrar Dene' : 'Sil'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* HASAT KAYDI DÜZENLEME MODALI */}
        <Modal
          visible={harvestEditModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setHarvestEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>✏️ Hasat Kaydını Düzenle</Text>
                <Text style={styles.formHelp}>Yanlış girilen bilgileri düzeltip kaydedin.</Text>

                <Text style={styles.label}>Tarih (GG.AA.YYYY)</Text>
                <TextInput style={styles.input} value={editHarvestForm.date} onChangeText={(date) => setEditHarvestForm({ ...editHarvestForm, date })} placeholder="12.08.2026" />

                <Text style={styles.label}>Sürüm</Text>
                <View style={styles.rowBtnGroup}>{['1. Sürüm', '2. Sürüm', '3. Sürüm', '4. Sürüm'].map((surum) => <TouchableOpacity key={surum} style={[styles.groupBtn, editHarvestForm.surum === surum && styles.groupBtnActive]} onPress={() => setEditHarvestForm({ ...editHarvestForm, surum })}><Text style={[styles.groupBtnText, editHarvestForm.surum === surum && styles.groupBtnTextActive]}>{surum}</Text></TouchableOpacity>)}</View>

                {isAdmin && <><Text style={styles.label}>Üretici Adı</Text><TextInput style={styles.input} value={editHarvestForm.producer} onChangeText={(producer) => setEditHarvestForm({ ...editHarvestForm, producer })} placeholder="Üretici adı" /></>}
                <Text style={styles.label}>Miktar (KG)</Text>
                <TextInput style={styles.input} value={editHarvestForm.kg} onChangeText={(kg) => setEditHarvestForm({ ...editHarvestForm, kg })} placeholder="Örn: 1000" keyboardType="decimal-pad" />
                <Text style={styles.label}>Firma / Alıcı</Text>
                <TextInput style={styles.input} value={editHarvestForm.firma} onChangeText={(firma) => setEditHarvestForm({ ...editHarvestForm, firma })} placeholder="ÇAYKUR veya özel fabrika" />
                <Text style={styles.label}>Brüt Birim Fiyat (TL)</Text>
                <TextInput style={styles.input} value={editHarvestForm.fiyat} onChangeText={(fiyat) => setEditHarvestForm({ ...editHarvestForm, fiyat })} placeholder="Örn: 35,00" keyboardType="decimal-pad" />
                <Text style={styles.formHelp}>%2 kesinti: {formatTL(calculateAgriculturalDeductions(editHarvestForm.kg, editHarvestForm.fiyat).gelirVergisiKesintisi)} · Net alacak: {formatTL(calculateAgriculturalDeductions(editHarvestForm.kg, editHarvestForm.fiyat).netTutar)}</Text>
                <Text style={styles.label}>Toplam Tahsilat</Text>
                <Text style={styles.formHelp}>Bu hasatta kayıtlı tahsilat: {formatTL(Number(editingHarvest?.tahsilat) || 0)}. Yeni ödeme eklemek için Ödeme Al ekranını kullanın.</Text>
                <Text style={styles.label}>Bahçe</Text>
                <TextInput style={styles.input} value={editHarvestForm.garden} onChangeText={(garden) => setEditHarvestForm({ ...editHarvestForm, garden })} placeholder="Örn: Arka Bahçe" />
                <View style={styles.switchRow}><Text style={styles.switchLabel}>Vadeli satış mı?</Text><Switch value={editHarvestForm.isVadeli} onValueChange={(isVadeli) => setEditHarvestForm({ ...editHarvestForm, isVadeli })} trackColor={{ false: '#767577', true: '#2a9d8f' }} /></View>
                {editHarvestForm.isVadeli && <><Text style={styles.label}>Vade Tarihi (GG.AA.YYYY)</Text><TextInput style={styles.input} value={editHarvestForm.vadeTarihi} onChangeText={(vadeTarihi) => setEditHarvestForm({ ...editHarvestForm, vadeTarihi })} placeholder="15.09.2026" /></>}
                <Text style={styles.label}>Açıklama</Text>
                <TextInput style={styles.input} value={editHarvestForm.aciklama} onChangeText={(aciklama) => setEditHarvestForm({ ...editHarvestForm, aciklama })} placeholder="Notlar..." />
                <View style={styles.modalBtnGroup}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setHarvestEditModalVisible(false)}><Text style={styles.modalBtnText}>İptal</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={handleUpdateHarvest}><Text style={styles.modalBtnText}>Kaydet</Text></TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
