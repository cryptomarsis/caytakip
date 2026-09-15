import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { validateSeasonReminderSettings } from '../../shared/seasonReminders';
import { SEASON_NOTIFICATION } from '../../shared/notificationMessages';
import { loadSeasonReminderPolicy, saveSeasonReminderPolicy, type SeasonReminderPolicy, type SeasonPolicyRequest } from '../services/seasonReminderPolicy';
import { refreshDailyReminderPolicy } from '../services/dailyReminder';
import { styles } from '../styles/styles';
import DatePickerField from './date-picker-field';
import TimePickerField from './time-picker-field';

const dateLabel = (value: string) => value.split('-').reverse().join('.');
const dateValue = (value: string) => value.split('.').reverse().map((part, i) => i ? part.padStart(2, '0') : part).join('-');
const timeLabel = (settings: SeasonReminderPolicy['settings']) => `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`;
type WebFields = { hour: string; minute: string; seasonStart: string; seasonEnd: string };
const webFieldsFor = ({ settings }: SeasonReminderPolicy): WebFields => ({
  hour: String(settings.hour).padStart(2, '0'), minute: String(settings.minute).padStart(2, '0'),
  seasonStart: dateLabel(settings.seasonStart), seasonEnd: dateLabel(settings.seasonEnd),
});

function WebPlanField({ label, value, placeholder, disabled, numeric = false, maxLength, onChange }: {
  label: string; value: string; placeholder: string; disabled: boolean; numeric?: boolean; maxLength: number; onChange: (value: string) => void;
}) {
  const theme = useTheme();
  return <View style={{ flexGrow: 1, minWidth: 120, marginBottom: 13 }}>
    <Text style={{ color: theme.colors.onSurface, fontWeight: '700', marginBottom: 7 }}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityState={{ disabled }} editable={!disabled} value={value} onChangeText={onChange}
      placeholder={placeholder} placeholderTextColor={theme.colors.onSurfaceVariant} inputMode={numeric ? 'numeric' : 'text'}
      autoCorrect={false} autoCapitalize="none" maxLength={maxLength}
      style={{ minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, opacity: disabled ? .6 : 1 }} />
  </View>;
}

function PolicyConfirmation({ policy, busy, onCancel, onConfirm }: {
  policy: SeasonReminderPolicy; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const theme = useTheme();
  return <View accessibilityLiveRegion="polite" style={{ padding: 16, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer, borderRadius: 14, gap: 10 }}>
    <Text accessibilityRole="header" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700', fontSize: 17 }}>Sezon planını onayla</Text>
    <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700' }}>{policy.settings.enabled
      ? `${dateLabel(policy.settings.seasonStart)} – ${dateLabel(policy.settings.seasonEnd)} · Her gün ${timeLabel(policy.settings)}`
      : 'Sezon hatırlatmaları kapalı'}</Text>
    <Text style={{ color: theme.colors.onPrimaryContainer, lineHeight: 21 }}>{policy.settings.enabled
      ? 'Bu tarih ve saat, sezon hatırlatmasını kabul eden kullanıcıların uygulamayı çevrimiçi açtıklarında alacağı ortak plandır. Hemen toplu bildirim gönderilmez.'
      : 'Yeni sezon hatırlatmaları kapatılacak. Cihazlarda önceden planlananlar uygulama çevrimiçi açılınca kaldırılır; çevrimdışı cihazlarda en fazla 14 günlük mevcut plan kalabilir.'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onCancel} style={{ minHeight: 48, minWidth: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.outline, justifyContent: 'center' }}><Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700' }}>Vazgeç</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onConfirm} style={{ minHeight: 48, minWidth: 48, padding: 14, borderRadius: 12, backgroundColor: theme.colors.primary, justifyContent: 'center' }}><Text style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>{busy ? 'Kaydediliyor…' : 'Planı kaydet'}</Text></Pressable>
    </View>
  </View>;
}

