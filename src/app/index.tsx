import React, { useState, useEffect, useRef } from 'react';
import { Image, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, StatusBar, Switch, Platform, Linking, useWindowDimensions, Keyboard, KeyboardAvoidingView } from 'react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { AppIcon } from '../components/app-icon';
import DatePickerField from '../components/date-picker-field';
import { API_TIMEOUTS, API_URL, fetchWithTimeout } from '../services/api';
import { clearDueNotifications, setupNotifications } from '../services/dueNotifications';
import { saveSession, getSession, clearSession } from '../services/session';
import { clearOfflineData } from '../services/offlineQueue';
import { UserSession, HarvestRecord, PaymentRecord, ExpenseRecord, GardenRecord, FactoryPriceRecord, AdRecord } from '../types';
import { formatTL, normalizePhone, formatDisplayDate, toServerDate, parseMoney, todayDisplayDate, calculateAgriculturalDeductions, netTotalOf, remainingTotalOf } from '../utils/format';
import { styles } from '../styles/styles';
import { useHarvestMetrics } from '../hooks/useHarvestMetrics';
import { useAiAssistant } from '../hooks/useAiAssistant';
import { useAppData } from '../hooks/useAppData';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useStorePurchases } from '../hooks/useStorePurchases';
import { ActiveTab, getDesktopMenuItems, mobileNavItems } from '../navigation';
import DashboardScreen from '../screens/DashboardScreen';
import HarvestScreen from '../screens/HarvestScreen';
import HarvestHistoryScreen from '../screens/HarvestHistoryScreen';
import CollectionsScreen from '../screens/CollectionsScreen';
import ReceivablesScreen from '../screens/ReceivablesScreen';
import ExpenseScreen from '../screens/ExpenseScreen';
import FactoryPricesScreen from '../screens/FactoryPricesScreen';
import GardensScreen from '../screens/GardensScreen';
import AdminScreen from '../screens/AdminScreen';
import ReportsScreen from '../screens/ReportsScreen';
import MoreScreen from '../screens/MoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AssistantScreen from '../screens/AssistantScreen';
import CreditStoreScreen from '../screens/CreditStoreScreen';

