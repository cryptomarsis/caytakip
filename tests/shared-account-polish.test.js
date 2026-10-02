/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const full = path.resolve(__dirname, '..', file), exports = {};
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Date, console, ...globals, require: id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(full), id + '.ts')), mocks, globals) : require(id) });
  return exports;
}
const record = { _id: 'one', sharedDeliveryId: 'one', sharedRole: 'cropper', shareDenominator: 2, sharedNetCents: 147000, sharedSaleNetCents: 294000, kg: 100, fiyat: 30, tarih: '2026-09-01', surum: '2. Sürüm', tahsilat: 100, firma: '<script>bad()</script>', legacySharedCollection: 0 };
test('report distinguishes entire sale from own entitlement and uses one period for chart and totals', () => {
  const fmt = load('src/utils/format.ts'), report = load('src/utils/sharedAccountReport.ts');
  assert.equal(fmt.saleNetTotalOf(record), 2940); assert.equal(fmt.netTotalOf(record), 1470); assert.equal(fmt.shareLabelOf(record), '1/2');
  const rows = [record, { ...record, _id: 'old', tarih: '2025-08-01' }, { ...record, _id: 'other', surum: '1. Sürüm', kg: 50 }];
  const period = report.sharedPeriod(rows, 2026, '2. Sürüm');
  assert.equal(period.selected.length, 1); assert.equal(period.totals.kg, 100); assert.equal(period.months.reduce((a,b) => a+b, 0), 100);
  assert.equal(period.previousRemaining, 1370); assert.equal(period.totals.remaining, 1370);
  assert.equal(report.sharedPeriod(rows, 2024).totals.kg, 0);
});
test('account PDF escapes text and excludes personal notes and other-party payments, warns on unresolved legacy', () => {
  const { sharedAccountHtml } = load('src/utils/sharedAccountReport.ts');
  const html = sharedAccountHtml([{ ...record, aciklama: 'SECRET NOTE', legacySharedCollection: 200 }], '<img src=x>', 2026);
  assert(!html.includes('<script>')); assert(!html.includes('<img')); assert(!html.includes('SECRET NOTE'));
  assert(html.includes('&lt;script&gt;')); assert(html.includes('onayı bekleniyor')); assert(html.includes('1.470,00'));
});
test('PDF generated during account switch is cleaned up without being shared', async () => {
  let active = true, shared = 0, deleted = 0;
  const api = load('src/services/shareAccountPdf.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-print': { printToFileAsync: async () => { active = false; return { uri: 'cache:created-pdf' }; } },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => { shared++; } },
    'expo-file-system/legacy': { deleteAsync: async uri => { assert.equal(uri, 'cache:created-pdf'); deleted++; } },
  });
  await api.shareAccountPdf('html', () => active); assert.equal(shared, 0); assert.equal(deleted, 1);
});

function dataHarness(existingSnapshots) {
  let index = 0, slots = [], effects = [], deps = [], output;
  let user = { userId: 'A', token: 'a' };
  const snapshots = existingSnapshots || new Map([['A', { harvests: [{ _id: 'cached', kg: 45 }], payments: [], expenses: [], gardens: [], factoryPrices: [{ _id: 'old-price' }], ads: [{ _id: 'old-ad' }], savedAt: '2026-09-28T12:00:00Z' }]]);
  const state = { calls: 0, failLedger: true, failAll: false, failOptional: false, failExpenses: false, notes: [], loading: false };
  const react = {
    useState: initial => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef: initial => { const i = index++; return slots[i] ||= { current: initial }; },
    useCallback: fn => { index++; return fn; },
    useEffect: (fn, d) => { const i = index++; if (!deps[i] || d.some((v,j) => v !== deps[i][j])) { deps[i] = d; effects.push(fn); } },
  };
  const fetcher = async (_auth, url) => { state.calls++; return { ok: !(state.failAll || state.failLedger && url.endsWith('shared-ledger') || state.failOptional && /\/(ads|factory-prices)$/.test(url) || state.failExpenses && url.endsWith('expenses')), data: url.endsWith('harvests') ? [{ _id: 'fresh', kg: 100 }] : [] }; };
  const api = load('src/hooks/useAppData.ts', {
    react, '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    '../services/api': { API_URL: '/api' }, '../services/paginatedData': { fetchCursorCollection: fetcher, fetchArrayCollection: fetcher },
    '../services/offlineQueue': { getDataSnapshot: async id => snapshots.get(id) || null, saveDataSnapshot: async (id, v) => snapshots.set(id, { ...v, savedAt: new Date().toISOString() }) },
    '../services/dueNotifications': { syncDueNotifications: async () => {} },
    '../services/shareLedger': { mergeShareLedger: (h,p) => ({ harvests: h, payments: p }) },
  });
  function render() { index = 0; effects = []; output = api.useAppData({ currentUser: user, authFetch: () => {}, getAuthHeaders: () => ({}), setLoading: v => { state.loading = v; }, onFeedback: (...args) => state.notes.push(args) }); effects.forEach(fn => fn()); return output; }
  return { state, render, switchUser: () => { user = { userId: 'B', token: 'b' }; }, snapshots };
}
test('cold start partial failure restores cached financial ledger and marks it stale', async () => {
  const h = dataHarness(); await h.render().fetchData(); const result = h.render();
  assert.equal(result.harvests[0]._id, 'cached'); assert.equal(result.dataStale, true); assert.equal(result.lastSyncAt, '2026-09-28T12:00:00Z');
  assert.equal(h.snapshots.get('A').harvests[0]._id, 'cached');
});

