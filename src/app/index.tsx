import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, StatusBar, Switch, Platform, Linking, useWindowDimensions, Keyboard, AppState } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { AppIcon } from '../components/app-icon';
import { TeaWordmark } from '../components/tea-brand';
import { MobileBrandHeader } from '../components/mobile-brand-header';
import DatePickerField from '../components/date-picker-field';
import { API_TIMEOUTS, API_URL, fetchWithTimeout } from '../services/api';
import { clearDueNotifications, setupNotifications, syncDueNotifications } from '../services/dueNotifications';
import { playFeedbackSound, stopFeedbackSound } from '../services/feedbackSounds';
import { cancelDailyReminder, syncDailyReminder, refreshDailyReminderPolicy } from '../services/dailyReminder';
import { setNotificationOwner } from '../services/notificationQueue';
import { saveSession, getSession, clearSession } from '../services/session';
import { createSessionLifecycle, type SessionScope } from '../services/sessionLifecycle';
import { clearOfflineData, discardOfflineRequest } from '../services/offlineQueue';
import { UserSession, HarvestRecord, PaymentRecord } from '../types';
import { formatTL, normalizePhone, formatDisplayDate, toServerDate, parseMoney, todayDisplayDate, calculateAgriculturalDeductions, remainingTotalOf } from '../utils/format';
import { styles } from '../styles/styles';
import { useHarvestMetrics } from '../hooks/useHarvestMetrics';
import { useAiAssistant } from '../hooks/useAiAssistant';
import { useAppData } from '../hooks/useAppData';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useStorePurchases } from '../hooks/useStorePurchases';
import { useHarvestAdNavigation } from '../hooks/useHarvestAdNavigation';
import {
  dismissAdTrackingPrompt,
  getAdTrackingState,
  hasSeenAdTrackingPrompt,
  requestAdTrackingConsent,
  trackTikTokRegistration,
} from '../services/adTracking';
import { ActiveTab, getDesktopMenuItems, mobileNavItems } from '../navigation';
import DashboardScreen from '../screens/DashboardScreen';
import HarvestScreen from '../screens/HarvestScreen';
import QuotaScreen from '../screens/QuotaScreen';
import QuotaPlanPicker from '../components/QuotaPlanPicker';
import HarvestReward from '../components/HarvestReward';
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
import AdvertiseScreen from '../screens/AdvertiseScreen';
import AuthScreen from '../screens/AuthScreen';
import AdTrackingConsentPrompt from '../components/AdTrackingConsentPrompt';
import { shouldRequestTracking } from '../utils/trackingPromptPolicy';
import AdMobBanner from '../components/AdMobBanner';
import AdMobNativeCard from '../components/AdMobNativeCard';
import { AdAccessContext } from '../context/ad-access';
import SharecroppingScreen from '../screens/SharecroppingScreen';
import { shareRequest, type ShareLink } from '../services/sharecropping';
import { collectionEndpoint, paymentEndpoint } from '../services/shareLedger';
import { useSharecroppingPush } from '../hooks/useSharecroppingPush';
import { useShareEvents } from '../hooks/useShareEvents';

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
  const mainScrollRef = useRef<ScrollView>(null);
  const resetSharecroppingScroll = useCallback(() => {
    Keyboard.dismiss();
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 960;
  const paperTheme = useTheme();
  const authCleanupRef = useRef<Promise<void> | null>(null);
  const harvestSavingRef = useRef(false);
  // Kullanıcı Giriş / Kayıt State'leri
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authSession] = useState(() => createSessionLifecycle({ save: saveSession, clear: clearSession, changed: (user) => {
    setNotificationOwner(user?.userId || null);
    setCurrentUser(user);
  } }));
  const [harvestReward, setHarvestReward] = useState<{ id: number; userId: string; kind: 'harvest' | 'payment'; value: string } | null>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') stopFeedbackSound(); });
    return () => { subscription.remove(); stopFeedbackSound(); };
  }, []);
  useEffect(() => () => stopFeedbackSound(), [currentUser?.userId]);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authPinConfirm, setAuthPinConfirm] = useState('');
  const [authFeedback, setAuthFeedback] = useState<{ title: string; message: string; type: 'error' | 'info' } | null>(null);
  const [operationFeedback, setOperationFeedback] = useState<{ title: string; message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ endpoint: string; id: string; title: string; status: 'confirming' | 'deleting' | 'error'; message?: string } | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [adTrackingPromptVisible, setAdTrackingPromptVisible] = useState(false);
  const [adTrackingPromptBusy, setAdTrackingPromptBusy] = useState(false);

  // Navigasyon ve Yüklenme State'leri
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [shareFocus, setShareFocus] = useState({ userId: '', linkId: '' });
  const [bannerHeight, setBannerHeight] = useState(0);
  const [assistantDraft, setAssistantDraft] = useState<{ userId: string; text: string } | null>(null);
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
    quotaPlanId: '',
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
  const [harvestShareSelection, setHarvestShareSelection] = useState({ userId: '', id: '' });
  const harvestShareLinkId = harvestShareSelection.userId === currentUser?.userId ? harvestShareSelection.id : '';
  const setHarvestShareLinkId = (id: string) => setHarvestShareSelection({ userId: currentUser?.userId || '', id });
  const [receiptNotice, setReceiptNotice] = useState('');
  const [receiptDraft, setReceiptDraft] = useState<{ date?: string; company?: string; netWeightKg?: number | null; paymentTerm?: string; receiptFingerprint?: string; confidence?: number; warnings?: string[] } | null>(null);

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
    quotaPlanId: '', date: '', surum: '1. Sürüm', producer: '', kg: '', firma: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '', isVadeli: false, vadeTarihi: ''
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

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';
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

  const refreshAccessToken = useCallback(async (user: UserSession): Promise<UserSession | null> => {
    if (!user.refreshToken) return null;
      const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: user.refreshToken })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token || !data?.refreshToken) return null;
      return { ...user, userId: data.userId || user.userId, name: data.name || user.name, phone: normalizePhone(data.phone || user.phone), role: data.role === 'admin' ? 'admin' : data.role === 'manager' ? 'manager' : 'user', adminPermissions: Array.isArray(data.adminPermissions) ? data.adminPermissions : [], token: data.token, refreshToken: data.refreshToken };
  }, []);

  const authFetchScoped = useCallback(async (url: string, options: RequestInit = {}, timeout = API_TIMEOUTS.default): Promise<{ response: Response; scope: SessionScope }> => {
    const makeOptions = (user: UserSession) => ({ ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${user.token}` } });
    const started = authSession.capture();
    if (!started.user?.token) throw new Error('Oturum bulunamadı.');
    let scope = started;
    let response = await fetchWithTimeout(url, makeOptions(started.user), timeout);
    if (!authSession.isCurrent(started)) throw new Error('Oturum değişti.');
    if (response.status !== 401) return { response, scope };
    // Shared refresh is scoped to this account generation; late T1 failures reuse T2.
    const nextUser = await authSession.refreshOnce(started, refreshAccessToken);
    if (!authSession.isCurrent(started)) throw new Error('Oturum değişti.');
    if (!nextUser) return { response, scope };
    scope = authSession.capture();
    response = await fetchWithTimeout(url, makeOptions(nextUser), timeout);
    if (!authSession.isCurrent(started)) throw new Error('Oturum değişti.');
    return { response, scope };
  }, [authSession, refreshAccessToken]);
  const authFetch = useCallback(async (url: string, options: RequestInit = {}, timeout = API_TIMEOUTS.default) => {
    if (!currentUser || authSession.capture().user !== currentUser) throw new Error('Oturum değişti.');
    return (await authFetchScoped(url, options, timeout)).response;
  }, [authFetchScoped, authSession, currentUser]);

  const {
    harvests,
    payments,
    expenses,
    gardens,
    factoryPrices,
    ads, setAds,
    lastSyncAt,
    dataStale,
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
  const refreshAssistantWallet = aiAssistant.refreshWallet;
  const storePurchases = useStorePurchases(currentUser?.userId, authFetch, aiAssistant.refreshWallet);
  const sharecroppingPush = useSharecroppingPush(currentUser, authFetch, () => setActiveTab('sharecropping'));
  const shareEvents = useShareEvents(currentUser?.userId, authFetch);
  const navigateTab = useHarvestAdNavigation({
    userId: currentUser?.userId, proStatus: storePurchases.proStatus, activeTab,
    enabled: onboardingStep === null && !adTrackingPromptVisible && !loading && !storePurchases.purchasingProductId && !storePurchases.restoring,
    onNavigate: setActiveTab,
  });
  const handleRewardedAdEarned = async () => {
    await aiAssistant.refreshWallet();
    showOperationFeedback('10 Kredi Kazandınız', 'Reklam ödülü hesabınıza eklendi.', 'success');
  };
  const policyRequest = useCallback((url: string, options?: RequestInit, timeout?: number) => {
    if (!currentUser || authSession.capture().user !== currentUser) return Promise.reject(new Error('Oturum değişti.'));
    return authFetch(url, options, timeout);
  }, [authFetch, authSession, currentUser]);
  const backgroundActionsRef = useRef({ fetchData, refreshPendingSyncCount, syncOfflineQueue });
  useEffect(() => {
    backgroundActionsRef.current = { fetchData, refreshPendingSyncCount, syncOfflineQueue };
  }, [fetchData, refreshPendingSyncCount, syncOfflineQueue]);

  useEffect(() => {
    if (!currentUser?.userId) return;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void backgroundActionsRef.current.fetchData(true);
    });
    return () => listener.remove();
  }, [currentUser?.userId]);

  const lastAccountTab = useRef(activeTab);
  useEffect(() => {
    const changed = lastAccountTab.current !== activeTab;
    lastAccountTab.current = activeTab;
    if (changed && currentUser?.userId && ['dashboard', 'collections', 'receivables', 'sharecropping', 'history', 'reports'].includes(activeTab)) {
      void backgroundActionsRef.current.fetchData(true);
    }
  }, [activeTab, currentUser?.userId]);

  useEffect(() => {
    if (activeTab === 'assistant' && currentUser?.userId) void refreshAssistantWallet();
  }, [activeTab, currentUser?.userId, refreshAssistantWallet]);

  const postOrQueue = async (endpoint: string, body: Record<string, unknown>) => {
    const scope = authSession.capture();
    if (!scope.user) throw new Error('Oturum bulunamadı.');
    const requestId = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    // Persist BEFORE sending: a crash or lost response must reuse the same identity.
    await queueOfflineRequest(endpoint, body, requestId);
    const network = await NetInfo.fetch();
    if (!authSession.isCurrent(scope)) throw new Error('Oturum değişti.');
    const offline = Platform.OS !== 'web' && (!network.isConnected || network.isInternetReachable === false);
    if (offline) return { queued: true as const };
    try {
      const response = await authFetch(`${API_URL}${endpoint}`, {
        method: 'POST', headers: { ...getAuthHeaders(), 'Idempotency-Key': requestId }, body: JSON.stringify(body)
      });
      if (!authSession.isCurrent(scope)) throw new Error('Oturum değişti.');
      const data = await response.clone().json().catch(() => null);
      if (response.ok && (data?._id || data?.payment?._id)) {
        await discardOfflineRequest(scope.user.userId, requestId);
        await refreshPendingSyncCount();
        return { queued: false as const, response };
      }
      if (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status) && data?.code !== 'REQUEST_IN_PROGRESS') {
        await discardOfflineRequest(scope.user.userId, requestId);
        await refreshPendingSyncCount();
        return { queued: false as const, response };
      }
      return { queued: true as const };
    } catch (error) {
      if (!authSession.isCurrent(scope)) throw error;
      // Unknown outcome stays durable. Never ask the user to create a second copy.
      return { queued: true as const };
    }
  };

  // Uygulama Açılışında Oturumu Kontrol Et
  useEffect(() => {
    let active = true;
    const checkSavedSession = async () => {
      try {
        await authSession.restore(getSession, () => active);
      } catch (error) {
        console.log('Oturum okuma hatası:', error);
      } finally {
        if (active) setInitialCheckDone(true);
      }
    };
    checkSavedSession();
    return () => { active = false; };
  }, [authSession]);

  useEffect(() => {
    let active = true;
    if (currentUser) {
      const actions = backgroundActionsRef.current;
      void setupNotifications().then(() => active ? syncDailyReminder(currentUser.userId) : undefined).catch(() => undefined);
      actions.refreshPendingSyncCount();
      actions.syncOfflineQueue().then((result) => {
        if (result.synced > 0) actions.fetchData();
      });
      actions.fetchData();
    }
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    if (!initialCheckDone) return;
    let active = true;
    const userId = currentUser?.userId;
    const token = currentUser?.token;
    setNotificationOwner(userId || null);
    const refreshSeasonReminder = () => {
      if (!active) return;
      void (async () => {
        if (!userId) { await cancelDailyReminder(); return; }
        // First reconcile cached finite plans (also removes personal legacy schedules).
        await syncDailyReminder(userId);
        if (active && token) await refreshDailyReminderPolicy(userId, token, policyRequest);
      })().catch(() => { if (__DEV__) console.log('Ortak sezon planı güncellenemedi; sonraki bağlantıda yeniden denenecek.'); });
    };
    // Replenish only while the account is being used. Every scheduled date remains finite.
    refreshSeasonReminder();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshSeasonReminder();
    });
    return () => { active = false; setNotificationOwner(null); subscription.remove(); };
  }, [currentUser?.userId, currentUser?.token, initialCheckDone, policyRequest]);

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

  // İlk kullanım rehberi tamamlandıktan sonra reklam ölçümü tercihini bir kez sorarız.
  // Expo Go ve web gibi native SDK içermeyen ortamlarda hiçbir pencere gösterilmez.
  useEffect(() => {
    let active = true;
    const userId = currentUser?.userId;
    if (Platform.OS === 'ios' || !userId || onboardingStep !== null) {
      return () => { active = false; };
    }

    Promise.all([
      AsyncStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}:${userId}`),
      hasSeenAdTrackingPrompt(),
      getAdTrackingState(),
    ]).then(([onboardingStatus, promptSeen, trackingState]) => {
      if (!active) return;
      const canAsk = shouldRequestTracking(Platform.OS, onboardingStatus === 'done', promptSeen, trackingState);
      setAdTrackingPromptVisible(canAsk);
    }).catch(() => {
      if (active) setAdTrackingPromptVisible(false);
    });

    return () => { active = false; };
  }, [currentUser?.userId, onboardingStep]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        const actions = backgroundActionsRef.current;
        actions.syncOfflineQueue().then((result) => {
          if (result.synced > 0) actions.fetchData();
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
    if (authCleanupRef.current || authSession.capture().user) return;
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
    let authAttempt = authSession.beginAuthentication();
    setLoading(true);
    try {
      const profile = authMode === 'register' ? await saveProfile(cleanPhone, authName, cleanPin) : await syncProfile(cleanPhone, cleanPin);
      if (!authSession.isCurrent(authAttempt)) return;
      if (!profile?.token) {
        showAuthFeedback('Giriş Başarısız', authMode === 'login' ? 'Kayıt bulunamadı veya oturum oluşturulamadı.' : 'Profil kaydedildi ancak güvenli oturum oluşturulamadı.');
        return;
      }
      if (authMode === 'register') void trackTikTokRegistration();
      const userData: UserSession = {
        userId: profile.userId,
        name: profile.name || authName.trim() || 'Üretici',
        phone: normalizePhone(profile.phone || cleanPhone),
        role: profile.role === 'admin' ? 'admin' : profile.role === 'manager' ? 'manager' : 'user',
        adminPermissions: Array.isArray(profile.adminPermissions) ? profile.adminPermissions : [],
        token: profile.token,
        refreshToken: profile.refreshToken
      };
      if (!await authSession.replace(userData, authAttempt)) return;
      authAttempt = authSession.capture();
      if (Platform.OS !== 'web') Alert.alert(authMode === 'register' ? 'Kayıt Başarılı' : 'Giriş Başarılı', `Hoş geldiniz, ${userData.name}!`);
    } catch (e: any) {
      if (!authSession.isCurrent(authAttempt)) return;
      if (e?.code === 'PIN_SETUP_REQUIRED') {
        setAuthMode('register');
        setAuthPin('');
        setAuthPinConfirm('');
        showAuthFeedback('İlk Giriş Şifresi', 'Bu eski hesap için henüz giriş şifresi yok. Aşağıdaki kayıt ekranında aynı telefon numaranızı ve yeni 6 haneli şifrenizi girin.', 'info');
      }
      else showAuthFeedback('Giriş Yapılamadı', e?.message || 'Giriş işlemi başarısız.');
    }
    finally { if (authSession.isCurrent(authAttempt)) setLoading(false); }
  };

  // Çıkış Yap
  const handleLogout = async () => {
    if (authCleanupRef.current) return authCleanupRef.current;
    const scope = authSession.capture();
    if (!scope.user || scope.user !== currentUser) return;
    const user = scope.user;
    stopFeedbackSound();
    setNotificationOwner(null);
    setHarvestReward(null);
    // Invalidate before waiting for the server, native cleanup, or an old device write.
    const cleared = authSession.invalidate(scope);
    setLoading(true);
    const task = (async () => {
      const cleanup = await Promise.allSettled([
        cancelDailyReminder(), clearDueNotifications(user.userId), cleared,
        user.refreshToken ? fetchWithTimeout(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: user.refreshToken }) }).catch(() => undefined) : Promise.resolve(),
      ]);
      if (cleanup.some(result => result.status === 'rejected')) {
        showAuthFeedback('Çıkış yapıldı; cihazı kontrol edin', 'Bu ekranda oturumunuz kapatıldı, ancak bu cihazdaki bazı bilgiler veya hatırlatmalar tamamen temizlenemedi. Kalan bildirimleri telefonunuzun Ayarlar > Bildirimler > Çaylık bölümünden kapatabilirsiniz. Sorun sürerse cihaz ayarlarından Çaylık uygulama verilerini temizleyebilirsiniz.', 'info');
      }
    })();
    authCleanupRef.current = task;
    try { await task; }
    finally { if (authCleanupRef.current === task) { authCleanupRef.current = null; setLoading(false); } }
  };

  const handleDeleteAccount = async () => {
    const scope = authSession.capture();
    if (!scope.user || scope.user !== currentUser || authCleanupRef.current) throw new Error('Oturum değişti.');
    stopFeedbackSound();
    setHarvestReward(null);
    const userId = scope.user.userId;
    try {
      const response = await authFetch(`${API_URL}/users/me`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!authSession.isCurrent(scope)) throw new Error('Oturum değişti.');
      if (!response.ok) throw new Error(data?.error || 'Hesap silinemedi.');
    } catch (error: any) { Alert.alert('Hesap Silme', error?.message || 'Hesap silinemedi.'); throw error; }
    setNotificationOwner(null);
    const cleared = authSession.invalidate(scope);
    setLoading(true);
    // The server has confirmed deletion. Local cleanup cannot turn that into a failure
    // or leave the deleted account active while unrelated cleanup is still pending.
    const task = (async () => {
    const cleanup = await Promise.allSettled([
      cancelDailyReminder(),
      userId ? clearOfflineData(userId) : Promise.resolve(),
      userId ? clearDueNotifications(userId) : Promise.resolve(),
      cleared,
    ]);
    if (cleanup.some(result => result.status === 'rejected')) {
      showAuthFeedback('Hesap silindi; cihaz temizliği tamamlanamadı', 'Hesabınız ve ilişkili kayıtlarınız sunucudan silindi, bu ekranda oturumunuz kapatıldı. Bu cihazdaki bazı bilgiler veya hatırlatmalar temizlenemedi. Kalan bildirimleri telefonunuzun Ayarlar > Bildirimler > Çaylık bölümünden kapatabilirsiniz. Cihazda kalan bilgileri kaldırmak için Çaylık uygulama verilerini temizleyebilir veya uygulamayı kaldırabilirsiniz.', 'info');
    } else {
      showAuthFeedback('Hesap Silindi', 'Hesabınız ve ilişkili kayıtlarınız silindi.', 'info');
    }
    })();
    authCleanupRef.current = task;
    try { await task; }
    finally { if (authCleanupRef.current === task) { authCleanupRef.current = null; setLoading(false); } }
  };

  const handleChangePin = async (currentPin: string, newPin: string) => {
    if (!currentUser || authSession.capture().user !== currentUser) throw new Error('Oturum bulunamadı.');
    const { response, scope } = await authFetchScoped(`${API_URL}/users/me/pin`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPin, newPin })
    });
    const data = await response.json().catch(() => ({}));
    if (!authSession.isCurrent(scope, true) || !scope.user) throw new Error('Oturum değişti.');
    if (!response.ok || !data?.token) throw new Error(data?.error || 'Giriş şifresi güncellenemedi.');
    const refreshedUser: UserSession = {
      ...scope.user,
      token: data.token,
      refreshToken: data.refreshToken || scope.user.refreshToken,
      name: data.name || scope.user.name,
      phone: normalizePhone(data.phone || scope.user.phone),
      role: data.role === 'admin' ? 'admin' : data.role === 'manager' ? 'manager' : 'user',
      adminPermissions: Array.isArray(data.adminPermissions) ? data.adminPermissions : []
    };
    if (!await authSession.replace(refreshedUser, scope, true)) throw new Error('Oturum değişti.');
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

  const allowAdTrackingFromPrompt = async () => {
    setAdTrackingPromptBusy(true);
    try {
      await requestAdTrackingConsent();
    } catch {
      // Tracking is optional: a permission/SDK failure must never block the app.
      console.warn('Reklam ölçümü izni uygulanamadı; uygulama kullanılmaya devam edebilir.');
    } finally {
      setAdTrackingPromptBusy(false);
      setAdTrackingPromptVisible(false);
    }
  };

  const dismissAdTrackingFromPrompt = async () => {
    setAdTrackingPromptVisible(false);
    try {
      await dismissAdTrackingPrompt();
    } catch {
      // Tercih depolanamasa da uygulamanın ana akışını kesmeyiz.
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
    if (endpoint === 'harvests') {
      const row = harvests.find(item => item._id === id);
      if (row?.sharedDeliveryId) {
        if (row.sharedRole !== 'cropper' || !row.sourceHarvestId) {
          showOperationFeedback('Paylaşılan teslimat', 'Bu teslimat yalnızca yarıcı tarafından Pay Takibi üzerinden değiştirilebilir.', 'info');
          return;
        }
        id = row.sourceHarvestId;
      }
    }
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
      const payment = target.endpoint === 'payments' ? payments.find(item => item._id === target.id) : undefined;
      const path = payment ? paymentEndpoint(payment) : `/${target.endpoint}/${target.id}`;
      const res = await authFetch(`${API_URL}${path}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        ...(payment?.sharedDeliveryId ? { body: JSON.stringify({ revision: payment.revision || 0 }) } : {}),
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
        confidence: Number.isFinite(Number(data?.confidence)) ? Number(data.confidence) : undefined,
        warnings: Array.isArray(data?.warnings) ? data.warnings.map(String) : [],
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
    if (harvestSavingRef.current) return;
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
    harvestSavingRef.current = true;
    setLoading(true);
    try {
      if (harvestShareLinkId) {
        const sharing = await shareRequest<{ links: ShareLink[]; harvestSharing?: boolean }>(policyRequest, '/sharecropping');
        if (!sharing.harvestSharing) throw Error('Paylaşım için önce sunucuyu güncelleyin. Hasat kaydedilmedi.');
        if (!sharing.links.some(link => link._id === harvestShareLinkId && link.myRole === 'cropper' && link.status === 'active')) throw Error('Seçilen anlaşma aktif değil. Yeniden seçin.');
      }
      const payload = {
        tarih,
        shareLinkId: harvestShareLinkId,
        surum: hForm.surum || '1. Sürüm',
        uretici: producerName,
        producerName: producerName,
        kg: parseMoney(hForm.kg),
        weight: parseMoney(hForm.kg),
        firma: hForm.firma ? hForm.firma.trim() : '',
        quotaPlanId: hForm.quotaPlanId,
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
        setHarvestShareLinkId('');
        showOperationFeedback('Çevrimdışı Kaydedildi', 'Hasat kaydı telefonda saklandı; internet gelince otomatik gönderilecek.', 'info');
        setReceiptNotice('');
        setHForm({ quotaPlanId: '', date: todayDisplayDate(), surum: '1. Sürüm', producer: '', kg: '', firma: '', fiyat: '', tahsilat: '0', aciklama: '', garden: '', isVadeli: false, vadeTarihi: '', receiptFingerprint: '' });
        setActiveTab('dashboard');
        return;
      }
      const res = result.response;

      if (res.ok) {
        setHarvestShareLinkId('');
        setOperationFeedback(null);
        Keyboard.dismiss();
        if (currentUser) void playFeedbackSound('harvest', currentUser.userId);
        if (currentUser) setHarvestReward({ id: Date.now(), userId: currentUser.userId, kind: 'harvest', value: `${payload.kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} KG` });
        setReceiptNotice('');
        // Form Temizleme Mantığı Düzeltildi (Madde 5)
        setHForm({
          quotaPlanId: '',
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
      harvestSavingRef.current = false;
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

    const remaining = remainingTotalOf(selected);

    if (amount > remaining + 0.01) {
      showOperationFeedback('Hata', `Tahsilat kalan borçtan fazla olamaz. Kalan: ${formatTL(remaining)}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await postOrQueue(collectionEndpoint(selected), {
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
        setOperationFeedback(null);
        Keyboard.dismiss();
        if (currentUser) void playFeedbackSound('payment', currentUser.userId);
        if (currentUser) setHarvestReward({ id: Date.now(), userId: currentUser.userId, kind: 'payment', value: formatTL(amount) });
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
      const response = await authFetch(`${API_URL}${paymentEndpoint(editingPayment)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ tarih, tutar, aciklama: editPaymentForm.description.trim(), revision: editingPayment.revision || 0 })
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
    if (harvestItem.sharedDeliveryId) {
      if (harvestItem.sharedRole !== 'cropper' || !harvestItem.sourceHarvestId) {
        setShareFocus({ userId: currentUser?.userId || '', linkId: harvestItem.shareLinkId || '' });
        setActiveTab('sharecropping');
        return;
      }
      void (async () => {
        try {
          const response = await policyRequest(`${API_URL}/harvests/${harvestItem.sourceHarvestId}`);
          const source = await response.json();
          if (!response.ok) throw Error(source.error || 'Hasat açılamadı.');
          openHarvestEditModal(source);
        } catch (error) { showOperationFeedback('Hasat açılamadı', error instanceof Error ? error.message : 'Yeniden deneyin.', 'error'); }
      })();
      return;
    }
    setEditingHarvest(harvestItem);
    setEditHarvestForm({
      quotaPlanId: harvestItem.quotaPlanId || '',
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
          quotaPlanId: editHarvestForm.quotaPlanId,
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
    return <AuthScreen mode={authMode} phone={authPhone} name={authName} pin={authPin} pinConfirm={authPinConfirm} feedback={authFeedback} loading={loading} onModeChange={setAuthMode} onPhoneChange={setAuthPhone} onNameChange={setAuthName} onPinChange={setAuthPin} onPinConfirmChange={setAuthPinConfirm} onClearFeedback={() => setAuthFeedback(null)} onSubmit={handleAuth} />;
  }

  return (
    <AdAccessContext.Provider value={storePurchases.proStatus}>
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
                onPress={() => navigateTab(item.tab)}
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
        {isDesktop ? (
        <View style={[styles.header, !isDesktop && { backgroundColor: paperTheme.colors.background, borderBottomColor: paperTheme.colors.outlineVariant }, isDesktop && styles.desktopHeader]}>
          <View style={styles.headerBrandRow}>
            <View style={{ flex: 1 }}>
              {isDesktop ? <Text style={styles.desktopHeaderSubtitle}>ÇAYLIK YÖNETİM</Text> : <TeaWordmark compact />}
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
        </View>
        ) : <MobileBrandHeader name={currentUser.name} home={activeTab === 'dashboard'} onBack={() => setActiveTab('dashboard')}>
          {pendingSyncCount > 0 && <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>{pendingSyncCount} kayıt senkronizasyon bekliyor</Text>}
          {failedSyncCount > 0 && <TouchableOpacity onPress={manageFailedOfflineRequests}><Text style={{ color: paperTheme.colors.error }}>{failedSyncCount} kayıt için işlem gerekli</Text></TouchableOpacity>}
        </MobileBrandHeader>}

        {dataStale && <TouchableOpacity accessibilityRole="button" onPress={() => void fetchData()} style={{ padding: 10, backgroundColor: paperTheme.colors.surfaceVariant }}>
          <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>Hesap güncellenemedi · {lastSyncAt ? `Son kayıt: ${new Date(lastSyncAt).toLocaleString('tr-TR')}` : 'Bağlantı bekleniyor'} · Yenile</Text>
        </TouchableOpacity>}

        {harvestReward?.userId === currentUser.userId && <HarvestReward key={harvestReward.id} userId={currentUser.userId} kind={harvestReward.kind} value={harvestReward.value} />}
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
              payments={payments}
              expenses={expenses}
              onAskAboutHarvest={(item) => { setAssistantDraft({ userId: currentUser.userId, text: `${formatDisplayDate(item.tarih)} tarihli ${item.firma || ''} teslimatımı (${item.kg ?? item.weight ?? 0} kg, ${item.fiyat || 0} TL/kg) bu sezondaki kayıtlarımla karşılaştır. Eksik bilgi varsa belirt.` }); setActiveTab('assistant'); }}
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
          ref={mainScrollRef}
          style={[styles.content, isDesktop && styles.desktopScroll, { backgroundColor: paperTheme.colors.background }]}
          contentContainerStyle={isDesktop ? styles.desktopContent : styles.mobileContent}
          showsVerticalScrollIndicator={isDesktop}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} colors={['#1b4332']} />}
        >
          {activeTab === 'dashboard' && (
            <DashboardScreen
              key={currentUser.userId}
              authFetch={policyRequest}
              pendingSyncCount={pendingSyncCount}
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
              onNavigate={navigateTab}
            />
          )}

          {activeTab === 'assistant' && (
            <AssistantScreen
              initialQuestion={assistantDraft?.userId === currentUser.userId ? assistantDraft.text : ''}
              messages={aiAssistant.messages}
              credits={aiAssistant.credits}
              transactions={aiAssistant.transactions}
              busy={aiAssistant.busy}
              transcribing={aiAssistant.transcribing}
              error={aiAssistant.error}
              onAsk={async (message) => { const result = await aiAssistant.ask(message); if (result) setAssistantDraft(null); return result; }}
              onTranscribe={aiAssistant.transcribeVoice}
              onClear={aiAssistant.clearConversation}
              onOpenStore={() => setActiveTab('creditStore')}
            />
          )}
          {activeTab === 'creditStore' && (
            <CreditStoreScreen
              key={currentUser.userId}
              userId={currentUser.userId}
              onReload={() => void storePurchases.reload()}
              authFetch={authFetch}
              credits={aiAssistant.credits}
              onBack={() => setActiveTab('assistant')}
              onPurchase={(productId) => void storePurchases.purchase(productId)}
              onRestore={() => void storePurchases.restore()}
              prices={storePurchases.prices}
              purchasingProductId={storePurchases.purchasingProductId}
              restoring={storePurchases.restoring}
              storeStatus={storePurchases.status}
              onRewardedAdEarned={handleRewardedAdEarned}
            />
          )}

          {activeTab === 'quota' && <QuotaScreen authFetch={authFetch} />}
          {activeTab === 'advertise' && (
            <AdvertiseScreen
              key={currentUser.userId}
              userId={currentUser.userId}
              token={currentUser.token}
              credits={aiAssistant.credits}
              onBuyCredits={() => setActiveTab('creditStore')}
              onCreditsChanged={aiAssistant.refreshWallet}
            />
          )}
          {/* HASAT EKLE TABI */}
          {activeTab === 'harvest' && (
            <HarvestScreen
              key={currentUser.userId}
              shareLinkId={harvestShareLinkId}
              onShareLinkChange={setHarvestShareLinkId}
              harvests={harvests.filter(item => item.userId === currentUser.userId)}
              authFetch={policyRequest}
              currentUser={currentUser}
              hForm={hForm}
              handleSaveHarvest={handleSaveHarvest}
              saving={loading}
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
              onPayment={openPaymentForHarvest}
            />
          )}

          {activeTab === 'more' && <MoreScreen isAdmin={Boolean(isAdmin)} onNavigate={navigateTab} />}
          {activeTab === 'sharecropping' && <SharecroppingScreen key={`${currentUser.userId}:${shareFocus.userId === currentUser.userId ? shareFocus.linkId : ''}`} initialLinkId={shareFocus.userId === currentUser.userId ? shareFocus.linkId : ''} userId={currentUser.userId} authFetch={policyRequest} enablePush={sharecroppingPush.enable} onPageChange={resetSharecroppingScroll} refreshKey={harvests}
            accountHarvests={harvests.filter(row => Boolean(row.sharedDeliveryId))}
            unread={shareEvents.unread} onEventsChanged={() => void shareEvents.refresh()}
            onCollect={openPaymentForHarvest}
            onRefreshAccount={() => { void fetchData(); }}
            onAddHarvest={id => { setHarvestShareLinkId(id); navigateTab('harvest'); }}
            onOpenHarvest={async id => {
              try { const response = await policyRequest(`${API_URL}/harvests/${id}`); const row = await response.json(); if (!response.ok) throw Error(row.error || 'Hasat bulunamadı.'); openHarvestEditModal(row); }
              catch (error) { showOperationFeedback('Hasat açılamadı', error instanceof Error ? error.message : 'Yeniden deneyin.', 'error'); }
            }} />}

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
              policyRequest={policyRequest}
              currentUser={currentUser}
              onChangePin={handleChangePin}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
              lastSyncAt={lastSyncAt}
              onExportData={handleExportData}
              onSendFeedback={handleSendFeedback}
              onDueSoundChange={() => syncDueNotifications(currentUser.userId, harvests, true)}
            />
          )}

          {/* ADMIN PANELİ TABI */}
          {activeTab === 'admin' && isAdmin && (
            <AdminScreen
              policyRequest={policyRequest}
              adForm={adForm}
              ads={ads}
              handleDelete={handleDelete}
              handleSaveAd={handleSaveAd}
              setAdForm={setAdForm}
              currentUser={currentUser}
            />
          )}
          {!isDesktop && ['history', 'receivables', 'more'].includes(activeTab) && <AdMobNativeCard key={activeTab} />}
        </ScrollView>
        )}
        {!isDesktop && activeTab !== 'assistant' && activeTab !== 'dashboard' && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Çaylık Asistanı aç"
            activeOpacity={0.86}
            onPress={() => setActiveTab('assistant')}
            style={[styles.assistantFab, { backgroundColor: paperTheme.colors.primary, bottom: 94 + bannerHeight }]}
          >
            <AppIcon name="robot-happy-outline" size={22} color={paperTheme.colors.onPrimary} />
            <Text style={[styles.assistantFabText, { color: paperTheme.colors.onPrimary }]}>Asistan{aiAssistant.credits !== null ? ` · ${aiAssistant.credits}` : ''}</Text>
          </TouchableOpacity>
        )}
        {!isDesktop && activeTab !== 'assistant' && <AdMobBanner onHeightChange={setBannerHeight} />}
        {!isDesktop && (
          <View style={[styles.mobileBottomNav, { backgroundColor: paperTheme.colors.surface, borderTopColor: paperTheme.colors.outline }]}>
            {mobileNavItems.map((item) => {
              const active = activeTab === item.tab;
              const centerAction = false;
              return (
                <TouchableOpacity
                  key={item.tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.tab === 'sharecropping' && shareEvents.unread ? `${item.label}, ${shareEvents.unread} okunmamış hareket` : item.label}
                  style={[styles.mobileBottomNavItem, { borderRadius: 16, paddingVertical: 6, backgroundColor: active ? paperTheme.colors.primaryContainer : 'transparent' }, centerAction && styles.mobileBottomNavCenterItem]}
                  onPress={() => navigateTab(item.tab)}
                >
                  <View style={[
                    styles.mobileBottomNavIcon,
                    centerAction && styles.mobileBottomNavCenterButton,
                    active && !centerAction && styles.mobileBottomNavIconActive,
                    active && !centerAction && { backgroundColor: 'transparent' },
                    centerAction && { backgroundColor: paperTheme.colors.primary, borderColor: paperTheme.colors.surface },
                  ]}>
                    <AppIcon name={item.icon} size={centerAction ? 27 : 23} color={centerAction ? paperTheme.colors.onPrimary : active ? paperTheme.colors.primary : paperTheme.colors.onSurfaceVariant} />
                    {item.tab === 'sharecropping' && shareEvents.unread > 0 && <Text style={{ position: 'absolute', right: -12, top: -6, backgroundColor: paperTheme.colors.error, color: paperTheme.colors.onError, borderRadius: 10, minWidth: 19, textAlign: 'center', paddingHorizontal: 3, fontSize: 11 }}>{shareEvents.unread > 99 ? '99+' : shareEvents.unread}</Text>}
                  </View>
                  <Text numberOfLines={2} style={[styles.mobileBottomNavText, centerAction && styles.mobileBottomNavCenterText, active && styles.mobileBottomNavTextActive, { color: active ? paperTheme.colors.primary : paperTheme.colors.onSurfaceVariant }]}>{item.label}</Text>
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

        <AdTrackingConsentPrompt
          visible={adTrackingPromptVisible}
          busy={adTrackingPromptBusy}
          onAllow={() => void allowAdTrackingFromPrompt()}
          onDismiss={() => void dismissAdTrackingFromPrompt()}
        />

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
                {!!editingHarvest?.shareLinkId && <Text style={[styles.formHelp, { color: paperTheme.colors.primary }]}>Bu hasat Pay Takibi’ne bağlı. Değişiklikler karşı tarafa da yansır ve geçmişte görünür.</Text>}

                <Text style={styles.label}>Tarih (GG.AA.YYYY)</Text>
                <TextInput style={styles.input} value={editHarvestForm.date} onChangeText={(date) => setEditHarvestForm({ ...editHarvestForm, date })} placeholder="12.08.2026" />

                <Text style={styles.label}>Sürüm</Text>
                <View style={styles.rowBtnGroup}>{['1. Sürüm', '2. Sürüm', '3. Sürüm', '4. Sürüm'].map((surum) => <TouchableOpacity key={surum} style={[styles.groupBtn, editHarvestForm.surum === surum && styles.groupBtnActive]} onPress={() => setEditHarvestForm({ ...editHarvestForm, surum })}><Text style={[styles.groupBtnText, editHarvestForm.surum === surum && styles.groupBtnTextActive]}>{surum}</Text></TouchableOpacity>)}</View>

                {isAdmin && <><Text style={styles.label}>Üretici Adı</Text><TextInput style={styles.input} value={editHarvestForm.producer} onChangeText={(producer) => setEditHarvestForm({ ...editHarvestForm, producer })} placeholder="Üretici adı" /></>}
                <Text style={styles.label}>Miktar (KG)</Text>
                <TextInput style={styles.input} value={editHarvestForm.kg} onChangeText={(kg) => setEditHarvestForm({ ...editHarvestForm, kg })} placeholder="Örn: 1000" keyboardType="decimal-pad" />
                <Text style={styles.label}>Firma / Alıcı</Text>
                <TextInput style={styles.input} value={editHarvestForm.firma} onChangeText={(firma) => setEditHarvestForm({ ...editHarvestForm, firma })} placeholder="ÇAYKUR veya özel fabrika" />
                <QuotaPlanPicker key={editingHarvest?._id} authFetch={authFetch} firma={editHarvestForm.firma} season={editHarvestForm.surum} date={toServerDate(editHarvestForm.date)} value={editHarvestForm.quotaPlanId} onChange={(quotaPlanId) => setEditHarvestForm({ ...editHarvestForm, quotaPlanId })} />
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
    </AdAccessContext.Provider>
  );
}
