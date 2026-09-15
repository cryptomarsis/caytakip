/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/pendingAdApplication.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function setup(storage = new Map(), send = async () => new Response(JSON.stringify({ item: { _id: 'application' } }))) {
  const exports = {}; const requests = [];
  vm.runInNewContext(code, { exports, console, require: name => name === './api' ? { API_URL: 'https://example.test/api', fetchWithTimeout: async (url, options) => { requests.push(options); assert.ok(storage.has('@caylik_pending_ad:u')); return send(url, options); } } : { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v), removeItem: async k => storage.delete(k) } });
  return { api: exports, storage, requests };
}
test('ad request persists before POST and restart reuses exact payload and operation ID', async () => {
  const first = setup(new Map(), async () => { throw Error('disconnected'); });
  await assert.rejects(first.api.sendAdApplication('u', 'token', '{"title":"a"}'), /disconnected/);
  const second = setup(first.storage);
  await second.api.sendAdApplication('u', 'new-token');
  assert.equal(second.requests[0].headers['Idempotency-Key'], first.requests[0].headers['Idempotency-Key']);
  assert.equal(second.requests[0].body, first.requests[0].body);
  assert.equal(await second.api.readPendingAd('u'), null);
});
test('ad pending blocks changed payload, stays account scoped and corrupt storage fails closed', async () => {
  const h = setup(new Map(), async () => { throw Error('timeout'); });
  await assert.rejects(h.api.sendAdApplication('u', 'token', '{"title":"a"}'));
  await assert.rejects(h.api.sendAdApplication('u', 'token', '{"title":"b"}'), /bekleyen/);
  assert.equal(h.requests.length, 1); assert.equal(await h.api.readPendingAd('other'), null);
  h.storage.set('@caylik_pending_ad:u', '<html>');
  await assert.rejects(h.api.sendAdApplication('u', 'token', '{}'), /okunamadı/);
  assert.equal(h.storage.get('@caylik_pending_ad:u'), '<html>');
});
test('concurrent ad submits use one request; ambiguous errors preserve identity', async () => {
  const h = setup(new Map(), async () => new Response('<html>'));
  const first = h.api.sendAdApplication('u', 'token', '{}');
  const second = h.api.sendAdApplication('u', 'token', '{}');
  assert.equal(first, second); await assert.rejects(first); assert.equal(h.requests.length, 1);
  assert.ok(await h.api.readPendingAd('u'));
  for (const status of [401, 403, 409, 429, 500, 503]) {
    const retry = setup(h.storage, async () => new Response('{"error":"pending"}', { status }));
    await assert.rejects(retry.api.sendAdApplication('u', 'token'));
    assert.equal(retry.requests[0].headers['Idempotency-Key'], h.requests[0].headers['Idempotency-Key']);
  }
});
test('explicit validation failure clears pending; malformed success never clears it', async () => {
  const h = setup(new Map(), async () => new Response('{"error":"invalid"}', { status: 400 }));
  await assert.rejects(h.api.sendAdApplication('u', 'token', '{}')); assert.equal(await h.api.readPendingAd('u'), null);
  const broken = setup(new Map(), async () => new Response('{}'));
  await assert.rejects(broken.api.sendAdApplication('u', 'token', '{}')); assert.ok(await broken.api.readPendingAd('u'));
});
test('SSV client never falls back after verification failure and ignores development earnings', () => {
  const client = fs.readFileSync(path.join(__dirname, '../src/components/RewardedAdButton.native.tsx'), 'utf8');
  assert.ok(client.includes("data.mode === 'legacy' && !__DEV__"));
  const screen = fs.readFileSync(path.join(__dirname, '../src/screens/AdvertiseScreen.tsx'), 'utf8');
  assert.ok(screen.includes('sendAdApplication(userId, token)'));
  assert.ok(screen.includes('Bekleyen başvuruyu kontrol et'));
});
test('earned compatibility reward survives restart and old confirmation cannot clear a newer reward', async () => {
  const storage = new Map();
  const load = () => {
    const exports = {};
    const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/pendingAdReward.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(compiled, { exports, require: () => ({ getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v), removeItem: async k => storage.delete(k) }) });
    return exports;
  };
  const a = 'a'.repeat(48); const b = 'b'.repeat(48);
  await load().savePendingAdReward('u', a);
  const api = load(); assert.equal(await api.readPendingAdReward('u'), a);
  assert.equal(await api.readPendingAdReward('other'), null);
  await Promise.all([api.savePendingAdReward('u', b), api.clearPendingAdReward('u', a)]);
  assert.equal(await api.readPendingAdReward('u'), b);
  await api.clearPendingAdReward('u', b); assert.equal(await api.readPendingAdReward('u'), null);
});
