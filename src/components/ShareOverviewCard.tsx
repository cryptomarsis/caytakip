import React, { useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppIcon } from './app-icon';
import type { AuthFetch } from '../services/aiAssistant';
import { shareRequest, type ShareOverview } from '../services/sharecropping';
import { formatTL } from '../utils/format';

export default function ShareOverviewCard({ authFetch, onOpen, refreshKey }: { authFetch: AuthFetch; onOpen: () => void; refreshKey?: unknown }) {
  const theme = useTheme();
  const [rows, setRows] = useState<ShareOverview[]>([]), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, version = 0;
    const refresh = async () => {
      const request = ++version;
      try { const result = await shareRequest<{ links: ShareOverview[] }>(authFetch, '/sharecropping-summary'); if (active && version === request) { setRows(result.links.filter(link => link.status === 'active' || link.kg > 0)); setFailed(false); } }
      catch { if (active && version === request) { setRows([]); setFailed(true); } }
    };
    void refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; listener.remove(); };
  }, [authFetch, refreshKey]);
  if (!rows.length && !failed) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Pay Takibi özetini aç" onPress={onOpen} style={({ pressed }) => ({ padding: 18, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface, gap: 12, opacity: pressed ? 0.8 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><AppIcon name="account-group-outline" color={theme.colors.primary} /><Text style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '700', fontSize: 17 }}>Pay Takibi</Text><AppIcon name="chevron-right" color={theme.colors.primary} /></View>
    {failed ? <Text style={{ color: theme.colors.onSurfaceVariant }}>Özet yüklenemedi. Pay Takibi’ni açıp yeniden deneyin.</Text> : <>
      {rows.slice(0, 2).map(row => <View key={row._id} style={{ gap: 4 }}><Text style={{ color: theme.colors.onSurface, fontWeight: '600' }}>{row.myRole === 'cropper' ? row.ownerName : row.cropperName} · {row.label}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{row.kg.toLocaleString('tr-TR')} kg · Satıştan payın {formatTL(row.myShareCents / 100)}</Text></View>)}
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>Tahsilat değildir · {rows.length > 2 ? `${rows.length} anlaşmanın tümünü gör` : 'Ayrıntıları gör'}</Text>
    </>}
  </Pressable>;
}
