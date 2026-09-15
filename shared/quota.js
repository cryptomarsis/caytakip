const isoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const isCaykur = (name) => String(name || '').trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ') === 'ÇAYKUR' || String(name || '').trim().toUpperCase() === 'CAYKUR';
function validateQuotaPlans(input) {
  if (!Array.isArray(input) || input.length > 20) throw Error('En fazla 20 kota planı kaydedilebilir.');
  const usedIds = new Set(); const usedRecords = new Set();
  return input.map((p) => {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) || usedIds.has(p.id)) throw Error('Plan kimliği geçersiz.');
    usedIds.add(p.id);
    if (typeof p.label !== 'string' || !p.label.trim() || p.label.length > 80) throw Error('Cüzdan için kısa bir ad girin.');
    if (!['1. Sürüm', '2. Sürüm', '3. Sürüm', '4. Sürüm'].includes(p.season)) throw Error('Sürgün seçin.');
    if (!isoDate(p.startDate) || !isoDate(p.endDate) || p.endDate < p.startDate) throw Error('Dönem tarihleri geçersiz.');
    if (!Number.isFinite(p.area) || p.area <= 0) throw Error('Ruhsatlı alanı dekar olarak girin.');
    for (const field of ['quotaRate', 'dailyRate']) if (p[field] !== null && (!Number.isFinite(p[field]) || p[field] < 0)) throw Error('Limitler pozitif sayı, sıfır veya boş olabilir.');
    for (const field of ['quotaRate', 'dailyRate']) if (p[field] !== null && !Number.isFinite(p[field] * p.area)) throw Error('Alan ve limit çarpımı çok büyük.');
    if (p.dailyRate !== null && !isoDate(p.dailyDate)) throw Error('Günlük limitin geçerli olduğu tarihi girin.');
    if (!Number.isFinite(p.openingKg) || p.openingKg < 0) throw Error('Önceki teslimat miktarı geçersiz.');
    if (!Array.isArray(p.recordIds) || p.recordIds.length > 10000) throw Error('Teslimat seçimi geçersiz.');
    for (const id of p.recordIds) {
      if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id) || usedRecords.has(id)) throw Error('Bir teslimat yalnızca bir kota planına bağlanabilir.');
      usedRecords.add(id);
    }
    return { id: p.id, label: p.label.trim(), season: p.season, startDate: p.startDate, endDate: p.endDate, area: p.area, quotaRate: p.quotaRate, dailyRate: p.dailyRate, dailyDate: p.dailyDate || '', openingKg: p.openingKg, source: String(p.source || '').slice(0, 240), recordIds: [...p.recordIds] };
  });
}
const eligibleRecord = (p, r) => isCaykur(r.firma) && r.surum === p.season && isoDate(r.tarih) && r.tarih >= p.startDate && r.tarih <= p.endDate;
function calculateQuota(p, records, today) {
  const selected = new Set(p.recordIds);
  const byId = new Map(records.map((r) => [String(r._id), r]));
  let delivered = p.openingKg; let todayKg = 0; let invalid = 0;
  for (const id of selected) {
    const r = byId.get(id);
    const kg = Number(r?.kg ?? r?.weight);
    if (!r || !eligibleRecord(p, r) || r.tarih > today || !Number.isFinite(kg) || kg < 0) { invalid++; continue; }
    delivered += kg;
    if (r.tarih === today) todayKg += kg;
  }
  const total = p.quotaRate === null ? null : p.area * p.quotaRate;
  const remaining = total === null ? null : Math.max(0, total - delivered);
  const dayRemaining = p.dailyRate === null || p.dailyDate !== today ? null : Math.max(0, p.area * p.dailyRate - todayKg);
  const active = today >= p.startDate && today <= p.endDate;
  return { delivered, todayKg, remaining, dayRemaining, invalid, active, available: !active || invalid || remaining === null || dayRemaining === null ? null : Math.min(remaining, dayRemaining), overQuota: total !== null && delivered > total };
}
module.exports = { validateQuotaPlans, calculateQuota, eligibleRecord, isCaykur };
