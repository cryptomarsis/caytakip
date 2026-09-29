import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { CaylikButton, CaylikSurface } from './caylik-ui';
import { AppIcon } from './app-icon';
import type { AuthFetch } from '../services/aiAssistant';
import { shareRequest, type ShareLink } from '../services/sharecropping';
import { shareAmounts } from '../../shared/sharecropping';
import { formatTL, parseMoney } from '../utils/format';

export default function HarvestSharePicker({ authFetch, value, onChange, kg, price, disabled }: {
  authFetch: AuthFetch; value: string; onChange: (id: string) => void; kg: string; price: string; disabled?: boolean;
}) {
  const theme = useTheme();
  const [links, setLinks] = useState<ShareLink[]>([]), [expanded, setExpanded] = useState(Boolean(value));
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void shareRequest<{ links: ShareLink[]; harvestSharing?: boolean }>(authFetch, '/sharecropping').then(result => {
      if (!active) return;
      if (!result.harvestSharing) { setLinks([]); setError('Hasat paylaşımı için sunucu güncellemesi gerekiyor.'); return; }
      setError(''); setLinks(result.links.filter(link => link.myRole === 'cropper' && link.status === 'active'));
    }).catch(() => { if (active) { setLinks([]); setError('Anlaşmalar yüklenemedi. Yeniden deneyin.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authFetch, retry]);
  const selected = links.find(link => link._id === value);
  let estimate; try { if (selected && kg && price) estimate = shareAmounts(parseMoney(kg), parseMoney(price), selected.denominator); } catch { /* incomplete input */ }
  return <CaylikSurface style={{ padding: 16, gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={disabled} onPress={() => setExpanded(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <AppIcon name="account-group-outline" color={theme.colors.primary} size={27} />
      <View style={{ flex: 1 }}><Text style={{ color: theme.colors.onSurface, fontSize: 16, fontWeight: '700' }}>Bu teslimat kiminle paylaşılıyor?</Text><Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>{selected ? `${selected.ownerName} · ${selected.label}` : value ? 'Seçilen anlaşma kontrol ediliyor' : 'Yalnızca benim kaydım'}</Text></View>
      <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} color={theme.colors.primary} />
    </Pressable>
    {(expanded || !!value) && <>
      {loading && <Text style={{ color: theme.colors.onSurfaceVariant }}>Anlaşmalar yükleniyor…</Text>}
      {!!error && <><Text style={{ color: theme.colors.error }}>{error}</Text><CaylikButton mode="text" disabled={disabled || loading} onPress={() => { setLoading(true); setRetry(v => v + 1); }}>Yeniden dene</CaylikButton></>}
      {[{ _id: '', label: 'Paylaşma', ownerName: 'Yalnızca benim kaydım' }, ...links].map(link => <Pressable key={link._id} accessibilityRole="radio" accessibilityState={{ checked: value === link._id, disabled: Boolean(disabled) }} disabled={disabled} onPress={() => onChange(link._id)} style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: value === link._id ? theme.colors.primary : theme.colors.outlineVariant, backgroundColor: value === link._id ? theme.colors.primaryContainer : theme.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>{link.label}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{link.ownerName}</Text></View>
        {value === link._id && <AppIcon name="check" color={theme.colors.primary} />}
      </Pressable>)}
      {!loading && !error && !links.length && <Text style={{ color: theme.colors.onSurfaceVariant }}>Pay Takibi’nde onaylanan anlaşmalar burada görünür.</Text>}
      {!!value && !selected && !loading && <Text style={{ color: theme.colors.error }}>Seçilen anlaşma kullanılamıyor. Kaydetmeden önce yeniden seçin.</Text>}
      {selected && <Text style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>Hasat ve Pay Takibi tek kayıtla güncellenir. Yarıcı payınız 1/{selected.denominator}; %2 kesinti sonrası{estimate ? ` ${formatTL(estimate.cropperCents / 100)}` : ''}.</Text>}
    </>}
  </CaylikSurface>;
}
