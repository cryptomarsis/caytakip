import React, { useMemo, useState } from 'react';
import { Alert, Share, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { formatTL, formatDisplayDate, parseMoney } from '../utils/format';
import { HarvestRecord, ExpenseRecord } from '../types';
import { styles } from '../styles/styles';
type Props = { harvests: HarvestRecord[]; expenses: ExpenseRecord[]; currentUser?: unknown };

const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const dateOf = (value?: string) => {
  if (!value) return null;
  const raw = String(value).trim();
  const m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};
const yearOf = (v?: string) => dateOf(v)?.getFullYear() || null;
const monthOf = (v?: string) => dateOf(v)?.getMonth() ?? null;
const kgOf = (h: HarvestRecord) => parseMoney(h.kg ?? h.weight ?? 0);
const priceOf = (h: HarvestRecord) => parseMoney(h.fiyat ?? 0);
const saleOf = (h: HarvestRecord) => kgOf(h) * priceOf(h);
const paidOf = (h: HarvestRecord) => parseMoney(h.tahsilat ?? 0);

export default function ReportsScreen({ harvests, expenses }: Props) {
  const years = useMemo(() => {
    const values = new Set<number>();
    harvests.forEach(h => { const y = yearOf(h.tarih); if (y) values.add(y); });
    expenses.forEach(e => { const y = yearOf(e.tarih); if (y) values.add(y); });
    values.add(new Date().getFullYear());
    return [...values].sort((a,b) => b-a);
  }, [harvests, expenses]);
  const [year, setYear] = useState(new Date().getFullYear());
  const selected = harvests.filter(h => yearOf(h.tarih) === year);
  const selectedExpenses = expenses.filter(e => yearOf(e.tarih) === year);
  const totalKg = selected.reduce((s,h) => s + kgOf(h), 0);
  const totalSales = selected.reduce((s,h) => s + saleOf(h), 0);
  const totalPaid = selected.reduce((s,h) => s + paidOf(h), 0);
  const totalExpenses = selectedExpenses.reduce((s,e) => s + parseMoney(e.tutar ?? 0), 0);
  const receivable = Math.max(0, totalSales - totalPaid);
  const monthly = Array.from({length:12}, (_, i) => {
    const hs = selected.filter(h => monthOf(h.tarih) === i);
    return { month:i, kg:hs.reduce((s,h)=>s+kgOf(h),0), sales:hs.reduce((s,h)=>s+saleOf(h),0) };
  });
  const maxMonthlyKg = Math.max(...monthly.map(x => x.kg), 1);

  const versions = useMemo(() => {
    const map = new Map<string, number>();
    selected.forEach(h => {
      const name = String(h.surum || 'Sürüm Belirtilmedi').trim();
      map.set(name, (map.get(name) || 0) + kgOf(h));
    });
    const order = ['1. Sürüm','2. Sürüm','3. Sürüm','4. Sürüm'];
    return [...map.entries()].map(([name, kg]) => ({name, kg}))
      .sort((a,b) => {
        const ai = order.indexOf(a.name), bi = order.indexOf(b.name);
        if (ai >= 0 && bi >= 0) return ai-bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.name.localeCompare(b.name, 'tr');
      });
  }, [selected]);
  const maxVersionKg = Math.max(...versions.map(x => x.kg), 1);

  const factorySales = useMemo(() => {
    const map = new Map<string,{name:string;kg:number;sales:number;paid:number;remaining:number}>();
    selected.forEach(h => {
      const name = String(h.firma || 'Belirtilmeyen Fabrika').trim();
      const row = map.get(name) || {name,kg:0,sales:0,paid:0,remaining:0};
      row.kg += kgOf(h); row.sales += saleOf(h); row.paid += paidOf(h);
      row.remaining += Math.max(0, saleOf(h)-paidOf(h)); map.set(name,row);
    });
    return [...map.values()].sort((a,b)=>b.kg-a.kg);
  }, [selected]);

  const gardenHarvests = useMemo(() => {
    const map = new Map<string,{name:string;kg:number;sales:number}>();
    selected.forEach(h => {
      const name = String(h.garden || h.bahce || 'Bahçesi belirtilmeyen').trim() || 'Bahçesi belirtilmeyen';
      const row = map.get(name) || { name, kg: 0, sales: 0 };
      row.kg += kgOf(h);
      row.sales += saleOf(h);
      map.set(name, row);
    });
    return [...map.values()].sort((a,b) => b.kg - a.kg);
  }, [selected]);
  const maxGardenKg = Math.max(...gardenHarvests.map(g => g.kg), 1);

  const exportCSV = async () => {
    const esc = (v:unknown) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const rows = [
      ['Tarih','Sürüm','Üretici','KG','Fabrika','Fiyat','Satış','Tahsilat','Kalan','Bahçe','Vade Tarihi'],
      ...selected.map(h => [formatDisplayDate(h.tarih), h.surum, h.producerName || h.uretici, kgOf(h), h.firma, priceOf(h), saleOf(h), paidOf(h), Math.max(0,saleOf(h)-paidOf(h)), h.garden || h.bahce, formatDisplayDate(h.vadeTarihi)])
    ];
    try { await Share.share({message: rows.map(r=>r.map(esc).join(';')).join('\n'), title:`CayTakip_${year}.csv`}); }
    catch { Alert.alert('CSV','Paylaşım ekranı açılamadı.'); }
  };

  const exportXLSX = async () => {
    try {
      const XLSX = require('xlsx');
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      const rows = selected.map(h => ({
        Tarih: formatDisplayDate(h.tarih), Sürüm: h.surum || '', Üretici: h.producerName || h.uretici || '', KG: kgOf(h),
        Fabrika: h.firma || '', 'Birim Fiyat': priceOf(h), Satış: saleOf(h), Tahsilat: paidOf(h),
        Kalan: Math.max(0, saleOf(h)-paidOf(h)), Bahçe: h.garden || h.bahce || '', 'Vade Tarihi': formatDisplayDate(h.vadeTarihi)
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const gardenWs = XLSX.utils.json_to_sheet(gardenHarvests.map(g => ({
        Bahçe: g.name,
        'Toplam Hasat (KG)': g.kg,
        'Toplam Satış (TL)': g.sales
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Hasatlar');
      XLSX.utils.book_append_sheet(wb, gardenWs, 'Bahçe Özeti');
      const base64 = XLSX.write(wb, { bookType:'xlsx', type:'base64' });
      const fileUri = `${FileSystem.cacheDirectory}Caylik_${year}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri, { mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle:`Çaylık ${year} Excel` });
      else Alert.alert('Excel Hazır', fileUri);
    } catch (e) {
      Alert.alert('Excel', 'Gerçek Excel dışa aktarma için xlsx, expo-file-system ve expo-sharing paketlerini kurun.');
    }
  };

  const exportPDF = async () => {
    try {
      const Print = require('expo-print') as typeof import('expo-print');
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      const versionRows = versions.map(v => `<tr><td>${v.name}</td><td>${v.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td></tr>`).join('');
      const monthRows = monthly.map(x => `<tr><td>${months[x.month]}</td><td>${x.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td><td>${formatTL(x.sales)}</td></tr>`).join('');
      const factoryRows = factorySales.map(f => `<tr><td>${f.name}</td><td>${f.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td><td>${formatTL(f.sales)}</td></tr>`).join('');
      const gardenRows = gardenHarvests.map(g => `<tr><td>${g.name}</td><td>${g.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td><td>${formatTL(g.sales)}</td></tr>`).join('');
      const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px;color:#1b4332}h1,h2{color:#1b4332}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#e9f5ee}.cards{display:flex;flex-wrap:wrap;gap:10px}.card{border:1px solid #ddd;padding:10px;width:45%}</style></head><body><h1>Çaylık Raporu - ${year}</h1><div class="cards"><div class="card">Toplam Hasat<br><b>${totalKg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</b></div><div class="card">Toplam Satış<br><b>${formatTL(totalSales)}</b></div><div class="card">Toplam Tahsilat<br><b>${formatTL(totalPaid)}</b></div><div class="card">Vadeli Alacak<br><b>${formatTL(receivable)}</b></div><div class="card">Toplam Gider<br><b>${formatTL(totalExpenses)}</b></div></div><h2>Sürüm Bazlı Hasat</h2><table><tr><th>Sürüm</th><th>Toplam KG</th></tr>${versionRows}</table><h2>Bahçe Bazında Hasat</h2><table><tr><th>Bahçe</th><th>Toplam KG</th><th>Toplam Satış</th></tr>${gardenRows}</table><h2>Aylık Hasat</h2><table><tr><th>Ay</th><th>KG</th><th>Satış</th></tr>${monthRows}</table><h2>Fabrika Bazında Satış</h2><table><tr><th>Fabrika</th><th>KG</th><th>Satış</th></tr>${factoryRows}</table></body></html>`;
      const pdf = await Print.printToFileAsync({ html, base64: true });
      if (!pdf.base64 || !FileSystem.cacheDirectory) throw new Error('PDF dosyası hazırlanamadı.');

      // Print modülünün geçici URL'si bazı Android cihazlarda paylaşım izni vermez.
      // PDF'yi uygulamanın kendi önbelleğine yazarak paylaşılabilir bir file:// URL oluşturuyoruz.
      const fileUri = `${FileSystem.cacheDirectory}Caylik_${year}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, pdf.base64, { encoding: FileSystem.EncodingType.Base64 });
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) throw new Error('PDF dosyası telefona kaydedilemedi.');

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: `Çaylık ${year} PDF` });
      } else {
        Alert.alert('PDF Hazır', fileUri);
      }
    } catch (e:any) {
      console.error('PDF oluşturma hatası:', e);
      Alert.alert('PDF Oluşturulamadı', e?.message || 'PDF hazırlanırken beklenmeyen bir hata oluştu. Uygulamayı güncelleyip tekrar deneyin.');
    }
  };

  return <View>
    <Text style={styles.sectionTitle}>📊 RAPORLAR</Text>
    <View style={styles.rowBtnGroup}>{years.map(y=><TouchableOpacity key={y} style={[styles.groupBtn,year===y&&styles.groupBtnActive]} onPress={()=>setYear(y)}><Text style={[styles.groupBtnText,year===y&&styles.groupBtnTextActive]}>{y}</Text></TouchableOpacity>)}</View>

    <View style={styles.statsGrid}>
      <View style={styles.statCard}><Text style={styles.statValue}>{totalKg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text><Text style={styles.statLabel}>Toplam Hasat</Text></View>
      <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(totalSales)}</Text><Text style={styles.statLabel}>Toplam Satış</Text></View>
      <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(totalPaid)}</Text><Text style={styles.statLabel}>Toplam Tahsilat</Text></View>
      <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(receivable)}</Text><Text style={styles.statLabel}>Vadeli Alacak</Text></View>
      <View style={styles.statCard}><Text style={styles.statValue}>{formatTL(totalExpenses)}</Text><Text style={styles.statLabel}>Toplam Gider</Text></View>
    </View>

    <View style={styles.formCard}>
      <Text style={styles.formTitle}>🌿 Sürüm Bazlı Hasat</Text>
      {versions.length === 0 ? <Text style={styles.emptyText}>Bu yıl hasat kaydı yok.</Text> : versions.map(v => <View key={v.name} style={{marginBottom:12}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={styles.listTitle}>{v.name}</Text><Text style={styles.listSubText}>{v.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text></View><View style={{height:14,backgroundColor:'#e9ecef',borderRadius:7,overflow:'hidden'}}><View style={{width:`${Math.max(2,(v.kg/maxVersionKg)*100)}%`,height:'100%',backgroundColor:'#2d6a4f'}}/></View></View>)}
      <Text style={[styles.listSubText,{marginTop:4}]}>Grafik: Sürümlerin toplam KG karşılaştırması</Text>
    </View>

    <View style={styles.formCard}>
      <Text style={styles.formTitle}>🏡 Bahçe Bazında Hasat</Text>
      {gardenHarvests.length === 0 ? <Text style={styles.emptyText}>Bu yıl bahçe bilgisi olan hasat kaydı yok.</Text> : gardenHarvests.map(g => <View key={g.name} style={{marginBottom:12}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={styles.listTitle}>{g.name}</Text><Text style={styles.listSubText}>{g.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text></View><Text style={[styles.listSubText,{marginTop:2}]}>Toplam satış: {formatTL(g.sales)}</Text><View style={{height:12,marginTop:6,backgroundColor:'#e9ecef',borderRadius:6,overflow:'hidden'}}><View style={{width:`${Math.max(2,(g.kg/maxGardenKg)*100)}%`,height:'100%',backgroundColor:'#2d6a4f'}}/></View></View>)}
      <Text style={[styles.listSubText,{marginTop:4}]}>Her bahçeden üretilen toplam çay miktarı</Text>
    </View>

    <View style={styles.formCard}>
      <Text style={styles.formTitle}>📈 Aylık Hasat Grafiği</Text>
      {monthly.map(x => <View key={x.month} style={{marginBottom:8}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={styles.listSubText}>{months[x.month]}</Text><Text style={styles.listSubText}>{x.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text></View><View style={{height:10,backgroundColor:'#e9ecef',borderRadius:5,overflow:'hidden'}}><View style={{width:`${Math.max(x.kg?2:0,(x.kg/maxMonthlyKg)*100)}%`,height:'100%',backgroundColor:'#40916c'}}/></View></View>)}
    </View>

    <View style={styles.formCard}><Text style={styles.formTitle}>🏭 Fabrika Bazında Satış</Text>{factorySales.length===0?<Text style={styles.emptyText}>Bu yıl fabrika satış kaydı yok.</Text>:factorySales.map(f=><View key={f.name} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#eee'}}><Text style={styles.listTitle}>{f.name}</Text><Text style={styles.listSubText}>⚖️ {f.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG • 💰 {formatTL(f.sales)}</Text><Text style={{color:f.remaining>0?'#d62828':'#2b9348',fontWeight:'bold'}}>Kalan: {formatTL(f.remaining)}</Text></View>)}</View>

    <View style={styles.formCard}><Text style={styles.formTitle}>📤 Dışa Aktarma</Text><TouchableOpacity style={styles.submitBtn} onPress={exportCSV}><Text style={styles.submitBtnText}>📋 CSV Paylaş</Text></TouchableOpacity><TouchableOpacity style={[styles.submitBtn,{marginTop:10}]} onPress={exportXLSX}><Text style={styles.submitBtnText}>📊 Excel Oluştur</Text></TouchableOpacity><TouchableOpacity style={[styles.submitBtn,{marginTop:10}]} onPress={exportPDF}><Text style={styles.submitBtnText}>📄 PDF Oluştur</Text></TouchableOpacity></View>
  </View>;
}
