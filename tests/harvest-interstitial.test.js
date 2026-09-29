/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(read('src/services/harvestInterstitial.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: moduleExports });
const { createHarvestInterstitial, newInterstitialBudget, HARVEST_INTERSTITIAL_IDS } = moduleExports;
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ allow = true, budget: sharedBudget } = {}) {
  let time = 1_000_000, allowed = allow, shows = 0, navigations = 0, failShow = false;
  const ads = [];
  const budget = sharedBudget || newInterstitialBudget(time);
  const controller = createHarvestInterstitial({ budget, now: () => time, allowed: () => allowed, createAd: () => {
    const callbacks = {}, removed = [];
    const ad = {
      callbacks, removed,
      on: (event, callback) => { callbacks[event] = callback; return () => { removed.push(event); }; },
      load: () => {},
      show: () => { shows++; return failShow ? Promise.reject(new Error('presentation failed')) : Promise.resolve(); },
    };
    ads.push(ad); return ad;
  } });
  const enter = (from = 'dashboard', to = 'harvest') => controller.navigate(from, to, () => navigations++);
  return { controller, budget, ads, enter,
    advance: amount => { time += amount; },
    allow: value => { allowed = value; },
    fail: () => { failShow = true; },
    get shows() { return shows; }, get navigations() { return navigations; },
  };
}

