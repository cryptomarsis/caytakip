import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';
import { API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';
import { formatTL } from '../utils/format';
import { CaylikScreenHeader } from '../components/caylik-ui';
import { useTheme } from 'react-native-paper';

const ADMIN_PAGE_SIZE = 7;
const sortProducersByName = (items: any[]) => [...items].sort((left, right) =>
  String(left?.name || '').localeCompare(String(right?.name || ''), 'tr', { sensitivity: 'base' })
);

const imageUrlOf = (value: unknown) => {
  const url = String(value || '').trim();
  return /^https?:\/\/\S+$/i.test(url) ? url : '';
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
  }, [activityFilter, cityFilter, currentUser, page, query]);

  useEffect(() => {
    const hasFilters = Boolean(query || cityFilter || activityFilter !== 'all');
    const timer = setTimeout(() => { loadAdminData(page); }, hasFilters ? 300 : 0);
    return () => clearTimeout(timer);
  }, [currentUser?.token, page, query, cityFilter, activityFilter, loadAdminData]);

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
        <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Ana Sayfa Bannerı</Text>
        <Text style={[styles.bannerHelp, { color: theme.colors.onSurfaceVariant }]}>Duyuru kartı yerine ana sayfada görselli, sade bir banner görünür. Sadece firma adı zorunludur.</Text>

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Firma / Marka *</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.firma} onChangeText={(value) => updateAdForm('firma', value)} placeholder="Örn: ÇAYKUR" />
        <Text style={styles.label}>Banner başlığı</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.baslik} onChangeText={(value) => updateAdForm('baslik', value)} placeholder="Boş bırakırsanız firma adı kullanılır" />
        <Text style={styles.label}>Görsel bağlantısı (isteğe bağlı)</Text>
        <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={adForm.gorselUrl} onChangeText={(value) => updateAdForm('gorselUrl', value)} placeholder="https://site.com/banner.jpg" autoCapitalize="none" keyboardType="url" />
        <Text style={styles.bannerHelp}>Görselin herkesin açabildiği bir internet bağlantısı olması gerekir. Bağlantı eklenmezse uygulama sade yeşil bir banner kullanır.</Text>
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
