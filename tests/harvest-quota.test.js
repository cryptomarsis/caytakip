/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const harvestQuota = require('../server/harvestQuota');
const registerQuota = require('../server/quotaRoutes');
const { calculateQuota } = require('../shared/quota');
const id = 'a'.repeat(24);
const plan = { id: 'wallet-a', label: 'Cüzdan A', season: '3. Sürüm', startDate: '2026-09-01', endDate: '2026-09-30', area: 2, quotaRate: 500, dailyRate: 100, dailyDate: '2026-09-15', openingKg: 0, recordIds: [] };
const record = { _id: id, userId: 'owner', userPhone: 'test-phone', firma: 'ÇAYKUR', surum: plan.season, tarih: plan.dailyDate, kg: 100, weight: 100, fiyat: 30, tahsilat: 0, quotaPlanId: plan.id };
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });

function setupHarvest(plans = [plan], existing = record) {
  const captures = {}; const routes = {};
  class Harvest {
    constructor(payload) { Object.assign(this, payload, { _id: id }); }
    async save() { captures.saved = this; }
    static async findOne() { return existing; }
    static async findByIdAndUpdate(key, payload) { captures.updated = { ...existing, ...payload }; return captures.updated; }
  }
  const UserProfile = { findOne(filter) { captures.profile = filter; return { select: () => ({ lean: async () => ({ quotaPlans: plans }) }) }; } };
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const code = source.slice(source.indexOf("app.post('/api/harvests',"), source.indexOf("app.delete('/api/harvests/:id',"));
  vm.runInNewContext(code, {
    app: { post: (url, auth, idem, fn) => { routes.post = fn; }, put: (url, auth, fn) => { routes.put = fn; } },
    requireAuth() {}, idempotencyMiddleware() {}, Harvest, UserProfile,
    mongoose: { startSession: async () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) },
    require: name => { assert.equal(name, './server/harvestQuota'); return harvestQuota; },
    getUserIdentifier: req => ({ userId: req.auth.userId, userPhone: req.auth.phone }),
    normalizeCalendarDate: v => v, todayServerDate: () => record.tarih,
    calculateHarvestAmounts: (kg, price) => ({ brutTutar: kg * price, netTutar: kg * price * .98, gelirVergisiOrani: .02, gelirVergisiKesintisi: kg * price * .02, kesintiTutar: kg * price * .02 }),
    detectHarvestQualityFlags: () => [], paymentAmount: Number,
    console: { error() {} },
  });
  return { routes, captures, req: { auth: { userId: 'owner', phone: 'test-phone' }, params: { id }, body: { ...record } } };
}

test('actual harvest POST persists selected own wallet; quota uses KG not net income', async () => {
  const h = setupHarvest(); const res = response();
  await h.routes.post(h.req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(h.captures.saved.quotaPlanId, plan.id);
  assert.equal(h.captures.profile.userId, 'owner');
  assert.equal(calculateQuota(plan, [h.captures.saved], record.tarih).delivered, 100);
  assert.equal(h.captures.saved.toplamTutar, 2940);
});

test('actual harvest POST refuses foreign or ambiguous wallets before writing', async () => {
  for (const choice of ['foreign', '']) {
    const h = setupHarvest([plan, { ...plan, id: 'wallet-b' }]); const res = response();
    h.req.body.quotaPlanId = choice;
    await h.routes.post(h.req, res);
    assert.equal(res.statusCode, 400); assert.equal(h.captures.saved, undefined);
  }
});

test('actual POST auto-selects a single matching wallet but permits users without quota plans', async () => {
  for (const plans of [[plan], []]) {
    const h = setupHarvest(plans); const res = response();
    delete h.req.body.quotaPlanId;
    await h.routes.post(h.req, res);
    assert.equal(res.statusCode, 201); assert.equal(h.captures.saved.quotaPlanId, plans.length ? plan.id : '');
  }
});

test('actual harvest PUT moves wallet and KG without changing payment computation', async () => {
  const second = { ...plan, id: 'wallet-b' };
  const h = setupHarvest([plan, second]); const res = response();
  Object.assign(h.req.body, { quotaPlanId: second.id, kg: 150 });
  await h.routes.put(h.req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calculateQuota(plan, [h.captures.updated], record.tarih).delivered, 0);
  assert.equal(calculateQuota(second, [h.captures.updated], record.tarih).delivered, 150);
  assert.equal(h.captures.updated.toplamTutar, 4410);
});

test('private-factory PUT clears quota association; invalid date/season does not silently write', async () => {
  const h = setupHarvest(); const res = response();
  h.req.body.firma = 'EFOR';
  await h.routes.put(h.req, res);
  assert.equal(h.captures.updated.quotaPlanId, '');
  const wrong = setupHarvest(); const bad = response();
  wrong.req.body.surum = '1. Sürüm';
  await wrong.routes.put(wrong.req, bad);
  assert.equal(bad.statusCode, 400); assert.equal(wrong.captures.updated, undefined);
});

function setupAssignment({ found = record, updated = record, plans = [plan] } = {}) {
  const routes = {}; const captures = {};
  const auth = () => {};
  const select = val => ({ select: () => ({ lean: async () => val }) });
  registerQuota({
    get(url, guard, handler) { assert.equal(guard, auth); routes[url] = handler; },
    put() {},
    patch(url, guard, handler) { assert.equal(guard, auth); routes.patch = handler; },
  }, {
    requireAuth: auth,
    UserProfile: { findOne(filter) { captures.profile = filter; return select({ quotaPlans: plans, quotaRevision: 2 }); } },
    Harvest: {
      findOne(filter) { captures.find = filter; return { lean: async () => found }; },
      findOneAndUpdate: async (filter, changes) => { captures.write = { filter, changes }; return updated; },
    },
  });
  return { routes, captures, req: { auth: { userId: 'owner', phone: 'test-phone' }, params: { id }, body: { quotaPlanId: plan.id, userId: 'victim', kg: 99999 } } };
}

test('wallet-only PATCH is owner scoped and changes no financial/weight fields', async () => {
  const h = setupAssignment(); const res = response();
  await h.routes.patch(h.req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(h.captures.find.$and[0].$or[0].userId, 'owner');
  assert.deepEqual(h.captures.write.changes, { $set: { quotaPlanId: plan.id } });
  assert.equal(h.captures.write.filter.$and[1].quotaPlanId, plan.id);
});

test('wallet-only PATCH rejects absent/foreign records, invalid wallets and concurrent edits', async () => {
  for (const [options, expected] of [[{ found: null }, 404], [{ plans: [] }, 400], [{ found: { ...record, firma: 'EFOR' } }, 400], [{ updated: null }, 409]]) {
    const h = setupAssignment(options); const res = response();
    await h.routes.patch(h.req, res);
    assert.equal(res.statusCode, expected);
    if (expected !== 409) assert.equal(h.captures.write, undefined);
  }
});

test('plans endpoint requires auth and exposes only current user plans', async () => {
  const h = setupAssignment(); const res = response();
  await h.routes['/api/quota/plans'](h.req, res);
  assert.equal(h.captures.profile.userId, 'owner');
  assert.deepEqual(res.body, { plans: [plan] });
});

test('private factories skip quota DB lookup; database failures do not expose internals', async () => {
  const badDb = { findOne() { throw Error('private database detail'); } };
  assert.equal(await harvestQuota(badDb, 'owner', { ...record, firma: 'EFOR' }, plan.id), '');
  await assert.rejects(harvestQuota(badDb, 'owner', record, plan.id), /bilgileri doğrulanamadı/);
});
