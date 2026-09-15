const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQuota, validateQuotaPlans, eligibleRecord } = require('../shared/quota');
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
test('deleted, changed, private-factory, future or other-season records block a confident answer', () => {
  for (const r of [null, { ...record, firma: 'EFOR' }, { ...record, surum: '2. Sürüm' }, { ...record, tarih: '2026-09-16' }, { ...record, kg: 'invalid' }]) {
    const q = calculateQuota(plan, r ? [r] : [], '2026-09-15');
    assert.equal(q.invalid, 1); assert.equal(q.available, null);
  }
  assert.equal(eligibleRecord(plan, { ...record, firma: 'CAYKUR' }), true);
  assert.equal(eligibleRecord(plan, { ...record, firma: 'ÇAYKUR Özel Bayi' }), false);
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
