import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../context/app-theme';

/** Isolated visual prototype; intentionally not wired to navigation until approved. */
export function ApprovedDashboardPrototype({ totalKg = 0, remaining = 0, onNewHarvest }: { totalKg?: number; remaining?: number; onNewHarvest?: () => void }) {
  const { paperTheme } = useAppTheme();
  const surface = paperTheme.colors.surface;
  return <View style={{ gap: 12, padding: 16, backgroundColor: paperTheme.colors.background }}>
    <View style={{ padding: 20, borderRadius: 24, backgroundColor: paperTheme.colors.primary }}>
      <Text style={{ color: '#FFF', fontSize: 13, letterSpacing: 1.2 }}>ÇAYLIK ÖZETİ</Text>
      <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '800', marginTop: 8 }}>Sezon durumunuz</Text>
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 18 }}><Text style={{ color: '#FFF', fontSize: 24, fontWeight: '800' }}>{totalKg.toLocaleString('tr-TR')} KG</Text><Text style={{ color: '#FFF', fontSize: 24, fontWeight: '800' }}>{remaining.toLocaleString('tr-TR')} TL</Text></View>
    </View>
    <View style={{ padding: 18, borderRadius: 20, backgroundColor: surface, borderWidth: 1, borderColor: paperTheme.colors.outline }}><Text style={{ color: paperTheme.colors.onSurface, fontSize: 18, fontWeight: '700' }}>Son teslimatlar</Text><Text style={{ color: paperTheme.colors.onSurfaceVariant, marginTop: 8 }}>Gerçek kayıtlar burada listelenecek.</Text></View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Yeni hasat ekle" onPress={onNewHarvest} style={{ minHeight: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: paperTheme.colors.secondary }}><Text style={{ color: paperTheme.colors.onSecondary, fontWeight: '800', fontSize: 16 }}>+ Yeni Hasat</Text></TouchableOpacity>
  </View>;
}
