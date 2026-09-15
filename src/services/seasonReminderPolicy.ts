import { defaultSeasonReminderSettings, validateSeasonReminderSettings, type DailyReminderSettings } from '../../shared/seasonReminders';
import { API_URL, fetchWithTimeout } from './api';

export type SeasonReminderPolicy = { settings: DailyReminderSettings; revision: number };
export type SeasonPolicyRequest = typeof fetchWithTimeout;
export const emptySeasonPolicy = (): SeasonReminderPolicy => ({ settings: defaultSeasonReminderSettings(), revision: 0 });

export function parseSeasonPolicy(data: unknown): SeasonReminderPolicy {
  const value = data as Partial<SeasonReminderPolicy> | null;
  if (!value || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw Error('Sezon planı doğrulanamadı.');
  return { settings: validateSeasonReminderSettings(value.settings as DailyReminderSettings, new Date(), true), revision: Number(value.revision) };
}

export async function loadSeasonReminderPolicy(token: string, request: SeasonPolicyRequest = fetchWithTimeout): Promise<SeasonReminderPolicy> {
  if (!token) throw Error('Planı yüklemek için giriş yapın.');
  const response = await request(`${API_URL}/season-reminder`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error(response.status === 404 ? 'Sezon planı bu sunucu sürümünde henüz hazır değil.' : 'Sezon planı yüklenemedi.');
  return parseSeasonPolicy(data);
}

export async function saveSeasonReminderPolicy(token: string, policy: SeasonReminderPolicy, request: SeasonPolicyRequest = fetchWithTimeout): Promise<SeasonReminderPolicy> {
  const settings = validateSeasonReminderSettings(policy.settings);
  const response = await request(`${API_URL}/admin/season-reminder`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings, revision: policy.revision }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error(data?.error || 'Sezon planı kaydedilemedi.');
  return parseSeasonPolicy(data);
}
