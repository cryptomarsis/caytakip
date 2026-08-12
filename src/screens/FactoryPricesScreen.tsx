import React, { useMemo } from 'react';
import { Text, View, TextInput, TouchableOpacity } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';

const dateValue = (value:any) => { const raw=String(value||'').trim(); const m=raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/); if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])).getTime(); const d=new Date(raw).getTime(); return Number.isNaN(d)?0:d; };

export default function FactoryPricesScreen(props: any) {
  const { factoryPrices, handleDelete, handleSaveFactoryPrice, isAdmin, priceForm, setPriceForm } = props;
  const types = ['Peşin','Haftalık','Aylık','Vadeli'];
  const latestByFactory = useMemo(() => {
    const map = new Map<string, any>();
    [...factoryPrices].sort((a,b) => dateValue(b.tarih || b.createdAt) - dateValue(a.tarih || a.createdAt)).forEach(p => {
      const firma = String(p.firma || '').trim(); if (!firma) return;
      const type = String(p.fiyatTuru || 'Peşin');
      const key = `${firma}__${type}`;
      if (!map.has(key)) map.set(key,p);
    });
    return [...map.values()];
  }, [factoryPrices]);
  const factories = useMemo(() => [...new Set<string>(factoryPrices.map((p:any): string => String(p.firma||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')), [factoryPrices]);
  const currentRows = useMemo(() => factories.map(firma => ({
    firma,
    rows: types.map(type => latestByFactory.find((p:any)=>String(p.firma||'').trim()===firma && String(p.fiyatTuru||'Peşin')===type) || null)
  })), [factories, latestByFactory]);
  const best = useMemo(() => {
    const rows = latestByFactory.filter(p => types.includes(String(p.fiyatTuru||'Peşin')));
    return rows.sort((a:any,b:any)=>Number(b.fiyat||0)-Number(a.fiyat||0))[0] || null;
  }, [latestByFactory]);

  return <View>
    <Text style={styles.sectionTitle}>Fabrika Fiyatları</Text>
    <Text style={styles.formHelp}>Her fabrikanın en güncel fiyatı burada gösterilir.</Text>
    {isAdmin && <View style={styles.formCard}>
      <Text style={styles.formTitle}>Yeni Fiyat Ekle</Text>
      <Text style={styles.label}>Fabrika</Text>
      <TextInput style={styles.input} value={priceForm.firma} onChangeText={(t)=>setPriceForm({...priceForm,firma:t})} autoCapitalize="characters" placeholder="ÇAYKUR / EFOR / DOĞUŞ" />
      <Text style={styles.label}>Fiyat (TL/KG)</Text>
      <TextInput style={styles.input} value={priceForm.fiyat} onChangeText={(t)=>setPriceForm({...priceForm,fiyat:t})} keyboardType="decimal-pad" placeholder="Örn: 35,00" />
      <Text style={styles.label}>Fiyat Türü</Text>
      <View style={styles.rowBtnGroup}>{types.map(t=><TouchableOpacity key={t} style={[styles.groupBtn,priceForm.fiyatTuru===t&&styles.groupBtnActive]} onPress={()=>setPriceForm({...priceForm,fiyatTuru:t})}><Text style={[styles.groupBtnText,priceForm.fiyatTuru===t&&styles.groupBtnTextActive]}>{t}</Text></TouchableOpacity>)}</View>
      {priceForm.fiyatTuru==='Vadeli' && <><Text style={styles.label}>Vade (Gün)</Text><TextInput style={styles.input} value={priceForm.vadeGun} onChangeText={(t)=>setPriceForm({...priceForm,vadeGun:t})} keyboardType="numeric" placeholder="Örn: 30" /></>}
      <Text style={styles.label}>Geçerlilik Başlangıcı</Text>
      <TextInput style={styles.input} value={priceForm.gecerlilikBaslangic || priceForm.tarih} onChangeText={(t)=>setPriceForm({...priceForm,tarih:t,gecerlilikBaslangic:t})} placeholder="GG.AA.YYYY" />
      <Text style={styles.label}>Açıklama</Text><TextInput style={styles.input} value={priceForm.politika} onChangeText={(t)=>setPriceForm({...priceForm,politika:t})} placeholder="Prim, vade, kampanya vb." />
      <Text style={styles.label}>Kaynak</Text><TextInput style={styles.input} value={priceForm.kaynak} onChangeText={(t)=>setPriceForm({...priceForm,kaynak:t})} placeholder="Firma duyurusu / telefon..." />
      <TouchableOpacity style={styles.submitBtn} onPress={handleSaveFactoryPrice}><Text style={styles.submitBtnText}>Fiyatı Kaydet</Text></TouchableOpacity>
    </View>}

    {best && <View style={styles.bestPriceCard}>
      <View style={styles.bestPriceIcon}><SymbolView name={{ ios: 'star.fill', android: 'star', web: 'star' }} size={22} tintColor="#9B6A20" /></View>
      <View style={{ flex: 1 }}><Text style={styles.bestPriceLabel}>En yüksek güncel fiyat</Text><Text style={styles.bestPriceValue}>{best.firma} · {formatTL(Number(best.fiyat)||0)} / KG</Text><Text style={styles.bestPriceMeta}>{best.fiyatTuru || 'Peşin'} · {formatDisplayDate(best.tarih)}</Text></View>
    </View>}

    {currentRows.length===0 ? <Text style={styles.emptyText}>Henüz fabrika fiyatı eklenmedi.</Text> : currentRows.map((f:any) => {
      const cashPrice = f.rows[0];
      const otherPrices = f.rows.slice(1).filter(Boolean);
      return <View key={f.firma} style={styles.factoryCard}>
        <View style={styles.factoryCardHeader}>
          <View style={styles.factoryIcon}><SymbolView name={{ ios: 'building.2.fill', android: 'factory', web: 'factory' }} size={21} tintColor="#246548" /></View>
          <Text style={styles.factoryName}>{f.firma}</Text>
        </View>
        {cashPrice ? <View style={styles.factoryMainPrice}>
          <View><Text style={styles.factoryPriceLabel}>Peşin fiyat</Text><Text style={styles.factoryPriceValue}>{formatTL(Number(cashPrice.fiyat)||0)} / KG</Text><Text style={styles.factoryPriceDate}>{formatDisplayDate(cashPrice.tarih)}</Text></View>
          {isAdmin && <TouchableOpacity style={styles.compactDeleteBtn} onPress={()=>handleDelete('factory-prices', cashPrice._id, 'Fiyat')}><Text style={styles.compactDeleteText}>Sil</Text></TouchableOpacity>}
        </View> : <Text style={styles.factoryEmptyPrice}>Peşin fiyat girilmemiş.</Text>}
        {otherPrices.map((p:any) => <View key={p._id} style={styles.factoryDetailRow}>
          <Text style={styles.factoryDetailLabel}>{p.fiyatTuru}</Text>
          <Text style={styles.factoryDetailValue}>{formatTL(Number(p.fiyat)||0)} / KG{p.vadeGun ? ` · ${p.vadeGun} gün` : ''}</Text>
        </View>)}
      </View>;
    })}
  </View>;
}
