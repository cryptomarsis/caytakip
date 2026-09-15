/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const { createVerifier } = require('../server/adRewardVerification');
const idem = require('../server/idempotency');
const { validateBackup, restoreBackup } = require('../server/backupRestore');

function loadTs(file, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (!(name in deps)) throw Error(name); return deps[name]; }, console, setTimeout, clearTimeout, Response, URLSearchParams });
  return exports;
}
function queue() {
  const storage = new Map();
  return { storage, api: loadTs('src/services/offlineQueue.ts', { '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); }, removeItem: async key => { storage.delete(key); } } }) };
}
const request = id => ({ id, userId: 'a', endpoint: '/harvests', method: 'POST', body: { kg: 42 } });
const ok = () => new Response(JSON.stringify({ _id: 'record' }), { status: 201 });

test('queue merges simultaneous enqueues and keeps requests added during sync', async () => {
  const { api } = queue();
  await Promise.all([api.enqueueOfflineRequest(request('one')), api.enqueueOfflineRequest(request('two'))]);
  assert.equal((await api.getOfflineRequests('a')).length, 2);
  let unblock; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const sending = api.syncOfflineRequests('a', async () => { entered(); await new Promise(resolve => { unblock = resolve; }); return ok(); });
  await started;
  await api.enqueueOfflineRequest(request('three'));
  await api.discardOfflineRequest('a', 'two');
  // Send snapshot also contains two; release each send without real network.
  unblock();
  await new Promise(resolve => setTimeout(resolve, 0));
  unblock();
  await sending;
  const left = await api.getOfflineRequests('a');
  assert.deepEqual(Array.from(left, item => item.id), ['three']);
});
test('parallel syncs share one sender and keep the original operation ID', async () => {
  const { api } = queue(); await api.enqueueOfflineRequest(request('same-key'));
  let calls = 0;
  const send = async item => { calls++; assert.equal(item.id, 'same-key'); await new Promise(resolve => setTimeout(resolve, 5)); return ok(); };
  await Promise.all([api.syncOfflineRequests('a', send), api.syncOfflineRequests('a', send)]);
  assert.equal(calls, 1); assert.equal(await api.getPendingRequestCount('a'), 0);
});
test('corrupt storage is not silently replaced or erased', async () => {
  const { api, storage } = queue(); storage.set('@cay_takip_offline_queue_v1', '{}');
  await assert.rejects(api.enqueueOfflineRequest(request('next')), /okunamadı/);
  assert.equal(storage.get('@cay_takip_offline_queue_v1'), '{}');
});
test('an old purchase confirmation cannot remove a newer pending transaction or another account', async () => {
  const storage = new Map();
  const api = loadTs('src/services/pendingPurchase.ts', { '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) } });
  await api.savePendingPurchase('a', 'first'); await api.savePendingPurchase('b', 'other');
  await Promise.all([api.savePendingPurchase('a', 'second'), api.clearPendingPurchase('a', 'first')]);
  assert.equal(await api.readPendingPurchase('a'), 'second'); assert.equal(await api.readPendingPurchase('b'), 'other');
});
test('malformed success and processing conflicts preserve pending writes', async () => {
  const { api } = queue(); await api.enqueueOfflineRequest(request('one'));
  await api.syncOfflineRequests('a', async () => new Response('<html/>'));
  assert.equal(await api.getPendingRequestCount('a'), 1);
  await api.syncOfflineRequests('a', async () => new Response(JSON.stringify({ code: 'REQUEST_IN_PROGRESS' }), { status: 409 }));
  assert.equal(await api.getPendingRequestCount('a'), 1);
  await api.syncOfflineRequests('a', async () => new Response(JSON.stringify({ code: 'DUPLICATE_RECEIPT', error: 'Fiş zaten var' }), { status: 409 }));
  assert.equal(await api.getFailedRequestCount('a'), 1);
});
test('array loader rejects HTML/object success; pagination cannot report truncated success', async () => {
  const api = loadTs('src/services/paginatedData.ts');
  for (const body of ['<html/>', '{}', 'null']) assert.equal((await api.fetchArrayCollection(async () => new Response(body), '/')).ok, false);
  assert.equal((await api.fetchCursorCollection(async () => new Response('[{"_id":"a"}]'), '/', {}, 1, 1)).ok, false);
  assert.equal((await api.fetchArrayCollection(async () => new Response('[]'), '/')).ok, true);
});
test('timeline keeps real payment entries separate and quick entry never reuses price/amount/date', () => {
  const api = loadTs('src/utils/transactionTimeline.ts');
  const harvests = [{ _id: 'h', tarih: '14.09.2026', firma: 'ÇAYKUR', kg: 100, fiyat: 32, tahsilat: 300, quotaPlanId: 'wallet' }];
  const timeline = api.buildTimeline(harvests, [{ _id: 'p', tarih: '2026-09-15', tutar: 300, harvestId: 'h' }], [{ _id: 'e', tarih: '2026-09-13', tutar: 90 }]);
  assert.equal(timeline.length, 3); assert.equal(timeline[0].kind, 'payment'); assert.equal(timeline[0].detail, 'ÇAYKUR');
  const defaults = api.lastHarvestDefaults(harvests, '16.09.2026');
  assert.equal(defaults.quotaPlanId, 'wallet'); assert.equal(defaults.date, '16.09.2026'); assert.equal(defaults.fiyat, ''); assert.equal(defaults.kg, ''); assert.equal(defaults.tahsilat, '0');
});

const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
test('idempotency reserves before write, rejects changed bodies and replays committed result', async () => {
  let row; let writes = 0;
  const middleware = idem({ create: async item => { if (row) throw Object.assign(Error(), { code: 11000 }); row = item; }, findOne: () => ({ lean: async () => row }), updateOne: async (_filter, update) => { Object.assign(row, update.$set); } });
  const req = { headers: { 'idempotency-key': 'record-key' }, auth: { userId: 'u' }, method: 'POST', path: '/harvests', body: { kg: 42 } };
  const first = res();
  await middleware(req, first, () => { assert.ok(row); writes++; });
  const pending = res(); await middleware(req, pending, () => { writes++; }); assert.equal(pending.statusCode, 409);
  first.status(201).json({ _id: 'saved' }); await new Promise(resolve => setTimeout(resolve, 0));
  const replay = res(); await middleware(req, replay, () => { writes++; }); assert.equal(replay.statusCode, 201); assert.equal(replay.body._id, 'saved'); assert.equal(writes, 1);
  const changed = res(); await middleware({ ...req, body: { kg: 99 } }, changed, () => { writes++; }); assert.equal(changed.body.code, 'REQUEST_MISMATCH');
});
test('SSV verifies the raw signed query, rejects tampering, duplicate fields and foreign ad units', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const verify = createVerifier(async () => ({ keys: [{ keyId: 123, pem: publicKey.export({ type: 'spki', format: 'pem' }) }] }));
  const signed = query => '/api/webhooks/admob?' + query + '&signature=' + crypto.sign('sha256', Buffer.from(query), privateKey).toString('base64url') + '&key_id=123';
  const query = `ad_unit=3226384358&custom_data=${'a'.repeat(48)}&transaction_id=abcd1234&user_id=user%2B1`;
  assert.equal((await verify(signed(query))).user_id, 'user+1');
  await assert.rejects(verify(signed(query).replace('abcd1234', 'abcd4321')), /imzası/);
  await assert.rejects(verify(signed(query + '&user_id=other')), /Tekrarlı/);
  await assert.rejects(verify(signed(query.replace('3226384358', 'foreign'))), /geçersiz/);
});
test('backup validates original relationship IDs and rejects orphan or cross-account payments', async () => {
  const body = { users: [], harvests: [{ _id: 'a'.repeat(24), userId: 'u' }], payments: [{ _id: 'b'.repeat(24), harvestId: 'a'.repeat(24), userId: 'u' }] };
  assert.equal(validateBackup(body, Object.keys(body)), 2);
  assert.throws(() => validateBackup({ ...body, payments: [{ ...body.payments[0], userId: 'other' }] }, Object.keys(body)), /başka kullanıcıya/);
  assert.throws(() => validateBackup({ ...body, harvests: [] }, Object.keys(body)), /eksik/);
  const captured = [];
  const model = { exists: () => ({ session: async () => null }), create: async rows => captured.push(rows[0]) };
  await restoreBackup(body, { users: model, harvests: model, payments: model }, { startSession: async () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) });
  assert.equal(captured[0]._id, body.harvests[0]._id); assert.equal(captured[1].harvestId, captured[0]._id);
});
test('restore refuses merging into nonempty business collections before writes', async () => {
  let writes = 0;
  const model = { exists: () => ({ session: async () => ({ _id: 'existing' }) }), create: async () => { writes++; } };
  await assert.rejects(restoreBackup({ users: [], harvests: [], payments: [] }, { users: model, harvests: model, payments: model }, { startSession: async () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) }), /Hedef veritabanında/);
  assert.equal(writes, 0);
});
