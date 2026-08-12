export const formatTL = (val: number) =>
  `${(val || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

export const normalizePhone = (value: string) => {
  let p = String(value || '').replace(/\D/g, '');
  if (p.startsWith('90')) p = '0' + p.slice(2);
  if (p.length === 10 && p.startsWith('5')) p = '0' + p;
  return p;
};

// Türkçe ve uluslararası ondalık girişlerini güvenli biçimde sayıya çevirir.
// Destekler: 12,5 | 12.5 | 1.250,50 | 1,250.50 | 1250.50 | 1250,50
export const parseMoney = (value: unknown) => {
  let s = String(value ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');

  if (comma >= 0 && dot >= 0) {
    // Son görünen ayraç ondalık kabul edilir.
    if (comma > dot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (comma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0) {
    const decimals = s.length - dot - 1;
    // 1.250 gibi üç haneli son bölüm binlik ayraç olarak kabul edilir.
    if (decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const number = Number(s);
  return Number.isFinite(number) ? number : 0;
};

export const formatDisplayDate = (value: unknown) => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[3].padStart(2,'0')}.${m[2].padStart(2,'0')}.${m[1]}`;
  const monthOnly = s.match(/^(\d{4})[-./](\d{1,2})$/);
  if (monthOnly) return `${monthOnly[2].padStart(2,'0')}.${monthOnly[1]}`;
  const tr = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (tr) return `${tr[1].padStart(2,'0')}.${tr[2].padStart(2,'0')}.${tr[3]}`;
  return s || '-';
};

export const toServerDate = (value: string) => {
  const s = String(value || '').trim();
  const tr = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  const iso = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  const year = Number(tr?.[3] || iso?.[1]);
  const month = Number(tr?.[2] || iso?.[2]);
  const day = Number(tr?.[1] || iso?.[3]);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
};

export const todayDisplayDate = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth() + 1).padStart(2,'0')}.${now.getFullYear()}`;
};
