/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const setupSync = require('../server/harvestSharing');
const { shareAmounts } = require('../shared/sharecropping');
const { validateBackup } = require('../server/backupRestore');
const linkId = 'a'.repeat(24), harvestId = 'b'.repeat(24);
const base = { kg: 100, fiyat: 30, firma: 'ÇAYKUR', tarih: '2026-09-29', isVadeli: true, vadeTarihi: '2026-10-31', shareLinkId: linkId, quotaPlanId: 'wallet-1', tahsilat: 0 };
const clone = value => structuredClone(value);
function harness() {
  const db = { harvests: [], deliveries: [], events: [], payments: [], links: [{ _id: linkId, cropperId: 'cropper', ownerId: 'owner', denominator: 3, status: 'active' }] };
  const control = { failEvent: false, stale: false };
  const matches = (row, filter) => Object.entries(filter).every(([key, val]) => key === '$or' ? val.some(v => matches(row, v)) : row[key] === val);
  const query = read => ({ session: () => Promise.resolve().then(read) });
  const change = (row, update) => {
    Object.assign(row, clone(update.$set || update));
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
    for (const [key, value] of Object.entries(update.$push || {})) row[key].push(clone(value));
    return clone(row);
  };
  const ShareLink = { findOneAndUpdate: async (filter, update) => { const row = db.links.find(r => matches(r, filter)); return row ? change(row, update) : null; } };
  const ShareDelivery = {
    findOne: filter => query(() => clone(db.deliveries.find(r => matches(r, filter)) || null)),
    create: async rows => rows.map(data => { assert(!db.deliveries.some(r => r.harvestId === data.harvestId)); const row = { _id: 'c'.repeat(24), history: [], revision: 0, voided: false, ...clone(data) }; db.deliveries.push(row); return clone(row); }),
    findOneAndUpdate: async (filter, update) => { const row = db.deliveries.find(r => matches(r, filter)); return row ? change(row, update) : null; },
  };
  const UserProfile = { exists: filter => query(() => ['cropper', 'owner'].includes(filter.userId)) };
  const ShareEvent = { create: async rows => { if (control.failEvent) throw Error('event unavailable'); db.events.push(...clone(rows)); } };
  const syncHarvestSharing = setupSync({ ShareLink, ShareDelivery, ShareEvent, UserProfile });
  class Harvest {
    constructor(payload) { Object.assign(this, payload, { _id: harvestId, updatedAt: 1 }); }
    async save() { db.harvests.push(clone(this)); }
    static async exists() { return false; }
    static async findOne(filter) { return clone(db.harvests.find(row => matches(row, filter)) || null); }
    static async findOneAndUpdate(filter, update) { if (control.stale) return null; const row = db.harvests.find(r => matches(r, filter)); if (!row) return null; Object.assign(row, clone(update), { updatedAt: row.updatedAt + 1 }); return clone(row); }
    static async findOneAndDelete(filter) { const i = db.harvests.findIndex(r => matches(r, filter)); return i < 0 ? null : db.harvests.splice(i, 1)[0]; }
  }
  const routes = {};
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const code = source.slice(source.indexOf("app.post('/api/harvests',"), source.indexOf('// --- YENİ EKLENEN ÖZEL ROTALAR ---'));
  vm.runInNewContext(code, {
    app: { post: (_path, _auth, _idem, fn) => { routes.POST = fn; }, put: (_path, _auth, fn) => { routes.PUT = fn; }, delete: (_path, _auth, fn) => { routes.DELETE = fn; } },
    Harvest, UserProfile, syncHarvestSharing,
    Payment: { create: async rows => db.payments.push(...clone(rows)), deleteMany: async filter => { db.payments = db.payments.filter(row => !matches(row, filter)); } },
    requireAuth() {}, idempotencyMiddleware() {},
    mongoose: { startSession: async () => ({ endSession: async () => {}, withTransaction: async fn => { const before = clone(db); try { await fn(); } catch (error) { Object.assign(db, before); throw error; } } }) },
    require: name => { assert.equal(name, './server/harvestQuota'); return async (_model, _user, _payload, id) => id || ''; },
    getUserIdentifier: req => ({ userId: req.auth.userId, userPhone: req.auth.phone }),
    normalizeCalendarDate: value => value, todayServerDate: () => base.tarih, paymentAmount: Number, detectHarvestQualityFlags: () => [],
    calculateHarvestAmounts: (kg, price) => { const a = shareAmounts(kg, price, 2); return { netTutar: a.netCents / 100, brutTutar: a.grossCents / 100 }; },
    console: { error() {} },
  });
  async function call(method, body = {}, user = 'cropper') {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    await routes[method]({ auth: { userId: user, phone: user }, params: { id: harvestId }, body }, res); return res;
  }
  return { db, control, call, syncHarvestSharing };
}
test('one harvest creates one linked delivery, net shares and one event in the same transaction', async () => {
  const h = harness(), res = await h.call('POST', base);
  assert.equal(res.statusCode, 201); assert.equal(h.db.harvests.length, 1); assert.equal(h.db.deliveries.length, 1); assert.equal(h.db.events.length, 1);
  assert.equal(h.db.harvests[0].quotaPlanId, 'wallet-1'); assert.equal(h.db.harvests[0].toplamTutar, 2940);
  assert.equal(h.db.deliveries[0].data.cropperCents, 98000); assert.equal(h.db.deliveries[0].data.ownerCents, 196000);
  assert.equal(h.db.deliveries[0].harvestId, harvestId); assert.equal(h.db.events[0].recipient, 'owner');
  await h.syncHarvestSharing(h.db.harvests[0], {});
  assert.equal(h.db.events.length, 1); assert.equal(h.db.deliveries.length, 1);
});
test('unauthorized, closed or nonexistent agreement rolls back harvest and payments', async () => {
  for (const mode of ['owner', 'closed', 'foreign']) {
    const h = harness(); if (mode === 'closed') h.db.links[0].status = 'closed';
    const res = await h.call('POST', { ...base, tahsilat: 5, shareLinkId: mode === 'foreign' ? 'f'.repeat(24) : linkId }, mode === 'owner' ? 'owner' : 'cropper');
    assert.equal(res.statusCode, 400); assert.equal(h.db.harvests.length, 0); assert.equal(h.db.payments.length, 0); assert.equal(h.db.events.length, 0);
  }
});
test('outbox failure rolls back all sale records; unshared harvest still works', async () => {
  const h = harness(); h.control.failEvent = true;
  assert.equal((await h.call('POST', base)).statusCode, 400); assert.equal(h.db.harvests.length, 0); assert.equal(h.db.deliveries.length, 0);
  assert.equal((await h.call('POST', { ...base, shareLinkId: '' })).statusCode, 201); assert.equal(h.db.deliveries.length, 0);
});
test('source edit synchronizes weight, price, factory and due date with before/after history', async () => {
  const h = harness(); await h.call('POST', base);
  const res = await h.call('PUT', { kg: 120, fiyat: 35, firma: 'EFOR', vadeTarihi: '2026-11-30' });
  assert.equal(res.statusCode, 200); assert.equal(h.db.harvests.length, 1); assert.equal(h.db.deliveries.length, 1);
  const row = h.db.deliveries[0]; assert.equal(row.data.kg, 120); assert.equal(row.data.price, 35); assert.equal(row.data.factory, 'EFOR'); assert.equal(row.data.dueDate, '2026-11-30');
  assert.equal(row.history[0].data.kg, 100); assert.equal(row.revision, 1); assert.match(h.db.events[1].message, /100 → 120/);
  assert.equal((await h.call('PUT', {}, 'owner')).statusCode, 404);
});
test('concurrent source changes and event failures cannot leave divergent balances or totals', async () => {
  const h = harness(); await h.call('POST', base);
  h.control.stale = true; assert.equal((await h.call('PUT', { kg: 120 })).statusCode, 409);
  h.control.stale = false; h.control.failEvent = true; assert.equal((await h.call('PUT', { kg: 120 })).statusCode, 400);
  assert.equal(h.db.harvests[0].kg, 100); assert.equal(h.db.deliveries[0].data.kg, 100); assert.equal(h.db.events.length, 1);
});
test('deletion removes source and payments but preserves a voided shared history, even after closing', async () => {
  const h = harness(); await h.call('POST', { ...base, tahsilat: 100 }); h.db.links[0].status = 'closed';
  h.control.failEvent = true; assert.equal((await h.call('DELETE')).statusCode, 400); assert.equal(h.db.harvests.length, 1);
  h.control.failEvent = false; assert.equal((await h.call('DELETE')).statusCode, 200);
  assert.equal(h.db.harvests.length, 0); assert.equal(h.db.payments.length, 0); assert.equal(h.db.deliveries[0].voided, true); assert.match(h.db.events[1].message, /iptal edildi/);
});
test('backup validates canonical harvest references and allows tombstones without source', async () => {
  const h = harness(); await h.call('POST', base);
  const backup = { users: [{ _id: '1'.repeat(24), userId: 'cropper' }, { _id: '2'.repeat(24), userId: 'owner' }], payments: [], harvests: h.db.harvests, shareLinks: h.db.links, shareDeliveries: h.db.deliveries };
  assert.doesNotThrow(() => validateBackup(backup, Object.keys(backup)));
  assert.throws(() => validateBackup({ ...backup, harvests: [] }, Object.keys(backup)), /kaynağı/);
  await h.call('DELETE');
  assert.doesNotThrow(() => validateBackup({ ...backup, harvests: h.db.harvests, shareDeliveries: h.db.deliveries }, Object.keys(backup)));
});
