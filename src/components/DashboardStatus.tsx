import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { calculateQuota, eligibleRecord, linkedRecord, isCaykur, validateQuotaPlans } from '../../shared/quota';
import type { HarvestRecord } from '../types';
import { API_URL } from '../services/api';
import type { AuthFetch } from '../services/aiAssistant';
import { remainingTotalOf, formatTL, toServerDate, todayDisplayDate } from '../utils/format';
import { CaylikButton, CaylikSurface } from './caylik-ui';

export default function DashboardStatus({ authFetch, harvests, pending, onQuota }: { authFetch: AuthFetch; harvests: HarvestRecord[]; pending: number; onQuota: () => void }) {
  const theme = useTheme();
  const [quota, setQuota] = useState('Kota bilgisi yükleniyor…');
  const today = toServerDate(todayDisplayDate());
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await authFetch(`${API_URL}/quota`);
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.records)) throw Error();
        const plans = validateQuotaPlans(data.plans).filter(plan => plan.startDate <= today && plan.endDate >= today);
        const records = data.records as HarvestRecord[];
        const totals = plans.map(plan => calculateQuota(plan, records, today));
        const unassigned = records.some(record => plans.some(plan => eligibleRecord(plan, record)) && isCaykur(record.firma) && !plans.some(plan => linkedRecord(plan, record)));
        const incomplete = totals.some(total => total.invalid || total.remaining === null) || unassigned;
        const remaining = totals.reduce((sum, total) => sum + (total.remaining || 0), 0);
        if (active) setQuota(!plans.length ? 'Aktif kota planı yok' : incomplete ? 'Kota hesabı için eşleştirme / bilgi gerekli' : `${remaining.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg kalan kota · ${plans.length} aktif plan`);
      } catch { if (active) setQuota('Kota güncellenemedi · ayrıntıdan tekrar deneyin'); }
    })();
    return () => { active = false; };
  }, [authFetch, harvests, today]);
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 7);
  const upcoming = harvests.filter(item => { const date = toServerDate(item.vadeTarihi || ''); return date && date >= today && new Date(`${date}T12:00:00`) <= end; }).reduce((sum, item) => sum + Math.max(0, remainingTotalOf(item)), 0);
  return <CaylikSurface style={{ padding: 16, marginVertical: 12 }}>
    <Text style={{ color: theme.colors.onSurface, fontWeight: '700', fontSize: 16 }}>Kısa durum</Text>
    <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>{quota}</Text>
    <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>Önümüzdeki 7 günün vadeli alacağı: {formatTL(upcoming)}</Text>
    {pending > 0 && <View><Text style={{ color: theme.colors.secondary, marginTop: 6 }}>{pending} kayıt gönderilmeyi bekliyor; henüz toplamlara dahil değil.</Text></View>}
    <CaylikButton mode="text" onPress={onQuota}>Çaykur Kota Takip</CaylikButton>
  </CaylikSurface>;
}