test('optional catalog failure saves fresh finances and preserves cached catalogs across offline restart', async () => {
  const h = dataHarness(); h.state.failLedger = false; h.state.failOptional = true;
  await h.render().fetchData();
  assert.equal(h.render().dataStale, true);
  const saved = h.snapshots.get('A');
  assert.equal(saved.harvests[0]._id, 'fresh');
  assert.equal(saved.ads[0]._id, 'old-ad');
  assert.equal(saved.factoryPrices[0]._id, 'old-price');
  const restarted = dataHarness(h.snapshots); restarted.state.failAll = true;
  await restarted.render().fetchData();
  assert.equal(restarted.render().harvests[0]._id, 'fresh');
  assert.equal(restarted.render().dataStale, true);
});

test('failed expenses or ledger never replace the coherent financial snapshot', async () => {
  for (const failure of ['failExpenses', 'failLedger']) {
    const h = dataHarness(); h.state.failLedger = false; h.state[failure] = true;
    await h.render().fetchData();
    assert.equal(h.snapshots.get('A').harvests[0]._id, 'cached');
  }
});
test('background refresh uses freshness window, mutations force refresh and account switch never reuses prior ledger', async () => {
  const h = dataHarness(); h.state.failLedger = false; await h.render().fetchData();
  let current = h.render(); assert.equal(current.dataStale, false); assert.equal(h.state.calls, 7);
  await current.fetchData(true); assert.equal(h.state.calls, 7);
  await current.fetchData(); assert.equal(h.state.calls, 14);
  h.switchUser(); h.state.failLedger = true; current = h.render(); assert.equal(current.harvests.length, 0);
  await current.fetchData(true); current = h.render(); assert.equal(current.harvests.length, 0); assert.equal(current.dataStale, true); assert.equal(h.state.calls, 21);
});

test('late unread count from account A cannot replace account B badge; background polling pauses', async () => {
  const slots = [], effects = [], requests = []; let cursor = 0, userId = 'A', timer;
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => v === b[i]);
  const react = {
    useRef: value => { const i = cursor++; return slots[i] ||= { current: value }; },
    useState: value => { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = next; }]; },
    useCallback: (fn, deps) => { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
  };
  react.useEffect = react.useLayoutEffect = (fn, deps) => {
    const i = cursor++; if (!same(slots[i]?.deps, deps)) { const cleanup = slots[i]?.cleanup; slots[i] = { deps }; effects.push(() => { cleanup?.(); slots[i].cleanup = fn(); }); }
  };
  const appState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const api = load('src/hooks/useShareEvents.ts', {
    react, 'react-native': { AppState: appState },
    '../services/sharecropping': { shareRequest: () => new Promise(resolve => requests.push(resolve)) },
  }, { setInterval: callback => { timer = callback; return 1; }, clearInterval: () => {} });
  const authFetch = () => {};
  const render = () => { cursor = 0; const value = api.useShareEvents(userId, authFetch); effects.splice(0).forEach(fn => fn()); return value; };
  render(); assert.equal(requests.length, 1);
  userId = 'B'; assert.equal(render().unread, 0);
  requests[0]({ unread: 99 }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(render().unread, 0);
  requests[1]({ unread: 2 }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(render().unread, 2);
  const count = requests.length; appState.currentState = 'background'; timer(); assert.equal(requests.length, count);
});
