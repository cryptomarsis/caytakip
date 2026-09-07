import React from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppIcon } from './app-icon';

type Props = {
  visible: boolean;
  busy?: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

export default function AdTrackingConsentPrompt({ visible, busy = false, onAllow, onDismiss }: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onDismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(6, 20, 13, 0.48)', padding: 16 }}>
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 28,
            padding: 22,
            gap: 12,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 9,
          }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
            <AppIcon name="chart-line" size={25} color={theme.colors.primary} />
          </View>
          <Text style={{ color: theme.colors.onSurface, fontSize: 22, fontWeight: '800' }}>Çaylık’ı geliştirmemize yardımcı olun</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 15, lineHeight: 22 }}>
            Reklam kampanyalarının uygulamaya yeni kullanıcı kazandırıp kazandırmadığını ölçmek için izniniz gerekir. Hasat, ödeme, bahçe ve firma kayıtlarınız paylaşılmaz.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Reklam ölçümüne izin ver"
            disabled={busy}
            onPress={onAllow}
            style={{ minHeight: 50, marginTop: 4, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : <Text style={{ color: theme.colors.onPrimary, fontSize: 16, fontWeight: '800' }}>İzin ver</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Reklam ölçümünü daha sonra seç"
            disabled={busy}
            onPress={onDismiss}
            style={{ minHeight: 46, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '700' }}>Şimdi değil</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, lineHeight: 17, textAlign: 'center' }}>
            Tercihinizi daha sonra Ayarlar ve Gizlilik bölümünden değiştirebilirsiniz.
          </Text>
        </View>
      </View>
    </Modal>
  );
}
