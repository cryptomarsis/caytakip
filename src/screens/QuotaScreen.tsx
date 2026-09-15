import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { API_URL } from '../services/api';
import { HarvestRecord } from '../types';
import { QuotaPlan, calculateQuota, eligibleRecord, linkedRecord, isCaykur, validateQuotaPlans, totalQuotaKg, withTotalQuota } from '../../shared/quota';
import { CaylikButton, CaylikScreenHeader, CaylikSurface } from '../components/caylik-ui';
import DatePickerField from '../components/date-picker-field';
import { formatDisplayDate, toServerDate, todayDisplayDate } from '../utils/format';
import { styles } from '../styles/styles';

type Props = { authFetch: (url: string, options?: RequestInit) => Promise<Response> };
type Draft = Omit<QuotaPlan, 'openingKg'> & { totalKg: string; openingKg: string };
const num = (text: string) => text.trim() ? Number(text.replace(',', '.')) : NaN;
const kg = (value: number | null) => value === null ? 'Bilgi gerekli' : `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`;
const newPlanId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function QuotaScreen({ authFetch }: Props) {
  const theme = useTheme();
  const [plans, setPlans] = useState<QuotaPlan[]>([]);
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [recordPage, setRecordPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [today, setToday] = useState(() => toServerDate(todayDisplayDate()));
  useEffect(() => {
    const refreshDate = () => setToday(toServerDate(todayDisplayDate()));
    const timer = setInterval(refreshDate, 60000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refreshDate(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const [initialFetch] = useState(() => authFetch);
  useEffect(() => {
    let active = true;
    initialFetch(`${API_URL}/quota`).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw Error(data.error || 'Kota yüklenemedi.');
      if (active) { setPlans(data.plans); setRecords(data.records); setRevision(data.revision); }
    }).catch(() => { if (active) setError('Kota bilgileri yüklenemedi. Bağlantınızı kontrol edip sayfayı yeniden açın. Sorun sürerse daha sonra tekrar deneyin.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialFetch, refresh]);
  const update = (key: keyof Draft, value: string) => setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  const edit = (plan?: QuotaPlan) => {
    setRecordPage(1);
    setDetailsOpen(false);
    setSaveError('');
    setDraft(plan ? { ...plan, totalKg: String(totalQuotaKg(plan) ?? ''), openingKg: String(plan.openingKg) } : {
      id: newPlanId(), label: '', season: '1. Sürüm', startDate: `${today.slice(0, 4)}-01-01`, endDate: `${today.slice(0, 4)}-12-31`, area: 1, quotaRate: null, dailyRate: null, dailyDate: '', totalKg: '', openingKg: '0', source: '', recordIds: [],
    });
  };
  const persist = async (next: QuotaPlan[]) => {
    setSaveError('');
    setBusy(true);
    try {
      const valid = validateQuotaPlans(next);
      const res = await authFetch(`${API_URL}/quota`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plans: valid, revision }) });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || 'Kaydedilemedi.');
      setPlans(valid); setRevision(data.revision); setDraft(null);
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Kota kaydedilemedi. Yeniden deneyin.'); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!draft) return;
    try {
      const { totalKg, ...fields } = draft;
      const p = withTotalQuota({ ...fields, openingKg: num(draft.openingKg) }, num(totalKg));
      p.recordIds = p.recordIds.filter(id => records.some(r => r._id === id && !r.quotaPlanId && eligibleRecord(p, r)));
      void persist([...plans.filter((old) => old.id !== p.id), p]);
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Toplam kotayı kontrol edin.'); }
  };
  const field = (key: keyof Draft, label: string, numeric = false, hint?: string) => <View key={key} style={local.field}>
    <Text style={[local.label, { color: theme.colors.onSurface }]}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityHint={hint} editable={!busy} style={[styles.input, local.input, { color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]} value={String(draft?.[key] ?? '')} onChangeText={(value) => update(key, value)} keyboardType={numeric ? 'decimal-pad' : 'default'} maxLength={numeric ? 14 : key === 'label' ? 80 : 240} />
    {!!hint && <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text>}
  </View>;
  const metric = (label: string, value: number | null, emphasized = false) => <View key={label} style={[local.metric, { backgroundColor: emphasized ? theme.colors.primaryContainer : theme.colors.surfaceVariant }]}>
    <Text style={[local.hint, { color: emphasized ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }]}>{label}</Text>
    <Text style={[local.metricValue, { color: emphasized ? theme.colors.onPrimaryContainer : theme.colors.onSurface }]}>{kg(value)}</Text>
  </View>;
  const unassigned = records.filter(r => isCaykur(r.firma) && !plans.some(p => eligibleRecord(p, r) && linkedRecord(p, r)));
  const assignRecord = async (record: HarvestRecord, plan: QuotaPlan) => {
    setBusy(true);
    try {
      const res = await authFetch(`${API_URL}/quota/records/${record._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quotaPlanId: plan.id }) });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || 'Cüzdan seçimi kaydedilemedi.');
      setLoading(true); setError(''); setRefresh(n => n + 1); setRecordPage(1);
    } catch (e) { Alert.alert('Teslimat bağlanamadı', e instanceof Error ? e.message : 'Yeniden deneyin.'); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 16 }}>
    <CaylikScreenHeader icon="leaf-circle-outline" title="ÇAYKUR Kota Takip" description="Kotanızı girin, kalan miktarı Çaylık takip etsin." />
    {!!saveError && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{saveError}</Text>}
    <View style={[local.notice, { backgroundColor: theme.colors.surfaceVariant }]}>
      <Text style={[local.label, { color: theme.colors.onSurface }]}>Size bildirilen bilgilerle kişisel takip</Text>
      <Text style={[local.body, { color: theme.colors.onSurfaceVariant }]}>Size bildirilen toplam kotayı KG olarak yazın. Hasat Ekle’de ÇAYKUR’a kaydettiğiniz teslimatlar ilgili cüzdanın kotasından otomatik düşer. ÇAYKUR’un resmî sistemiyle bağlantı yoktur; kalan kota günlük alım garantisi değildir.</Text>
    </View>
    {loading ? <View style={local.loading}><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.onSurfaceVariant }}>Kota planları yükleniyor…</Text></View> : error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text> : draft ? <CaylikSurface style={local.card}>
      <Text style={[local.title, { color: theme.colors.onSurface }]}>{plans.some((p) => p.id === draft.id) ? 'Kota planını düzenle' : 'Yeni kota planı'}</Text>
      <Text style={[local.body, { color: theme.colors.onSurfaceVariant }]}>Her cüzdan ve sürgün için ayrı plan oluşturun.</Text>
      <View style={local.section}>
        {field('label', 'Cüzdan adı', false, 'Ayırt edebileceğiniz kısa bir ad yazın; tam kimlik numarası girmeyin.')}
        <Text style={[local.label, { color: theme.colors.onSurface }]}>Sürgün</Text>
        <View style={local.actions}>{[1, 2, 3, 4].map((n) => <CaylikButton key={n} disabled={busy} style={local.seasonButton} mode={draft.season === `${n}. Sürüm` ? 'contained' : 'outlined'} onPress={() => { update('season', `${n}. Sürüm`); setRecordPage(1); }}>{n}. sürgün</CaylikButton>)}</View>
        {field('totalKg', 'Toplam kota (KG)', true, 'Bu cüzdanın seçtiğiniz sürgündeki toplam hakkını girin; kalan miktarı değil.')}
        <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>Dönem: {formatDisplayDate(draft.startDate)} – {formatDisplayDate(draft.endDate)}. Yalnızca seçili sürgünün teslimatları sayılır.</Text>
      </View>
      <CaylikButton mode="text" disabled={busy} onPress={() => setDetailsOpen(value => !value)}>{detailsOpen ? 'Ek bilgileri kapat' : 'Dönem / önceki teslimatlar (isteğe bağlı)'}</CaylikButton>
      {detailsOpen && <View style={[local.section, local.divider, { borderColor: theme.colors.outlineVariant }]}>
        {(['startDate', 'endDate'] as const).map((key, i) => <DatePickerField key={key} disabled={busy} label={['Dönem başlangıcı', 'Dönem bitişi'][i]} value={formatDisplayDate(draft[key])} onChange={(value) => update(key, toServerDate(value))} />)}
        {field('openingKg', 'Uygulamada kaydı olmayan önceki teslimatlar (kg)', true, 'Yalnızca bu sürgünde daha önce verdiğiniz ve Hasat Ekle’de kaydı bulunmayan miktarı girin. Kayıtlı teslimatları buraya tekrar eklemeyin.')}
        {field('source', 'Not (isteğe bağlı)')}
      </View>}
      {Number(draft.openingKg) > 0 && !detailsOpen && <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>Önceki teslimatlar: {kg(Number(draft.openingKg))}. Bu miktar da kotadan düşülür; ek bilgilerden düzenleyebilirsiniz.</Text>}
      <CaylikButton disabled={busy} onPress={save}>{busy ? 'Kaydediliyor…' : 'Kota planını kaydet'}</CaylikButton>
      <CaylikButton mode="text" disabled={busy} onPress={() => setDraft(null)}>Vazgeç</CaylikButton>
    </CaylikSurface> : <>
      {!plans.length && <CaylikSurface style={local.card}>
        <Text style={[local.title, { color: theme.colors.onSurface }]}>İlk kota planınızı oluşturun</Text>
        <Text style={[local.body, { color: theme.colors.onSurfaceVariant }]}>Cüzdana bir ad verin, sürgünü seçin ve toplam kotanızı yazın. Sonraki teslimatları Hasat Ekle’den girmeniz yeterli.</Text>
      </CaylikSurface>}
      {!!plans.length && <Text style={[local.sectionTitle, { color: theme.colors.onSurface }]}>Kayıtlı kota planları · {plans.length}</Text>}
      {plans.map((p) => {
        const q = calculateQuota(p, records, today);
        const pendingCount = unassigned.filter(r => eligibleRecord(p, r) && r.tarih! <= today).length;
        const totalQuota = totalQuotaKg(p);
        return <CaylikSurface key={p.id} style={local.card}>
          <View style={local.section}>
            <Text style={[local.title, { color: theme.colors.onSurface }]}>{p.label}</Text>
            <Text style={[local.label, { color: theme.colors.primary }]}>{p.season.replace('Sürüm', 'sürgün')}</Text>
            <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>{formatDisplayDate(p.startDate)} – {formatDisplayDate(p.endDate)}</Text>
          </View>
          <View style={local.section}>
            <Text style={[local.sectionTitle, { color: theme.colors.onSurface }]}>Sürgün kotası</Text>
            <View style={local.metrics}>{metric('Toplam kota', totalQuota)}{metric('Kullanılan', q.delivered)}{metric('Kalan kota', q.remaining, true)}</View>
            {!!totalQuota && <View accessibilityRole="progressbar" accessibilityLabel="Kota kullanımı" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(q.delivered / totalQuota * 100)) }} style={[local.progressTrack, { backgroundColor: theme.colors.surfaceVariant }]}><View style={{ width: `${Math.min(100, q.delivered / totalQuota * 100)}%`, height: '100%', backgroundColor: q.overQuota ? theme.colors.error : theme.colors.primary }} /></View>}
            {p.openingKg > 0 && <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>Kullanılan miktara, uygulama öncesi {kg(p.openingKg)} teslimatınız dahildir.</Text>}
          </View>
          {!!pendingCount && <Text accessibilityRole="alert" style={[local.body, { color: theme.colors.error }]}>{pendingCount} teslimatın cüzdanı henüz seçilmemiş; bu kayıtlar yukarıdaki hesaba dahil değil. Aşağıdan eşleştirin.</Text>}
          {(!q.active || totalQuota === null || !!q.invalid || q.overQuota) && <View accessibilityRole="alert" style={[local.notice, { backgroundColor: theme.colors.errorContainer }]}>
            {!q.active && <Text style={[local.body, { color: theme.colors.onErrorContainer }]}>Bugün bu sürgünün tarih aralığında değil.</Text>}
            {totalQuota === null && <Text style={[local.body, { color: theme.colors.onErrorContainer }]}>Toplam kotayı KG olarak ekleyin.</Text>}
            {!!q.invalid && <Text style={[local.body, { color: theme.colors.onErrorContainer }]}>{q.invalid} teslimatın KG bilgisi geçersiz. Hasat geçmişinden miktarını kontrol edin.</Text>}
            {q.overQuota && <Text style={[local.body, { color: theme.colors.onErrorContainer }]}>Kayıtlar girilen kotayı aşıyor. Kota ve önceki teslimat toplamını kontrol edin.</Text>}
          </View>}
          <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>{q.recordCount} teslimat hesaba katıldı. Yeni kayıtlar, düzenlemeler ve silmeler otomatik yansır. Bekleyen çevrimdışı kayıtlar sunucuya ulaştığında hesaba katılır.</Text>
          {!!p.source && <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>Girdiğiniz kaynak / not: {p.source}</Text>}
          <CaylikButton mode="outlined" disabled={busy} onPress={() => edit(p)}>Kota bilgilerini düzenle</CaylikButton>
          <CaylikButton mode="text" disabled={busy} onPress={() => Alert.alert('Kota planı silinsin mi?', 'Yalnızca bu plan silinir. Hasat kayıtlarınız korunur.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Planı sil', style: 'destructive', onPress: () => void persist(plans.filter((item) => item.id !== p.id)) }])}>Planı sil</CaylikButton>
        </CaylikSurface>;
      })}
      {!!unassigned.length && <CaylikSurface style={local.card}>
        <Text style={[local.title, { color: theme.colors.onSurface }]}>Cüzdan eşleştirmesi gereken teslimatlar · {unassigned.length}</Text>
        <Text style={[local.body, { color: theme.colors.onSurfaceVariant }]}>Eski veya plansız kayıtlar rastgele bir cüzdandan düşülmez. Bunları bir kez eşleştirin. Önceki teslimat toplamına dahil ettiğiniz miktarları tekrar saymayın.</Text>
        {unassigned.slice((recordPage - 1) * 10, recordPage * 10).map(r => {
          const choices = plans.filter(p => eligibleRecord(p, r));
          return <View key={r._id} style={local.section}>
            <Text style={[local.label, { color: theme.colors.onSurface }]}>{formatDisplayDate(r.tarih)} · {kg(Number(r.kg ?? r.weight))} · {r.surum?.replace('Sürüm', 'sürgün')}</Text>
            {choices.map(p => <CaylikButton key={p.id} mode="outlined" disabled={busy} onPress={() => Alert.alert('Cüzdana bağla', `${p.label} cüzdanına eklenecek. Bu miktar önceki teslimat toplamınızda varsa çift sayımı önlemek için o toplamı önce düzeltin.`, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Cüzdana bağla', onPress: () => void assignRecord(r, p) }])}>{p.label}</CaylikButton>)}
            {!choices.length && <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>Bu tarih ve sürgüne uygun kota planı ekleyin.</Text>}
          </View>;
        })}
        {unassigned.length > 10 && <View style={local.actions}>
          <CaylikButton mode="outlined" disabled={busy || recordPage <= 1} onPress={() => setRecordPage(p => p - 1)}>Önceki</CaylikButton>
          <Text style={{ color: theme.colors.onSurface }}>Sayfa {recordPage} / {Math.ceil(unassigned.length / 10)}</Text>
          <CaylikButton mode="outlined" disabled={busy || recordPage * 10 >= unassigned.length} onPress={() => setRecordPage(p => p + 1)}>Sonraki</CaylikButton>
        </View>}
      </CaylikSurface>}
      <CaylikButton disabled={busy || plans.length >= 20} onPress={() => edit()}>Cüzdan / sürgün planı ekle</CaylikButton>
      {plans.length >= 20 && <Text style={[local.hint, { color: theme.colors.onSurfaceVariant }]}>En fazla 20 plan kaydedilebilir. Yeni plan için artık kullanmadığınız bir planı silebilirsiniz; hasat kayıtları korunur.</Text>}
    </>}
  </View>;
}

const local = StyleSheet.create({
  card: { padding: 18, gap: 16 },
  title: { fontSize: 21, lineHeight: 28, fontWeight: '700' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  divider: { borderTopWidth: 1, paddingTop: 18 },
  label: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 18 },
  field: { gap: 6 },
  input: { marginBottom: 0 },
  notice: { padding: 14, borderRadius: 16, gap: 6 },
  loading: { paddingVertical: 24, alignItems: 'center', gap: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: 118, minWidth: 100, padding: 12, borderRadius: 14, gap: 6 },
  metricValue: { fontSize: 18, lineHeight: 25, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seasonButton: { flexGrow: 1, flexBasis: 110 },
  actionButton: { flexGrow: 1, flexBasis: 120 },
  record: { minHeight: 56, justifyContent: 'center', borderBottomWidth: 1, paddingVertical: 12 },
});
