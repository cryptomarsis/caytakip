import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { QuotaPlan, eligibleRecord, isCaykur } from '../../shared/quota';
import { API_URL } from '../services/api';
import { CaylikButton } from './caylik-ui';
import { caylikDesign } from '../context/app-theme';

type Props = {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  firma: string; season: string; date: string; value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};
export default function QuotaPlanPicker({ authFetch, firma, season, date, value, onChange, disabled }: Props) {
  const theme = useTheme();
  const [request] = useState(() => authFetch);
  const [plans, setPlans] = useState<QuotaPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const caykur = isCaykur(firma);
  useEffect(() => {
    let active = true;
    request(`${API_URL}/quota/plans`).then(async res => {
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.plans)) throw Error('Kota bilgileri alınamadı.');
      if (active) setPlans(data.plans);
    }).catch(() => { if (active) setError('Cüzdanlar yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, retry]);
  if (!caykur) return null;
  const eligible = plans.filter(p => eligibleRecord(p, { firma, surum: season, tarih: date }));
  const selected = value || (eligible.length === 1 ? eligible[0].id : '');
  return <View style={{ gap: caylikDesign.spacing.xs, marginVertical: caylikDesign.spacing.sm }}>
    <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>ÇAYKUR cüzdanı · {season.replace('Sürüm', 'sürgün')}</Text>
    {loading ? <ActivityIndicator color={theme.colors.primary} /> : error ? <>
      <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text>
      <CaylikButton mode="outlined" disabled={disabled} onPress={() => { setLoading(true); setError(''); setRetry(n => n + 1); }}>Yeniden dene</CaylikButton>
    </> : <>
      {eligible.map(p => <CaylikButton key={p.id} disabled={disabled} mode={selected === p.id ? 'contained' : 'outlined'} accessibilityLabel={`${p.label}, ${p.season.replace('Sürüm', 'sürgün')}${selected === p.id ? ', seçili' : ''}`} onPress={() => onChange(p.id)}>{p.label}</CaylikButton>)}
      {!!value && !eligible.some(p => p.id === value) && <>
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>Önceki cüzdan seçimi bu tarih veya sürgüne uygun değil.</Text>
        <CaylikButton mode="text" disabled={disabled} onPress={() => onChange('')}>Cüzdan seçimini temizle</CaylikButton>
      </>}
      <Text style={{ color: theme.colors.onSurfaceVariant }}>{eligible.length
        ? 'Kaydedilen KG, bu cüzdanın toplam kotasından otomatik düşer. Birden fazla cüzdan varsa teslimatın ait olduğu cüzdanı seçin.'
        : 'Bu tarih ve sürgün için kota planı yok. ÇAYKUR Kota Takip’ten plan ekleyin. Plansız kayıtlar kotaya kendiliğinden bağlanmaz.'}</Text>
    </>}
  </View>;
}
