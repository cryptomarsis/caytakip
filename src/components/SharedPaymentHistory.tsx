import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { CaylikButton, CaylikSurface } from './caylik-ui';
import type { HarvestRecord } from '../types';
import { formatDisplayDate, formatTL } from '../utils/format';

export default function SharedPaymentHistory({ rows }: { rows: HarvestRecord[] }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const items = rows.flatMap(row => (row.sharedCollectionHistory || []).flatMap(p => p.changes.map((h, i) => ({ ...h, key: `${p.paymentId}:${i}`, firma: row.firma })))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!items.length) return null;
  return <View style={{ gap: 8 }}>
    <CaylikButton size="compact" mode="text" onPress={() => setOpen(!open)}>{open ? 'Geçmişi gizle' : `Tahsilat düzeltme geçmişim (${items.length})`}</CaylikButton>
    {open && items.map(h => <CaylikSurface key={h.key} style={{ padding: 12, gap: 4 }}>
      <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>{h.firma} · {h.action === 'delete' ? 'Tahsilat silindi' : 'Tahsilat düzeltildi'}</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>{new Date(h.at).toLocaleString('tr-TR')}</Text>
      <Text style={{ color: theme.colors.onSurface }}>Önce: {formatTL(h.before.amountCents / 100)} · {formatDisplayDate(h.before.date)}{h.before.note ? ` · ${h.before.note}` : ''}</Text>
      <Text style={{ color: theme.colors.onSurface }}>Sonra: {h.action === 'delete' ? 'İptal' : `${formatTL(h.after.amountCents / 100)} · ${formatDisplayDate(h.after.date)}${h.after.note ? ` · ${h.after.note}` : ''}`}</Text>
    </CaylikSurface>)}
  </View>;
}
