import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';
import { API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';
import { formatTL } from '../utils/format';
import { CaylikScreenHeader } from '../components/caylik-ui';
import { useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { AppIcon } from '../components/app-icon';

const ADMIN_PAGE_SIZE = 7;
const sortProducersByName = (items: any[]) => [...items].sort((left, right) =>
  String(left?.name || '').localeCompare(String(right?.name || ''), 'tr', { sensitivity: 'base' })
);

const imageUrlOf = (value: unknown) => {
  const url = String(value || '').trim();
  return /^(https?:\/\/\S+|data:image\/(png|jpe?g|webp);base64,)/i.test(url) ? url : '';
};

function BannerCard({ ad, preview = false }: { ad: any; preview?: boolean }) {
  const imageUrl = imageUrlOf(ad.gorselUrl);
  const title = String(ad.baslik || ad.firma || 'Banner başlığı').trim();
  const firm = String(ad.firma || 'Marka adı').trim();
  const isAnnouncement = String(ad.kategori || '').toLocaleLowerCase('tr-TR') === 'duyuru';

  return (
    <View style={styles.sponsorBanner}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.sponsorBannerImage} resizeMode="cover" />
      ) : (
        <View style={styles.sponsorBannerFallback}>
          <Text style={styles.sponsorBannerFallbackMark}>{firm}</Text>
        </View>
      )}
      <View style={styles.sponsorBannerInfo}>
        <View style={styles.sponsorBannerMeta}>
          <Text style={styles.sponsorBannerBadge}>{isAnnouncement ? 'DUYURU' : 'SPONSORLU'}</Text>
          <Text style={styles.sponsorBannerFirm}>{firm}</Text>
        </View>
        <Text style={styles.sponsorBannerTitle}>{title}</Text>
        {!!ad.aciklama && <Text style={styles.sponsorBannerText}>{ad.aciklama}</Text>}
        {!preview && !!(ad.link || ad.telefon) && <Text style={styles.sponsorBannerAction}>İncelemek için dokunun →</Text>}
      </View>
    </View>
  );
}

