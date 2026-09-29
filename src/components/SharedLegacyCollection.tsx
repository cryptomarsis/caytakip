import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { CaylikButton } from './caylik-ui';
import type { HarvestRecord } from '../types';
import type { AuthFetch } from '../services/aiAssistant';
import { shareRequest } from '../services/sharecropping';
import { formatTL, parseMoney } from '../utils/format';

export default function SharedLegacyCollection({ row, authFetch, onChanged }: { row: HarvestRecord; authFetch: AuthFetch; onChanged?: () => void }) {
  const theme = useTheme();
  const [amount, setAmount] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  if (!row.legacySharedCollection) return null;
  const proposal = row.legacyAllocation;
  const send = async (body: unknown) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await shareRequest(authFetch, `/shared-ledger/${row.sharedDeliveryId}/legacy-allocation`, 'POST', body); setMessage(row.sharedRole === 'owner' ? 'Aktarım onaylandı.' : 'Dağılım müstahsilin onayına gönderildi.'); onChanged?.(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Aktarım yapılamadı.'); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 10, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 12 }}>
    <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>Eski tahsilat · {formatTL(row.legacySharedCollection)}</Text>
    <Text style={{ color: theme.colors.onSurfaceVariant }}>Eski kayıt korunur. Yarıcı dağılımı önerir, müstahsil onaylayınca herkesin kendi tahsilatına aktarılır.</Text>
    {proposal?.state === 'pending' && <Text style={{ color: theme.colors.onSurface }}>Öneri: Yarıcı {formatTL(proposal.cropperCents / 100)} · Müstahsil {formatTL(proposal.ownerCents / 100)}</Text>}
    {row.sharedRole === 'cropper' ? <>
      <TextInput accessibilityLabel="Eski tahsilattan yarıcıya ait tutar" placeholder="Size ait tahsilat (TL)" placeholderTextColor={theme.colors.onSurfaceVariant} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!busy} style={{ borderWidth: 1, borderColor: theme.colors.outline, color: theme.colors.onSurface, borderRadius: 10, padding: 12 }} />
      {!!amount && <Text style={{ color: theme.colors.onSurfaceVariant }}>Müstahsil: {formatTL(row.legacySharedCollection - parseMoney(amount))}</Text>}
      <CaylikButton disabled={busy || !/^\d+(?:[.,]\d{1,2})?$/.test(amount.trim())} onPress={() => void send({ cropperAmount: amount.trim().replace(',', '.') })}>Bu dağılımı onaya gönder</CaylikButton>
    </> : proposal?.state === 'pending' ? <CaylikButton disabled={busy} onPress={() => void send({ confirm: true, proposalId: proposal.proposalId })}>Tutarları onayla ve aktar</CaylikButton> : <Text style={{ color: theme.colors.onSurfaceVariant }}>Yarıcının dağılım önerisi bekleniyor.</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.onSurface }}>{message}</Text>}
  </View>;
}
