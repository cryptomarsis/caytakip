import * as XLSX from 'xlsx';

type Counts = { harvestCount: number; paymentCount: number; expenseCount: number; gardenCount: number; totalCount: number };
export type ActivityExport = {
  generatedAt: string; start: string; end: string; timezone: 'UTC'; excludedUnknownDates: number;
  users: (Counts & { userKey: string; registeredAt: string | null; activeDays: number; lastEntryAt: string | null })[];
  daily: (Counts & { date: string; activeUsers: number })[];
  totals: { userCount: number; activeUsers: number; totalCount: number };
};
const DAY = 86400000;
const invalid = () => new Error('Kullanım raporu doğrulanamadı. Lütfen tekrar deneyin.');
export function activityDate(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw Error('Geçerli bir tarih seçin.');
  return timestamp;
}
export function validateActivityRange(start: string, end: string) {
  const from = activityDate(start), through = activityDate(end);
  if (through < from || through - from > 365 * DAY) throw Error('Başlangıç ve bitiş sıralı olmalı; en fazla 366 gün seçebilirsiniz.');
  return { start, end };
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}
function timestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid();
  const canonical = new Date(value).toISOString();
  if (canonical !== value) throw invalid();
  return canonical;
}
function counts(value: Record<string, unknown>): Counts {
  const result = { harvestCount: integer(value.harvestCount), paymentCount: integer(value.paymentCount), expenseCount: integer(value.expenseCount), gardenCount: integer(value.gardenCount), totalCount: integer(value.totalCount) };
  if (result.harvestCount + result.paymentCount + result.expenseCount + result.gardenCount !== result.totalCount) throw invalid();
  return result;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
// Explicit allowlist: never put full backend profiles or arbitrary fields in a file.
export function parseActivityExport(input: unknown, expected: { start: string; end: string }): ActivityExport {
  const data = object(input);
  validateActivityRange(expected.start, expected.end);
  const spanDays = (activityDate(expected.end) - activityDate(expected.start)) / DAY + 1;
  if (data.start !== expected.start || data.end !== expected.end || data.timezone !== 'UTC'
    || !Array.isArray(data.users) || data.users.length > 20000 || !Array.isArray(data.daily) || data.daily.length > 366) throw invalid();
  const keys = new Set<string>(), days = new Set<string>();
  const users = data.users.map(item => {
    const row = object(item), userKey = row.userKey;
    if (typeof userKey !== 'string' || !/^user_[a-f0-9]{24}$/i.test(userKey) || keys.has(userKey)) throw invalid();
    keys.add(userKey);
    const activity = counts(row), activeDays = integer(row.activeDays), lastEntryAt = timestamp(row.lastEntryAt, true);
    if (activeDays > spanDays || activeDays > activity.totalCount || (activity.totalCount === 0) !== (lastEntryAt === null)
      || (activity.totalCount > 0 && activeDays === 0)) throw invalid();
    if (lastEntryAt && (Date.parse(lastEntryAt) < activityDate(expected.start) || Date.parse(lastEntryAt) >= activityDate(expected.end) + DAY)) throw invalid();
    return { userKey, registeredAt: timestamp(row.registeredAt, true), ...activity, activeDays, lastEntryAt };
  });
  const daily = data.daily.map(item => {
    const row = object(item), date = row.date;
    if (typeof date !== 'string' || date < expected.start || date > expected.end || days.has(date)) throw invalid();
    activityDate(date); days.add(date);
    const activity = counts(row), activeUsers = integer(row.activeUsers);
    if (activeUsers > users.length || activeUsers > activity.totalCount || (activity.totalCount > 0 && activeUsers === 0)) throw invalid();
    return { date, ...activity, activeUsers };
  });
  const rawTotals = object(data.totals);
  const totals = { userCount: integer(rawTotals.userCount), activeUsers: integer(rawTotals.activeUsers), totalCount: integer(rawTotals.totalCount) };
  if (daily.some(row => row.activeUsers > totals.activeUsers)) throw invalid();
  if (totals.userCount !== users.length || totals.activeUsers !== users.filter(row => row.totalCount > 0).length
    || totals.totalCount !== users.reduce((sum, row) => sum + row.totalCount, 0)
    || totals.totalCount !== daily.reduce((sum, row) => sum + row.totalCount, 0)) throw invalid();
  for (const field of ['harvestCount', 'paymentCount', 'expenseCount', 'gardenCount'] as const) {
    if (users.reduce((sum, row) => sum + row[field], 0) !== daily.reduce((sum, row) => sum + row[field], 0)) throw invalid();
  }
  if (users.reduce((sum, row) => sum + row.activeDays, 0) !== daily.reduce((sum, row) => sum + row.activeUsers, 0)) throw invalid();
  return { ...expected, generatedAt: timestamp(data.generatedAt)!, timezone: 'UTC', users, daily, totals, excludedUnknownDates: integer(data.excludedUnknownDates) };
}
export function buildActivityWorkbook(data: ActivityExport): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const addSheet = (name: string, rows: (string | number | null)[][], widths: number[]) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = widths.map(wch => ({ wch }));
    if (rows.length > 1) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: rows.length - 1, c: rows[0].length - 1 }) };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  addSheet('Kullanıcılar', [
    ['Kullanıcı kodu', 'Üyelik tarihi (UTC)', 'Hasat kaydı', 'Tahsilat kaydı', 'Gider kaydı', 'Bahçe kaydı', 'Toplam kayıt', 'Kayıt girilen gün', 'Son kayıt (UTC)'],
    ...data.users.map(row => [row.userKey, row.registeredAt, row.harvestCount, row.paymentCount, row.expenseCount, row.gardenCount, row.totalCount, row.activeDays, row.lastEntryAt]),
  ], [33, 27, 16, 16, 16, 16, 16, 20, 27]);
  addSheet('Günlük Kullanım', [
    ['Gün (UTC)', 'Hasat kaydı', 'Tahsilat kaydı', 'Gider kaydı', 'Bahçe kaydı', 'Toplam kayıt', 'Kayıt giren kullanıcı'],
    ...data.daily.map(row => [row.date, row.harvestCount, row.paymentCount, row.expenseCount, row.gardenCount, row.totalCount, row.activeUsers]),
  ], [16, 16, 16, 16, 16, 16, 24]);
  addSheet('Rapor Bilgisi', [
    ['Alan', 'Değer'], ['Başlangıç (dahil)', data.start], ['Bitiş (dahil)', data.end], ['Saat dilimi', 'UTC'],
    ['Oluşturma zamanı', data.generatedAt], ['Kullanıcı sayısı', data.totals.userCount],
    ['Kayıt giren kullanıcı', data.totals.activeUsers], ['Toplam kayıt', data.totals.totalCount],
    ['Tarihi eksik/geçersiz kayıt', data.excludedUnknownDates],
    ['Tarihsiz kayıt kapsamı', 'Yukarıdaki tarihsiz kayıt sayısı tüm dönemler içindir; bu kayıtlar seçili tarih aralığına atanamaz.'],
    ['Kapsam', 'Mevcut hasat, tahsilat, gider ve bahçe kayıtlarının oluşturulma zamanlarıdır; işlem üzerindeki hasat/vade tarihi değildir.'],
    ['Sınırlar', 'Silinen kayıtlar, ekran ziyaretleri, tıklamalar ve oturum süreleri izlenmez. Eşleştirilemeyen kayıtlar dahil değildir.'],
    ['Mahremiyet', 'İsim, telefon, şifre, erişim anahtarı, finansal tutar ve mesaj içeriği içermez. Kullanıcı kodu raporlar arasında sabittir.'],
    ['Aktif gün', 'En az bir kayıt oluşturulan UTC günüdür; uygulamanın açıldığı gün anlamına gelmez.'],
  ], [30, 110]);
  return workbook;
}
