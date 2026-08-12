import React, { useEffect, useState } from 'react';
import { Alert, Text, View, TextInput, TouchableOpacity, Switch } from 'react-native';
import { API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';
import { formatTL } from '../utils/format';

export default function AdminScreen(props: any) {
  const { adForm, ads, getAdminProducerSummary, handleDelete, handleSaveAd, setAdForm, totalKg, totalPay, totalSales, currentUser } = props;
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const loadUsers = async () => {
    if (!currentUser?.token) return;
    try {
      const res = await fetchWithTimeout(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${currentUser.token}` } });
      const data = await res.json(); if (res.ok) setUsers(Array.isArray(data) ? data : []);
    } catch {}
  };
  useEffect(() => { loadUsers(); }, [currentUser?.token]);
  const toggleUser = async (u:any, active:boolean) => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/admin/users/${u._id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json',Authorization:`Bearer ${currentUser.token}`}, body:JSON.stringify({active}) });
      if (!res.ok) { const d=await res.json().catch(()=>({})); throw new Error(d.error||'İşlem başarısız'); }
      await loadUsers();
    } catch(e:any) { Alert.alert('Hata',e.message); } finally { setBusy(false); }
  };
  const downloadBackup = async () => {
    try {
      const res=await fetchWithTimeout(`${API_URL}/admin/backup`,{headers:{Authorization:`Bearer ${currentUser.token}`}});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||'Yedek alınamadı');
      await (await import('react-native')).Share.share({message:JSON.stringify(data,null,2),title:'CayTakip_Admin_Yedek.json'});
    } catch(e:any){Alert.alert('Yedekleme',e.message);}
  };
  const filtered=users.filter(u=>`${u.name||''} ${u.phone||''}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  return <View>
    <Text style={styles.sectionTitle}>👑 YÖNETİCİ PANELİ</Text>
    <View style={styles.statsGrid}>
      <View style={styles.statCard}><Text style={styles.statValue}>{users.length}</Text><Text style={styles.statLabel}>Üretici</Text></View>
      <View style={styles.statCard}><Text style={styles.statValue}>{totalKg.toLocaleString('tr-TR')}</Text><Text style={styles.statLabel}>Toplam KG</Text></View>
      <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(totalSales)}</Text><Text style={styles.statLabel}>Toplam Satış</Text></View>
      <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(totalPay)}</Text><Text style={styles.statLabel}>Tahsilat</Text></View>
    </View>

    <View style={styles.formCard}><Text style={styles.formTitle}>👥 Üretici Yönetimi</Text><TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Ad Soyad veya telefon ara" />{filtered.length===0?<Text style={styles.emptyText}>Üretici bulunamadı.</Text>:filtered.map(u=><View key={u._id} style={styles.listItem}><View style={{flex:1}}><Text style={styles.listTitle}>{u.name||'İsimsiz Üretici'}</Text><Text style={styles.listSubText}>{u.phone} • {u.harvestCount||0} hasat • {(u.totalKg||0).toLocaleString('tr-TR')} KG</Text><Text style={styles.listSubText}>Satış: {formatTL(u.totalSales||0)} • Kalan: {formatTL(u.remaining||0)}</Text></View><Switch value={u.active!==false} onValueChange={v=>toggleUser(u,v)} disabled={busy}/></View>)}</View>

    <View style={styles.formCard}><Text style={styles.formTitle}>📢 Reklam / Admin Duyurusu</Text><Text style={styles.label}>Kategoriye "Duyuru" yazarak admin duyurusu oluşturabilirsiniz.</Text><TextInput style={styles.input} value={adForm.firma} onChangeText={(t:any)=>setAdForm({...adForm,firma:t})} placeholder="Firma / Yönetim" /><TextInput style={styles.input} value={adForm.kategori} onChangeText={(t:any)=>setAdForm({...adForm,kategori:t})} placeholder="Duyuru" /><TextInput style={styles.input} value={adForm.baslik} onChangeText={(t:any)=>setAdForm({...adForm,baslik:t})} placeholder="Başlık" /><TextInput style={styles.input} value={adForm.aciklama} onChangeText={(t:any)=>setAdForm({...adForm,aciklama:t})} placeholder="Duyuru metni" /><TouchableOpacity style={styles.submitBtn} onPress={handleSaveAd}><Text style={styles.submitBtnText}>📢 YAYINLA</Text></TouchableOpacity></View>

    {ads.map((ad:any,index:number)=><View key={ad._id||index} style={styles.adCard}><Text style={styles.adLabel}>{ad.kategori||'REKLAM'}</Text><Text style={styles.adTitle}>{ad.baslik}</Text><Text style={styles.adText}>{ad.aciklama||''}</Text><Text style={styles.adCompany}>📣 {ad.firma}{ad.telefon?` • ${ad.telefon}`:''}</Text><TouchableOpacity style={styles.deleteBtn} onPress={()=>handleDelete('ads',ad._id,'Reklam')}><Text style={styles.actionBtnText}>🗑️ Kaldır</Text></TouchableOpacity></View>)}

    <View style={styles.formCard}><Text style={styles.formTitle}>💾 Yedekleme</Text><Text style={styles.listSubText}>Sunucu tarafında 24 saatte bir otomatik yedek alınır. Manuel yedek aşağıdaki düğmeden paylaşılabilir.</Text><TouchableOpacity style={styles.submitBtn} onPress={downloadBackup}><Text style={styles.submitBtnText}>☁️ MANUEL SUNUCU YEDEĞİ AL</Text></TouchableOpacity></View>
  </View>;
}
