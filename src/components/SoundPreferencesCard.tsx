import React, { useEffect, useState } from 'react';
import { Alert, Platform, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { getSoundPreferences, saveSoundPreferences, SoundPreferences } from '../services/soundPreferences';
import { playFeedbackSound, stopFeedbackSound } from '../services/feedbackSounds';
import { styles } from '../styles/styles';
import { syncDailyReminder } from '../services/dailyReminder';

export default function SoundPreferencesCard({ userId, onDueSoundChange }: { userId: string; onDueSoundChange?: () => Promise<void> }) {
  const theme = useTheme();
  const [prefs, setPrefs] = useState<SoundPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getSoundPreferences(userId).then((value) => { if (active) setPrefs(value); });
    return () => { active = false; stopFeedbackSound(); };
  }, [userId]);
  const change = async (kind: keyof SoundPreferences, value: boolean) => {
    if (!prefs) return;
    setBusy(true); stopFeedbackSound();
    try {
      const next = { ...prefs, [kind]: value };
      await saveSoundPreferences(userId, next);
      setPrefs(next);
      if (kind === 'due') await onDueSoundChange?.();
      if (kind === 'season') await syncDailyReminder(userId);
    } catch {
      Alert.alert('Ses tercihi', 'Değişiklik tamamen uygulanamadı. Tekrar deneyin. Bildirimleri telefon ayarlarından da sessize alabilirsiniz.');
    } finally { setBusy(false); }
  };
  return <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
    <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>İşlem ve bildirim sesleri</Text>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Hasat kutlamasının sesi ve tahsilat sesi varsayılan olarak açıktır; yalnızca sunucu işlemi onaylayınca çalar. Aşağıdan ayrı ayrı kapatabilirsiniz. İşlem sesleri cihazın medya ses düzeyine ve iOS’ta sessiz moduna bağlıdır. Bildirimlerde telefonun bildirim tercihleri de geçerlidir.</Text>
    {([['harvest', 'Hasat kayıt sesi'], ['payment', 'Ödeme alındı sesi'], ['due', 'Vade ve gecikme uyarı sesi'], ['season', 'Sezon hatırlatma sesi']] as const).map(([kind, label]) => <View key={kind} style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, color: theme.colors.onSurface }}>{label}</Text>
        <Switch accessibilityLabel={label} value={prefs?.[kind] ?? false} disabled={!prefs || busy || Platform.OS === 'web'} onValueChange={(value) => void change(kind, value)} />
      </View>
      {kind !== 'season' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} örneğini dinle`} disabled={!prefs?.[kind] || busy || Platform.OS === 'web'} style={{ minHeight: 48, justifyContent: 'center', opacity: prefs?.[kind] ? 1 : 0.45 }} onPress={() => void playFeedbackSound(kind, userId)}>
        <Text style={{ color: theme.colors.primary }}>Sesi dinle</Text>
      </TouchableOpacity>}
    </View>)}
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Ses tercihleri size aittir; yönetici sesinizi açamaz. Sezon hatırlatması telefonun standart bildirim sesini kullanır. Bildirim sesini kapatmak uyarıyı kaldırmaz, sessiz gösterir. Android’de kanal sesi telefon ayarlarından ayrıca değiştirilebilir. “Sesi dinle” yalnızca uygulama içi örnektir, sistem bildirimi testi değildir.</Text>
    {Platform.OS === 'web' && <Text style={{ color: theme.colors.onSurfaceVariant }}>Sesleri kurulu iOS/Android uygulamasından yönetebilirsiniz.</Text>}
  </View>;
}
