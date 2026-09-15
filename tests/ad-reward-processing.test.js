/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
function setup(failLedger = false, env = {}) {
  let state = { credits: 50, ledger: [], records: [0, 1, 2, 3].map(i => ({ nonce: String(i).repeat(48), userId: 'u', expiresAt: new Date(Date.now() + 86400000), rewarded: false })) };
  let tail = Promise.resolve();
  const Reward = {
    async create(row) { state.records.push(row); },
    findOne(filter) {
      const row = state.records.find(item => item.nonce === filter.nonce && item.userId === filter.userId);
      const copy = row ? { ...row, async save({ session }) { assert.ok(session); const data = { ...this }; delete data.save; Object.assign(row, data); } } : null;
      return { session: async session => { assert.ok(session); return copy; }, lean: async () => copy };
    },
  };
  const mongoose = { Schema: class {}, models: { AdRewardSession: Reward }, startSession: async () => ({ async withTransaction(fn) {
    const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
    const snapshot = structuredClone(state);
    try { await fn(); } catch (error) { state = snapshot; throw error; } finally { release(); }
  }, endSession: async () => {} }) };
  const UserProfile = { findOne: () => ({ session: async () => ({ aiCredits: state.credits }) }), async findOneAndUpdate(_filter, update, options) { assert.ok(options.session); state.credits += update.$inc.aiCredits; return { aiCredits: state.credits }; } };
  const AiCreditTransaction = { findOne: () => ({ sort: () => ({ session: async () => state.ledger.at(-1) }) }), countDocuments: () => ({ then: resolve => Promise.resolve(state.ledger.length).then(resolve), session: async () => state.ledger.length }), async create(rows, options) {
    assert.ok(options.session); if (failLedger) throw Error('Ledger failed'); state.ledger.push({ ...rows[0], createdAt: new Date() });
  } };
  const module = { exports: {} }; const handlers = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/adRewardRoutes.js'), 'utf8'), {
    module, process: { env }, console: { error() {}, warn() {} }, Date,
    require: name => name === 'node:crypto' ? require(name) : { createVerifier: () => async url => JSON.parse(url) },
  });
  module.exports({ post: (url, ...args) => { handlers[url] = args.at(-1); }, get: (url, ...args) => { handlers[url] = args.at(-1); } }, { mongoose, UserProfile, AiCreditTransaction, requireAuth() {}, limitPublicUsage: () => () => {} });
  const callback = async (index = 0, userId = 'u') => { const res = response(); await handlers['/api/webhooks/admob']({ originalUrl: JSON.stringify({ custom_data: String(index).repeat(48), user_id: userId, transaction_id: `verified-${index}` }) }, res); return res; };
  const legacy = async body => { const res = response(); await handlers['/api/ai/rewarded-ad']({ auth: { userId: 'u' }, body }, res); return res; };
  const issue = async () => { const res = response(); await handlers['/api/ai/rewarded-ad/session']({ auth: { userId: 'u' } }, res); return res; };
  return { state: () => state, callback, handlers, legacy, issue };
}
test('verified reward retries grant once, and concurrent fourth reward cannot exceed daily limit', async () => {
  const h = setup(); const responses = await Promise.all([h.callback(), h.callback(), h.callback(1), h.callback(2), h.callback(3)]);
  assert.equal(responses[0].statusCode, 200); assert.equal(responses[1].statusCode, 200);
  assert.equal(h.state().credits, 80); assert.equal(h.state().ledger.length, 3); assert.equal(h.state().records.filter(item => item.rewarded).length, 3);
});
test('SSV processing failure rolls back balance, ledger and session; foreign owner gets no reward', async () => {
  const h = setup(true); assert.equal((await h.callback()).statusCode, 503);
  assert.equal(h.state().credits, 50); assert.equal(h.state().records[0].rewarded, false); assert.equal(h.state().ledger.length, 0);
  const other = setup(); assert.equal((await other.callback(0, 'foreign')).statusCode, 503); assert.equal(other.state().credits, 50);
});
test('old binaries continue during rollout, immediate retries replay and retirement is explicit', async () => {
  const h = setup(); assert.equal((await h.legacy()).body.creditsGranted, 10);
  assert.equal((await h.legacy()).body.creditsGranted, 0); assert.equal(h.state().credits, 60);
  const retired = setup(false, { ADMOB_LEGACY_REWARDS_ENABLED: 'false' });
  assert.equal((await retired.legacy()).statusCode, 426); assert.equal(retired.state().credits, 50);
});
test('SSV activation does not retire old clients; issued legacy sessions survive cutover exactly once', async () => {
  const env = {}; const h = setup(false, env); const issued = await h.issue();
  assert.equal(issued.body.mode, 'legacy');
  env.ADMOB_SSV_ENABLED = 'true'; env.ADMOB_LEGACY_REWARDS_ENABLED = 'false';
  assert.equal((await h.issue()).body.mode, 'ssv');
  await Promise.all([h.legacy({ customData: issued.body.customData }), h.legacy({ customData: issued.body.customData })]);
  assert.equal(h.state().credits, 60); assert.equal(h.state().ledger.length, 1);
  const ssv = await h.issue(); assert.equal((await h.legacy({ customData: ssv.body.customData })).statusCode, 409);
  assert.equal((await setup(false, { ADMOB_SSV_ENABLED: 'true' }).legacy()).statusCode, 200);
});
test('legacy and verified paths share daily limit and legacy ledger failure rolls back', async () => {
  const h = setup(); const sessions = await Promise.all([h.issue(), h.issue(), h.issue()]);
  await h.callback();
  await Promise.all(sessions.map(s => h.legacy({ customData: s.body.customData })));
  assert.equal(h.state().credits, 80); assert.equal(h.state().ledger.length, 3);
  const failed = setup(true); assert.equal((await failed.legacy()).statusCode, 503); assert.equal(failed.state().credits, 50);
});
test('legacy nonce never credits twice through the SSV callback and rejects invalid/expired sessions', async () => {
  const h = setup(); h.state().records[0].mode = 'legacy';
  assert.equal((await h.callback()).statusCode, 200); assert.equal(h.state().credits, 50);
  assert.equal((await h.legacy({ customData: '0'.repeat(48) })).body.creditsGranted, 10);
  await h.callback(); assert.equal(h.state().credits, 60);
  assert.equal((await h.legacy({ customData: 'bad' })).statusCode, 400);
  h.state().records[1].mode = 'legacy'; h.state().records[1].expiresAt = new Date(0);
  assert.equal((await h.legacy({ customData: '1'.repeat(48) })).statusCode, 410);
});
