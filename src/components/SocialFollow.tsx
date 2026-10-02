import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppIcon, type AppIconName } from './app-icon';
import { caylikDesign } from '../context/app-theme';

const accounts: { label: string; icon: AppIconName; url: string }[] = [
  { label: 'Instagram', icon: 'instagram', url: 'https://www.instagram.com/caylikapp/' },
  { label: 'Facebook', icon: 'facebook', url: 'https://www.facebook.com/profile.php?id=61593694898641' },
];

export default function SocialFollow() {
  const theme = useTheme();
  const [error, setError] = useState('');
  const open = async (account: typeof accounts[number]) => {
    setError('');
    try { await Linking.openURL(account.url); }
    catch { setError(`${account.label} açılamadı. Lütfen tekrar deneyin.`); }
  };
  return <View style={styles.section}>
    <Text style={[styles.heading, { color: theme.colors.onSurface }]}>Çaylık’ı takip et</Text>
    <View style={styles.links}>
      {accounts.map(account => <Pressable
        key={account.label}
        accessibilityRole="link"
        accessibilityLabel={`Çaylık ${account.label} hesabını aç`}
        accessibilityHint="Uygulama dışında açılır"
        onPress={() => void open(account)}
        style={({ pressed }) => [styles.link, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }, pressed && styles.pressed]}
      >
        <AppIcon name={account.icon} size={21} color={theme.colors.primary} />
        <Text style={[styles.label, { color: theme.colors.primary }]}>{account.label}</Text>
      </Pressable>)}
    </View>
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 8, gap: 12 },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  links: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  link: { flex: 1, minWidth: 0, minHeight: caylikDesign.touchTarget, paddingHorizontal: 10, paddingVertical: 12, borderWidth: 1, borderRadius: caylikDesign.radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  error: { fontSize: 12, lineHeight: 18 },
});
