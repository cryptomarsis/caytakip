/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const XLSX = require('xlsx');

const range = { start: '2026-09-01', end: '2026-09-03' };
const emptyCounts = { harvestCount: 0, paymentCount: 0, expenseCount: 0, gardenCount: 0, totalCount: 0 };
const clone = value => JSON.parse(JSON.stringify(value));
const fixture = () => ({
  ...range, generatedAt: '2026-09-04T10:00:00.000Z', timezone: 'UTC', excludedUnknownDates: 2,
  users: [
    { userKey: 'user_' + 'a'.repeat(24), registeredAt: '2026-08-01T09:00:00.000Z', harvestCount: 2, paymentCount: 1, expenseCount: 1, gardenCount: 0, totalCount: 4, activeDays: 2, lastEntryAt: '2026-09-03T11:00:00.000Z' },
    { userKey: 'user_' + 'b'.repeat(24), registeredAt: null, ...emptyCounts, activeDays: 0, lastEntryAt: null },
  ],
  daily: [
    { date: '2026-09-01', ...emptyCounts, harvestCount: 1, totalCount: 1, activeUsers: 1 },
    { date: '2026-09-02', ...emptyCounts, activeUsers: 0 },
    { date: '2026-09-03', ...emptyCounts, harvestCount: 1, paymentCount: 1, expenseCount: 1, totalCount: 3, activeUsers: 1 },
  ],
  totals: { userCount: 2, activeUsers: 1, totalCount: 4 },
});
const transpile = source => ts.transpileModule(source, { fileName: 'fixture.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText;
function load(relativePath, modules, globals = {}) {
  const exports = {};
  vm.runInNewContext(transpile(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')), {
    exports, ...globals, require: name => {
      if (!(name in modules)) throw Error('Unexpected dependency: ' + name);
      return modules[name];
    },
  });
  return exports;
}
const utilities = load('src/utils/activityExport.ts', { xlsx: XLSX });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function serviceHarness(platform = 'web') {
  const state = { active: true, available: true, writes: [], shares: [], deleted: [], links: [], revoked: [], blobs: [], write: null, share: null, availability: null };
  const service = load('src/services/activityExport.ts', {
    xlsx: XLSX, 'react-native': { Platform: { OS: platform } }, './api': { API_URL: 'https://example.invalid/api' }, '../utils/activityExport': utilities,
    'expo-file-system/legacy': {
      cacheDirectory: 'cache://activity-test/', EncodingType: { Base64: 'base64' },
      writeAsStringAsync: async (...args) => { state.writes.push(args); if (state.write) await state.write(); },
      deleteAsync: async (...args) => { state.deleted.push(args); },
    },
    'expo-sharing': {
      isAvailableAsync: async () => state.availability ? state.availability() : state.available,
      shareAsync: async (...args) => { state.shares.push(args); if (state.share) await state.share(); },
    },
  }, {
    Blob: class { constructor(parts, options) { this.parts = parts; this.type = options.type; state.blobs.push(this); } },
    URL: { createObjectURL: () => 'blob:synthetic-test', revokeObjectURL: url => state.revoked.push(url) },
    document: {
      createElement: tag => { assert.equal(tag, 'a'); const link = { clicks: 0, removed: false, click() { this.clicks++; }, remove() { this.removed = true; } }; state.links.push(link); return link; },
      body: { appendChild: () => {} },
    },
    setTimeout: callback => { callback(); return 0; },
  });
  return { service, state };
}

test('date ranges use real calendar days and allow at most 366 inclusive days', () => {
  assert.deepEqual(clone(utilities.validateActivityRange('2024-01-01', '2024-12-31')), { start: '2024-01-01', end: '2024-12-31' });
  assert.equal(utilities.activityDate('2024-02-29'), Date.UTC(2024, 1, 29));
  for (const [start, end] of [
    ['2026-02-30', '2026-03-01'], ['2026-02-29', '2026-03-01'], ['01.09.2026', range.end],
    [range.start, '2026-08-31'], ['2024-01-01', '2025-01-01'], ['2026-13-01', range.end],
    ['', range.end], ['2026-09-01T00:00:00Z', range.end],
  ]) assert.throws(() => utilities.validateActivityRange(start, end));
});

test('real XLSX write/read retains three Turkish sheets and numeric counts', () => {
  const workbook = utilities.buildActivityWorkbook(utilities.parseActivityExport(fixture(), range));
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true });
  const decoded = XLSX.read(bytes, { type: 'buffer' });
  assert.deepEqual(decoded.SheetNames, ['Kullanıcılar', 'Günlük Kullanım', 'Rapor Bilgisi']);
  const userRows = XLSX.utils.sheet_to_json(decoded.Sheets['Kullanıcılar'], { header: 1, defval: null });
  assert.deepEqual(userRows[0], ['Kullanıcı kodu', 'Üyelik tarihi (UTC)', 'Hasat kaydı', 'Tahsilat kaydı', 'Gider kaydı', 'Bahçe kaydı', 'Toplam kayıt', 'Kayıt girilen gün', 'Son kayıt (UTC)']);
  assert.equal(userRows[1][0], fixture().users[0].userKey);
  assert.equal(userRows[1][2], 2); assert.equal(userRows[1][6], 4); assert.equal(userRows[1][7], 2);
  assert.equal(userRows[2][1], null); assert.equal(userRows[2][6], 0); assert.equal(userRows[2][8], null);
  for (const address of ['C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'G3']) assert.equal(decoded.Sheets['Kullanıcılar'][address].t, 'n');
  assert.equal(decoded.Sheets['Günlük Kullanım'].A1.v, 'Gün (UTC)');
  assert.equal(decoded.Sheets['Günlük Kullanım'].G1.v, 'Kayıt giren kullanıcı');
  assert.equal(decoded.Sheets['Günlük Kullanım'].F4.v, 3);
  assert.equal(decoded.Sheets['Rapor Bilgisi'].B6.v, 2);
  assert.equal(decoded.Sheets['Rapor Bilgisi'].B8.v, 4);
  assert.equal(decoded.Sheets['Rapor Bilgisi'].B9.v, 2);
  assert.equal(decoded.Sheets['Kullanıcılar']['!autofilter'].ref, 'A1:I3');
});

test('only allowlisted fields reach parsed data or cells; private data and formula payloads are dropped', () => {
  const input = fixture();
  const injected = { name: 'PRIVATE_NAME', phone: 'PRIVATE_PHONE', pin: 'PRIVATE_PIN', token: 'PRIVATE_TOKEN', amount: 999987654, message: 'PRIVATE_MESSAGE', formula: '=WEBSERVICE("PRIVATE_URL")' };
  Object.assign(input, injected);
  for (const row of [...input.users, ...input.daily]) Object.assign(row, injected);
  Object.assign(input.totals, injected);
  const parsed = utilities.parseActivityExport(input, range);
  const workbook = utilities.buildActivityWorkbook(parsed);
  const decoded = XLSX.read(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' });
  const text = JSON.stringify(parsed) + JSON.stringify(decoded.Sheets);
  for (const value of Object.values(injected)) assert(!text.includes(String(value)), String(value));
  assert.deepEqual(Object.keys(parsed.users[0]).sort(), ['activeDays', 'expenseCount', 'gardenCount', 'harvestCount', 'lastEntryAt', 'paymentCount', 'registeredAt', 'totalCount', 'userKey'].sort());
  for (const sheet of Object.values(decoded.Sheets)) for (const [key, cell] of Object.entries(sheet)) if (!key.startsWith('!')) assert.equal(cell.f, undefined);
});

test('malformed envelopes, opaque keys, counts, dates and totals are rejected', () => {
  const mutations = [
    value => { value.timezone = 'Europe/Istanbul'; }, value => { value.start = '2026-08-01'; },
    value => { value.generatedAt = 'bad'; }, value => { value.excludedUnknownDates = -1; },
    value => { value.users = {}; }, value => { value.daily = null; },
    value => { value.users = Array(20001).fill(value.users[0]); }, value => { value.daily = Array(367).fill(value.daily[0]); },
    value => { value.users[0].userKey = 'PRIVATE_PHONE'; }, value => { value.users[1].userKey = value.users[0].userKey; },
    value => { value.users[0].harvestCount = '2'; }, value => { value.users[0].totalCount = 8; },
    value => { value.users[0].paymentCount = -1; }, value => { value.users[0].expenseCount = 0.5; },
    value => { value.users[0].gardenCount = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.users[0].activeDays = 0; }, value => { value.users[0].lastEntryAt = null; },
    value => { value.users[0].registeredAt = '01.08.2026'; }, value => { value.users[0].lastEntryAt = '2026-09-04T00:00:00.000Z'; },
    value => { value.users[1].lastEntryAt = '2026-09-01T00:00:00.000Z'; },
    value => { value.daily[1].date = value.daily[0].date; }, value => { value.daily[1].date = '2026-09-04'; },
    value => { value.daily[1].activeUsers = 1; }, value => { value.daily[2].activeUsers = 3; },
    value => { value.totals.userCount = 9; }, value => { value.totals.activeUsers = 2; }, value => { value.totals.totalCount = 3; },
  ];
  for (const [index, mutate] of mutations.entries()) { const input = fixture(); mutate(input); assert.throws(() => utilities.parseActivityExport(input, range), 'Mutation ' + index); }
  for (const input of [null, [], '', {}]) assert.throws(() => utilities.parseActivityExport(input, range));
});

test('normalized invalid dates and implicit device-local timestamps cannot masquerade as UTC', () => {
  for (const timestamp of ['2026-02-30T12:00:00.000Z', '2026-09-04T10:00:00', '2026-09-04T10:00:00.000+03:00']) {
    const input = fixture(); input.generatedAt = timestamp;
    assert.throws(() => utilities.parseActivityExport(input, range), timestamp);
  }
});

test('active-day bounds and per-category/day participation reconciliations prevent contradictory sheets', () => {
  const input = fixture();
  input.users[0].activeDays = 4;
  assert.throws(() => utilities.parseActivityExport(input, range));
  const categories = fixture(); categories.daily[0].harvestCount = 0; categories.daily[0].paymentCount = 1;
  assert.throws(() => utilities.parseActivityExport(categories, range));
  const participation = fixture(); participation.users[0].activeDays = 3;
  assert.throws(() => utilities.parseActivityExport(participation, range));
  const inflated = fixture(); inflated.users[0].activeDays = 3;
  inflated.users.push({ ...inflated.users[1], userKey: 'user_' + 'c'.repeat(24) }); inflated.totals.userCount = 3;
  inflated.daily[0] = { date: range.start, ...emptyCounts, activeUsers: 0 };
  inflated.daily[2] = { date: range.end, harvestCount: 2, paymentCount: 1, expenseCount: 1, gardenCount: 0, totalCount: 4, activeUsers: 3 };
  assert.throws(() => utilities.parseActivityExport(inflated, range));
});

test('all-zero activity still yields usable sheets with numeric zero totals', () => {
  const input = fixture(); input.users = []; input.totals = { userCount: 0, activeUsers: 0, totalCount: 0 };
  input.daily = input.daily.map(row => ({ date: row.date, ...emptyCounts, activeUsers: 0 }));
  const decoded = XLSX.read(XLSX.write(utilities.buildActivityWorkbook(utilities.parseActivityExport(input, range)), { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' });
  assert.equal(decoded.SheetNames.length, 3);
  assert.equal(decoded.Sheets['Kullanıcılar']['!ref'], 'A1:I1');
  assert.equal(decoded.Sheets['Rapor Bilgisi'].B6.v, 0);
  assert.equal(decoded.Sheets['Rapor Bilgisi'].B6.t, 'n');
});

test('transport uses the supplied authenticated GET, bounded timeout, dates and AbortSignal', async () => {
  const h = serviceHarness(); const calls = []; const controller = new AbortController();
  const report = await h.service.loadActivityExport('admin-token', range.start, range.end, async (...args) => { calls.push(args); return { ok: true, json: async () => fixture() }; }, controller.signal);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://example.invalid/api/admin/activity-export?start=2026-09-01&end=2026-09-03');
  assert.equal(calls[0][1].method || 'GET', 'GET');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer admin-token');
  assert.equal(calls[0][1].signal, controller.signal); assert.equal(calls[0][2], 120000);
  assert.equal(report.totals.totalCount, 4);
});

test('invalid ranges, missing auth, malformed success payloads and 404/401/403 produce explicit errors', async () => {
  const h = serviceHarness(); let requests = 0;
  const request = async () => { requests++; return { ok: true, json: async () => fixture() }; };
  await assert.rejects(h.service.loadActivityExport('', range.start, range.end, request), /giriş yapın/);
  await assert.rejects(h.service.loadActivityExport('token', range.end, range.start, request));
  assert.equal(requests, 0);
  for (const [status, expected] of [[404, /Sunucu güncellemesi/], [401, /asıl yönetici/], [403, /asıl yönetici/], [503, /server unavailable/]]) {
    await assert.rejects(h.service.loadActivityExport('token', range.start, range.end, async () => ({ ok: false, status, json: async () => ({ error: 'server unavailable' }) })), expected);
  }
  await assert.rejects(h.service.loadActivityExport('token', range.start, range.end, async () => ({ ok: true, json: async () => ({}) })));
  await assert.rejects(h.service.loadActivityExport('token', range.start, range.end, async () => ({ ok: true, json: async () => { throw Error('invalid JSON'); } })));
});

test('web export creates one XLSX download and always removes its synthetic link/object URL', async () => {
  const h = serviceHarness();
  await h.service.saveActivityExport(utilities.parseActivityExport(fixture(), range), () => h.state.active);
  assert.equal(h.state.links.length, 1); assert.equal(h.state.links[0].clicks, 1); assert.equal(h.state.links[0].removed, true);
  assert.match(h.state.links[0].download, /^Caylik_Kullanim_2026-09-01_2026-09-03_\d+\.xlsx$/);
  assert.deepEqual(h.state.revoked, ['blob:synthetic-test']);
  assert.equal(h.state.blobs[0].type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const decoded = XLSX.read(h.state.blobs[0].parts[0], { type: 'array' });
  assert.equal(decoded.Sheets['Kullanıcılar'].G2.v, 4);
  assert.equal(h.state.writes.length, 0);
});

test('inactive exports do not write or download, including cancellation immediately before browser download', async () => {
  for (const platform of ['web', 'ios']) {
    const h = serviceHarness(platform);
    await h.service.saveActivityExport(utilities.parseActivityExport(fixture(), range), () => false);
    assert.equal(h.state.writes.length, 0); assert.equal(h.state.links.length, 0); assert.equal(h.state.shares.length, 0);
  }
  const h = serviceHarness(); let checks = 0;
  await h.service.saveActivityExport(utilities.parseActivityExport(fixture(), range), () => ++checks === 1);
  assert.equal(h.state.links.length, 0); assert.equal(h.state.blobs.length, 0);
});

test('native export shares a real base64 workbook and deletes only its generated temporary file', async () => {
  const h = serviceHarness('ios');
  await h.service.saveActivityExport(utilities.parseActivityExport(fixture(), range), () => h.state.active);
  assert.equal(h.state.writes.length, 1); assert.equal(h.state.shares.length, 1); assert.equal(h.state.deleted.length, 1);
  const [uri, bytes, options] = h.state.writes[0];
  assert.match(uri, /^cache:\/\/activity-test\/Caylik_Kullanim_2026-09-01_2026-09-03_\d+\.xlsx$/);
  assert.equal(options.encoding, 'base64');
  assert.equal(XLSX.read(bytes, { type: 'base64' }).Sheets['Kullanıcılar'].G2.v, 4);
  assert.equal(h.state.shares[0][0], uri); assert.equal(h.state.deleted[0][0], uri);
  assert.equal(h.state.deleted[0][1].idempotent, true);
});

test('account switch during native file creation suppresses sharing and still cleans its cache file', async () => {
  const h = serviceHarness('android'); const pending = deferred(); const writing = deferred();
  h.state.write = async () => { writing.resolve(); await pending.promise; };
  const saved = h.service.saveActivityExport(utilities.parseActivityExport(fixture(), range), () => h.state.active);
  await writing.promise; h.state.active = false; pending.resolve(); await saved;
  assert.equal(h.state.shares.length, 0); assert.equal(h.state.deleted.length, 1);
  assert.equal(h.state.deleted[0][0], h.state.writes[0][0]);
});

test('native sharing unavailable or write/share failures cannot leave generated cache files behind', async () => {
  const unavailable = serviceHarness('ios'); unavailable.state.available = false;
  await assert.rejects(unavailable.service.saveActivityExport(utilities.parseActivityExport(fixture(), range), () => true), /paylaşımı kullanılamıyor/);
  assert.equal(unavailable.state.writes.length, 0);
  for (const failure of ['write', 'share']) {
    const h = serviceHarness('ios'); h.state[failure] = async () => { throw Error('synthetic failure'); };
    await assert.rejects(h.service.saveActivityExport(utilities.parseActivityExport(fixture(), range), () => true), /synthetic failure/);
    assert.equal(h.state.deleted.length, 1); assert.equal(h.state.deleted[0][0], h.state.writes[0][0]);
  }
});

function cardHarness({ role = 'admin', start = '01.09.2026' } = {}) {
  const source = ts.createSourceFile('card.tsx', fs.readFileSync(path.join(__dirname, '../src/components/AdminActivityExportCard.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const snippets = {};
  const find = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['isoDate', 'download'].includes(node.name.text)) snippets[node.name.text] = node.initializer.getText(source);
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') snippets.mount = node.arguments[0].getText(source);
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'AdminActivityExportCard') snippets.card = node.getText(source).replace('export default ', '');
    ts.forEachChild(node, find);
  };
  find(source);
  const state = { requests: [], saves: [], errors: [], messages: [], busy: false };
  const pending = deferred(), mounted = { current: false }, controller = { current: null };
  const exports = {};
  const ExportForm = () => {};
  vm.runInNewContext(transpile('const isoDate = ' + snippets.isoDate + '; exports.download = ' + snippets.download + '; exports.mount = ' + snippets.mount + '; ' + snippets.card + '; exports.card = AdminActivityExportCard;'), {
    exports, mounted, controller, inFlight: { current: false }, start, end: '03.09.2026', currentUser: { role, userId: 'admin-A', token: 'token-A' },
    request: () => {}, validateActivityRange: utilities.validateActivityRange, AbortController,
    setBusy: value => { state.busy = value; }, setError: value => state.errors.push(value), setMessage: value => state.messages.push(value),
    loadActivityExport: async (...args) => { state.requests.push(args); return pending.promise; },
    saveActivityExport: async (...args) => { state.saves.push(args); }, Platform: { OS: 'web' },
    React: { createElement: (type, props) => ({ type, props }) }, ExportForm,
  });
  const cleanup = exports.mount();
  return { api: exports, state, pending, cleanup, controller, ExportForm };
}

test('card is main-admin-only and keyed per account; unmount aborts a late download before saving', async () => {
  const h = cardHarness();
  assert.equal(h.api.card({ currentUser: { role: 'manager', userId: 'M' } }), null);
  assert.equal(h.api.card({ currentUser: { role: 'user', userId: 'U' } }), null);
  const card = h.api.card({ currentUser: { role: 'admin', userId: 'A' } });
  assert.equal(card.props.key, 'A'); assert.equal(card.type, h.ExportForm);
  const download = h.api.download();
  h.cleanup(); assert.equal(h.controller.current.signal.aborted, true);
  h.pending.resolve(fixture()); await download;
  assert.equal(h.state.saves.length, 0); assert(!h.state.messages.some(Boolean));
});

test('card prevents duplicate downloads and rejects malformed dates before requesting data', async () => {
  const h = cardHarness(); const download = h.api.download(); await h.api.download();
  assert.equal(h.state.requests.length, 1); assert.equal(h.state.busy, true);
  h.pending.resolve(fixture()); await download;
  assert.equal(h.state.saves.length, 1); assert.equal(h.state.busy, false);
  assert(h.state.messages.some(message => message.includes('2 kullanıcı')));
  const invalid = cardHarness({ start: '32.09.2026' }); await invalid.api.download();
  assert.equal(invalid.state.requests.length, 0); assert(invalid.state.errors.some(Boolean));
  const manager = cardHarness({ role: 'manager' }); await manager.api.download();
  assert.equal(manager.state.requests.length, 0);
});

function timeoutHarness() {
  const state = { signals: [], timer: null, cleared: [] };
  const api = load('src/services/api.ts', {}, {
    AbortController,
    setTimeout: callback => { state.timer = callback; return 123; },
    clearTimeout: id => state.cleared.push(id),
    fetch: async (_url, options) => {
      state.signals.push(options.signal);
      return new Promise((_resolve, reject) => {
        const abort = () => reject(Object.assign(Error('synthetic cancellation'), { name: 'AbortError' }));
        if (options.signal.aborted) abort();
        else options.signal.addEventListener('abort', abort, { once: true });
      });
    },
  });
  return { api, state };
}

test('real timeout transport forwards pre-aborted and later-aborted external signals and removes listeners', async (t) => {
  for (const preAborted of [true, false]) {
    const h = timeoutHarness(); const controller = new AbortController();
    const removed = t.mock.method(controller.signal, 'removeEventListener');
    if (preAborted) controller.abort();
    const request = h.api.fetchWithTimeout('https://example.invalid/synthetic', { signal: controller.signal });
    if (!preAborted) controller.abort();
    await assert.rejects(request);
    assert.equal(h.state.signals.length, 1); assert.equal(h.state.signals[0].aborted, true);
    assert.notEqual(h.state.signals[0], controller.signal);
    assert.deepEqual(h.state.cleared, [123]);
    assert.equal(removed.mock.callCount(), 1);
  }
});

test('real timeout transport still aborts an unresponsive fetch when its deadline fires', async () => {
  const h = timeoutHarness();
  const request = h.api.fetchWithTimeout('https://example.invalid/synthetic', {}, 120000);
  assert.equal(h.state.signals[0].aborted, false);
  h.state.timer();
  await assert.rejects(request, /yanıt vermekte gecikti/);
  assert.equal(h.state.signals[0].aborted, true);
  assert.deepEqual(h.state.cleared, [123]);
});
