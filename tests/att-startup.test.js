/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const compiled = ts.transpileModule(read('src/services/adTracking.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function setup({ state = 'active', status = 'undetermined', result = 'granted', saved } = {}) {
  const calls = []; const storage = new Map(saved ? [['caylik:ad-measurement-consent', saved]] : []);
  let listener; const appState = { currentState: state, addEventListener: (_, callback) => {
    listener = callback; return { remove: () => { listener = null; } };
  } };
  const permission = value => ({ status: value, granted: value === 'granted', canAskAgain: value === 'undetermined' });
  const modules = {
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) ?? null,
      setItem: async (k, v) => storage.set(k, v), multiSet: async pairs => pairs.forEach(([k,v]) => storage.set(k,v)) },
    'expo-constants': { __esModule: true, default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'store' } },
    'react-native': { Platform: { OS: 'ios' }, AppState: appState },
    'expo-tracking-transparency': { getTrackingPermissionsAsync: async () => permission(status),
      requestTrackingPermissionsAsync: async () => { calls.push('ATT'); status = result; return permission(result); } },
    'react-native-fbsdk-next': { Settings: {
      setAutoLogAppEventsEnabled: value => calls.push(`meta-events:${value}`),
      setAdvertiserIDCollectionEnabled: value => calls.push(`meta-id:${value}`),
      setAdvertiserTrackingEnabled: async value => calls.push(`meta-tracking:${value}`),
      initializeSDK: () => calls.push('meta-init'),
    } },
    '@react-native-firebase/analytics': { getAnalytics: () => ({}), setAnalyticsCollectionEnabled: async (_, value) => calls.push(`firebase:${value}`) },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; } });
  return { api: exports, storage, calls, activate: () => { appState.currentState = 'active'; listener?.('active'); } };
}
test('ATT precedes measurement and concurrent callers share one system request', async () => {
  const h = setup(); const a = h.api.requestAdTrackingConsent(); const b = h.api.requestAdTrackingConsent();
  assert.equal(a, b); assert.equal(await a, 'granted');
  assert.equal(h.calls[0], 'ATT'); assert.equal(h.calls.filter(x => x === 'ATT').length, 1);
  assert.ok(h.calls.includes('meta-init')); assert.ok(h.calls.includes('firebase:true'));
});
test('inactive app waits; old dismissed prompt does not suppress native ATT', async () => {
  const h = setup({ state: 'inactive' }); h.storage.set('caylik:ad-measurement-consent-prompt-seen', 'seen');
  const pending = h.api.requestAdTrackingConsent(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 0); h.activate(); assert.equal(await pending, 'granted');
});
test('denied ATT disables measurement and never initializes Meta', async () => {
  const h = setup({ result: 'denied' }); assert.equal(await h.api.requestAdTrackingConsent(), 'denied');
  assert.ok(h.calls.includes('firebase:false')); assert.ok(!h.calls.includes('meta-init'));
  assert.equal(h.storage.get('caylik:ad-measurement-consent'), 'disabled');
});
test('undetermined response is not stored as an answered permission', async () => {
  const h = setup({ result: 'undetermined' }); assert.equal(await h.api.requestAdTrackingConsent(), 'not-determined');
  assert.equal(h.storage.size, 0); assert.ok(!h.calls.includes('meta-init'));
});
test('revoked native permission overrides previously saved grant', async () => {
  const h = setup({ status: 'denied', saved: 'granted' }); assert.equal(await h.api.initializeAdTracking(), 'denied');
  assert.ok(!h.calls.includes('ATT')); assert.ok(!h.calls.includes('meta-init')); assert.ok(h.calls.includes('firebase:false'));
});
test('in-app withdrawal notifies mounted ad surfaces and keeps measurement disabled', async () => {
  const h = setup({ status: 'granted', saved: 'granted' }); let changed = 0;
  const unsubscribe = h.api.subscribeAdTrackingChanges(() => changed++);
  await h.api.disableAdTracking(); assert.equal(changed, 1);
  assert.equal(await h.api.initializeAdTracking(), 'disabled'); assert.ok(!h.calls.includes('meta-init'));
  unsubscribe(); await h.api.disableAdTracking(); assert.equal(changed, 1);
});
test('native auto measurement is off and startup does not depend on login', () => {
  const config = read('app.config.js'); assert.match(config, /isAutoInitEnabled: false/); assert.match(config, /autoLogAppEventsEnabled: false/);
  const app = JSON.parse(read('app.json')); const ads = app.expo.plugins.find(p => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');
  assert.equal(ads[1].delayAppMeasurementInit, true);
  assert.equal(JSON.parse(read('firebase.json'))['react-native'].analytics_auto_collection_enabled, false);
  const layout = read('src/app/_layout.tsx'); assert.match(layout, /if \(!splashDone\) return/); assert.match(layout, /requestAdTrackingConsent\(\)/);
  assert.ok(layout.indexOf('requestAdTrackingConsent()') < layout.indexOf('await initializeAdMob()'));
  assert.match(layout, /privacyChecked && <Stack/);
  assert.match(read('src/app/index.tsx'), /Platform\.OS === 'ios' \|\| !userId/);
});
