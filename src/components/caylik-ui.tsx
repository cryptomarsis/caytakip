import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Snackbar, useTheme } from 'react-native-paper';
import { caylikDesign, useAppTheme } from '../context/app-theme';
import { AppIcon } from './app-icon';
import type { AppIconName } from './app-icon';

type ButtonProps = {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  mode?: 'contained' | 'outlined' | 'text';
  style?: StyleProp<ViewStyle>;
  icon?: AppIconName;
  accessibilityLabel?: string;
};

/** Ortak mobil buton: uygulamanın tüm ekranlarında aynı dokunma alanı ve renk dili kullanılır. */
export function CaylikButton({ children, onPress, disabled, mode = 'contained', style, icon, accessibilityLabel }: ButtonProps) {
  const theme = useTheme();
  const contained = mode === 'contained';
  const outlined = mode === 'outlined';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ui.button,
        contained && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        outlined && { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary },
        mode === 'text' && ui.textButton,
        disabled && ui.buttonDisabled,
        pressed && !disabled && ui.buttonPressed,
        style,
      ]}
    >
      {!!icon && <View style={[ui.buttonIcon, { backgroundColor: contained ? 'rgba(255,255,255,0.14)' : theme.colors.primaryContainer }]}><AppIcon name={icon} size={20} color={contained ? theme.colors.onPrimary : theme.colors.primary} /></View>}
      <Text style={[ui.buttonLabel, { color: contained ? theme.colors.onPrimary : theme.colors.primary }]} numberOfLines={1}>{children}</Text>
      {contained && (
        <View style={ui.buttonArrow}>
          <AppIcon name="arrow-right" size={17} color={theme.colors.onPrimary} />
        </View>
      )}
    </Pressable>
  );
}

export function CaylikScreenHeader({ icon, eyebrow = 'ÇAYLIK', title, description }: { icon: AppIconName; eyebrow?: string; title: string; description?: string }) {
  const theme = useTheme();
  return (
    <View style={ui.screenHeader}>
      <View style={[ui.screenHeaderIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name={icon} size={25} color={theme.colors.primary} /></View>
      <View style={ui.screenHeaderCopy}>
        <Text style={[ui.screenEyebrow, { color: theme.colors.primary }]}>{eyebrow}</Text>
        <Text style={[ui.screenTitle, { color: theme.colors.onBackground }]}>{title}</Text>
        {!!description && <Text style={[ui.screenDescription, { color: theme.colors.onSurfaceVariant }]}>{description}</Text>}
      </View>
    </View>
  );
}

export function CaylikSurface({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { paperTheme: theme } = useAppTheme();
  // Paper Card kendi iç yüzeyini bazı sürümlerde beyaz bırakabildiği için
  // tema yüzeylerini doğrudan View üzerinde çiziyoruz.
  return <View style={[ui.surface, style, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}><View pointerEvents="none" style={[ui.surfaceAccent, { backgroundColor: theme.colors.primary }]} />{children}</View>;
}

export function CaylikActionCard({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}) {
  const { paperTheme: theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [ui.actionCard, style, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, pressed && ui.actionCardPressed]}
    >
      {children}
    </Pressable>
  );
}

export function CaylikNotice({ visible, text, onDismiss }: { visible: boolean; text: string; onDismiss: () => void }) {
  const theme = useTheme();
  return <Snackbar visible={visible} onDismiss={onDismiss} duration={4500} style={[ui.notice, { backgroundColor: theme.colors.primary }]}>{text}</Snackbar>;
}

const ui = StyleSheet.create({
  button: {
    minHeight: 58,
    borderRadius: caylikDesign.radius.lg,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#092A1D',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  textButton: { borderWidth: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0, paddingHorizontal: 12 },
  buttonDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  buttonPressed: { transform: [{ scale: 0.985 }], opacity: 0.91, shadowOpacity: 0.05, elevation: 1 },
  buttonIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  buttonLabel: { flexShrink: 1, fontSize: 15, fontWeight: '900', letterSpacing: 0.1, textAlign: 'center' },
  buttonArrow: { width: 35, height: 35, borderRadius: 12, marginLeft: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  surface: {
    borderRadius: caylikDesign.radius.xl,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    shadowColor: '#10291F',
    shadowOpacity: 0.055,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
    overflow: 'hidden',
  },
  surfaceAccent: { position: 'absolute', top: 0, left: 24, width: 44, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, opacity: 0.85 },
  actionCard: {
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    shadowColor: '#10291F',
    shadowOpacity: 0.055,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  actionCardPressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  screenHeader: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: caylikDesign.spacing.md, marginBottom: caylikDesign.spacing.lg },
  screenHeaderIcon: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  screenHeaderCopy: { flex: 1, minWidth: 0 },
  screenEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  screenTitle: { marginTop: 3, fontSize: caylikDesign.type.headline, lineHeight: 31, fontWeight: '900', letterSpacing: -0.55 },
  screenDescription: { marginTop: 4, fontSize: caylikDesign.type.body, lineHeight: 20, fontWeight: '600' },
  notice: { backgroundColor: '#1F6B4F' },
});
