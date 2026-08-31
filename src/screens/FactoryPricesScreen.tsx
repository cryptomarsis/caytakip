import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, TextInput, TouchableOpacity } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppIcon } from '../components/app-icon';
import { CaylikScreenHeader } from '../components/caylik-ui';
import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';

const dateValue = (value:any) => { const raw=String(value||'').trim(); const m=raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/); if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])).getTime(); const d=new Date(raw).getTime(); return Number.isNaN(d)?0:d; };
const PRICE_TYPES = ['Peşin', 'Haftalık', 'Aylık', 'Vadeli'] as const;

export default function FactoryPricesScreen(props: any) {
  const theme = useTheme();
  const { factoryPrices, handleDelete, handleSaveFactoryPrice, isAdmin, priceForm, setPriceForm } = props;
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
    rows: PRICE_TYPES.map(type => latestByFactory.find((p:any)=>String(p.firma||'').trim()===firma && String(p.fiyatTuru||'Peşin')===type) || null)
  })), [factories, latestByFactory]);
  const best = useMemo(() => {
    const rows = latestByFactory.filter(p => PRICE_TYPES.includes(String(p.fiyatTuru||'Peşin') as typeof PRICE_TYPES[number]));
    return rows.sort((a:any,b:any)=>Number(b.fiyat||0)-Number(a.fiyat||0))[0] || null;
  }, [latestByFactory]);
  const latestForSelectedFactory = useMemo(() => latestByFactory
    .filter((p:any) => String(p.firma || '').trim() === String(priceForm.firma || '').trim())
    .sort((a:any,b:any) => dateValue(b.tarih || b.createdAt) - dateValue(a.tarih || a.createdAt))[0] || null,
  [latestByFactory, priceForm.firma]);
  const copyLatestPrice = () => {
    if (!latestForSelectedFactory) return;
    setPriceForm({
      ...priceForm,
      firma: latestForSelectedFactory.firma || priceForm.firma,
      fiyat: String(latestForSelectedFactory.fiyat ?? '').replace('.', ','),
      fiyatTuru: latestForSelectedFactory.fiyatTuru || 'Peşin',
      vadeGun: latestForSelectedFactory.vadeGun ? String(latestForSelectedFactory.vadeGun) : '',
      politika: latestForSelectedFactory.politika || '',
      kaynak: latestForSelectedFactory.kaynak || '',
    });
  };

  return <View>
    <CaylikScreenHeader icon="factory" eyebrow="FİYAT KARŞILAŞTIRMA" title="Fabrika Fiyatları" description={isAdmin
      ? 'Her fabrikanın en güncel fiyatı burada gösterilir.'
      : 'Yönetici tarafından yayınlanan güncel alım fiyatlarını karşılaştırın.'} />
    {isAdmin && <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
      <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Yeni Fiyat Ekle</Text>
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>Fabrika</Text>
      {factories.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.factoryChips}>
        {factories.map((firma) => <TouchableOpacity
          key={firma}
          accessibilityRole="button"
          accessibilityLabel={`${firma} fabrikasını seç`}
          onPress={() => setPriceForm({ ...priceForm, firma })}
          style={[local.factoryChip, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }, priceForm.firma === firma && { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary }]}
        ><AppIcon name="factory" size={16} color={priceForm.firma === firma ? theme.colors.primary : theme.colors.onSurfaceVariant} /><Text style={[local.factoryChipText, { color: priceForm.firma === firma ? theme.colors.primary : theme.colors.onSurface }]}>{firma}</Text></TouchableOpacity>)}
      </ScrollView>}
      <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={priceForm.firma} onChangeText={(t)=>setPriceForm({...priceForm,firma:t})} autoCapitalize="characters" placeholder="ÇAYKUR / EFOR / DOĞUŞ" />
      {latestForSelectedFactory && <TouchableOpacity accessibilityRole="button" onPress={copyLatestPrice} style={[local.copyButton, { backgroundColor: theme.colors.secondaryContainer, borderColor: theme.colors.outline }]}>
        <AppIcon name="content-copy" size={19} color={theme.colors.primary} />
        <View style={{ flex: 1 }}><Text style={[local.copyTitle, { color: theme.colors.onSecondaryContainer }]}>Son fiyatı forma kopyala</Text><Text style={[local.copyText, { color: theme.colors.onSurfaceVariant }]}>{latestForSelectedFactory.fiyatTuru || 'Peşin'} · {formatTL(Number(latestForSelectedFactory.fiyat) || 0)} / KG · {formatDisplayDate(latestForSelectedFactory.tarih)}</Text></View>
      </TouchableOpacity>}
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>Fiyat (TL/KG)</Text>
      <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={priceForm.fiyat} onChangeText={(t)=>setPriceForm({...priceForm,fiyat:t})} keyboardType="decimal-pad" placeholder="Örn: 35,00" />
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>Fiyat Türü</Text>
      <View style={styles.rowBtnGroup}>{PRICE_TYPES.map(t=><TouchableOpacity key={t} style={[styles.groupBtn, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline },priceForm.fiyatTuru===t&&styles.groupBtnActive]} onPress={()=>setPriceForm({...priceForm,fiyatTuru:t})}><Text style={[styles.groupBtnText, { color: theme.colors.onSurface },priceForm.fiyatTuru===t&&styles.groupBtnTextActive]}>{t}</Text></TouchableOpacity>)}</View>
      {priceForm.fiyatTuru==='Vadeli' && <><Text style={[styles.label, { color: theme.colors.onSurface }]}>Vade (Gün)</Text><TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={priceForm.vadeGun} onChangeText={(t)=>setPriceForm({...priceForm,vadeGun:t})} keyboardType="numeric" placeholder="Örn: 30" /></>}
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>Geçerlilik Başlangıcı (GG.AA.YYYY)</Text>
      <TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={priceForm.gecerlilikBaslangic || priceForm.tarih} onChangeText={(t)=>setPriceForm({...priceForm,tarih:t,gecerlilikBaslangic:t})} placeholder="12.08.2026" />
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>Açıklama</Text><TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={priceForm.politika} onChangeText={(t)=>setPriceForm({...priceForm,politika:t})} placeholder="Prim, vade, kampanya vb." />
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>Kaynak</Text><TextInput style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={priceForm.kaynak} onChangeText={(t)=>setPriceForm({...priceForm,kaynak:t})} placeholder="Firma duyurusu / telefon..." />
      <TouchableOpacity style={styles.submitBtn} onPress={handleSaveFactoryPrice}><View style={styles.submitBtnContent}><AppIcon name="content-save-outline" size={20} color="#FFFFFF" /><Text style={styles.submitBtnText}>Fiyatı Kaydet</Text></View></TouchableOpacity>
    </View>}

    {best && <View style={[styles.bestPriceCard, { backgroundColor: theme.colors.secondaryContainer, borderColor: theme.colors.outline }]}>
      <View style={[styles.bestPriceIcon, { backgroundColor: theme.colors.secondaryContainer }]}><AppIcon name="star-four-points" size={22} color={theme.colors.secondary} /></View>
      <View style={{ flex: 1 }}><Text style={[styles.bestPriceLabel, { color: theme.colors.onSecondaryContainer }]}>En yüksek güncel fiyat</Text><Text style={[styles.bestPriceValue, { color: theme.colors.onSecondaryContainer }]}>{best.firma} · {formatTL(Number(best.fiyat)||0)} / KG</Text><Text style={[styles.bestPriceMeta, { color: theme.colors.onSurfaceVariant }]}>{best.fiyatTuru || 'Peşin'} · {formatDisplayDate(best.tarih)}</Text></View>
    </View>}

    {currentRows.length===0 ? <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Henüz fabrika fiyatı eklenmedi.</Text> : currentRows.map((f:any) => {
      const cashPrice = f.rows[0];
      const otherPrices = f.rows.slice(1).filter(Boolean);
      return <View key={f.firma} style={[styles.factoryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
        <View style={styles.factoryCardHeader}>
          <View style={[styles.factoryIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="factory" size={22} color={theme.colors.primary} /></View>
          <Text style={[styles.factoryName, { color: theme.colors.onSurface }]}>{f.firma}</Text>
        </View>
        {cashPrice ? <View style={[styles.factoryMainPrice, { backgroundColor: theme.colors.primaryContainer }]}>
          <View><Text style={[styles.factoryPriceLabel, { color: theme.colors.onSurfaceVariant }]}>Peşin fiyat</Text><Text style={[styles.factoryPriceValue, { color: theme.colors.onPrimaryContainer }]}>{formatTL(Number(cashPrice.fiyat)||0)} / KG</Text><Text style={[styles.factoryPriceDate, { color: theme.colors.onSurfaceVariant }]}>{formatDisplayDate(cashPrice.tarih)}</Text></View>
          {isAdmin && <TouchableOpacity style={styles.compactDeleteBtn} onPress={()=>handleDelete('factory-prices', cashPrice._id, 'Fiyat')}><Text style={styles.compactDeleteText}>Sil</Text></TouchableOpacity>}
        </View> : <Text style={[styles.factoryEmptyPrice, { color: theme.colors.onSurfaceVariant }]}>Peşin fiyat girilmemiş.</Text>}
        {otherPrices.map((p:any) => <View key={p._id} style={[styles.factoryDetailRow, { borderTopColor: theme.colors.outline }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.factoryDetailLabel, { color: theme.colors.onSurface }]}>{p.fiyatTuru}</Text>
            <Text style={[styles.factoryDetailValue, { color: theme.colors.onSurfaceVariant }]}>{formatTL(Number(p.fiyat)||0)} / KG{p.vadeGun ? ` · ${p.vadeGun} gün` : ''}</Text>
          </View>
          {isAdmin && <TouchableOpacity style={styles.compactDeleteBtn} onPress={()=>handleDelete('factory-prices', p._id, 'Fiyat')}><Text style={styles.compactDeleteText}>Sil</Text></TouchableOpacity>}
        </View>)}
      </View>;
    })}
  </View>;
}

const local = StyleSheet.create({
  factoryChips: { gap: 8, paddingBottom: 10 },
  factoryChip: { minHeight: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  factoryChipText: { fontSize: 13, fontWeight: '800' },
  copyButton: { minHeight: 58, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10, marginTop: -2, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  copyTitle: { fontSize: 14, fontWeight: '900' },
  copyText: { fontSize: 11, lineHeight: 16, marginTop: 2 },
});
