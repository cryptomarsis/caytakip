/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const plan = { enabled: true, hour: 19, minute: 5, seasonStart: '2026-09-15', seasonEnd: '2026-10-15' };
const plain = value => JSON.parse(JSON.stringify(value));
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function harness() {
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [new Date(2026, 8, 15, 10).getTime()])); }
  }
  const shared = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/seasonReminders.js'), 'utf8'), { module: shared, Date: ClockDate });
  const calls = [];
  const apiUrl = 'https://example.invalid/api';
  const defaultRequest = async (...args) => {
    calls.push(args);
    return response({ settings: plan, revision: 2 });
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/seasonReminderPolicy.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Date: ClockDate, require(name) {
    if (name === '../../shared/seasonReminders') return shared.exports;
    if (name === './api') return { API_URL: apiUrl, fetchWithTimeout: defaultRequest };
    throw Error(`Unexpected dependency: ${name}`);
  } });
  return { api: exports, calls, apiUrl };
}

test('policy parser preserves safe revision and canonical settings while dropping extra fields', () => {
  const { api } = harness();
  assert.deepEqual(plain(api.emptySeasonPolicy()), {
    settings: { enabled: false, hour: 19, minute: 0, seasonStart: '', seasonEnd: '' }, revision: 0,
  });
  assert.deepEqual(plain(api.parseSeasonPolicy({ settings: { ...plan, recipient: 'everyone' }, revision: 12, extra: 'ignored' })), { settings: plan, revision: 12 });
  for (const revision of [-1, 1.5, '2', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => api.parseSeasonPolicy({ settings: plan, revision }), /doğrulanamadı/);
  }
  assert.throws(() => api.parseSeasonPolicy(null), /doğrulanamadı/);
  assert.throws(() => api.parseSeasonPolicy({ settings: { ...plan, seasonEnd: '2026-02-30' }, revision: 1 }));
  const expired = api.parseSeasonPolicy({ settings: { ...plan, seasonStart: '2026-08-01', seasonEnd: '2026-08-31' }, revision: 8 });
  assert.equal(expired.settings.enabled, false);
  assert.equal(expired.revision, 8);
});

test('GET uses the injected authenticated request and returns its updated revision', async () => {
  const { api, calls, apiUrl } = harness();
  const injected = [];
  const result = await api.loadSeasonReminderPolicy('initial-token', async (...args) => {
    injected.push(args);
    // Authentication retry is owned by the injected app request, not this service.
    return response({ settings: plan, revision: 24 });
  });
  assert.equal(calls.length, 0);
  assert.equal(injected.length, 1);
  assert.equal(injected[0][0], `${apiUrl}/season-reminder`);
  assert.equal(injected[0][1].headers.Authorization, 'Bearer initial-token');
  assert.deepEqual(plain(result), { settings: plan, revision: 24 });
  await assert.rejects(api.loadSeasonReminderPolicy('', async () => { throw Error('must not request'); }), /giriş yapın/);
});

test('PUT sends the caller revision and validated fields through the injected request', async () => {
  const { api, calls, apiUrl } = harness();
  let sent;
  const result = await api.saveSeasonReminderPolicy('admin-token', { settings: { ...plan, arbitraryMessage: 'not sent' }, revision: 9 }, async (url, options) => {
    sent = { url, options };
    return response({ settings: { ...plan, hour: 20 }, revision: 10 });
  });
  assert.equal(calls.length, 0);
  assert.equal(sent.url, `${apiUrl}/admin/season-reminder`);
  assert.equal(sent.options.method, 'PUT');
  assert.equal(sent.options.headers.Authorization, 'Bearer admin-token');
  assert.equal(sent.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(sent.options.body), { settings: plan, revision: 9 });
  assert.deepEqual(plain(result), { settings: { ...plan, hour: 20 }, revision: 10 });
  await assert.rejects(api.saveSeasonReminderPolicy('admin-token', { settings: { ...plan, hour: 25 }, revision: 9 }, async () => { throw Error('must not request'); }), /saati seçin/);
});

test('policy HTTP errors and malformed successful payloads cannot masquerade as a saved plan', async () => {
  const { api } = harness();
  await assert.rejects(api.loadSeasonReminderPolicy('token', async () => response({}, 404)), /henüz hazır değil/);
  await assert.rejects(api.loadSeasonReminderPolicy('token', async () => response({}, 401)), /yüklenemedi/);
  const policy = { settings: plan, revision: 2 };
  for (const [status, message] of [[403, 'Yalnızca ana yönetici'], [409, 'Plan başka bir oturumda değişti.']]) {
    await assert.rejects(api.saveSeasonReminderPolicy('token', policy, async () => response({ error: message }, status)), error => error.message === message);
  }
  const badJson = status => ({ ok: status === 200, status, json: async () => { throw Error('bad JSON'); } });
  await assert.rejects(api.loadSeasonReminderPolicy('token', async () => badJson(200)), /doğrulanamadı/);
  await assert.rejects(api.saveSeasonReminderPolicy('token', policy, async () => badJson(503)), /kaydedilemedi/);
  await assert.rejects(api.saveSeasonReminderPolicy('token', policy, async () => response({ settings: plan, revision: '3' })), /doğrulanamadı/);
});

test('authenticated request failures propagate, and omitted request remains isolated to the fallback', async () => {
  const { api, calls } = harness();
  const failure = Error('Oturum değişti.');
  const deniedRequest = async () => { throw failure; };
  await assert.rejects(api.loadSeasonReminderPolicy('token', deniedRequest), error => error === failure);
  await assert.rejects(api.saveSeasonReminderPolicy('token', { settings: plan, revision: 2 }, deniedRequest), error => error === failure);
  assert.equal(calls.length, 0);
  assert.equal((await api.loadSeasonReminderPolicy('test-fallback-token')).revision, 2);
  assert.equal(calls.length, 1);
});
