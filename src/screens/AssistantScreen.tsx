import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '../components/app-icon';
import { CaylikButton, CaylikSurface } from '../components/caylik-ui';
import { AiChatMessage, AiCreditTransaction } from '../services/aiAssistant';

const suggestions = [
  'Bu sezonki hasat ve alacak durumumu özetle.',
  'Yaş çayda verimi artırmak için nelere dikkat etmeliyim?',
  'Çay bahçesinde budama ne zaman ve nasıl yapılır?',
  'Gübreleme öncesinde hangi kontrolleri yapmalıyım?',
];

type Props = {
  messages: AiChatMessage[];
  credits: number | null;
  transactions: AiCreditTransaction[];
  busy: boolean;
  transcribing: boolean;
  error: string;
  onAsk: (message: string) => Promise<boolean>;
  onTranscribe: (audioBase64: string, mimeType: string) => Promise<string | null>;
  onClear: () => void;
  onOpenStore: () => void;
};

export default function AssistantScreen({ messages, credits, transactions, busy, transcribing, error, onAsk, onTranscribe, onClear, onOpenStore }: Props) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);

  const stopRecording = async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Ses kaydı oluşturulamadı.');
      const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
      const text = await onTranscribe(audioBase64, mimeType);
      if (text) setInput(text);
    } catch (recordingError) {
      Alert.alert('Ses kaydı alınamadı', recordingError instanceof Error ? recordingError.message : 'Lütfen tekrar deneyin.');
    } finally {
      stoppingRef.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }
  };

  const startRecording = async () => {
    if (busy || transcribing || recorderState.isRecording) return;
    if (credits !== null && credits < 6) {
      Alert.alert('Kredi yetersiz', 'Sesli soru için 6 kredi gerekiyor.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Kredi Yükle', onPress: onOpenStore },
      ]);
      return;
    }
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Mikrofon izni gerekli', 'Sesli soru sorabilmek için cihaz ayarlarından Çaylık uygulamasına mikrofon izni verin.');
        return;
      }
      await Speech.stop();
      setSpeakingId(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingTimerRef.current = setTimeout(() => { void stopRecording(); }, 20000);
    } catch (recordingError) {
      Alert.alert('Mikrofon açılamadı', recordingError instanceof Error ? recordingError.message : 'Lütfen tekrar deneyin.');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }
  };

  const toggleSpeech = async (message: AiChatMessage) => {
    if (speakingId === message.id) {
      await Speech.stop();
      setSpeakingId(null);
      return;
    }
    await Speech.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    setSpeakingId(message.id);
    Speech.speak(message.text, {
      language: 'tr-TR',
      rate: 0.9,
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  };

  useEffect(() => () => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    void Speech.stop();
  }, []);

  const submit = async (suggestion?: string) => {
    const message = String(suggestion ?? input).trim();
    if (!message || busy) return;
    if (!suggestion) setInput('');
    const sent = await onAsk(message);
    if (!sent && !suggestion) setInput(message);
  };

  return (
    <View>
      <View style={local.headerRow}>
        <View style={[local.iconWrap, { backgroundColor: theme.colors.primaryContainer }]}>
          <AppIcon name="robot-happy-outline" size={29} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[local.title, { color: theme.colors.onSurface }]}>Çaylık Asistan</Text>
          <Text style={[local.subtitle, { color: theme.colors.onSurfaceVariant }]}>Çay üretimi ve kendi kayıtlarınız hakkında yardım alın.</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Kredi yükle" onPress={onOpenStore} style={[local.creditBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
          <Text style={[local.creditValue, { color: theme.colors.onSecondaryContainer }]}>{credits === null ? '…' : credits}</Text>
          <Text style={[local.creditLabel, { color: theme.colors.onSecondaryContainer }]}>kredi</Text>
          <Text style={[local.creditAction, { color: theme.colors.primary }]}>YÜKLE</Text>
        </TouchableOpacity>
      </View>

      {credits !== null && credits <= 15 && (
        <TouchableOpacity onPress={onOpenStore} style={[local.lowCredit, { backgroundColor: theme.colors.errorContainer }]}>
          <AppIcon name="alert-circle-outline" size={20} color={theme.colors.error} />
          <Text style={[local.lowCreditText, { color: theme.colors.onErrorContainer }]}>Krediniz azalıyor. Kesintisiz kullanmak için kredi yükleyin.</Text>
          <Text style={[local.lowCreditLink, { color: theme.colors.error }]}>Paketler ›</Text>
        </TouchableOpacity>
      )}

      {messages.length === 0 && (
        <CaylikSurface style={local.introCard}>
          <View style={local.cardInner}>
            <Text style={[local.cardTitle, { color: theme.colors.onSurface }]}>Size nasıl yardımcı olabilirim?</Text>
            <Text style={[local.cardText, { color: theme.colors.onSurfaceVariant }]}>Bir konu seçin veya sorunuzu aşağıya yazın. Yanıtın uzunluğuna ve kullanılan yapay zekâ maliyetine göre kredi düşer.</Text>
            {suggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion}
                disabled={busy}
                onPress={() => void submit(suggestion)}
                style={[local.suggestion, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}
              >
                <AppIcon name="sprout-outline" size={18} color={theme.colors.primary} />
                <Text style={[local.suggestionText, { color: theme.colors.onSurface }]}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </CaylikSurface>
      )}

      {messages.map((message) => {
        const mine = message.role === 'user';
        return (
          <View key={message.id} style={[local.messageRow, mine ? local.messageRowMine : local.messageRowAssistant]}>
            <View style={[
              local.messageBubble,
              mine ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline, borderWidth: 1 },
            ]}>
              <Text style={[local.messageText, { color: mine ? theme.colors.onPrimary : theme.colors.onSurface }]}>{message.text}</Text>
              {!mine && (
                <TouchableOpacity onPress={() => void toggleSpeech(message)} style={local.speechButton} accessibilityRole="button" accessibilityLabel="Asistan yanıtını sesli dinle">
                  <AppIcon name={speakingId === message.id ? 'stop-circle-outline' : 'volume-high'} size={17} color={theme.colors.primary} />
                  <Text style={[local.speechButtonText, { color: theme.colors.primary }]}>{speakingId === message.id ? 'Durdur' : 'Sesli Dinle'}</Text>
                </TouchableOpacity>
              )}
              {!mine && message.creditsUsed ? (
                <Text style={[local.messageCost, { color: theme.colors.onSurfaceVariant }]}>{message.creditsUsed} kredi kullanıldı</Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {busy && (
        <View style={local.busyRow}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Çaylık Asistan düşünüyor…</Text>
        </View>
      )}
      {transcribing && (
        <View style={local.busyRow}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Sesiniz metne çevriliyor…</Text>
        </View>
      )}
      {!!error && <Text style={[local.error, { color: theme.colors.error, backgroundColor: theme.colors.errorContainer }]}>{error}</Text>}

      <CaylikSurface style={local.composerCard}>
        <View style={local.cardInner}>
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={!busy && !transcribing && !recorderState.isRecording}
            multiline
            maxLength={1200}
            placeholder="Çayla ilgili sorunuzu yazın…"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={[local.input, { color: theme.colors.onSurface, borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={recorderState.isRecording ? 'Ses kaydını bitir' : 'Sesli soru sor'}
            disabled={busy || transcribing}
            onPress={() => { if (recorderState.isRecording) void stopRecording(); else void startRecording(); }}
            style={[
              local.voiceButton,
              { backgroundColor: recorderState.isRecording ? theme.colors.errorContainer : theme.colors.secondaryContainer },
              (busy || transcribing) && local.disabled,
            ]}
          >
            <AppIcon name={recorderState.isRecording ? 'stop-circle' : 'microphone'} size={22} color={recorderState.isRecording ? theme.colors.error : theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[local.voiceTitle, { color: recorderState.isRecording ? theme.colors.error : theme.colors.onSecondaryContainer }]}>
                {recorderState.isRecording ? `Dinliyorum… ${Math.min(20, Math.floor((recorderState.durationMillis || 0) / 1000))} sn` : 'Sesli soru sor'}
              </Text>
              <Text style={[local.voiceHint, { color: theme.colors.onSurfaceVariant }]}>
                {recorderState.isRecording ? 'Bitirmek için dokunun' : 'En fazla 20 saniye · 6 kredi'}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={local.actionRow}>
            {messages.length > 0 && <CaylikButton icon="broom" mode="text" disabled={busy || transcribing || recorderState.isRecording} onPress={onClear} style={{ flex: 1 }}>Sohbeti Temizle</CaylikButton>}
            <CaylikButton icon="send-outline" disabled={busy || transcribing || recorderState.isRecording || input.trim().length < 2 || credits === 0} onPress={() => void submit()} style={{ flex: 1 }}>
              {busy ? 'Bekleyin' : 'Gönder'}
            </CaylikButton>
          </View>
          <Text style={[local.disclaimer, { color: theme.colors.onSurfaceVariant }]}>Sorunuz ve yanıt için gerekli sınırlı Çaylık hesap özeti OpenAI API hizmetine gönderilir. İlaç, kimyasal doz ve ciddi hastalık konularında ürün etiketi ile ziraat uzmanı değerlendirmesini esas alın.</Text>
        </View>
      </CaylikSurface>

      {transactions.length > 0 && (
        <View style={local.historyWrap}>
          <Text style={[local.historyTitle, { color: theme.colors.onSurface }]}>Son kredi hareketleri</Text>
          {transactions.slice(0, 3).map((item, index) => (
            <View key={item._id || `${item.createdAt}-${index}`} style={[local.historyRow, { borderBottomColor: theme.colors.outline }]}>
              <Text style={[local.historyDescription, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>{item.description || 'Kredi hareketi'}</Text>
              <Text style={[local.historyAmount, { color: item.amount >= 0 ? theme.colors.primary : theme.colors.error }]}>{item.amount > 0 ? '+' : ''}{item.amount}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconWrap: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  creditBadge: { minWidth: 66, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  creditValue: { fontSize: 20, fontWeight: '900' },
  creditLabel: { fontSize: 11, fontWeight: '700' },
  creditAction: { fontSize: 9, fontWeight: '900', marginTop: 3 },
  lowCredit: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, padding: 12, marginBottom: 14 },
  lowCreditText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  lowCreditLink: { fontSize: 12, fontWeight: '900' },
  introCard: { marginBottom: 14 },
  composerCard: { marginTop: 16 },
  cardInner: { padding: 16 },
  cardTitle: { fontSize: 19, fontWeight: '900', marginBottom: 6 },
  cardText: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  suggestionText: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  messageRow: { flexDirection: 'row', marginVertical: 6 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowAssistant: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  messageText: { fontSize: 15, lineHeight: 22 },
  speechButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 9 },
  speechButtonText: { fontSize: 12, fontWeight: '800' },
  messageCost: { fontSize: 11, fontWeight: '700', marginTop: 8 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  error: { borderRadius: 10, padding: 11, marginTop: 10, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 96, maxHeight: 180, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  voiceButton: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginTop: 10 },
  voiceTitle: { fontSize: 14, fontWeight: '900' },
  voiceHint: { fontSize: 11, marginTop: 2 },
  disabled: { opacity: 0.55 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  historyWrap: { marginTop: 20 },
  historyTitle: { fontSize: 16, fontWeight: '900', marginBottom: 6 },
  historyRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  historyDescription: { flex: 1, fontSize: 13 },
  historyAmount: { fontSize: 14, fontWeight: '900', marginLeft: 12 },
});
