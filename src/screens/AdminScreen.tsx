import React, { useEffect, useState } from 'react';
import { Alert, Image, Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';
import { API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';
import { formatTL } from '../utils/format';

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
  const { adForm, ads, handleDelete, handleSaveAd, setAdForm, totalKg, totalPay, totalSales, currentUser } = props;
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const loadUsers = async () => {
    if (!currentUser?.token) return;
    try {
      const res = await fetchWithTimeout(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${currentUser.token}` } });
      const data = await res.json();
      if (res.ok) setUsers(Array.isArray(data) ? data : []);
    } catch {
      // Kullanıcı listesi geçici olarak yüklenemezse mevcut ekran kullanılabilir kalır.
    }
  };

  useEffect(() => { loadUsers(); }, [currentUser?.token]);

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
      await loadUsers();
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

  const filtered = users.filter((user) => `${user.name || ''} ${user.phone || ''}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  const previewAd = {
    ...adForm,
    firma: adForm.firma || 'Marka adı',
    baslik: adForm.baslik || adForm.firma || 'Banner başlığı'
  };
  const updateAdForm = (key: string, value: string) => setAdForm({ ...adForm, [key]: value });

  return (
    <View>
      <Text style={styles.sectionTitle}>YÖNETİCİ PANELİ</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}><Text style={styles.statValue}>{users.length}</Text><Text style={styles.statLabel}>Üretici</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{totalKg.toLocaleString('tr-TR')}</Text><Text style={styles.statLabel}>Toplam KG</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(totalSales)}</Text><Text style={styles.statLabel}>Net Satış</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(totalPay)}</Text><Text style={styles.statLabel}>Tahsilat</Text></View>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Üretici Yönetimi</Text>
        <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Ad soyad veya telefon ara" />
        {filtered.length === 0 ? <Text style={styles.emptyText}>Üretici bulunamadı.</Text> : filtered.map((user) => (
          <View key={user._id} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listTitle}>{user.name || 'İsimsiz üretici'}</Text>
              <Text style={styles.listSubText}>{user.phone} • {user.harvestCount || 0} hasat • {(user.totalKg || 0).toLocaleString('tr-TR')} KG</Text>
              <Text style={styles.listSubText}>Satış: {formatTL(user.totalSales || 0)} • Kalan: {formatTL(user.remaining || 0)}</Text>
            </View>
            <Switch value={user.active !== false} onValueChange={(active) => toggleUser(user, active)} disabled={busy} />
          </View>
        ))}
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Ana Sayfa Bannerı</Text>
        <Text style={styles.bannerHelp}>Duyuru kartı yerine ana sayfada görselli, sade bir banner görünür. Sadece firma adı zorunludur.</Text>

        <Text style={styles.label}>Firma / Marka *</Text>
        <TextInput style={styles.input} value={adForm.firma} onChangeText={(value) => updateAdForm('firma', value)} placeholder="Örn: ÇAYKUR" />
        <Text style={styles.label}>Banner başlığı</Text>
        <TextInput style={styles.input} value={adForm.baslik} onChangeText={(value) => updateAdForm('baslik', value)} placeholder="Boş bırakırsanız firma adı kullanılır" />
        <Text style={styles.label}>Görsel bağlantısı (isteğe bağlı)</Text>
        <TextInput style={styles.input} value={adForm.gorselUrl} onChangeText={(value) => updateAdForm('gorselUrl', value)} placeholder="https://site.com/banner.jpg" autoCapitalize="none" keyboardType="url" />
        <Text style={styles.bannerHelp}>Görselin herkesin açabildiği bir internet bağlantısı olması gerekir. Bağlantı eklenmezse uygulama sade yeşil bir banner kullanır.</Text>
        <Text style={styles.label}>Kısa açıklama (isteğe bağlı)</Text>
        <TextInput style={styles.input} value={adForm.aciklama} onChangeText={(value) => updateAdForm('aciklama', value)} placeholder="Örn: Güncel yaş çay alım fiyatları" multiline />
        <Text style={styles.label}>Tıklanınca açılacak bağlantı (isteğe bağlı)</Text>
        <TextInput style={styles.input} value={adForm.link} onChangeText={(value) => updateAdForm('link', value)} placeholder="https://firma.com" autoCapitalize="none" keyboardType="url" />
        <Text style={styles.label}>Telefon (isteğe bağlı)</Text>
        <TextInput style={styles.input} value={adForm.telefon} onChangeText={(value) => updateAdForm('telefon', value)} placeholder="Örn: 0464 000 00 00" keyboardType="phone-pad" />

        <Text style={styles.bannerPreviewLabel}>YAYIN ÖNİZLEMESİ</Text>
        <BannerCard ad={previewAd} preview />
        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveAd}><Text style={styles.submitBtnText}>BANNER'I YAYINLA</Text></TouchableOpacity>
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

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Yedekleme</Text>
        <Text style={styles.listSubText}>Sunucu tarafında 24 saatte bir otomatik yedek alınır. Manuel yedek aşağıdaki düğmeden paylaşılabilir.</Text>
        <TouchableOpacity style={styles.submitBtn} onPress={downloadBackup}><Text style={styles.submitBtnText}>MANUEL SUNUCU YEDEĞİ AL</Text></TouchableOpacity>
      </View>
    </View>
  );
}
