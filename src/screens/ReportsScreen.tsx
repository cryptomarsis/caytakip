import React, { useMemo, useState } from 'react';
import { Alert, Platform, Share, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { deductionTotalOf, formatTL, formatDisplayDate, grossTotalOf, netTotalOf, parseMoney, remainingTotalOf } from '../utils/format';
import { HarvestRecord, ExpenseRecord } from '../types';
import { styles } from '../styles/styles';
import { AppIcon } from '../components/app-icon';
import { IconHeading } from '../components/icon-heading';
import { useAppTheme } from '../context/app-theme';
import { CaylikScreenHeader } from '../components/caylik-ui';
type Props = { harvests: HarvestRecord[]; expenses: ExpenseRecord[]; currentUser?: unknown };

type DesktopBridge = {
  saveBase64File: (payload: {
    defaultFileName: string;
    base64: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  printPdf: (payload: {
    defaultFileName: string;
    html: string;
  }) => Promise<{ canceled: boolean; filePath?: string }>;
};

const getDesktopBridge = (): DesktopBridge | undefined => {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as typeof globalThis & { caylikDesktop?: DesktopBridge }).caylikDesktop;
};

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
const grossOf = (h: HarvestRecord) => grossTotalOf(h);
const deductionOf = (h: HarvestRecord) => deductionTotalOf(h);
const saleOf = (h: HarvestRecord) => netTotalOf(h);
const paidOf = (h: HarvestRecord) => parseMoney(h.tahsilat ?? 0);

export default function ReportsScreen({ harvests, expenses }: Props) {
  const { paperTheme: theme, isDark: darkCards } = useAppTheme();
  const reportCard = { backgroundColor: darkCards ? '#18251F' : '#FFFFFF', borderColor: darkCards ? '#476356' : '#DDE8DF' };
  const reportValue = { color: darkCards ? '#FFFFFF' : '#174E3A' };
  const reportLabel = { color: darkCards ? '#E5EDE7' : '#526057' };
  const years = useMemo(() => {
    const values = new Set<number>();
    harvests.forEach(h => { const y = yearOf(h.tarih); if (y) values.add(y); });
    expenses.forEach(e => { const y = yearOf(e.tarih); if (y) values.add(y); });
    values.add(new Date().getFullYear());
    return [...values].sort((a,b) => b-a);
  }, [harvests, expenses]);
  const [year, setYear] = useState(new Date().getFullYear());
  const selected = useMemo(() => harvests.filter(h => yearOf(h.tarih) === year), [harvests, year]);
  const selectedExpenses = useMemo(() => expenses.filter(e => yearOf(e.tarih) === year), [expenses, year]);
  const previousSeason = useMemo(() => harvests.filter(h => yearOf(h.tarih) === year - 1), [harvests, year]);
  const totalKg = selected.reduce((s,h) => s + kgOf(h), 0);
  const totalSales = selected.reduce((s,h) => s + saleOf(h), 0);
  const totalPaid = selected.reduce((s,h) => s + paidOf(h), 0);
  const totalExpenses = selectedExpenses.reduce((s,e) => s + parseMoney(e.tutar ?? 0), 0);
  const receivable = selected.reduce((s, h) => s + remainingTotalOf(h), 0);
  const previousKg = previousSeason.reduce((s, h) => s + kgOf(h), 0);
  const previousSales = previousSeason.reduce((s, h) => s + saleOf(h), 0);
  const changePct = (current: number, previous: number) => previous ? Math.round(((current - previous) / previous) * 100) : null;
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
    const map = new Map<string,{name:string;kg:number;sales:number;paid:number;remaining:number;records:number}>();
    selected.forEach(h => {
      const name = String(h.firma || 'Belirtilmeyen Fabrika').trim();
      const row = map.get(name) || {name,kg:0,sales:0,paid:0,remaining:0,records:0};
      row.kg += kgOf(h); row.sales += saleOf(h); row.paid += paidOf(h);
      row.records += 1;
      row.remaining += remainingTotalOf(h); map.set(name,row);
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
      ['Tarih','Sürüm','Üretici','KG','Fabrika','Brüt Birim Fiyat','Brüt Satış','%2 Kesinti','Net Satış','Tahsilat','Kalan','Bahçe','Vade Tarihi'],
      ...selected.map(h => [formatDisplayDate(h.tarih), h.surum, h.producerName || h.uretici, kgOf(h), h.firma, priceOf(h), grossOf(h), deductionOf(h), saleOf(h), paidOf(h), remainingTotalOf(h), h.garden || h.bahce, formatDisplayDate(h.vadeTarihi)])
    ];
    const content = rows.map(r=>r.map(esc).join(';')).join('\n');
    const desktop = getDesktopBridge();
    if (desktop) {
      try {
        const result = await desktop.saveBase64File({
          defaultFileName: `Caylik_${year}.csv`,
          base64: globalThis.btoa(unescape(encodeURIComponent(content))),
          filters: [{ name: 'CSV dosyası', extensions: ['csv'] }],
        });
        if (!result.canceled) Alert.alert('CSV Hazır', 'Dosya bilgisayarınıza kaydedildi.');
        return;
      } catch (error) {
        console.error('CSV oluşturma hatası:', error);
        Alert.alert('CSV', 'Dosya bilgisayara kaydedilemedi.');
        return;
      }
    }
    try { await Share.share({message: content, title:`CayTakip_${year}.csv`}); }
    catch { Alert.alert('CSV','Paylaşım ekranı açılamadı.'); }
  };

  const exportXLSX = async () => {
    try {
      const rows = selected.map(h => ({
        Tarih: formatDisplayDate(h.tarih), Sürüm: h.surum || '', Üretici: h.producerName || h.uretici || '', KG: kgOf(h),
        Fabrika: h.firma || '', 'Brüt Birim Fiyat': priceOf(h), 'Brüt Satış': grossOf(h), '%2 Kesinti': deductionOf(h), 'Net Satış': saleOf(h), Tahsilat: paidOf(h),
        Kalan: remainingTotalOf(h), Bahçe: h.garden || h.bahce || '', 'Vade Tarihi': formatDisplayDate(h.vadeTarihi)
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const gardenWs = XLSX.utils.json_to_sheet(gardenHarvests.map(g => ({
        Bahçe: g.name,
        'Toplam Hasat (KG)': g.kg,
        'Net Satış (TL)': g.sales
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Hasatlar');
      XLSX.utils.book_append_sheet(wb, gardenWs, 'Bahçe Özeti');
      const base64 = XLSX.write(wb, { bookType:'xlsx', type:'base64' });
      const desktop = getDesktopBridge();
      if (desktop) {
        const result = await desktop.saveBase64File({
          defaultFileName: `Caylik_${year}.xlsx`,
          base64,
          filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }],
        });
        if (!result.canceled) Alert.alert('Excel Hazır', 'Dosya bilgisayarınıza kaydedildi.');
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory}Caylik_${year}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri, { mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle:`Çaylık ${year} Excel` });
      else Alert.alert('Excel Hazır', fileUri);
    } catch {
      Alert.alert('Excel', 'Gerçek Excel dışa aktarma için xlsx, expo-file-system ve expo-sharing paketlerini kurun.');
    }
  };

  const exportPDF = async () => {
    try {
      const versionRows = versions.map(v => `<tr><td>${v.name}</td><td>${v.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td></tr>`).join('');
      const monthRows = monthly.map(x => `<tr><td>${months[x.month]}</td><td>${x.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td><td>${formatTL(x.sales)}</td></tr>`).join('');
      const factoryRows = factorySales.map(f => `<tr><td>${f.name}</td><td>${f.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td><td>${formatTL(f.sales)}</td></tr>`).join('');
      const gardenRows = gardenHarvests.map(g => `<tr><td>${g.name}</td><td>${g.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</td><td>${formatTL(g.sales)}</td></tr>`).join('');
      const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px;color:#1b4332}h1,h2{color:#1b4332}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#e9f5ee}.cards{display:flex;flex-wrap:wrap;gap:10px}.card{border:1px solid #ddd;padding:10px;width:45%}</style></head><body><h1>Çaylık Raporu - ${year}</h1><div class="cards"><div class="card">Toplam Hasat<br><b>${totalKg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</b></div><div class="card">Net Satış<br><b>${formatTL(totalSales)}</b></div><div class="card">Toplam Tahsilat<br><b>${formatTL(totalPaid)}</b></div><div class="card">Bekleyen Alacak<br><b>${formatTL(receivable)}</b></div><div class="card">Toplam Gider<br><b>${formatTL(totalExpenses)}</b></div></div><h2>Sürüm Bazlı Hasat</h2><table><tr><th>Sürüm</th><th>Toplam KG</th></tr>${versionRows}</table><h2>Bahçe Bazında Hasat</h2><table><tr><th>Bahçe</th><th>Toplam KG</th><th>Net Satış</th></tr>${gardenRows}</table><h2>Aylık Hasat</h2><table><tr><th>Ay</th><th>KG</th><th>Net Satış</th></tr>${monthRows}</table><h2>Fabrika Bazında Satış</h2><table><tr><th>Fabrika</th><th>KG</th><th>Net Satış</th></tr>${factoryRows}</table></body></html>`;
      const desktop = getDesktopBridge();
      if (desktop) {
        const result = await desktop.printPdf({ defaultFileName: `Caylik_${year}.pdf`, html });
        if (!result.canceled) Alert.alert('PDF Hazır', 'Dosya bilgisayarınıza kaydedildi.');
        return;
      }
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
    <CaylikScreenHeader icon="chart-areaspline" eyebrow="SEZON ANALİZİ" title="Raporlar" description="Hasat, satış, tahsilat ve bahçe performansınızı inceleyin." />
    <View style={styles.rowBtnGroup}>{years.map(y=><TouchableOpacity key={y} style={[styles.groupBtn,{backgroundColor:theme.colors.surfaceVariant,borderColor:theme.colors.outline},year===y&&styles.groupBtnActive]} onPress={()=>setYear(y)}><Text style={[styles.groupBtnText,{color:theme.colors.onSurface},year===y&&styles.groupBtnTextActive]}>{y}</Text></TouchableOpacity>)}</View>

    <View style={styles.statsGrid}>
      <View style={[styles.statCard,reportCard]}><Text style={[styles.statValue,reportValue]}>{totalKg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text><Text style={[styles.statLabel,reportLabel]}>Toplam Hasat</Text></View>
      <View style={[styles.statCard,reportCard]}><Text style={[styles.statValue,reportValue]}>{formatTL(totalSales)}</Text><Text style={[styles.statLabel,reportLabel]}>Net Satış</Text></View>
      <View style={[styles.statCard,reportCard]}><Text style={[styles.statValue,reportValue]}>{formatTL(totalPaid)}</Text><Text style={[styles.statLabel,reportLabel]}>Toplam Tahsilat</Text></View>
      <View style={[styles.statCard,reportCard]}><Text style={[styles.statValue,{color:darkCards?'#FFB4AB':theme.colors.error}]}>{formatTL(receivable)}</Text><Text style={[styles.statLabel,reportLabel]}>Vadeli Alacak</Text></View>
      <View style={[styles.statCard,reportCard]}><Text style={[styles.statValue,reportValue]}>{formatTL(totalExpenses)}</Text><Text style={[styles.statLabel,reportLabel]}>Toplam Gider</Text></View>
    </View>
    <View style={[styles.formCard,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outline}]}>
      <IconHeading icon="compare-horizontal" title="Sezon Karşılaştırması" compact />
      <Text style={[styles.listSubText,{color:theme.colors.onSurfaceVariant}]}>Önceki sezonla değişim</Text>
      <Text style={[styles.listTitle,{color:theme.colors.onSurface,marginTop:6}]}>Hasat: {changePct(totalKg, previousKg) === null ? 'Yeni sezon' : `${changePct(totalKg, previousKg)! >= 0 ? '+' : ''}${changePct(totalKg, previousKg)}%`} ({previousKg.toLocaleString('tr-TR')} KG)</Text>
      <Text style={[styles.listTitle,{color:theme.colors.onSurface,marginTop:4}]}>Net satış: {changePct(totalSales, previousSales) === null ? 'Yeni sezon' : `${changePct(totalSales, previousSales)! >= 0 ? '+' : ''}${changePct(totalSales, previousSales)}%`} ({formatTL(previousSales)})</Text>
    </View>

    <View style={[styles.formCard,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outline}]}>
      <IconHeading icon="leaf" title="Sürüm Bazlı Hasat" compact />
      {versions.length === 0 ? <Text style={[styles.emptyText,{color:theme.colors.onSurfaceVariant}]}>Bu yıl hasat kaydı yok.</Text> : versions.map(v => <View key={v.name} style={{marginBottom:12}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={[styles.listTitle,{color:theme.colors.onSurface}]}>{v.name}</Text><Text style={[styles.listSubText,{color:theme.colors.onSurfaceVariant}]}>{v.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text></View><View style={{height:14,backgroundColor:theme.colors.surfaceVariant,borderRadius:7,overflow:'hidden'}}><View style={{width:`${Math.max(2,(v.kg/maxVersionKg)*100)}%`,height:'100%',backgroundColor:theme.colors.primary}}/></View></View>)}
      <Text style={[styles.listSubText,{marginTop:4,color:theme.colors.onSurfaceVariant}]}>Grafik: Sürümlerin toplam KG karşılaştırması</Text>
    </View>

    <View style={[styles.formCard,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outline}]}>
      <IconHeading icon="tree" title="Bahçe Bazında Hasat" compact />
      {gardenHarvests.length === 0 ? <Text style={[styles.emptyText,{color:theme.colors.onSurfaceVariant}]}>Bu yıl bahçe bilgisi olan hasat kaydı yok.</Text> : gardenHarvests.map(g => <View key={g.name} style={{marginBottom:12}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={[styles.listTitle,{color:theme.colors.onSurface}]}>{g.name}</Text><Text style={[styles.listSubText,{color:theme.colors.onSurfaceVariant}]}>{g.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text></View><Text style={[styles.listSubText,{marginTop:2,color:theme.colors.onSurfaceVariant}]}>Toplam satış: {formatTL(g.sales)}</Text><View style={{height:12,marginTop:6,backgroundColor:theme.colors.surfaceVariant,borderRadius:6,overflow:'hidden'}}><View style={{width:`${Math.max(2,(g.kg/maxGardenKg)*100)}%`,height:'100%',backgroundColor:theme.colors.primary}}/></View></View>)}
      <Text style={[styles.listSubText,{marginTop:4,color:theme.colors.onSurfaceVariant}]}>Her bahçeden üretilen toplam çay miktarı</Text>
    </View>

    <View style={[styles.formCard,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outline}]}>
      <IconHeading icon="chart-line" title="Aylık Hasat Grafiği" compact />
      {monthly.map(x => <View key={x.month} style={{marginBottom:8}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={[styles.listSubText,{color:theme.colors.onSurfaceVariant}]}>{months[x.month]}</Text><Text style={[styles.listSubText,{color:theme.colors.onSurfaceVariant}]}>{x.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG</Text></View><View style={{height:10,backgroundColor:theme.colors.surfaceVariant,borderRadius:5,overflow:'hidden'}}><View style={{width:`${Math.max(x.kg?2:0,(x.kg/maxMonthlyKg)*100)}%`,height:'100%',backgroundColor:theme.colors.primary}}/></View></View>)}
    </View>

    <View style={[styles.formCard,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outline}]}><IconHeading icon="factory" title="Fabrika Bazında Satış" compact />{factorySales.length===0?<Text style={[styles.emptyText,{color:theme.colors.onSurfaceVariant}]}>Bu yıl fabrika satış kaydı yok.</Text>:factorySales.map(f=><View key={f.name} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:theme.colors.outline}}><Text style={[styles.listTitle,{color:theme.colors.onSurface}]}>{f.name}</Text><Text style={[styles.listSubText,{color:theme.colors.onSurfaceVariant}]}>{f.kg.toLocaleString('tr-TR',{maximumFractionDigits:2})} KG • {formatTL(f.sales)}</Text><Text style={{color:f.remaining>0?theme.colors.error:theme.colors.primary,fontWeight:'bold'}}>Kalan: {formatTL(f.remaining)}</Text></View>)}</View>

    <View style={[styles.formCard,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outline}]}><IconHeading icon="export-variant" title="Dışa Aktarma" compact /><TouchableOpacity style={styles.submitBtn} onPress={exportCSV}><View style={styles.submitBtnContent}><AppIcon name="share-variant-outline" size={20} color="#FFFFFF" /><Text style={styles.submitBtnText}>CSV PAYLAŞ</Text></View></TouchableOpacity><TouchableOpacity style={[styles.submitBtn,{marginTop:10}]} onPress={exportXLSX}><View style={styles.submitBtnContent}><AppIcon name="file-excel" size={20} color="#FFFFFF" /><Text style={styles.submitBtnText}>EXCEL OLUŞTUR</Text></View></TouchableOpacity><TouchableOpacity style={[styles.submitBtn,{marginTop:10}]} onPress={exportPDF}><View style={styles.submitBtnContent}><AppIcon name="file-pdf-box" size={20} color="#FFFFFF" /><Text style={styles.submitBtnText}>PDF OLUŞTUR</Text></View></TouchableOpacity></View>
  </View>;
}
