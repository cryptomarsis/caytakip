/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const output = {};
vm.runInNewContext(ts.transpileModule(read('src/services/proAccess.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: output, require: () => require('../shared/storeProducts') });
const { proStatusFromCustomerInfo: status, observeProAccess: observe } = output;
const now = Date.now();
const info = (activeSubscriptions = [], allExpirationDates = {}) => ({ activeSubscriptions, allExpirationDates, requestDate: new Date(now).toISOString() });
const pro = (id = 'caylik_pro_monthly') => info([id], { [id]: new Date(now + 86_400_000).toISOString() });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('active iOS Pro and Android base plan grant ad-free access, even when cancelled but paid through', () => {
  assert.equal(status(pro(), 'ios', now), 'pro');
  assert.equal(status(pro('caylik_pro_monthly:monthly'), 'android', now), 'pro');
  assert.equal(status({ ...pro(), cancellationDate: new Date(now).toISOString() }, 'ios', now), 'pro');
});
test('consumables, historic subscriptions and unknown products never grant Pro', () => {
  assert.equal(status(info(), 'ios', now), 'free');
  assert.equal(status(pro('caylik_credits_2000'), 'ios', now), 'free');
  assert.equal(status(pro('caylik_pro_monthly:monthly'), 'ios', now), 'free');
  assert.equal(status(info([], { caylik_pro_monthly: new Date(now - 1).toISOString() }), 'ios', now), 'free');
});
test('stale active data at expiry or malformed expiry hide ads pending verification', () => {
  assert.equal(status(info(['caylik_pro_monthly'], { caylik_pro_monthly: new Date(now).toISOString() }), 'ios', now), 'unknown');
  assert.equal(status(info(['caylik_pro_monthly']), 'ios', now), 'unknown');
  assert.equal(status({}, 'ios', now), 'unknown');
});

function harness(initial = info()) {
  let owner = 'alice', current = initial, listener, disposed = false, reads = 0;
  const values = [];
  const client = {
    getAppUserID: async () => owner,
    getCustomerInfo: async () => { reads++; return await current; },
    addCustomerInfoUpdateListener: fn => { listener = fn; },
    removeCustomerInfoUpdateListener: fn => { assert.equal(fn, listener); disposed = true; },
  };
  const observer = observe(client, 'alice', 'android', value => values.push(value));
  return { values, observer, setOwner: value => { owner = value; }, setInfo: value => { current = value; }, emit: () => listener(), get reads() { return reads; }, get disposed() { return disposed; } };
}
test('SDK purchase/restore update, renewal and expiry update the active user', async () => {
  const h = harness();
  await flush();
  assert.deepEqual(h.values, ['free']);
  h.setInfo(pro()); h.emit(); await flush();
  assert.deepEqual(h.values, ['free', 'pro']);
  h.setInfo(info()); h.emit(); await flush();
  assert.deepEqual(h.values, ['free', 'pro', 'free']);
  h.observer.dispose(); assert.equal(h.disposed, true);
});
test('account change while a request is pending cannot leak the previous Pro access', async () => {
  let resolve;
  const h = harness(new Promise(yes => { resolve = yes; }));
  await flush();
  h.setOwner('bob'); resolve(pro()); await flush();
  assert.deepEqual(h.values, []);
  await h.observer.refresh();
  assert.equal(h.reads, 1);
  h.observer.dispose();
});
test('unmount ignores late results and removes the listener', async () => {
  let resolve;
  const h = harness(new Promise(yes => { resolve = yes; }));
  await flush(); h.observer.dispose(); resolve(pro()); await flush();
  h.emit(); await flush();
  assert.equal(h.reads, 1); assert.deepEqual(h.values, []);
});
test('verification failures suppress advertisements and subsequent refresh recovers', async () => {
  const h = harness(pro()); await flush();
  h.setInfo({ then: (_, reject) => reject(new Error('offline')) });
  await h.observer.refresh();
  assert.deepEqual(h.values, ['pro', 'unknown']);
  h.setInfo(pro()); await h.observer.refresh();
  assert.deepEqual(h.values, ['pro', 'unknown', 'pro']);
  h.observer.dispose();
});
test('duplicate listener/foreground refreshes share a single in-flight read', async () => {
  let resolve;
  const h = harness(new Promise(yes => { resolve = yes; }));
  await flush(); h.emit(); h.emit(); await h.observer.refresh();
  assert.equal(h.reads, 1); resolve(info()); await flush();
  assert.deepEqual(h.values, ['free']); h.observer.dispose();
});
test('all mobile ad formats, sponsor carousel and reward entry use the shared access gate', () => {
  for (const file of ['AdMobBanner', 'AdMobNativeCard', 'RewardedAdButton']) {
    assert.match(read(`src/components/${file}.native.tsx`), /useAdAccess/);
    assert.match(read(`src/components/${file}.native.tsx`), /adsAllowed/);
  }
  const app = read('src/app/index.tsx');
  assert.match(app, /AdAccessContext.Provider value=\{storePurchases.proStatus\}/);
  assert.match(app, /\['history', 'receivables', 'more'\].includes\(activeTab\)/);
  const dashboard = read('src/screens/DashboardScreen.tsx');
  assert.equal((dashboard.match(/adsAllowed && <SponsorCarousel/g) || []).length, 2);
  assert.match(dashboard, /Platform.OS !== 'web' && adsAllowed/);
  assert.match(read('src/screens/CreditStoreScreen.tsx'), /adsAllowed && !!onRewardedAdEarned/);
  const hook = read('src/hooks/useProAccess.ts');
  assert.match(hook, /result\?\.session === storeSession/);
  assert.match(hook, /AppState.currentState === 'active'/);
});

test('banner and rewarded components render nothing for Pro and unknown, including before privacy readiness', () => {
  for (const file of ['AdMobBanner', 'RewardedAdButton']) {
    for (const adsAllowed of [false, true]) {
      const result = {};
      const React = { createElement: (type, props, ...children) => ({ type, props, children }), useEffect: () => {} };
      const modules = {
        react: { ...React, default: React },
        'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: x => x }, View: 'View' },
        '../context/ad-access': { useAdAccess: () => ({ adsAllowed }) },
        '../context/ads-privacy': { useAdsPrivacy: () => ({ ready: true, personalized: false }) },
        'react-native-google-mobile-ads': { TestIds: { ADAPTIVE_BANNER: 'test' }, BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'adaptive' }, BannerAd: 'BannerAd' },
        './caylik-ui': {}, '../services/api': {}, '../services/pendingAdReward': {},
      };
      vm.runInNewContext(ts.transpileModule(read(`src/components/${file}.native.tsx`), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
      }).outputText, { exports: result, __DEV__: true, require: id => {
        assert.ok(id in modules, `Unexpected import: ${id}`);
        return modules[id];
      } });
      const tree = result.default({});
      assert.equal(tree !== null, adsAllowed);
    }
  }
});