const ONBOARDING_STORAGE_PREFIX = '@caylik_onboarding_v1';
const ONBOARDING_STEPS = [
  { title: 'Hasadını kaydet', message: 'Hasat Ekle’ye dokunun; kilo, firma ve satış fiyatını yazın.' },
  { title: 'Alacağını takip et', message: 'Alacaklar ekranından bekleyen ödemeleri ve vade tarihlerini görün.' },
  { title: 'Ödeme geldiğinde kaydedin', message: 'Ödeme Al ekranından tahsilatı girin. Tutarlarınız otomatik güncellenir.' },
];

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function App() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 960;
  const paperTheme = useTheme();
  const refreshPromiseRef = useRef<Promise<UserSession | null> | null>(null);
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
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);

  // Navigasyon ve Yüklenme State'leri
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // Veri listeleri useAppData hook'unda tutulur; bu dosya yalnızca ekran akışını yönetir.
  const [selectedFactory, setSelectedFactory] = useState<string | null>(null);
  const [factoryFilter, setFactoryFilter] = useState<'Tümü' | 'Haftalık' | 'Aylık' | 'Peşin' | 'Vadeli'>('Tümü');
  const [priceForm, setPriceForm] = useState({ firma: 'ÇAYKUR', fiyat: '', tarih: todayDisplayDate(), fiyatTuru: 'Peşin', vadeGun: '', gecerlilikBaslangic: '', politika: '', kaynak: '', aciklama: '' });
  const [adForm, setAdForm] = useState({
    slot: 'dashboard_top', firma: '', kategori: 'Sponsorlu', baslik: '', aciklama: '', telefon: '', link: '', gorselUrl: '', baslangic: '', bitis: ''
  });

  // Form State'leri
  const todayTR = todayDisplayDate();
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
    vadeTarihi: '',
    receiptFingerprint: ''
  });
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState('');
  const [receiptDraft, setReceiptDraft] = useState<{ date?: string; company?: string; netWeightKg?: number | null; paymentTerm?: string; receiptFingerprint?: string } | null>(null);

  const [eForm, setEForm] = useState({
    date: todayTR,
    kategori: 'İşçilik',
    aciklama: '',
    tutar: '',
    garden: ''
  });

  const [gForm, setGForm] = useState({ name: '', adaParsel: '', alan: '' });

  // Hasat kaydı düzenleme modalı
  const [editingHarvest, setEditingHarvest] = useState<HarvestRecord | null>(null);
  const [harvestEditModalVisible, setHarvestEditModalVisible] = useState(false);
  const [editHarvestForm, setEditHarvestForm] = useState({
    date: '', surum: '1. Sürüm', producer: '', kg: '', firma: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '', isVadeli: false, vadeTarihi: ''
  });
  // Tahsilat kaydı düzenleme formu. Tahsilat ayrı kayıt olduğu için yapılan
  // değişiklik, bağlı hasadın kalan alacağını sunucuda otomatik günceller.
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);
  const [paymentEditModalVisible, setPaymentEditModalVisible] = useState(false);
  const [editPaymentForm, setEditPaymentForm] = useState({ date: '', amount: '', description: '' });

  // Özel Tahsilat Ekleme Formu State'leri (Belirli Hasada Ödeme Yapma)
  const [payHarvestId, setPayHarvestId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDesc, setPayDesc] = useState('');
  const [payDate, setPayDate] = useState(todayTR);

  const isAdmin = currentUser?.role === 'admin';
  const desktopMenuItems = getDesktopMenuItems(Boolean(isAdmin));
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

  const authFetch = async (url: string, options: RequestInit = {}, timeout = API_TIMEOUTS.default) => {
    const makeOptions = (user: UserSession) => ({ ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${user.token}` } });
    if (!currentUser?.token) throw new Error('Oturum bulunamadı.');
    let res = await fetchWithTimeout(url, makeOptions(currentUser), timeout);
    if (res.status !== 401) return res;
    // Birden fazla veri isteği aynı anda 401 alırsa refresh token yalnızca bir
    // kez kullanılmalıdır. Diğer istekler aynı yenileme sonucunu bekler.
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = refreshAccessToken().finally(() => {
        refreshPromiseRef.current = null;
      });
    }
    const nextUser = await refreshPromiseRef.current;
    if (!nextUser) return res;
    return fetchWithTimeout(url, makeOptions(nextUser), timeout);
  };

  const {
    harvests, setHarvests,
    payments, setPayments,
    expenses, setExpenses,
    gardens, setGardens,
    factoryPrices, setFactoryPrices,
    ads, setAds,
    lastSyncAt,
    fetchData,
  } = useAppData({ currentUser, authFetch, getAuthHeaders, setLoading, onFeedback: showOperationFeedback });
  const {
    pendingCount: pendingSyncCount,
    failedCount: failedSyncCount,
    refreshCounts: refreshPendingSyncCount,
    queueRequest: queueOfflineRequest,
    syncQueue: syncOfflineQueue,
    manageFailedRequests: manageFailedOfflineRequests,
  } = useOfflineSync({ currentUser, authFetch, getAuthHeaders });

  const aiAssistant = useAiAssistant(currentUser?.userId, authFetch);
  const storePurchases = useStorePurchases(currentUser?.userId, authFetch, aiAssistant.refreshWallet);

  useEffect(() => {
    if (activeTab === 'assistant' && currentUser?.userId) void aiAssistant.refreshWallet();
  }, [activeTab, currentUser?.userId]);

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

  useEffect(() => {
    if (currentUser) {
      setupNotifications();
      refreshPendingSyncCount();
      syncOfflineQueue().then((result) => {
        if (result.synced > 0) fetchData();
      });
      fetchData();
    } else {
    }
  }, [currentUser]);

  useEffect(() => {
    let active = true;
    const userId = currentUser?.userId;
    if (!userId) {
      // Onboarding progress belongs to the active account and resets on logout.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnboardingStep(null);
      return () => { active = false; };
    }

    AsyncStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}:${userId}`)
      .then((value) => {
        if (active && value !== 'done') setOnboardingStep(0);
      })
      .catch(() => {
        if (active) setOnboardingStep(0);
      });

    return () => { active = false; };
  }, [currentUser?.userId]);

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

  // Giriş Yap / Kayıt Ol İşlemleri
  const syncProfile = async (phone: string, pin: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    try {
      const res = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: normalized, pin })
      }, API_TIMEOUTS.authentication);
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
    }, API_TIMEOUTS.authentication);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: any = new Error(data?.error || 'Üretici profili kaydedilemedi.');
      error.code = data?.code;
      throw error;
    }
    return data;
  };

  const handleAuth = async () => {
    // iPhone'da sayı klavyesinde "Bitti" tuşu yoktur. Butona basıldığında
    // klavyeyi kapatıp işlemi görünür ve tek dokunuşla başlatırız.
    Keyboard.dismiss();
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
    if (currentUser?.userId) await clearDueNotifications(currentUser.userId);
    await clearSession();
    setCurrentUser(null);
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await authFetch(`${API_URL}/users/me`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Hesap silinemedi.');
      if (currentUser?.userId) await Promise.all([clearOfflineData(currentUser.userId), clearDueNotifications(currentUser.userId)]);
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

  const handleExportData = async () => {
    if (!currentUser) throw new Error('Oturum bulunamadı.');
    const fileName = `caylik-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    const uri = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify({
      application: 'Çaylık',
      exportedAt: new Date().toISOString(),
      harvests,
      payments,
      expenses,
      gardens,
      factoryPrices
    }, null, 2));
    if (!await Sharing.isAvailableAsync()) throw new Error('Bu cihazda paylaşım kullanılamıyor.');
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Çaylık yedeği' });
  };

  const handleSendFeedback = async (subject: string, message: string) => {
    const response = await authFetch(`${API_URL}/feedback`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ subject, message })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Mesaj gönderilemedi.');
  };

  const finishOnboarding = async () => {
    const userId = currentUser?.userId;
    setOnboardingStep(null);
    if (!userId) return;
    try {
      await AsyncStorage.setItem(`${ONBOARDING_STORAGE_PREFIX}:${userId}`, 'done');
    } catch {
      // Rehber tekrar görünse bile uygulamanın kullanılmasını engelleme.
    }
  };

  // Genel Hesaplamalar
  const {
    totalKg,
    totalSales,
    totalPay,
    totalExp,
    pendingCollection,
    netProfit,
    totalReceivables,
    calculatedGardenSummaries,
    getReceivablesByMonth,
  } = useHarvestMetrics(harvests, expenses);

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

  const handlePickReceipt = async (source: 'camera' | 'library') => {
    try {
      setReceiptDraft(null);
      setHForm((current) => ({ ...current, receiptFingerprint: '' }));
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const permissionName = source === 'camera' ? 'kamera' : 'fotoğraf erişim';
        const message = source === 'camera'
          ? 'Fiş fotoğrafı çekmek için kamera izni gerekir.'
          : 'Fiş seçmek için fotoğraf erişim izni gerekir.';

        if (permission.canAskAgain === false) {
          Alert.alert(
            'İzin Ayarlar’dan Açılmalı',
            `${message} Android ayarlarından Çaylık uygulamasının ${permissionName} iznini açın.`,
            [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Ayarları Aç', onPress: () => { void Linking.openSettings(); } }
            ]
          );
        } else {
          showOperationFeedback('İzin Gerekli', message, 'error');
        }
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.7, base64: false, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.7, base64: false, exif: false });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error('Fotoğraf hazırlanamadı. Lütfen tekrar deneyin.');

      // Galerideki HEIC/PNG gibi biçimleri ve çok büyük fotoğrafları, sunucunun
      // güvenle okuyabileceği küçük bir JPEG'e dönüştürür. Böylece hem Android
      // hem iOS'ta aynı veri biçimi gönderilir.
      const preparedImage = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!preparedImage.base64) throw new Error('Fotoğraf hazırlanamadı. Lütfen tekrar deneyin.');

      setReceiptBusy(true);
      setReceiptNotice('Fiş okunuyor...');
      const response = await authFetch(`${API_URL}/receipts/parse`, {
        method: 'POST',
        body: JSON.stringify({ imageBase64: preparedImage.base64, mimeType: 'image/jpeg' })
      }, API_TIMEOUTS.receipt);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Fiş okunamadı.');

      const hasKg = Number(data?.netWeightKg) > 0;
      const fields = [data?.date ? 'tarih' : '', data?.company ? 'firma' : '', hasKg ? 'net ağırlık' : ''].filter(Boolean);
      setReceiptDraft({
        date: data?.date ? String(data.date) : undefined,
        company: data?.company ? String(data.company) : undefined,
        netWeightKg: hasKg ? Number(data.netWeightKg) : null,
        paymentTerm: data?.paymentTerm ? String(data.paymentTerm) : undefined,
        receiptFingerprint: data?.receiptFingerprint ? String(data.receiptFingerprint) : undefined
      });
      setReceiptNotice(fields.length
        ? `Fişten ${fields.join(', ')} okundu. Bilgileri kontrol edip onaylayın.`
        : 'Fişte net okunabilen bilgi bulunamadı. Alanları elle doldurun.');
    } catch (error: any) {
      const message = error?.message || 'Fiş okunamadı. Lütfen alanları elle doldurun.';
      setReceiptNotice(message);
      showOperationFeedback('Fiş Okunamadı', message, 'error');
    } finally {
      setReceiptBusy(false);
    }
  };

  const handleConfirmReceipt = () => {
    if (!receiptDraft) return;
    setHForm((current) => ({
      ...current,
      date: receiptDraft.date ? formatDisplayDate(receiptDraft.date) : current.date,
      firma: receiptDraft.company || current.firma,
      kg: receiptDraft.netWeightKg && receiptDraft.netWeightKg > 0
        ? String(receiptDraft.netWeightKg).replace('.', ',')
        : current.kg,
      receiptFingerprint: receiptDraft.receiptFingerprint || ''
    }));
    setReceiptDraft(null);
    setReceiptNotice('Fiş bilgileri forma aktarıldı. Kaydetmeden önce kontrol edebilirsiniz.');
  };

  const handleDismissReceipt = () => {
    setReceiptDraft(null);
    setReceiptNotice('Fiş bilgileri aktarılmadı. Alanları elle doldurabilirsiniz.');
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
        vadeTarihi,
        receiptFingerprint: hForm.receiptFingerprint || undefined
      };

      const result = await postOrQueue('/harvests', payload);
      if (result.queued) {
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Hasat kaydı telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setReceiptNotice('');
        setHForm({ date: todayDisplayDate(), surum: '1. Sürüm', producer: '', kg: '', firma: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '', isVadeli: false, vadeTarihi: '', receiptFingerprint: '' });
        setActiveTab('dashboard');
        return;
      }
      const res = result.response;

      if (res.ok) {
        showOperationFeedback('Başarılı', 'Hasat kaydı eklendi.', 'success');
        setReceiptNotice('');
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
          vadeTarihi: '',
          receiptFingerprint: ''
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
    const tarih = toServerDate(payDate);
    if (!Number.isFinite(amount) || amount <= 0) {
      showOperationFeedback('Eksik Bilgi', 'Geçerli ve 0’dan büyük bir tahsilat tutarı girin.', 'error');
      return;
    }
    if (!tarih) {
      showOperationFeedback('Tarih Hatası', 'Tahsilat tarihini GG.AA.YYYY biçiminde girin.', 'error');
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
        tarih
      });
      if (result.queued) {
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Tahsilat telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setPayHarvestId(''); setPayAmount(''); setPayDesc(''); setPayDate(todayDisplayDate());
        return;
      }
      const res = result.response;

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showOperationFeedback('Başarılı', 'Tahsilat başarıyla kaydedildi ve satıştan düşüldü.', 'success');
        setPayHarvestId('');
        setPayAmount('');
        setPayDesc('');
        setPayDate(todayDisplayDate());
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
    setPayDate(todayDisplayDate());
    setActiveTab('collections');
  };

  const openPaymentEditModal = (payment: PaymentRecord) => {
    const rawDate = String(payment.tarih || payment.createdAt || '').slice(0, 10);
    setEditingPayment(payment);
    setEditPaymentForm({
      date: formatDisplayDate(rawDate),
      amount: String(payment.tutar ?? ''),
      description: String(payment.aciklama || '')
    });
    setPaymentEditModalVisible(true);
  };

  const handleUpdatePayment = async () => {
    if (!editingPayment?._id) return;
    const tutar = parseMoney(editPaymentForm.amount);
    const tarih = toServerDate(editPaymentForm.date);
    if (!Number.isFinite(tutar) || tutar <= 0) {
      showOperationFeedback('Tahsilat Hatası', '0’dan büyük geçerli bir tahsilat tutarı girin.', 'error');
      return;
    }
    if (!tarih) {
      showOperationFeedback('Tarih Hatası', 'Tahsilat tarihini GG.AA.YYYY biçiminde girin.', 'error');
      return;
    }
    setLoading(true);
    try {
      const response = await authFetch(`${API_URL}/payments/${editingPayment._id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ tarih, tutar, aciklama: editPaymentForm.description.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Tahsilat güncellenemedi.');
      setPaymentEditModalVisible(false);
      setEditingPayment(null);
      showOperationFeedback('Başarılı', 'Tahsilat güncellendi; kalan alacak otomatik hesaplandı.', 'success');
      await fetchData();
    } catch (error: any) {
      showOperationFeedback('Tahsilat Düzenleme', error?.message || 'Tahsilat güncellenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const prepareLegacyPaymentForEdit = async (harvest: HarvestRecord) => {
    if (!harvest?._id) return;
    setLoading(true);
    try {
      const response = await authFetch(`${API_URL}/payments/legacy`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Idempotency-Key': `legacy-payment-${harvest._id}-${Date.now()}` },
        body: JSON.stringify({ harvestId: harvest._id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Önceki tahsilat kaydı hazırlanamadı.');
      const payment = data?.payment as PaymentRecord | undefined;
      await fetchData();
      if (payment) openPaymentEditModal(payment);
    } catch (error: any) {
      showOperationFeedback('Tahsilat Geçmişi', error?.message || 'Önceki tahsilat düzenlemeye açılamadı.', 'error');
    } finally {
      setLoading(false);
    }
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
        tutar,
        bahce: eForm.garden ? eForm.garden.trim() : ''
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
        <SafeAreaView style={[styles.container, styles.authScreen]}>
          <StatusBar barStyle="light-content" backgroundColor="#1b4332" />
          <KeyboardAvoidingView
            style={styles.authKeyboardAvoider}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
          >
          <ScrollView
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.authCard}>
            <View style={styles.authBrand}>
              <View style={styles.authBrandMark}>
                <Image source={require('../../assets/caylik-icon-v1.png')} style={styles.authBrandImage} accessibilityLabel="Çaylık logosu" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.authTitle}>Çaylık</Text>
                <Text style={styles.authEyebrow}>ÜRETİCİ TAKİP SİSTEMİ</Text>
              </View>
            </View>
            <Text style={styles.authSubTitle}>
              {authMode === 'login' ? 'Telefon numaranız ve 6 haneli şifrenizle güvenle giriş yapın.' : 'Bilgilerinizi girin, hesabınız hemen hazır olsun.'}
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
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={authMode === 'login' ? 'Giriş yap' : 'Kaydı tamamla'} disabled={loading} style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleAuth}>
              <Text style={styles.submitBtnText}>{loading ? 'Lütfen bekleyin…' : authMode === 'login' ? 'Giriş yap' : 'Kaydı tamamla'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 15 }}
              onPress={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthPin(''); setAuthPinConfirm(''); setAuthFeedback(null); }}
            >
              <Text style={styles.authModeLink}>
                {authMode === 'login'
                  ? 'Hesabınız yok mu? Telefonla kayıt olun'
                  : 'Zaten hesabınız var mı? Giriş yapın'}
              </Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }


  // ANA UYGULAMA EKRANI
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1b4332" />
        <View style={[isDesktop ? styles.desktopShell : styles.mobileShell, { backgroundColor: paperTheme.colors.background }]}>
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
                        <View style={[styles.desktopNavIcon, active && styles.desktopNavIconActive]}>
                          <AppIcon name={item.icon} size={20} color={active ? '#FFFFFF' : '#B9D5C0'} />
                        </View>
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
                {pendingSyncCount > 0 && (
                  <View style={styles.statusLine}>
                    <AppIcon name="cloud-upload-outline" size={15} color="#C8E4CF" />
                    <Text style={styles.desktopFooterSync}>{pendingSyncCount} kayıt gönderilecek</Text>
                  </View>
                )}
                {failedSyncCount > 0 && (
                  <TouchableOpacity onPress={manageFailedOfflineRequests} style={styles.statusLine}>
                    <AppIcon name="alert-circle-outline" size={15} color="#FFD39C" />
                    <Text style={styles.desktopFooterWarning}>{failedSyncCount} kayıt için işlem gerekli</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <View style={[styles.appMain, { backgroundColor: paperTheme.colors.background }]}>

        {/* HEADER */}
        <View style={[styles.header, !isDesktop && { backgroundColor: paperTheme.colors.background, borderBottomColor: paperTheme.colors.outlineVariant }, isDesktop && styles.desktopHeader]}>
          {!isDesktop && <><View pointerEvents="none" style={styles.headerDecorLarge} /><View pointerEvents="none" style={styles.headerDecorSmall} /></>}
          <View style={styles.headerBrandRow}>
            {!isDesktop && <View style={styles.headerBrandMark}><Image source={require('../../assets/caylik-icon-v1.png')} style={styles.headerBrandImage} /></View>}
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerEyebrow, !isDesktop && { color: paperTheme.colors.primary }, isDesktop && styles.desktopHeaderSubtitle]}>{isDesktop ? 'ÇAYLIK YÖNETİM' : 'ÇAYLIK · ÜRETİCİ TAKİBİ'}</Text>
              <Text style={[styles.headerTitle, !isDesktop && { color: paperTheme.colors.onBackground }, isDesktop && styles.desktopHeaderTitle]}>{isDesktop ? activeDesktopMenu?.label || 'Çaylık' : `Merhaba, ${currentUser.name.split(' ')[0] || currentUser.name}`}</Text>
              <Text style={[styles.headerSubtitle, !isDesktop && { color: paperTheme.colors.onSurfaceVariant }, isDesktop && styles.desktopHeaderSubtitle]}>
                {isDesktop ? `${activeDesktopMenu?.helper || 'Çay üretimi takibi'} · ${currentUser.name}` : isAdmin ? 'Yönetici hesabı' : 'Sezon verilerin güncel'}
              </Text>
            {pendingSyncCount > 0 && (
              <View style={styles.statusLine}>
                <AppIcon name="cloud-upload-outline" size={15} color="#46735A" />
                <Text style={[styles.headerSubtitle, isDesktop && styles.desktopHeaderSubtitle]}>{pendingSyncCount} kayıt senkronizasyon bekliyor</Text>
              </View>
            )}
            {failedSyncCount > 0 && (
              <TouchableOpacity onPress={manageFailedOfflineRequests} style={styles.statusLine}>
                <AppIcon name="alert-circle-outline" size={16} color="#A64B19" />
                <Text style={styles.headerWarning}>{failedSyncCount} kayıt için işlem gerekli</Text>
              </TouchableOpacity>
            )}
          </View>
          </View>
          <TouchableOpacity style={[styles.logoutBtn, !isDesktop && { backgroundColor: paperTheme.colors.surfaceVariant, borderColor: paperTheme.colors.outlineVariant }, isDesktop && styles.desktopLogoutBtn]} onPress={handleLogout}>
            <AppIcon name="logout-variant" size={20} color={isDesktop ? '#FFFFFF' : paperTheme.colors.onSurface} />
            <Text style={[styles.logoutBtnText, !isDesktop && { color: paperTheme.colors.onSurface }]}>Çıkış</Text>
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

        {/* İÇERİK ALANI */}
        {(['history', 'expense', 'gardens'] as const).includes(activeTab as any) ? (
          <View style={[styles.content, isDesktop && styles.desktopScroll, { padding: 0, backgroundColor: paperTheme.colors.background }]}>
            {activeTab === 'history' && (
            <HarvestHistoryScreen
              harvests={harvests}
              openHarvestEditModal={openHarvestEditModal}
              openPaymentForHarvest={openPaymentForHarvest}
              handleDelete={handleDelete}
              refreshing={loading}
              onRefresh={fetchData}
              contentContainerStyle={isDesktop ? styles.desktopContent : { padding: 18, paddingBottom: 32 }}
            />
            )}
            {activeTab === 'expense' && (
              <ExpenseScreen
                eForm={eForm}
                expenses={expenses}
                gardens={gardens}
                handleDelete={handleDelete}
                handleSaveExpense={handleSaveExpense}
                setEForm={setEForm}
                refreshing={loading}
                onRefresh={fetchData}
                contentContainerStyle={isDesktop ? styles.desktopContent : { padding: 18, paddingBottom: 32 }}
              />
            )}
            {activeTab === 'gardens' && (
              <GardensScreen
                gForm={gForm}
                gardens={gardens}
                calculatedGardenSummaries={calculatedGardenSummaries}
                handleDelete={handleDelete}
                handleSaveGarden={handleSaveGarden}
                setGForm={setGForm}
                refreshing={loading}
                onRefresh={fetchData}
                contentContainerStyle={isDesktop ? styles.desktopContent : { padding: 18, paddingBottom: 32 }}
              />
            )}
          </View>
        ) : (
        <ScrollView
          style={[styles.content, isDesktop && styles.desktopScroll, { backgroundColor: paperTheme.colors.background }]}
          contentContainerStyle={isDesktop ? styles.desktopContent : styles.mobileContent}
          showsVerticalScrollIndicator={isDesktop}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} colors={['#1b4332']} />}
        >
          {activeTab === 'dashboard' && (
            <DashboardScreen
              ads={ads}
              harvests={harvests}
              userName={currentUser.name}
              assistantCredits={aiAssistant.credits}
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

          {activeTab === 'assistant' && (
            <AssistantScreen
              messages={aiAssistant.messages}
              credits={aiAssistant.credits}
              transactions={aiAssistant.transactions}
              busy={aiAssistant.busy}
              transcribing={aiAssistant.transcribing}
              error={aiAssistant.error}
              onAsk={aiAssistant.ask}
              onTranscribe={aiAssistant.transcribeVoice}
              onClear={aiAssistant.clearConversation}
              onOpenStore={() => setActiveTab('creditStore')}
            />
          )}
          {activeTab === 'creditStore' && (
            <CreditStoreScreen
              credits={aiAssistant.credits}
              onBack={() => setActiveTab('assistant')}
              onPurchase={(productId) => void storePurchases.purchase(productId)}
              onRestore={() => void storePurchases.restore()}
              prices={storePurchases.prices}
              purchasingProductId={storePurchases.purchasingProductId}
              restoring={storePurchases.restoring}
              storeStatus={storePurchases.status}
            />
          )}
          {/* HASAT EKLE TABI */}
          {activeTab === 'harvest' && (
            <HarvestScreen
              currentUser={currentUser}
              hForm={hForm}
              handleSaveHarvest={handleSaveHarvest}
              setHForm={setHForm}
              onPickReceipt={handlePickReceipt}
              receiptBusy={receiptBusy}
              receiptNotice={receiptNotice}
              receiptDraft={receiptDraft}
              onConfirmReceipt={handleConfirmReceipt}
              onDismissReceipt={handleDismissReceipt}
            />
          )}

          {/* TAHSİLAT TABI */}
          {activeTab === 'collections' && (
            <CollectionsScreen
              handleSpecificHarvestPayment={handleSpecificHarvestPayment}
              harvests={harvests}
              payments={payments}
              handleDelete={handleDelete}
              openPaymentEditModal={openPaymentEditModal}
              prepareLegacyPaymentForEdit={prepareLegacyPaymentForEdit}
              payAmount={payAmount}
              payDate={payDate}
              payDesc={payDesc}
              payHarvestId={payHarvestId}
              setPayAmount={setPayAmount}
              setPayDate={setPayDate}
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

          {activeTab === 'reports' && (
            <ReportsScreen
              harvests={harvests}
              expenses={expenses}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsScreen
              currentUser={currentUser}
              onChangePin={handleChangePin}
              onDeleteAccount={handleDeleteAccount}
              lastSyncAt={lastSyncAt}
              onExportData={handleExportData}
              onSendFeedback={handleSendFeedback}
            />
          )}

          {/* ADMIN PANELİ TABI */}
          {activeTab === 'admin' && isAdmin && (
            <AdminScreen
              adForm={adForm}
              ads={ads}
              handleDelete={handleDelete}
              handleSaveAd={handleSaveAd}
              setAdForm={setAdForm}
              currentUser={currentUser}
            />
          )}
        </ScrollView>
        )}
        {!isDesktop && activeTab !== 'assistant' && activeTab !== 'dashboard' && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Çaylık Asistanı aç"
            activeOpacity={0.86}
            onPress={() => setActiveTab('assistant')}
            style={[styles.assistantFab, { backgroundColor: paperTheme.colors.primary }]}
          >
            <AppIcon name="robot-happy-outline" size={22} color={paperTheme.colors.onPrimary} />
            <Text style={[styles.assistantFabText, { color: paperTheme.colors.onPrimary }]}>Asistan{aiAssistant.credits !== null ? ` · ${aiAssistant.credits}` : ''}</Text>
          </TouchableOpacity>
        )}
        {!isDesktop && (
          <View style={[styles.mobileBottomNav, { backgroundColor: paperTheme.colors.surface, borderTopColor: paperTheme.colors.outline }]}>
            {mobileNavItems.map((item) => {
              const active = activeTab === item.tab;
              const centerAction = item.tab === 'harvest';
              return (
                <TouchableOpacity
                  key={item.tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                  style={[styles.mobileBottomNavItem, centerAction && styles.mobileBottomNavCenterItem]}
                  onPress={() => setActiveTab(item.tab)}
                >
                  <View style={[
                    styles.mobileBottomNavIcon,
                    centerAction && styles.mobileBottomNavCenterButton,
                    active && !centerAction && styles.mobileBottomNavIconActive,
                    active && !centerAction && { backgroundColor: paperTheme.colors.primaryContainer },
                    centerAction && { backgroundColor: paperTheme.colors.primary, borderColor: paperTheme.colors.surface },
                  ]}>
                    <AppIcon name={item.icon} size={centerAction ? 27 : 23} color={centerAction ? paperTheme.colors.onPrimary : active ? paperTheme.colors.primary : paperTheme.colors.onSurfaceVariant} />
                  </View>
                  <Text numberOfLines={1} style={[styles.mobileBottomNavText, centerAction && styles.mobileBottomNavCenterText, active && styles.mobileBottomNavTextActive, { color: active ? paperTheme.colors.primary : paperTheme.colors.onSurfaceVariant }]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
          </View>
        </View>

        <Modal
          visible={onboardingStep !== null}
          transparent
          animationType="fade"
          onRequestClose={finishOnboarding}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, styles.deleteConfirmModal]}>
              <Text style={styles.modalTitle}>Çaylık kullanımı</Text>
              <Text style={styles.formHelp}>Adım {(onboardingStep ?? 0) + 1} / {ONBOARDING_STEPS.length}</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#174D36', marginTop: 8 }}>
                {ONBOARDING_STEPS[onboardingStep ?? 0]?.title}
              </Text>
              <Text style={[styles.formHelp, { fontSize: 16, lineHeight: 24, marginTop: 12 }]}>
                {ONBOARDING_STEPS[onboardingStep ?? 0]?.message}
              </Text>
              <View style={styles.modalBtnGroup}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={finishOnboarding}>
                  <Text style={styles.modalBtnText}>Daha Sonra</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteConfirmButton}
                  onPress={() => {
                    if ((onboardingStep ?? 0) >= ONBOARDING_STEPS.length - 1) {
                      finishOnboarding();
                    } else {
                      setOnboardingStep((step) => (step ?? 0) + 1);
                    }
                  }}
                >
                  <Text style={styles.modalBtnText}>
                    {(onboardingStep ?? 0) >= ONBOARDING_STEPS.length - 1 ? 'Başla' : 'Devam'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
                <Text style={styles.modalTitle}>Hasat Kaydını Düzenle</Text>
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
                {editHarvestForm.isVadeli && <DatePickerField label="Vade Tarihi" value={editHarvestForm.vadeTarihi} onChange={(vadeTarihi) => setEditHarvestForm({ ...editHarvestForm, vadeTarihi })} />}
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

        {/* TAHSİLAT DÜZENLEME MODALI */}
        <Modal
          visible={paymentEditModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => { setPaymentEditModalVisible(false); setEditingPayment(null); }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Tahsilatı Düzenle</Text>
              <Text style={styles.formHelp}>Tutar değiştiğinde bağlı hasadın kalan alacağı otomatik güncellenir.</Text>
              <Text style={styles.label}>Tahsilat Tarihi (GG.AA.YYYY)</Text>
              <TextInput style={styles.input} value={editPaymentForm.date} onChangeText={(date) => setEditPaymentForm({ ...editPaymentForm, date })} placeholder="12.08.2026" />
              <Text style={styles.label}>Alınan Tutar (TL)</Text>
              <TextInput style={styles.input} value={editPaymentForm.amount} onChangeText={(amount) => setEditPaymentForm({ ...editPaymentForm, amount })} placeholder="Örn: 5000" keyboardType="decimal-pad" />
              <Text style={styles.label}>Not</Text>
              <TextInput style={styles.input} value={editPaymentForm.description} onChangeText={(description) => setEditPaymentForm({ ...editPaymentForm, description })} placeholder="Örn: Banka havalesi" />
              <View style={styles.modalBtnGroup}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setPaymentEditModalVisible(false); setEditingPayment(null); }}><Text style={styles.modalBtnText}>İptal</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleUpdatePayment}><Text style={styles.modalBtnText}>Kaydet</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