test('only supplied ad UNIT identifiers are used, existing app IDs remain unchanged', () => {
  assert.equal(HARVEST_INTERSTITIAL_IDS.android, 'ca-app-pub-4870931624363029/6113892832');
  assert.equal(HARVEST_INTERSTITIAL_IDS.ios, 'ca-app-pub-4870931624363029/2363273527');
  const app = JSON.parse(read('app.json'));
  const config = app.expo.plugins.find(item => Array.isArray(item) && item[0] === 'react-native-google-mobile-ads')[1];
  assert.equal(config.androidAppId, 'ca-app-pub-4870931624363029~6235691078');
  assert.equal(config.iosAppId, 'ca-app-pub-4870931624363029~5191921346');
});
test('Pro, unknown subscription or privacy not ready: no load/show and immediate navigation', () => {
  const h = setup({ allow: false });
  h.controller.sync(); h.advance(100_000); h.enter(); h.enter();
  assert.equal(h.ads.length, 0); assert.equal(h.shows, 0); assert.equal(h.navigations, 2);
});
test('preloading never displays; warm-up and first entrance remain uninterrupted', () => {
  const h = setup(); h.controller.sync(); h.ads[0].callbacks.loaded();
  h.enter(); h.enter(); assert.equal(h.shows, 0); assert.equal(h.navigations, 2);
  h.advance(61_000); assert.equal(h.shows, 0);
  h.enter(); assert.equal(h.shows, 1); assert.equal(h.navigations, 2);
  h.ads[0].callbacks.closed(); assert.equal(h.navigations, 3);
});
test('no fill or delayed load never blocks entry or opens over an already open form', () => {
  const h = setup(); h.controller.sync(); h.enter(); h.advance(61_000); h.enter();
  assert.equal(h.navigations, 2); assert.equal(h.shows, 0);
  h.ads.at(-1).callbacks.loaded(); assert.equal(h.shows, 0);
  h.enter('harvest'); assert.equal(h.shows, 0); assert.equal(h.navigations, 3);
});
test('load error has no fast retry loop and a stale listener cannot mark a later ad ready', () => {
  const h = setup(); h.controller.sync(); const old = h.ads[0]; old.callbacks.error();
  for (let i = 0; i < 10; i++) h.enter();
  assert.equal(h.ads.length, 1); assert.equal(h.shows, 0);
  h.advance(61_000); h.controller.sync(); old.callbacks.loaded(); h.enter();
  assert.equal(h.ads.length, 2); assert.equal(h.shows, 0);
  h.ads[1].callbacks.loaded(); h.enter(); assert.equal(h.shows, 1);
});
test('show failure continues exactly once; repeated taps and duplicate close events cannot duplicate navigation', async () => {
  const h = setup(); h.controller.sync(); h.ads[0].callbacks.loaded(); h.enter(); h.advance(61_000); h.fail();
  h.enter(); h.enter(); assert.equal(h.shows, 1);
  await flush(); assert.equal(h.navigations, 2);
  h.ads[0].callbacks.error(); h.ads[0].callbacks.closed(); assert.equal(h.navigations, 2);
});
test('at least two entrances and two minutes between ads, at most three per app session', () => {
  const h = setup(); h.controller.sync(); h.ads[0].callbacks.loaded(); h.enter(); h.advance(61_000); h.enter();
  h.ads[0].callbacks.closed(); assert.equal(h.shows, 1);
  h.controller.sync(); h.ads.at(-1).callbacks.loaded(); h.enter(); h.enter();
  assert.equal(h.shows, 1);
  h.advance(120_000); h.enter(); h.ads.at(-1).callbacks.closed(); assert.equal(h.shows, 2);
  h.controller.sync(); h.ads.at(-1).callbacks.loaded(); h.advance(120_000); h.enter(); assert.equal(h.shows, 2);
  h.enter(); h.ads.at(-1).callbacks.closed(); assert.equal(h.shows, 3);
  h.advance(120_000); h.controller.sync(); h.enter(); h.enter(); assert.equal(h.shows, 3);
});
test('harvest save, payment, store, auth and existing form navigation cannot trigger an interstitial', () => {
  const h = setup(); h.controller.sync(); h.ads[0].callbacks.loaded(); h.advance(61_000);
  for (const [from, to] of [['harvest', 'dashboard'], ['collections', 'harvest'], ['creditStore', 'harvest'], ['harvest', 'harvest'], ['dashboard', 'collections'], ['dashboard', 'creditStore']]) h.enter(from, to);
  assert.equal(h.budget.entries, 0); assert.equal(h.shows, 0); assert.equal(h.navigations, 6);
});
test('background or consent revocation discards preload and late loads cannot show', () => {
  const h = setup(); h.controller.sync(); const old = h.ads[0]; h.allow(false); h.controller.sync();
  old.callbacks.loaded(); h.advance(61_000); h.enter(); h.enter();
  assert.equal(h.shows, 0); assert.equal(h.ads.length, 1); assert.equal(old.removed.length, 3);
});
test('ad-induced inactive state and privacy reset keep the close continuation alive', () => {
  const h = setup(); h.controller.sync(); h.ads[0].callbacks.loaded(); h.enter(); h.advance(61_000); h.enter();
  h.allow(false); h.controller.sync(true); assert.equal(h.ads[0].removed.length, 0);
  h.ads[0].callbacks.closed(); assert.equal(h.navigations, 2); assert.equal(h.ads[0].removed.length, 3);
});
test('logout/unmount removes all callbacks, cancels stale navigation and does not reset session limits', () => {
  const h = setup(); h.controller.sync(); h.ads[0].callbacks.loaded(); h.enter(); h.advance(61_000); h.enter();
  h.controller.dispose(); h.ads[0].callbacks.closed(); assert.equal(h.navigations, 1);
  const next = setup({ budget: h.budget }); assert.equal(next.budget.shown, 1);
});
test('all explicit harvest entry points use one wrapper, save callbacks remain untouched', () => {
  const app = read('src/app/index.tsx');
  assert.match(app, /onNavigate=\{navigateTab\}/);
  assert.equal((app.match(/onPress=\{\(\) => navigateTab\(item.tab\)\}/g) || []).length, 2);
  assert.doesNotMatch(app, /setActiveTab\('harvest'\)/);
  const hook = read('src/hooks/useHarvestAdNavigation.native.ts');
  assert.match(hook, /__DEV__ \? TestIds.INTERSTITIAL/);
  assert.match(hook, /proStatus === 'free'/);
  assert.match(hook, /privacy.ready && AppState.currentState === 'active'/);
  assert.match(hook, /requestNonPersonalizedAdsOnly: !latest.current.privacy.personalized/);
  assert.match(hook, /latest.current.userId === snapshot.userId/);
});
