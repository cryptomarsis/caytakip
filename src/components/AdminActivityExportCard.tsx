import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { type UserSession } from '../types';
import { type fetchWithTimeout } from '../services/api';
import { loadActivityExport, saveActivityExport } from '../services/activityExport';
import { validateActivityRange } from '../utils/activityExport';
import { styles } from '../styles/styles';
import DatePickerField from './date-picker-field';
import { AppIcon } from './app-icon';

const displayDate = (value: string) => value.split('-').reverse().join('.');
const isoDate = (value: string) => {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) throw Error('Tarihi GG.AA.YYYY biçiminde yazın.');
  return value.split('.').reverse().join('-');
};
type Props = { currentUser: UserSession; request: typeof fetchWithTimeout };
export default function AdminActivityExportCard(props: Props) {
  return props.currentUser.role === 'admin' ? <ExportForm key={props.currentUser.userId} {...props} /> : null;
}
function ExportForm({ currentUser, request }: Props) {
  const theme = useTheme();
  const [start, setStart] = useState(() => displayDate(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)));
  const [end, setEnd] = useState(() => displayDate(new Date().toISOString().slice(0, 10)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(false), inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const download = async () => {
    if (inFlight.current || !mounted.current || currentUser.role !== 'admin') return;
    setError(''); setMessage('');
    let range;
    try { range = validateActivityRange(isoDate(start), isoDate(end)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Tarihleri kontrol edin.'); return; }
    inFlight.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    const isActive = () => mounted.current && !abort.signal.aborted;
    try {
      const report = await loadActivityExport(currentUser.token, range.start, range.end, request, abort.signal);
      if (!isActive()) return;
      await saveActivityExport(report, isActive);
      if (isActive()) setMessage(`${report.totals.userCount} kullanıcı, ${report.totals.activeUsers} kayıt giren kullanıcı ve ${report.totals.totalCount} kayıt içeren rapor hazırlandı.${report.excludedUnknownDates ? ` Tüm dönemlerde tarihi eksik/geçersiz ${report.excludedUnknownDates} kayıt bulundu; bunlar döneme atanamadığından rapora dahil edilmedi.` : ''} ${Platform.OS === 'web' ? 'Tarayıcınızın indirmeler bölümünü kontrol edin.' : 'Dosyayı paylaşım penceresinden kaydedebilirsiniz.'}`);
    } catch (failure) {
      if (isActive()) setError(failure instanceof Error ? failure.message : 'Rapor indirilemedi.');
    } finally {
      inFlight.current = false; if (isActive()) setBusy(false);
    }
  };
  const dateField = (label: string, value: string, onChange: (value: string) => void) => <View style={{ flexGrow: 1, flexBasis: 155 }}>
    {Platform.OS === 'web' ? <>
      <Text style={{ color: theme.colors.onSurface, fontWeight: '700', marginBottom: 7 }}>{label}</Text>
      <TextInput accessibilityLabel={label} accessibilityState={{ disabled: busy }} editable={!busy} value={value} onChangeText={onChange}
        placeholder="GG.AA.YYYY" placeholderTextColor={theme.colors.onSurfaceVariant} maxLength={10} autoCapitalize="none"
        style={[styles.input, { minHeight: 48, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]} />
    </> : <DatePickerField label={label} value={value} onChange={onChange} disabled={busy} />}
  </View>;
  return <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
    <Text accessibilityRole="header" style={[styles.formTitle, { color: theme.colors.onSurface }]}>Kullanım Verilerini İndir</Text>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Tüm kullanıcıların kayıt sıklığını Excel’de analiz edin. Kullanıcı bazlı özet, günlük kullanım ve rapor açıklamaları ayrı sayfalarda yer alır.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
      {dateField('Başlangıç', start, setStart)}{dateField('Bitiş', end, setEnd)}
    </View>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Tarihler UTC’ye göredir; iki tarih de dahildir. En fazla 366 gün seçilebilir. Kayıtların oluşturulma zamanı kullanılır; tıklama veya oturum süresi izlenmez.</Text>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>İsim, telefon ve finansal tutarlar paylaşılmaz. Kullanıcılar sabit kodlarla gösterilir. İndirdiğiniz dosyayı güvenli saklayın.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Kullanım raporunu Excel olarak indir" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void download()}
      style={{ minHeight: 52, borderRadius: 16, backgroundColor: theme.colors.primary, padding: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, opacity: busy ? .6 : 1 }}>
      <AppIcon name="file-excel" size={22} color={theme.colors.onPrimary} />
      <Text style={{ color: theme.colors.onPrimary, fontWeight: '800', flexShrink: 1 }}>{busy ? 'Rapor hazırlanıyor…' : 'EXCEL İNDİR'}</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginTop: 12 }}>{error}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.onSurface, marginTop: 12 }}>{message}</Text>}
  </View>;
}