export default function AdminScreen(props: any) {
  const theme = useTheme();
  const chooseBannerImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Fotoğraf izni gerekli', 'Banner görseli seçmek için fotoğraf erişimine izin verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]?.uri) return;
    const rendered = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 1200 } }], { compress: 0.68, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (rendered.base64) updateAdForm('gorselUrl', `data:image/jpeg;base64,${rendered.base64}`);
  };
  const { adForm, ads, handleDelete, handleSaveAd, setAdForm, currentUser } = props;
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ producerCount: 0, totalKg: 0, totalSales: 0, totalPaid: 0, remaining: 0 });
  const [loadError, setLoadError] = useState('');
  const [adApplications, setAdApplications] = useState<any[]>([]);
  const [reviewingAdId, setReviewingAdId] = useState('');

  const loadAdApplications = useCallback(async () => {
    if (!currentUser?.token) return;
    try {
      const response = await fetchWithTimeout(`${API_URL}/admin/ad-applications`, { headers: { Authorization: `Bearer ${currentUser.token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Reklam başvuruları yüklenemedi.');
      setAdApplications(Array.isArray(data.items) ? data.items : []);
    } catch (error: any) { setLoadError(error.message); }
  }, [currentUser]);

  const reviewAdApplication = async (item: any, status: 'approved' | 'rejected') => {
    const perform = async () => {
      setReviewingAdId(item._id);
      try {
        const response = await fetchWithTimeout(`${API_URL}/admin/ad-applications/${item._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` }, body: JSON.stringify({ status }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Başvuru sonuçlandırılamadı.');
        await loadAdApplications();
        Alert.alert(status === 'approved' ? 'Reklam yayınlandı' : 'Başvuru reddedildi', status === 'approved' ? 'Reklam seçilen süre boyunca banner alanında gösterilecek.' : 'Kullanıcının reklam kredisi iade edildi.');
      } catch (error: any) { Alert.alert('Reklam Başvurusu', error.message); }
      finally { setReviewingAdId(''); }
    };
    Alert.alert(status === 'approved' ? 'Reklamı onayla' : 'Başvuruyu reddet', status === 'approved' ? `${item.firma} reklamı yayınlansın mı?` : 'Başvuru reddedilecek ve kredi kullanıcıya iade edilecek.', [{ text: 'Vazgeç', style: 'cancel' }, { text: status === 'approved' ? 'Onayla' : 'Reddet', style: status === 'approved' ? 'default' : 'destructive', onPress: () => void perform() }]);
  };

  const loadAdminData = useCallback(async (requestedPage = page) => {
    if (!currentUser?.token) return;
    setLoadingUsers(true);
    setLoadError('');
    try {
      const producerUrl = `${API_URL}/admin/producers?page=${requestedPage}&limit=${ADMIN_PAGE_SIZE}&search=${encodeURIComponent(query.trim())}&city=${encodeURIComponent(cityFilter.trim())}&activity=${encodeURIComponent(activityFilter)}`;
      const [usersResponse, summaryResponse] = await Promise.all([
        fetchWithTimeout(producerUrl, { headers: { Authorization: `Bearer ${currentUser.token}` } }),
        fetchWithTimeout(`${API_URL}/admin/summary`, { headers: { Authorization: `Bearer ${currentUser.token}` } })
      ]);
      const [usersData, summaryData] = await Promise.all([
        usersResponse.json().catch(() => ({})),
        summaryResponse.json().catch(() => ({}))
      ]);
      if (!usersResponse.ok) throw new Error(usersData.error || 'Üretici listesi yüklenemedi.');
      if (!summaryResponse.ok) throw new Error(summaryData.error || 'Yönetici toplamları yüklenemedi.');
      const nextPagination = usersData.pagination || { page: requestedPage, total: 0, totalPages: 1 };
      setUsers(sortProducersByName(Array.isArray(usersData.items) ? usersData.items : []));
      setPagination(nextPagination);
      setPage(Number(nextPagination.page || requestedPage));
      setSummary({
        producerCount: Number(summaryData?.producerCount || 0),
        totalKg: Number(summaryData?.totalKg || 0),
        totalSales: Number(summaryData?.totalSales || 0),
        totalPaid: Number(summaryData?.totalPaid || 0),
        remaining: Number(summaryData?.remaining || 0)
      });
    } catch (error: any) {
      setLoadError(error?.message || 'Yönetici bilgileri yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setLoadingUsers(false);
    }
  }, [activityFilter, cityFilter, currentUser, page, query, setPage]);

  useEffect(() => {
    const hasFilters = Boolean(query || cityFilter || activityFilter !== 'all');
    const timer = setTimeout(() => { loadAdminData(page); }, hasFilters ? 300 : 0);
    return () => clearTimeout(timer);
  }, [currentUser?.token, page, query, cityFilter, activityFilter, loadAdminData]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadAdApplications(); }, 0);
    return () => clearTimeout(timer);
  }, [loadAdApplications]);

  const toggleUser = async (user: any, active: boolean) => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/admin/users/${user._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({ active })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'İşlem başarısız.');
      }
      await loadAdminData(page);
    } catch (error: any) {
      Alert.alert('Hata', error.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async () => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/admin/backup`, { headers: { Authorization: `Bearer ${currentUser.token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Yedek alınamadı.');
      await (await import('react-native')).Share.share({ message: JSON.stringify(data, null, 2), title: 'Caylik_Admin_Yedek.json' });
    } catch (error: any) {
      Alert.alert('Yedekleme', error.message);
    }
  };

  const previewAd = {
    ...adForm,
    firma: adForm.firma || 'Marka adı',
    baslik: adForm.baslik || adForm.firma || 'Banner başlığı'
  };
  const updateAdForm = (key: string, value: string) => setAdForm({ ...adForm, [key]: value });

  return (
    <View>
      <CaylikScreenHeader icon="shield-account-outline" eyebrow="ÇAYLIK YÖNETİMİ" title="Yönetici Paneli" description="Üreticileri, fiyatları ve uygulama duyurularını yönetin." />
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}><Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{Number(summary.producerCount || 0).toLocaleString('tr-TR')}</Text><Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Üretici</Text></View>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}><Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{Number(summary.totalKg || 0).toLocaleString('tr-TR')}</Text><Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Toplam Net KG</Text></View>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}><Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{formatTL(summary.totalSales || 0)}</Text><Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Net Satış</Text></View>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}><Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{formatTL(summary.totalPaid || 0)}</Text><Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Tahsilat</Text></View>
      </View>
      {!!loadError && <Text style={{ color: '#B42318', marginTop: 8, fontWeight: '700' }}>{loadError}</Text>}

      <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Üretici Yönetimi</Text>
        <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Toplam {Number(pagination.total || 0).toLocaleString('tr-TR')} üretici. Her sayfada en fazla {ADMIN_PAGE_SIZE} kişi alfabetik sıralanır.</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Ad soyad veya telefon ara" />
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={cityFilter} onChangeText={(value) => { setCityFilter(value); setPage(1); }} placeholder="Şehir ile filtrele" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {[
            { value: 'all', label: 'Tümü' },
            { value: 'recent', label: 'Son 30 gün' },
            { value: 'stale', label: 'Uzun süredir pasif' },
            { value: 'active', label: 'Aktif hesaplar' },
            { value: 'inactive', label: 'Pasif hesaplar' }
          ].map((filter) => {
            const selected = activityFilter === filter.value;
            return (
              <TouchableOpacity
                key={filter.value}
                style={[styles.secondaryBtn, { paddingHorizontal: 10, paddingVertical: 8, marginTop: 0, backgroundColor: selected ? '#1F724F' : undefined }]}
                onPress={() => { setActivityFilter(filter.value); setPage(1); }}
              >
                <Text style={[styles.secondaryBtnText, { color: selected ? '#FFFFFF' : undefined }]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {loadingUsers ? <Text style={styles.emptyText}>Üreticiler yükleniyor...</Text> : users.length === 0 ? <Text style={styles.emptyText}>Üretici bulunamadı.</Text> : users.map((user) => (
          <View key={user._id} style={[styles.listItem, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant, borderWidth: 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>{user.name || 'İsimsiz üretici'}</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>{[user.phone, user.city, user.lastActiveAt ? `Son giriş: ${new Date(user.lastActiveAt).toLocaleDateString('tr-TR')}` : 'Son giriş bilgisi yok'].filter(Boolean).join(' • ')}</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>{user.harvestCount || 0} hasat • {(user.totalKg || 0).toLocaleString('tr-TR')} KG</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Satış: {formatTL(user.totalSales || 0)} • Kalan: {formatTL(user.remaining || 0)}</Text>
            </View>
            <Switch value={user.active !== false} onValueChange={(active) => toggleUser(user, active)} disabled={busy || loadingUsers} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, marginRight: 8, opacity: Number(pagination.page || page) <= 1 ? 0.45 : 1 }]} disabled={Number(pagination.page || page) <= 1 || loadingUsers} onPress={() => setPage((current) => Math.max(1, current - 1))}>
            <Text style={styles.secondaryBtnText}>ÖNCEKİ</Text>
          </TouchableOpacity>
          <Text style={[styles.listSubText, { textAlign: 'center' }]}>Sayfa {pagination.page || page} / {pagination.totalPages || 1}</Text>
          <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, marginLeft: 8, opacity: Number(pagination.page || page) >= Number(pagination.totalPages || 1) ? 0.45 : 1 }]} disabled={Number(pagination.page || page) >= Number(pagination.totalPages || 1) || loadingUsers} onPress={() => setPage((current) => Math.min(Number(pagination.totalPages || 1), current + 1))}>
            <Text style={styles.secondaryBtnText}>SONRAKİ</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.secondaryBtn} disabled={loadingUsers} onPress={() => loadAdminData(page)}>
          <Text style={styles.secondaryBtnText}>LİSTEYİ YENİLE</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Reklam Başvuruları</Text>
        <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Kullanıcıların krediyle gönderdiği reklamları kontrol ederek yayınlayın veya reddedin.</Text>
        {adApplications.filter((item) => item.status === 'pending').length === 0 ? <Text style={styles.emptyText}>Bekleyen reklam başvurusu yok.</Text> : adApplications.filter((item) => item.status === 'pending').map((item) => (
          <View key={item._id} style={[styles.listItem, { display: 'flex', flexDirection: 'column', alignItems: 'stretch', backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant, borderWidth: 1 }]}>
            {!!imageUrlOf(item.gorselUrl) && <Image source={{ uri: item.gorselUrl }} style={{ width: '100%', height: 140, borderRadius: 12, marginBottom: 10 }} resizeMode="cover" />}
            <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>{item.baslik}</Text>
            <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>{item.firma} · {item.durationDays} gün · {item.creditsCharged} kredi</Text>
            {!!item.aciklama && <Text style={[styles.listSubText, { color: theme.colors.onSurface, marginTop: 7 }]}>{item.aciklama}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity disabled={!!reviewingAdId} onPress={() => void reviewAdApplication(item, 'rejected')} style={[styles.secondaryBtn, { flex: 1, marginTop: 0 }]}><Text style={styles.secondaryBtnText}>REDDET</Text></TouchableOpacity>
              <TouchableOpacity disabled={!!reviewingAdId} onPress={() => void reviewAdApplication(item, 'approved')} style={[styles.submitBtn, { flex: 1, marginTop: 0 }]}><Text style={styles.submitBtnText}>{reviewingAdId === item._id ? 'İŞLENİYOR...' : 'ONAYLA'}</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Ana Sayfa Bannerı</Text>
        <Text style={[styles.bannerHelp, { color: theme.colors.onSurfaceVariant }]}>Duyuru kartı yerine ana sayfada görselli, sade bir banner görünür. Sadece firma adı zorunludur.</Text>

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Firma / Marka *</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.firma} onChangeText={(value) => updateAdForm('firma', value)} placeholder="Örn: ÇAYKUR" />
        <Text style={styles.label}>Banner başlığı</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.baslik} onChangeText={(value) => updateAdForm('baslik', value)} placeholder="Boş bırakırsanız firma adı kullanılır" />
        <Text style={styles.label}>Görsel bağlantısı (isteğe bağlı)</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.gorselUrl} onChangeText={(value) => updateAdForm('gorselUrl', value)} placeholder="https://site.com/banner.jpg" autoCapitalize="none" keyboardType="url" />
        <TouchableOpacity accessibilityRole="button" onPress={() => void chooseBannerImage()} style={[styles.secondaryBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}><AppIcon name="image-plus" size={20} color={theme.colors.primary} /><Text style={styles.secondaryBtnText}>TELEFONDAN FOTOĞRAF SEÇ</Text></TouchableOpacity>
        <Text style={styles.bannerHelp}>İsterseniz bağlantı yapıştırın, isterseniz telefondan fotoğraf seçin. Görsel eklenmezse sade yeşil alan kullanılır.</Text>
        <Text style={styles.label}>Kısa açıklama (isteğe bağlı)</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.aciklama} onChangeText={(value) => updateAdForm('aciklama', value)} placeholder="Örn: Güncel yaş çay alım fiyatları" multiline />
        <Text style={styles.label}>Tıklanınca açılacak bağlantı (isteğe bağlı)</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.link} onChangeText={(value) => updateAdForm('link', value)} placeholder="https://firma.com" autoCapitalize="none" keyboardType="url" />
        <Text style={styles.label}>Telefon (isteğe bağlı)</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.telefon} onChangeText={(value) => updateAdForm('telefon', value)} placeholder="Örn: 0464 000 00 00" keyboardType="phone-pad" />

        <Text style={styles.bannerPreviewLabel}>YAYIN ÖNİZLEMESİ</Text>
        <BannerCard ad={previewAd} preview />
        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveAd}><Text style={styles.submitBtnText}>{"BANNER'I YAYINLA"}</Text></TouchableOpacity>
      </View>

      <Text style={styles.bannerListTitle}>Yayındaki Bannerlar</Text>
      {ads.length === 0 ? <Text style={styles.emptyText}>Henüz yayınlanmış banner yok.</Text> : ads.map((ad: any, index: number) => (
        <View key={ad._id || index}>
          <BannerCard ad={ad} />
          <TouchableOpacity style={[styles.deleteBtn, { alignSelf: 'flex-end', marginTop: -7, marginBottom: 16 }]} onPress={() => handleDelete('ads', ad._id, 'Banner')}>
            <Text style={styles.actionBtnText}>Kaldır</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Yedekleme</Text>
        <Text style={styles.listSubText}>Sunucu tarafında 24 saatte bir otomatik yedek alınır. Manuel yedek aşağıdaki düğmeden paylaşılabilir.</Text>
        <TouchableOpacity style={styles.submitBtn} onPress={downloadBackup}><Text style={styles.submitBtnText}>MANUEL SUNUCU YEDEĞİ AL</Text></TouchableOpacity>
      </View>
    </View>
  );
}
