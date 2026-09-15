import type { ExpenseRecord, HarvestRecord, PaymentRecord } from '../types/records';
export type TimelineItem = { id: string; kind: 'harvest' | 'payment' | 'expense'; title: string; date: string; detail: string; value: number; unit: 'kg' | 'TL' };
export function recordDate(value: string = '') {
  const tr = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const parsed = Date.parse(tr ? `${tr[3]}-${tr[2]}-${tr[1]}T00:00:00` : value);
  return Number.isFinite(parsed) ? parsed : 0;
}
export function buildTimeline(harvests: HarvestRecord[], payments: PaymentRecord[], expenses: ExpenseRecord[]): TimelineItem[] {
  const companies = new Map(harvests.map(item => [item._id, item.firma || 'Hasat']));
  const rows: TimelineItem[] = [
    ...harvests.map(item => ({ id: `harvest:${item._id}`, kind: 'harvest' as const, title: item.firma || 'Hasat', date: item.tarih || '', detail: item.bahce || item.garden || 'Hasat teslimatı', value: Number(item.kg ?? item.weight) || 0, unit: 'kg' as const })),
    ...payments.map(item => ({ id: `payment:${item._id}`, kind: 'payment' as const, title: 'Tahsilat', date: item.tarih || '', detail: (typeof item.harvestId === 'object' ? item.harvestId?.firma : companies.get(item.harvestId || '')) || item.aciklama || 'Tahsilat kaydı', value: Number(item.tutar) || 0, unit: 'TL' as const })),
    ...expenses.map(item => ({ id: `expense:${item._id}`, kind: 'expense' as const, title: item.kategori || 'Gider', date: item.tarih || '', detail: item.aciklama || item.bahce || 'Gider kaydı', value: Number(item.tutar) || 0, unit: 'TL' as const })),
  ];
  return [...new Map(rows.map(row => [row.id, row])).values()].sort((a, b) => recordDate(b.date) - recordDate(a.date) || a.id.localeCompare(b.id));
}

export function lastHarvestDefaults(harvests: HarvestRecord[], today: string) {
  const last = [...harvests].sort((a, b) => recordDate(b.tarih) - recordDate(a.tarih))[0];
  if (!last) return null;
  return { firma: last.firma || '', garden: last.bahce || last.garden || '', quotaPlanId: last.quotaPlanId || '', surum: last.surum || '1. Sürüm', date: today, fiyat: '', kg: '', tahsilat: '0', aciklama: '', receiptFingerprint: '', isVadeli: false, vadeTarihi: '' };
}
