const test = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../server/sharecroppingPush');
const token = 'ExponentPushToken[device_1]';
function harness(job = {}) {
  const state = { job: { _id: 'event', recipient: 'owner', linkId: 'link', state: 'pending', attempts: 0, createdAt: new Date(), ...job }, activeSession: true, deviceDeleted: [], updates: [], sent: [], profile: true, link: true, fail: false };
  const q = value => ({ sort() { return this; }, limit() { return this; }, lean: async () => value });
  let handler;
  const api = setup({ post: (path, auth, fn) => { handler = fn; } }, {
    requireAuth() {}, mongoose: { connection: { readyState: 1 } },
    UserProfile: { exists: async () => state.profile }, ShareLink: { exists: async () => state.link },
    Session: { exists: async () => state.activeSession, findOne: () => q(state.activeSession ? { createdAt: new Date(), expiresAt: new Date(Date.now() + 10000) } : null) },
    SharePushDevice: { find: () => q([{ _id: token, sessionHash: 'session' }]), deleteOne: async filter => state.deviceDeleted.push(filter), updateOne: async (filter, update) => { state.deviceWrite = { filter, update }; } },
    ShareEvent: { findOneAndUpdate: async () => { const old = state.job; state.job = null; return old; }, updateOne: async (filter, update) => state.updates.push(update.$set) },
  });
  api.stop();
  return { state, api, handler };
}
test('Expo token format validation is strict', () => {
  assert(setup.tokenValid(token)); assert(!setup.tokenValid('https://example.org')); assert(!setup.tokenValid('ExpoPushToken[]'));
});
test('push worker gates sessions and masks financial content; ambiguous jobs never resend', async t => {
  const prior = process.env.SHARECROPPING_PUSH_ENABLED, originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; if (prior === undefined) delete process.env.SHARECROPPING_PUSH_ENABLED; else process.env.SHARECROPPING_PUSH_ENABLED = prior; });
  let calls = [];
  global.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ data: [{ status: 'ok', id: 'ticket' }] }) }; };
  process.env.SHARECROPPING_PUSH_ENABLED = 'false';
  const disabled = harness(); await disabled.api.tick(); assert.equal(calls.length, 0); assert(disabled.state.job);
  process.env.SHARECROPPING_PUSH_ENABLED = 'true';
  for (const key of ['activeSession', 'profile', 'link']) { const h = harness(); h.state[key] = false; await h.api.tick(); assert.equal(calls.length, 0); }
  const stale = harness({ createdAt: new Date(Date.now() - 90000000) }); await stale.api.tick(); assert.equal(calls.length, 0);
  const h = harness({ message: 'Private 100 kg 5000 TL' }); await h.api.tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].body[0].data.owner, 'owner'); assert.doesNotMatch(calls[0].body[0].body, /100|5000|Private/);
  assert.equal(h.state.updates[0].state, 'receipts');
  const ambiguous = harness({ state: 'sending' }); await ambiguous.api.tick(); assert.equal(calls.length, 1); assert.equal(ambiguous.state.updates[0].lastError, 'AMBIGUOUS_SEND');
  global.fetch = async () => { throw Error('timeout'); };
  const uncertain = harness(); await uncertain.api.tick(); assert.equal(uncertain.state.updates[0].state, 'failed');
});
test('receipt errors remove only the matching session device; receipt retry does not send again', async t => {
  const prior = process.env.SHARECROPPING_PUSH_ENABLED, originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; if (prior === undefined) delete process.env.SHARECROPPING_PUSH_ENABLED; else process.env.SHARECROPPING_PUSH_ENABLED = prior; });
  process.env.SHARECROPPING_PUSH_ENABLED = 'true';
  global.fetch = async url => { assert.match(url, /getReceipts$/); return { ok: true, json: async () => ({ data: { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }) }; };
  const h = harness({ state: 'receipts', tickets: [{ id: 'ticket', token, sessionHash: 'old-session' }] });
  await h.api.tick(); assert.deepEqual(h.state.deviceDeleted, [{ _id: token, sessionHash: 'old-session' }]);
  global.fetch = async () => { throw Error('timeout'); };
  const retry = harness({ state: 'receipts', attempts: 1, tickets: [{ id: 'ticket' }] }); await retry.api.tick(); assert.equal(retry.state.updates[0].state, 'receipts');
});
test('device binding requires a live session belonging to the authenticated user', async () => {
  const h = harness(), req = { auth: { userId: 'owner' }, body: { token, refreshToken: 'opaque' } };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  h.state.activeSession = false; await h.handler(req, res); assert.equal(res.code, 401); assert.equal(h.state.deviceWrite, undefined);
  h.state.activeSession = true; res.code = 200; await h.handler(req, res); assert.equal(res.code, 200);
  assert.equal(h.state.deviceWrite.update.$set.userId, 'owner'); assert.equal(h.state.deviceWrite.update.$set.sessionHash.length, 64);
  assert(h.state.deviceWrite.filter.$or[0].sessionCreatedAt.$lte instanceof Date);
});
