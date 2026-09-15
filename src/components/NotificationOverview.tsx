import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { DUE_NOTIFICATION_RULES, SEASON_NOTIFICATION } from '../../shared/notificationMessages';
import { styles } from '../styles/styles';

export default function NotificationOverview() {
  const theme = useTheme();
  return <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
    <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Hangi bildirimler gönderilir?</Text>
    {[{ ...SEASON_NOTIFICATION, when: 'Sezonda · Yönetici planındaki saatte, en fazla günde bir kez' },
      ...DUE_NOTIFICATION_RULES.map(rule => ({ ...rule, when: `${rule.days === -2 ? 'Vadeden 2 gün önce' : rule.days === 0 ? 'Vade günü' : 'Vadeden 1 gün sonra'} · 09:00` }))].map(item => (
      <View key={item.title} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: theme.colors.outlineVariant, gap: 5 }}>
        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{item.when}</Text>
        <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>{item.title}</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, lineHeight: 21 }}>{item.body}</Text>
      </View>
    ))}
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>
      Saatler telefonun yerel saatidir. Vade mesajındaki firma ve tutar kendi kaydınızdan gelir; ödeme tamamen tahsil edilince uygulama eşitlendiğinde bu uyarılar kaldırılır. Sezon dışındayken vade uyarıları devam eder.
    </Text>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>
      Asistan için ayrı bir bildirim yoktur. Hasat ve ödeme kayıt sesleri yalnızca başarılı işlem sırasında uygulama içinde çalar; telefona ayrı bildirim göndermez.
    </Text>
  </View>;
}
