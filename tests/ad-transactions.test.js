/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

function setup(failLedger = false) {
  let state = { balance: 1000, applications: [], ads: [], ledger: [] };
  let tail = Promise.resolve();
  const query = value => ({ select() { return this; }, lean: async () => value });
  const mongoose = { startSession: async () => ({
    async withTransaction(fn) {
      const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
      const snapshot = structuredClone(state);
      try { await fn(); } catch (error) { state = snapshot; throw error; } finally { release(); }
    }, endSession: async () => {},
  }) };
  const UserProfile = {
    findOneAndUpdate(filter, update, options) {
      assert.ok(options.session, 'wallet must be in transaction');
      if (filter.aiCredits && state.balance < filter.aiCredits.$gte) return query(null);
      state.balance += update.$inc.aiCredits; return query({ aiCredits: state.balance });
    },
  };
  const AdApplication = {
    async create(rows, options) { assert.ok(options.session); const row = { ...rows[0], _id: 'application' }; state.applications.push(row); return [row]; },
    findById(id) { return { session: async session => {
      assert.ok(session); const row = state.applications.find(item => item._id === id); if (!row) return null;
      return { ...row, async save(options) { assert.ok(options.session); const copy = { ...this }; delete copy.save; Object.assign(row, copy); } };
    } }; },
  };
  const Ad = { async create(rows, options) { assert.ok(options.session); const row = { ...rows[0], _id: 'published' }; state.ads.push(row); return [row]; } };
  const AiCreditTransaction = { async create(rows, options) {
    assert.ok(options.session); if (failLedger) throw Error('Ledger unavailable');
    if (state.ledger.some(item => item.requestId === rows[0].requestId)) throw Error('Duplicate ledger');
    state.ledger.push(rows[0]);
  } };
  const handlers = {};
  const code = source.match(/app\.post\('\/api\/ad-applications',[\s\S]*?\n\}\);/)[0] + '\n' + source.match(/app\.patch\('\/api\/admin\/ad-applications\/:id',[\s\S]*?\n\}\);/)[0];
  vm.runInNewContext(code, { app: { post: (_path, ...args) => { handlers.submit = args.at(-1); }, patch: (_path, ...args) => { handlers.decide = args.at(-1); } }, mongoose, UserProfile, AdApplication, Ad, AiCreditTransaction, requireAuth() {}, requireAdmin() {}, idempotencyMiddleware() {}, getAdCampaignCredits: () => 500, isAdContentAllowed: () => true });
  const req = { auth: { userId: 'owner', phone: 'private' }, body: { acceptedRules: true, durationDays: 7, firma: 'Test', baslik: 'Test', aciklama: 'Reklam' }, params: { id: 'application' } };
  return { handlers, req, state: () => state, setFail: value => { failLedger = value; } };
}
test('ad submission atomically charges and records its ledger; ledger failure rolls everything back', async () => {
  for (const fail of [false, true]) {
    const h = setup(fail); const res = response(); await h.handlers.submit(h.req, res);
    assert.equal(res.statusCode, fail ? 400 : 201);
    assert.equal(h.state().balance, fail ? 1000 : 500);
    assert.equal(h.state().applications.length, fail ? 0 : 1);
    assert.equal(h.state().ledger.length, fail ? 0 : 1);
  }
});
test('concurrent reject requests refund once; failure cannot leave credit without a rejected application', async () => {
  const h = setup(); await h.handlers.submit(h.req, response());
  h.req.body = { status: 'rejected' }; h.setFail(true);
  const failed = response(); await h.handlers.decide(h.req, failed);
  assert.equal(failed.statusCode, 400); assert.equal(h.state().balance, 500); assert.equal(h.state().applications[0].status, 'pending');
  h.setFail(false);
  const first = response(); const second = response();
  await Promise.all([h.handlers.decide(h.req, first), h.handlers.decide(h.req, second)]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
  assert.equal(h.state().balance, 1000); assert.equal(h.state().ledger.filter(row => row.type === 'refund').length, 1);
});
test('concurrent approvals create only one published banner', async () => {
  const h = setup(); await h.handlers.submit(h.req, response()); h.req.body = { status: 'approved' };
  const first = response(); const second = response(); await Promise.all([h.handlers.decide(h.req, first), h.handlers.decide(h.req, second)]);
  assert.equal(h.state().ads.length, 1); assert.equal(h.state().applications[0].publishedAdId, 'published');
  assert.equal(h.state().balance, 500);
});

function paymentSetup(failLedger = false) {
  let state = { paid: 0, payments: [] }; let tail = Promise.resolve(); let handler;
  const mongoose = { Types: { ObjectId: { isValid: () => true } }, startSession: async () => ({ async withTransaction(fn) {
    const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior;
    const snapshot = structuredClone(state);
    try { await fn(); } catch (error) { state = snapshot; throw error; } finally { release(); }
  }, endSession: async () => {} }) };
  const Harvest = { findById: () => ({ session: async session => {
    assert.ok(session);
    return { userId: 'u', userPhone: 'p', kg: 100, fiyat: 1, tahsilat: state.paid, async save(options) { assert.ok(options.session); state.paid = this.tahsilat; } };
  } }) };
  const Payment = { async create(rows, options) { assert.ok(options.session); if (failLedger) throw Error('Payment ledger failed'); state.payments.push(rows[0]); return [{ ...rows[0], _id: 'p1' }]; } };
  const code = source.match(/app\.post\('\/api\/payments',[\s\S]*?\n\}\);/)[0];
  vm.runInNewContext(code, { app: { post: (_url, ...args) => { handler = args.at(-1); } }, mongoose, Harvest, Payment, requireAuth() {}, idempotencyMiddleware() {}, getUserIdentifier: () => ({ userId: 'u', userPhone: 'p' }), paymentAmount: Number, roundedMoney: value => Math.round(value * 100) / 100, normalizeCalendarDate: value => value, todayServerDate: () => '2026-09-15', calculateHarvestAmounts: () => ({ brutTutar: 100, netTutar: 98, gelirVergisiOrani: .02, gelirVergisiKesintisi: 2, kesintiTutar: 2 }), console: { error() {} } });
  return { state: () => state, pay: async () => { const res = response(); await handler({ auth: { userId: 'u', phone: 'p' }, body: { harvestId: 'h', tutar: 60, tarih: '2026-09-15' } }, res); return res; } };
}
test('concurrent payments recheck remaining debt instead of losing an update or overpaying', async () => {
  const h = paymentSetup(); const results = await Promise.all([h.pay(), h.pay()]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [201, 400]); assert.equal(h.state().paid, 60); assert.equal(h.state().payments.length, 1);
});
test('payment ledger failure rolls back the harvest paid total', async () => {
  const h = paymentSetup(true); assert.equal((await h.pay()).statusCode, 500); assert.equal(h.state().paid, 0); assert.equal(h.state().payments.length, 0);
});
