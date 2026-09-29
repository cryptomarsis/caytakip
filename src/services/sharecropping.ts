import type { AuthFetch } from './aiAssistant';
import { API_URL } from './api';
import type { SharedDeliveryData } from '../../shared/sharecropping';
export type ShareLink = { _id: string; label: string; cropperName: string; ownerName?: string; denominator: 2 | 3; status: 'pending' | 'active' | 'closed'; myRole: 'cropper' | 'owner' };
export type ShareDelivery = { _id: string; data: SharedDeliveryData; revision: number; voided: boolean; harvestId?: string; changes?: { at: string; revision: number; details: string[] }[] };
export type ShareOverview = ShareLink & { kg: number; myShareCents: number };
export type ShareSummary = { kg: number; netCents: number; cropperCents: number; ownerCents: number };
export type ShareEvent = { _id: string; linkId: string; message: string; createdAt: string };
export type PendingSharedDelivery = { requestId: string; linkId: string; kg: string; price: string; date: string; dueDate: string; factory: string };
export async function shareRequest<T>(authFetch: AuthFetch, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await authFetch(`${API_URL}${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Object.assign(Error(data?.error || 'Pay Takibi bilgileri alınamadı. Bağlantınızı ve sunucu güncellemesini kontrol edin.'), { status: response.status });
  return data;
}
