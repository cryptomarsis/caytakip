import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from 'react-native-paper';
import { AppIcon } from './app-icon';
import { caylikDesign } from '../context/app-theme';
import { styles } from '../styles/styles';

const preferenceKey = (userId: string) => `@caylik_harvest_vibration:${userId}`;
export function HarvestRewardPreference({ userId }: { userId: string }) {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(preferenceKey(userId)).then((value) => { if (active) setEnabled(value === 'true'); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);
  return <View style={[styles.formCard, { backgroundColor: theme.colors.surface }]}>
    <Text style={[styles.formTitle, { color: theme.colors.onSurface }]}>Kayıt tamamlandı efekti</Text>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Hasat ve tahsilat kaydından sonra kısa bir onay animasyonu gösterilir. Sesleri “İşlem ve bildirim sesleri” bölümünden yönetebilirsiniz.</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.sm }}>
      <Text style={{ flex: 1, color: theme.colors.onSurface }}>Kutlamaya kısa titreşim ekle</Text>
      <Switch accessibilityLabel="Başarılı hasat ve tahsilat kaydında titreşim" disabled={busy || Platform.OS === 'web'} value={enabled} onValueChange={(value) => {
        setBusy(true);
        void AsyncStorage.setItem(preferenceKey(userId), String(value)).then(() => setEnabled(value)).catch(() => undefined).finally(() => setBusy(false));
      }} />
    </View>
    <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Titreşim isteğe bağlıdır; cihaz desteğine ve hareketi azaltma ayarına göre çalışır. Kutlama, emeğinizin kayda geçtiğini belirtir; kredi veya maddi ödül verilmez.</Text>
  </View>;
}

type Props = { userId: string; kind: 'harvest' | 'payment'; value: string };

// Shared success overlay: show only after the server has accepted a new record.
export default function HarvestReward({ userId, kind, value }: Props) {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [burst] = useState(() => new Animated.Value(0));
  const [visible, setVisible] = useState(true);
  const title = kind === 'harvest' ? 'Emeğin kayda geçti!' : 'Tahsilatın kaydedildi!';
  const description = kind === 'harvest' ? 'Çayının hesabı artık cebinde.' : 'Ödemen işlendi, alacak kaydın güncellendi.';
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.announceForAccessibility(`${title} ${value}`);
    // A screen-reader user dismisses explicitly, so the result doesn't disappear while read.
    void Promise.all([
      AccessibilityInfo.isReduceMotionEnabled().catch(() => true),
      AsyncStorage.getItem(preferenceKey(userId)).catch(() => null),
      AccessibilityInfo.isScreenReaderEnabled().catch(() => true),
    ]).then(([reduced, enabled, screenReader]) => {
      if (!active) return;
      if (!reduced) {
        scale.setValue(0.8);
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 130 }),
          Animated.timing(burst, { toValue: 1, duration: 1100, useNativeDriver: true }),
        ]).start();
      }
      if (!reduced && enabled === 'true' && Platform.OS !== 'web') Vibration.vibrate(30);
      if (!screenReader) timer = setTimeout(() => setVisible(false), 3500);
    }).catch(() => undefined);
    return () => { active = false; clearTimeout(timer); scale.stopAnimation(); burst.stopAnimation(); };
  }, [userId, scale, burst, title, value]);
  if (!visible) return null;
  return <Modal transparent visible animationType="none" onRequestClose={() => setVisible(false)}>
    <SafeAreaView style={[local.overlay, { backgroundColor: theme.colors.backdrop }]}>
      <ScrollView contentContainerStyle={local.center} bounces={false}>
        <View accessibilityViewIsModal style={[local.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
          <View accessible={false} importantForAccessibility="no-hide-descendants" style={local.emblem}>
            <Animated.View style={[local.ring, { borderColor: theme.colors.primary, opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]} />
            {[-1, 1].map(direction => <Animated.View key={direction} style={[local.spark, { opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }), transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [direction * 30, direction * 90] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, -55] }) }] }]}><AppIcon name={kind === 'harvest' ? 'leaf' : 'star-four-points'} size={24} color={theme.colors.secondary} /></Animated.View>)}
            <Animated.View style={[local.icon, { backgroundColor: theme.colors.primaryContainer, transform: [{ scale }] }]}><AppIcon name="check" size={54} color={theme.colors.onPrimaryContainer} /></Animated.View>
          </View>
          <Text accessibilityRole="header" style={[local.title, { color: theme.colors.onSurface }]}>{title}</Text>
          <View style={[local.amount, { backgroundColor: theme.colors.primaryContainer }]}>
            <AppIcon name={kind === 'harvest' ? 'leaf-circle-outline' : 'wallet-outline'} size={24} color={theme.colors.onPrimaryContainer} />
            <Text style={[local.value, { color: theme.colors.onPrimaryContainer }]}>{value}</Text>
          </View>
          <Text style={[local.description, { color: theme.colors.onSurfaceVariant }]}>{description}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Onayı kapat ve devam et" onPress={() => setVisible(false)} style={[local.button, { backgroundColor: theme.colors.primary }]}><Text style={[local.buttonText, { color: theme.colors.onPrimary }]}>Devam et</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const d = caylikDesign;
const local = StyleSheet.create({
  overlay: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: d.spacing.xl },
  card: { width: '100%', maxWidth: 400, padding: d.spacing.xl, borderRadius: d.radius.xl, borderWidth: 1, alignItems: 'center', gap: d.spacing.md },
  emblem: { width: 160, height: 116, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 96, height: 96, borderRadius: d.radius.pill, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: d.radius.pill, borderWidth: 2 },
  spark: { position: 'absolute' },
  title: { fontSize: d.type.headline, fontWeight: '700', textAlign: 'center' },
  amount: { flexDirection: 'row', alignItems: 'center', gap: d.spacing.xs, padding: d.spacing.sm, borderRadius: d.radius.md, maxWidth: '100%' },
  value: { flexShrink: 1, fontSize: d.type.title, fontWeight: '700' },
  description: { fontSize: d.type.bodyLarge, textAlign: 'center' },
  button: { width: '100%', minHeight: d.touchTarget, justifyContent: 'center', alignItems: 'center', borderRadius: d.radius.md, padding: d.spacing.sm },
  buttonText: { fontSize: d.type.bodyLarge, fontWeight: '700' },
});
