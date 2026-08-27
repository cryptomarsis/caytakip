import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Button, Snackbar, useTheme } from 'react-native-paper';
import { useAppTheme } from '../context/app-theme';

type ButtonProps = {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  mode?: 'contained' | 'outlined' | 'text';
  style?: StyleProp<ViewStyle>;
};

/** Ortak mobil buton: uygulamanın tüm ekranlarında aynı dokunma alanı ve renk dili kullanılır. */
export function CaylikButton({ children, onPress, disabled, mode = 'contained', style }: ButtonProps) {
  const theme = useTheme();
  return (
    <Button
      mode={mode}
      onPress={onPress}
      disabled={disabled}
      style={[ui.button, style]}
      contentStyle={ui.buttonContent}
      labelStyle={ui.buttonLabel}
      buttonColor={mode === 'contained' ? theme.colors.primary : undefined}
      textColor={mode === 'contained' ? theme.colors.onPrimary : theme.colors.primary}
    >
      {children}
    </Button>
  );
}

export function CaylikSurface({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { paperTheme: theme } = useAppTheme();
  // Paper Card kendi iç yüzeyini bazı sürümlerde beyaz bırakabildiği için
  // tema yüzeylerini doğrudan View üzerinde çiziyoruz.
  return <View style={[ui.surface, style, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>{children}</View>;
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
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.82}
      onPress={onPress}
      style={[ui.actionCard, style, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
    >
      {children}
    </TouchableOpacity>
  );
}

export function CaylikNotice({ visible, text, onDismiss }: { visible: boolean; text: string; onDismiss: () => void }) {
  const theme = useTheme();
  return <Snackbar visible={visible} onDismiss={onDismiss} duration={4500} style={[ui.notice, { backgroundColor: theme.colors.primary }]}>{text}</Snackbar>;
}

const ui = StyleSheet.create({
  button: { borderRadius: 12, justifyContent: 'center' },
  buttonContent: { minHeight: 48 },
  buttonLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0 },
  surface: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    shadowColor: '#173B2B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  actionCard: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    shadowColor: '#173B2B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  notice: { backgroundColor: '#1F6B4F' },
});
