import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Switch, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { dailyReminderSupported, getSeasonReminderOptIn, refreshDailyReminderPolicy, saveSeasonReminderOptIn } from '../services/dailyReminder';
import { loadSeasonReminderPolicy, type SeasonReminderPolicy, type SeasonPolicyRequest } from '../services/seasonReminderPolicy';
import { styles } from '../styles/styles';

export default function DailyReminderPreference(props: { userId: string; token: string; request: SeasonPolicyRequest }) {
  return <ReminderPreference key={props.userId} {...props} />;
}
function ReminderPreference({ userId, token, request }: { userId: string; token: string; request: SeasonPolicyRequest }) {
  const theme = useTheme();
  const [policy, setPolicy] = useState<SeasonReminderPolicy | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consentReady, setConsentReady] = useState(false);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    // Keep local opt-out usable even while the policy server is unreachable.
    getSeasonReminderOptIn(userId).then(optIn => {
      if (active) { setEnabled(optIn); setConsentReady(true); }
    }).catch(() => { if (active) setError('Bildirim tercihi okunamadı. Lütfen yeniden deneyin.'); });
    return () => { active = false; };
  }, [userId, attempt]);
  useEffect(() => {
    let active = true;
    loadSeasonReminderPolicy(token, request).then(plan => {
      if (active) setPolicy(plan);
      return refreshDailyReminderPolicy(userId, token, request);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Plan yüklenemedi.');
    });
    return () => { active = false; };
  }, [userId, token, request, attempt]);
  const change = useCallback(async (value: boolean) => {
    if (busy || !consentReady || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setPermissionDenied(false);
    try {
      const result = await saveSeasonReminderOptIn(userId, value);
      const optedIn = await getSeasonReminderOptIn(userId);
      if (!mounted.current) return;
      setEnabled(optedIn);
      if (value && !result.permissionGranted) {
        setPermissionDenied(true);
        setError('Telefonunuzda bildirim izni kapalı. İzin verdikten sonra bu tercihi tekrar açabilirsiniz.');
      }
    } catch (failure: unknown) {
      const optedIn = await getSeasonReminderOptIn(userId).catch(() => false);
      if (mounted.current) { setEnabled(optedIn); setError(failure instanceof Error ? failure.message : 'Tercih kaydedilemedi.'); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [busy, consentReady, userId]);
  const settings = policy?.settings;
  return <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[styles.formTitle, { color: theme.colors.onSurface, flex: 1, marginBottom: 0 }]}>Sezon hatırlatmalarını al</Text>
      {busy || !consentReady ? <ActivityIndicator color={theme.colors.primary} /> : <Switch accessibilityLabel="Sezon hatırlatmalarını al" value={enabled} disabled={!dailyReminderSupported} onValueChange={value => void change(value)} />}
    </View>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Sezon tarihini ve saatini yönetici belirler. Siz yalnızca bu hatırlatmaları almak isteyip istemediğinizi seçersiniz.</Text>
    {settings && <Text style={[styles.formHelp, { color: theme.colors.onSurface }]}>{settings.enabled
      ? `Yönetici planı: ${settings.seasonStart.split('-').reverse().join('.')} – ${settings.seasonEnd.split('-').reverse().join('.')}, ${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`
      : 'Şu anda etkin bir sezon planı yok.'}</Text>}
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Plan uygulamayı internete bağlı açtığınızda yenilenir; en fazla 14 gün önceden telefonunuza kurulur. Sezon bitince durur, sonraki yıl kendiliğinden başlamaz. Bu tercihi kapatmanız vade bildirimlerini etkilemez.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: 8 }}>{error}</Text>}
    {!!error && <Pressable accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }} disabled={busy} onPress={() => { setConsentReady(false); setError(''); setAttempt(n => n + 1); }}><Text style={{ color: theme.colors.primary }}>Planı yeniden yükle</Text></Pressable>}
    {permissionDenied && <Pressable accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => void Linking.openSettings().catch(() => setError('Telefon ayarları açılamadı.'))}><Text style={{ color: theme.colors.primary }}>Telefonun bildirim ayarlarını aç</Text></Pressable>}
    {!dailyReminderSupported && <Text style={{ color: theme.colors.onSurfaceVariant }}>Bildirim tercihi kurulu iOS/Android uygulamasında kullanılabilir.</Text>}
  </View>;
}
