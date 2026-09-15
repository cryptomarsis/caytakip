import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { TeaLandscape, TeaWordmark } from './tea-brand';
import { AppIcon } from './app-icon';
import { caylikDesign } from '../context/app-theme';

type MobileBrandHeaderProps = {
  name: string;
  home: boolean;
  onBack: () => void;
  children?: React.ReactNode;
};

export function MobileBrandHeader({ name, home, onBack, children }: MobileBrandHeaderProps) {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const firstName = name.trim().split(/\s+/)[0];
  const compact = !home || width < 390 || fontScale > 1.2;

  return <View style={ui.header}>
    <View style={[ui.panel, { backgroundColor: theme.colors.background, borderColor: theme.colors.outlineVariant }]}>
      <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { opacity: theme.dark ? .38 : .4 }]}>
        <TeaLandscape background />
      </View>
      <View style={ui.top}>
        <View style={ui.brandRow}>
          {!home && <Pressable accessibilityRole="button" accessibilityLabel="Ana sayfaya dön" onPress={onBack} style={({ pressed }) => [ui.back, pressed && ui.pressed]}><AppIcon name="chevron-left" size={28} color={theme.colors.onBackground} /></Pressable>}
          <TeaWordmark compact={compact} />
        </View>
      </View>
      {home && <Text style={[ui.motto, { color: theme.colors.onBackground }]}>Çayının hesabı cebinde!</Text>}
      {home && <View style={ui.homeAccountRow}>
        <View style={ui.greetingBlock}>
          <Text accessibilityRole="header" style={[ui.greeting, { color: theme.colors.onBackground }]}>{firstName ? `Merhaba, ${firstName}` : 'Merhaba'}</Text>
        </View>
      </View>}
    </View>
    {React.Children.toArray(children).length > 0 && <View style={ui.status}>{children}</View>}
  </View>;
}
const ui = StyleSheet.create({
  header: { paddingHorizontal: caylikDesign.spacing.lg, paddingTop: caylikDesign.spacing.sm, paddingBottom: caylikDesign.spacing.md },
  panel: { overflow: 'hidden', borderRadius: caylikDesign.radius.lg, borderWidth: 1, padding: caylikDesign.spacing.md },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: caylikDesign.spacing.xs },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  back: { minWidth: caylikDesign.touchTarget, minHeight: caylikDesign.touchTarget, justifyContent: 'center' },
  motto: { fontFamily: caylikDesign.font.editorial, fontSize: caylikDesign.type.caption, marginTop: caylikDesign.spacing.xxs },
  homeAccountRow: { flexDirection: 'row', marginTop: caylikDesign.spacing.lg },
  greetingBlock: { flex: 1, minWidth: 132 },
  greeting: { fontSize: caylikDesign.type.title, fontWeight: '600' },
  pressed: { opacity: .72 },
  status: { gap: caylikDesign.spacing.xxs, marginTop: caylikDesign.spacing.xs },
});