export default function AdminSeasonReminderCard(props: { userId: string; token: string; request: SeasonPolicyRequest }) {
  return <PolicyForm key={props.userId} {...props} />;
}
function PolicyForm({ userId, token, request }: { userId: string; token: string; request: SeasonPolicyRequest }) {
  const theme = useTheme();
  const [draft, setDraft] = useState<SeasonReminderPolicy | null>(null);
  const [webFields, setWebFields] = useState<WebFields | null>(null);
  const [confirmation, setConfirmation] = useState<SeasonReminderPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const confirmationRef = useRef<SeasonReminderPolicy | null>(null);
  const locked = busy || confirmation !== null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    loadSeasonReminderPolicy(token, request).then(plan => { if (active && !inFlight.current && !confirmationRef.current) { setDraft(plan); setWebFields(webFieldsFor(plan)); } })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Plan yüklenemedi.'); });
    return () => { active = false; };
  }, [token, request, attempt]);
  const update = (patch: Partial<SeasonReminderPolicy['settings']>) => {
    if (busy || inFlight.current || confirmationRef.current) return;
    setDraft(value => value ? { ...value, settings: { ...value.settings, ...patch } } : value);
    setNotice('Kaydedilmemiş değişiklikler var.'); setError('');
  };
  const updateWeb = (patch: Partial<WebFields>) => {
    if (busy || inFlight.current || confirmationRef.current) return;
    setWebFields(value => value ? { ...value, ...patch } : value);
    setNotice('Kaydedilmemiş değişiklikler var.'); setError('');
  };
  const preview = () => {
    if (!mounted.current || !draft || inFlight.current || confirmationRef.current) return;
    try {
      let settings = { ...draft.settings };
      if (Platform.OS === 'web' && webFields) {
        if (settings.enabled) {
          if (!/^\d{1,2}$/.test(webFields.hour) || !/^\d{1,2}$/.test(webFields.minute)
            || Number(webFields.hour) > 23 || Number(webFields.minute) > 59) throw Error('Saati 00–23, dakikayı 00–59 aralığında yazın.');
          if (!/^\d{2}\.\d{2}\.\d{4}$/.test(webFields.seasonStart) || !/^\d{2}\.\d{2}\.\d{4}$/.test(webFields.seasonEnd)) throw Error('Sezon tarihlerini GG.AA.YYYY biçiminde yazın; örneğin 15.05.2027.');
        }
        settings = { ...settings, hour: webFields.hour.trim() ? Number(webFields.hour) : NaN,
          minute: webFields.minute.trim() ? Number(webFields.minute) : NaN,
          seasonStart: dateValue(webFields.seasonStart), seasonEnd: dateValue(webFields.seasonEnd) };
      }
      const snapshot = { ...draft, settings: validateSeasonReminderSettings(settings) };
      confirmationRef.current = snapshot;
      setConfirmation(snapshot); setError(''); setNotice('Henüz kaydedilmedi. Aşağıdaki planı kontrol edip onaylayın.');
    } catch (failure: unknown) { setError(failure instanceof Error ? failure.message : 'Tarihleri kontrol edin.'); }
  };
  const cancelConfirmation = () => {
    if (!mounted.current || inFlight.current) return;
    confirmationRef.current = null; setConfirmation(null); setError(''); setNotice('Onay iptal edildi; değişiklikler kaydedilmedi.');
  };
  const saveConfirmed = () => {
    const snapshot = confirmationRef.current;
    if (!mounted.current || inFlight.current || !snapshot) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    void saveSeasonReminderPolicy(token, snapshot, request).then(async saved => {
      if (!mounted.current) return;
      confirmationRef.current = null; setConfirmation(null);
      setDraft(saved); setWebFields(webFieldsFor(saved)); setNotice('Ortak sezon planı sunucuya kaydedildi.');
      try { await refreshDailyReminderPolicy(userId, token, request); }
      catch { if (mounted.current) setNotice('Plan sunucuya kaydedildi; bu cihazdaki bildirimler sonraki eşitlemede güncellenecek.'); }
    }).catch((failure: unknown) => {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Plan kaydedilemedi.');
    }).finally(() => { inFlight.current = false; if (mounted.current) setBusy(false); });
  };
  return <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
    <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Otomatik sezon hatırlatması</Text>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Sezon tarihlerini ve saati bir kez belirleyin. İzin veren kullanıcılara bu aralıkta günde bir hatırlatma gösterilir; her gün elle gönderim yapmanız gerekmez. Bu planı yalnızca ana yönetici değiştirebilir.</Text>
    <View style={{ backgroundColor: theme.colors.surfaceVariant, padding: 14, borderRadius: 14, gap: 8, marginBottom: 12 }}>
      <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>Nasıl çalışır?</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>1. Tarih ve saat seçip planı onaylayın.</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>2. Kullanıcı internete bağlı giriş yaptığında plan telefonuna yüklenir. Bildirim izni ve sezon hatırlatma tercihi açık olmalıdır.</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>3. Uygulama kapalıyken de seçtiğiniz saatte telefon hatırlatır. Sezon bitince durur.</Text>
    </View>
    {!draft && !error && <ActivityIndicator color={theme.colors.primary} />}
    {draft && <>
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, color: theme.colors.onSurface }}>Sezon planını etkinleştir</Text>
        <Switch accessibilityLabel="Ortak sezon planını etkinleştir" value={draft.settings.enabled} disabled={locked} onValueChange={enabled => update({ enabled })} />
      </View>
      {Platform.OS === 'web' ? <>
        <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>24 saat biçimi. Tarihleri gün.ay.yıl olarak yazın (GG.AA.YYYY).</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <WebPlanField label="Hatırlatma saati (00–23)" value={webFields?.hour || ''} placeholder="19" numeric maxLength={2} disabled={locked} onChange={hour => updateWeb({ hour })} />
          <WebPlanField label="Dakika (00–59)" value={webFields?.minute || ''} placeholder="00" numeric maxLength={2} disabled={locked} onChange={minute => updateWeb({ minute })} />
        </View>
        <WebPlanField label="Sezon başlangıcı (GG.AA.YYYY)" value={webFields?.seasonStart || ''} placeholder="15.05.2027" maxLength={10} disabled={locked} onChange={seasonStart => updateWeb({ seasonStart })} />
        <WebPlanField label="Sezon bitişi (GG.AA.YYYY)" value={webFields?.seasonEnd || ''} placeholder="15.10.2027" maxLength={10} disabled={locked} onChange={seasonEnd => updateWeb({ seasonEnd })} />
      </> : <>
        <TimePickerField label="Günlük hatırlatma saati" hour={draft.settings.hour} minute={draft.settings.minute} disabled={locked} onChange={(hour, minute) => update({ hour, minute })} />
        <DatePickerField label="Sezon başlangıcı" value={dateLabel(draft.settings.seasonStart)} disabled={locked} onChange={value => update({ seasonStart: dateValue(value) })} />
        <DatePickerField label="Sezon bitişi" value={dateLabel(draft.settings.seasonEnd)} disabled={locked} onChange={value => update({ seasonEnd: dateValue(value) })} />
      </>}
      <View style={{ backgroundColor: theme.colors.surfaceVariant, padding: 14, borderRadius: 14, gap: 6, marginBottom: 12 }}>
        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Gönderilecek mesaj</Text>
        <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>{SEASON_NOTIFICATION.title}</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, lineHeight: 21 }}>{SEASON_NOTIFICATION.body}</Text>
      </View>
      <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Telefon en fazla 14 günlük hatırlatmayı önceden saklar; uygulama çevrimiçi açıldıkça bu süre yenilenir. İki hafta hiç açmayan kullanıcıda plan biter. Saat kullanıcının telefon saatidir. Sonraki yıl için yeni tarih girmeniz gerekir. Bu düğme anlık toplu bildirim göndermez.</Text>
      {confirmation ? <PolicyConfirmation policy={confirmation} busy={busy} onCancel={cancelConfirmation} onConfirm={saveConfirmed} />
        : <Pressable accessibilityRole="button" accessibilityHint="Kaydetmeden önce planın onay ekranını gösterir." accessibilityState={{ disabled: busy }} disabled={busy} onPress={preview} style={{ minHeight: 48, borderRadius: 14, padding: 14, alignItems: 'center', backgroundColor: theme.colors.primary }}><Text style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>{busy ? 'Güncelleniyor…' : 'Planı gözden geçir'}</Text></Pressable>}
    </>}
    {!!error && <><Text accessibilityRole="alert" style={{ color: theme.colors.error, marginTop: 12 }}>{error}</Text>{!confirmation && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { if (inFlight.current || confirmationRef.current) return; setError(''); setNotice(''); setDraft(null); setWebFields(null); setAttempt(n => n + 1); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: theme.colors.primary }}>Kayıtlı planı yeniden yükle</Text></Pressable>}</>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>{notice}</Text>}
  </View>;
}
