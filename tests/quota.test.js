const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQuota, validateQuotaPlans, eligibleRecord, resolveQuotaPlan, totalQuotaKg, withTotalQuota } = require('../shared/quota');
const id = 'a'.repeat(24);
const plan = { id: 'p1', label: 'Kendi cüzdanım', season: '3. Sürüm', startDate: '2026-09-01', endDate: '2026-09-30', area: 2, quotaRate: 500, dailyRate: 50, dailyDate: '2026-09-15', openingKg: 100, source: 'Test', recordIds: [id] };
const record = { _id: id, firma: 'ÇAYKUR', surum: '3. Sürüm', tarih: '2026-09-15', kg: 40 };
test('daily and seasonal limits are separate; smaller remaining limit applies', () => {
  const q = calculateQuota(plan, [record], '2026-09-15');
  assert.equal(q.remaining, 860); assert.equal(q.dayRemaining, 60); assert.equal(q.available, 60);
  assert.equal(calculateQuota({ ...plan, openingKg: 940 }, [record], '2026-09-15').available, 20);
});
test('unknown, stale daily limit and inactive season never imply unlimited capacity', () => {
  for (const p of [{ ...plan, dailyDate: '2026-09-14' }, { ...plan, dailyRate: null }, { ...plan, quotaRate: null }, { ...plan, endDate: '2026-09-14' }]) assert.equal(calculateQuota(p, [record], '2026-09-15').available, null);
  assert.equal(calculateQuota({ ...plan, dailyRate: 0 }, [record], '2026-09-15').available, 0);
});
test('deleted, moved, private-factory and future deliveries no longer consume current quota', () => {
  for (const r of [null, { ...record, firma: 'EFOR' }, { ...record, surum: '2. Sürüm' }, { ...record, tarih: '2026-09-16' }]) {
    const q = calculateQuota(plan, r ? [r] : [], '2026-09-15');
    assert.equal(q.invalid, 0); assert.equal(q.delivered, 100); assert.equal(q.todayKg, 0);
  }
  assert.equal(calculateQuota(plan, [{ ...record, kg: 'invalid' }], '2026-09-15').available, null);
  assert.equal(eligibleRecord(plan, { ...record, firma: 'CAYKUR' }), true);
  assert.equal(eligibleRecord(plan, { ...record, firma: 'ÇAYKUR Özel Bayi' }), false);
});

test('new linked harvests, kg edits, deletion and duplicate input recalculate without stored counters', () => {
  const p = { ...plan, openingKg: 0, recordIds: [] };
  const r = { ...record, quotaPlanId: p.id };
  assert.equal(calculateQuota(p, [r], r.tarih).remaining, 960);
  assert.equal(calculateQuota(p, [r, r], r.tarih).delivered, 40);
  assert.equal(calculateQuota(p, [{ ...r, kg: 60 }], r.tarih).remaining, 940);
  assert.equal(calculateQuota(p, [], r.tarih).remaining, 1000);
  assert.equal(calculateQuota(p, [r], r.tarih).todayKg, 40); // not financial net (98%)
});

test('explicit wallet selection wins over legacy links and never consumes both wallets', () => {
  const second = { ...plan, id: 'p2', openingKg: 0, recordIds: [] };
  const moved = { ...record, quotaPlanId: 'p2' };
  assert.equal(calculateQuota(plan, [moved], record.tarih).delivered, 100);
  assert.equal(calculateQuota(second, [moved], record.tarih).delivered, 40);
  assert.equal(calculateQuota(plan, [{ ...record, quotaPlanId: plan.id }], record.tarih).delivered, 140);
});

test('wallet resolution is date/season scoped, single wallet automatic, multiple wallets explicit', () => {
  const a = { ...plan, recordIds: [] };
  const b = { ...a, id: 'p2' };
  assert.equal(resolveQuotaPlan([a], record), a.id);
  assert.throws(() => resolveQuotaPlan([a, b], record), /cüzdanı seçin/);
  assert.equal(resolveQuotaPlan([a, b], record, b.id), b.id);
  assert.throws(() => resolveQuotaPlan([a], record, 'foreign'), /ait değil/);
  assert.throws(() => resolveQuotaPlan([a], { ...record, surum: '2. Sürüm' }, a.id));
  assert.equal(resolveQuotaPlan([a], { ...record, firma: 'EFOR' }, a.id), '');
  assert.equal(resolveQuotaPlan([], record), '');
  assert.equal(resolveQuotaPlan([plan, b], record), plan.id); // existing manual link
});

test('unassigned records are never silently attributed to a new plan', () => {
  const p = { ...plan, recordIds: [] };
  assert.equal(calculateQuota(p, [record], record.tarih).delivered, 100);
  assert.equal(validateQuotaPlans([{ ...p, recordIds: undefined }])[0].recordIds.length, 0);
});
test('duplicate assignment, negative rates, invalid dates, overflow rejected; null and zero allowed', () => {
  assert.throws(() => validateQuotaPlans([plan, { ...plan, id: 'p2' }]));
  for (const change of [{ dailyRate: -1 }, { area: Infinity }, { startDate: '2026-02-30' }, { area: 1e300, quotaRate: 1e300 }]) assert.throws(() => validateQuotaPlans([{ ...plan, ...change }]));
  assert.equal(validateQuotaPlans([{ ...plan, dailyRate: 0, quotaRate: null }])[0].dailyRate, 0);
});
test('over quota remains visible without negative balance', () => {
  const q = calculateQuota({ ...plan, openingKg: 2000 }, [record], '2026-09-15');
  assert.equal(q.overQuota, true); assert.equal(q.remaining, 0);
});

test('total-KG editing preserves legacy quota, opening deliveries, dates and wallet links', () => {
  const snapshot = JSON.stringify(plan);
  const saved = validateQuotaPlans([withTotalQuota(plan, totalQuotaKg(plan))])[0];
  assert.equal(totalQuotaKg(saved), 1000);
  assert.equal(saved.dailyRate, null);
  for (const field of ['id', 'label', 'season', 'startDate', 'endDate', 'openingKg', 'source', 'recordIds']) assert.deepEqual(saved[field], plan[field]);
  assert.equal(calculateQuota(saved, [record], record.tarih).remaining, 860);
  assert.equal(JSON.stringify(plan), snapshot); // no implicit migration of stored plans
});

test('total-KG changes need no dekar or daily limit; invalid input never becomes unlimited', () => {
  const saved = validateQuotaPlans([withTotalQuota(plan, 1250.5)])[0];
  assert.equal(totalQuotaKg(saved), 1250.5);
  assert.equal(calculateQuota(saved, [record], record.tarih).remaining, 1110.5);
  assert.equal(calculateQuota(withTotalQuota(plan, 0), [record], record.tarih).overQuota, true);
  for (const invalid of [NaN, Infinity, -1, null, undefined, '']) assert.throws(() => withTotalQuota(plan, invalid));
});
