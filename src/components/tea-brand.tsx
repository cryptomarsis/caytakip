import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from 'react-native-paper';
import { caylikDesign } from '../context/app-theme';

/** Bundled artwork, not a network image or a screenshot of the interface. */
export function TeaLandscape({ height, background = false }: { height?: number; background?: boolean } = {}) {
  const theme = useTheme();
  return <Image accessible={false} source={theme.dark
    ? require('../../assets/tea-landscape-engraving-dark-v1.png')
    : require('../../assets/tea-landscape-engraving-v1.png')}
    resizeMode={background ? 'cover' : 'contain'} style={[ui.landscape, height !== undefined && { height, aspectRatio: undefined }, background && ui.landscapeBackground]} />;
}

export function TeaSprig() {
  const theme = useTheme();
  return <View pointerEvents="none" accessible={false} style={{ position: 'absolute', right: 54, top: 8, opacity: .1 }}>
    <Svg width={110} height={150} viewBox="0 0 110 150">
      <Path d="M56 146Q52 72 65 4M58 116Q13 113 8 67Q46 76 58 116M57 88Q96 83 108 43Q74 48 57 88M58 62Q23 51 23 19Q51 28 58 62M61 36Q88 28 88 2Q66 9 61 36M54 112L15 74M60 83L100 50M56 56L28 27M64 30L83 9" stroke={theme.colors.primary} strokeWidth={1} fill="none" />
    </Svg>
  </View>;
}

export function TeaWordmark({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  return <View style={ui.wordmark} accessibilityLabel="Çaylık">
    <Text style={[ui.brand, { color: theme.colors.onBackground, fontSize: compact ? 36 : 52 }]}>Çaylık</Text>
    <Svg width={26} height={34} viewBox="0 0 26 34">
      <Path d="M8 31 Q12 16 22 3 Q25 17 11 20 M10 25 Q0 22 2 10 Q13 13 10 25" stroke={theme.colors.primary} strokeWidth={1.5} fill="none" />
    </Svg>
  </View>;
}
const ui = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center' },
  brand: { fontFamily: caylikDesign.font.editorial, fontWeight: '700', letterSpacing: -1.2 },
  landscape: { width: '100%', maxWidth: 460, aspectRatio: 1.5 },
  landscapeBackground: { ...StyleSheet.absoluteFill, height: '100%', maxWidth: undefined, aspectRatio: undefined },
});
