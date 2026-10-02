import type { HarvestRecord } from '../types';
import { escapeHtml, formatDisplayDate, formatTL, netTotalOf, parseMoney, remainingTotalOf, saleNetTotalOf, shareLabelOf } from './format';

export function sharedPeriod(rows: HarvestRecord[], year: number, season = '') {
  const selected = rows.filter(row => !row.sharedVoided && String(row.tarih).startsWith(`${year}-`) && (!season || (row.surum || 'Belirtilmedi') === season));
  const sum = (items: HarvestRecord[]) => items.reduce((s, r) => ({ kg: s.kg + parseMoney(r.kg), net: s.net + netTotalOf(r), paid: s.paid + parseMoney(r.tahsilat), remaining: s.remaining + remainingTotalOf(r) }), { kg: 0, net: 0, paid: 0, remaining: 0 });
  return {
    selected, totals: sum(selected),
    previousRemaining: sum(rows.filter(r => !r.sharedVoided && String(r.tarih).slice(0, 4) < String(year))).remaining,
    months: Array.from({ length: 12 }, (_, i) => sum(selected.filter(r => String(r.tarih).slice(5, 7) === String(i + 1).padStart(2, '0'))).kg),
  };
}

export function sharedAccountHtml(rows: HarvestRecord[], title: string, year: number, season = '') {
  const { selected, totals, previousRemaining } = sharedPeriod(rows, year, season);
  const body = selected.map(r => `<tr><td>${escapeHtml(formatDisplayDate(r.tarih))}</td><td>${escapeHtml(r.firma)}</td><td>${parseMoney(r.kg)}</td><td>${formatTL(saleNetTotalOf(r))}</td><td>${escapeHtml(shareLabelOf(r))}</td><td>${formatTL(netTotalOf(r))}</td><td>${formatTL(parseMoney(r.tahsilat))}</td><td>${formatTL(remainingTotalOf(r))}${r.legacySharedCollection ? '*' : ''}</td></tr>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:15mm}body{font:12px Arial;color:#173b2b}h1{font-size:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d4ded7;padding:7px;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}p{line-height:1.5}</style></head><body><h1>Çaylık · Hesap Özeti</h1><h2>${escapeHtml(title)}</h2><p>${year} · ${escapeHtml(season || 'Tüm sürgünler')}<br>KG teslimatın tamamıdır. Tahsilat ve alacak yalnızca bu hesabın sahibine aittir; diğer tarafın özel tahsilatları paylaşılmaz.</p><p>Teslimat: ${totals.kg.toLocaleString('tr-TR')} KG · Benim net payım: ${formatTL(totals.net)} · Benim tahsilatım: ${formatTL(totals.paid)} · Kalan: ${formatTL(totals.remaining)}<br>Önceki yıllardan kalan (bu döneme dahil değil): ${formatTL(previousRemaining)}</p><table><thead><tr><th>Tarih</th><th>Fabrika</th><th>KG</th><th>Teslimat net</th><th>Pay</th><th>Benim payım</th><th>Tahsilatım</th><th>Kalanım</th></tr></thead><tbody>${body || '<tr><td colspan="8">Bu dönemde kayıt yok.</td></tr>'}</tbody></table>${rows.some(r => r.legacySharedCollection) ? '<p>* Eski toplam tahsilat için iki tarafın onayı bekleniyor. Bu tutarlar henüz paylara düşülmedi; ilgili kalan alacaklar kesinleşmemiştir.</p>' : ''}<p>Bilgilendirme amaçlı hesap özetidir; ödeme makbuzu değildir.</p></body></html>`;
}
