import { useMemo } from 'react';

import { ExpenseRecord, HarvestRecord } from '../types';
import { netTotalOf, remainingTotalOf, toServerDate } from '../utils/format';

const formatDueMonth = (value: unknown) => {
  if (!value) return 'Vadesi Belirtilmeyenler';
  const raw = String(value).trim();
  let year = 0;
  let month = 0;
  let match = raw.match(/^(\d{4})[-./](\d{1,2})/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
  } else {
    match = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
    if (match) {
      month = Number(match[2]);
      year = Number(match[3]);
    }
  }
  if (!year || !month) return raw;
  const names = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return (names[month - 1] || 'Bilinmeyen Ay') + ' ' + year;
};

export const useHarvestMetrics = (harvests: HarvestRecord[], expenses: ExpenseRecord[]) => useMemo(() => {
  const gardenMap: Record<string, { name: string; toplamKg: number; toplamKazanc: number; toplamTahsilat: number; toplamGider: number; netKar: number }> = {};
  const dueGroups: Record<string, { label: string; rows: HarvestRecord[] }> = {};
  let totalKg = 0;
  let totalSales = 0;
  let totalPay = 0;
  let pendingCollection = 0;

  for (const harvest of harvests || []) {
    const kg = Number(harvest.kg || harvest.weight) || 0;
    const paid = Number(harvest.tahsilat) || 0;
    const net = netTotalOf(harvest);
    const remaining = remainingTotalOf(harvest);
    totalKg += kg;
    totalSales += net;
    totalPay += paid;
    pendingCollection += remaining;

    const gardenName = (harvest.bahce || harvest.garden || '').trim() || 'Bahçesi Belirtilmeyen';
    const gardenKey = gardenName.toLocaleLowerCase('tr-TR');
    if (!gardenMap[gardenKey]) {
      gardenMap[gardenKey] = { name: gardenName, toplamKg: 0, toplamKazanc: 0, toplamTahsilat: 0, toplamGider: 0, netKar: 0 };
    }
    gardenMap[gardenKey].toplamKg += kg;
    gardenMap[gardenKey].toplamKazanc += net;
    gardenMap[gardenKey].toplamTahsilat += paid;

    if (remaining > 0.01) {
      const rawDate = harvest.vadeTarihi || harvest.tarih;
      const normalizedDate = toServerDate(String(rawDate || ''));
      const key = normalizedDate ? normalizedDate.slice(0, 7) : '9999-12';
      if (!dueGroups[key]) dueGroups[key] = { label: formatDueMonth(rawDate), rows: [] };
      dueGroups[key].rows.push(harvest);
    }
  }

  let totalExp = 0;
  for (const expense of expenses || []) {
    const amount = Number(expense.tutar) || 0;
    totalExp += amount;
    const gardenName = (expense.bahce || expense.garden || '').trim() || 'Genel Giderler';
    const gardenKey = gardenName.toLocaleLowerCase('tr-TR');
    if (!gardenMap[gardenKey]) {
      gardenMap[gardenKey] = { name: gardenName, toplamKg: 0, toplamKazanc: 0, toplamTahsilat: 0, toplamGider: 0, netKar: 0 };
    }
    gardenMap[gardenKey].toplamGider += amount;
  }
  for (const garden of Object.values(gardenMap)) garden.netKar = garden.toplamKazanc - garden.toplamGider;
  const receivablesByMonth = Object.entries(dueGroups)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => [group.label, group.rows] as [string, HarvestRecord[]]);

  return {
    totalKg,
    totalSales,
    totalPay,
    totalExp,
    pendingCollection,
    netProfit: totalSales - totalExp,
    totalReceivables: pendingCollection,
    calculatedGardenSummaries: Object.values(gardenMap).sort((left, right) => {
      if (left.name === 'Genel Giderler') return 1;
      if (right.name === 'Genel Giderler') return -1;
      return right.netKar - left.netKar;
    }),
    getReceivablesByMonth: () => receivablesByMonth,
  };
}, [expenses, harvests]);
