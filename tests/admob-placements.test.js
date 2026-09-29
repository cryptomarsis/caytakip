/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function nativeCard({ ready = true, adsAllowed = true, personalized = false, dev = true, platform = 'android' } = {}) {
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const requests = [], effects = [], slots = [], cleanups = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = value; }];
    },
    useRef: initial => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect: (fn, deps) => {
      const slot = cursor++;
      if (!slots[slot] || deps.some((dep, i) => dep !== slots[slot][i])) effects.push(fn);
      slots[slot] = deps;
    },
  };
  const modules = {
    react: { ...React, default: React },
    'react-native': { Platform: { OS: platform }, StyleSheet: { create: x => x }, Image: 'Image', Text: 'Text', View: 'View' },
    'react-native-paper': { useTheme: () => ({ colors: {} }) },
    '../context/ads-privacy': { useAdsPrivacy: () => ({ ready, personalized }) },
    '../context/ad-access': { useAdAccess: () => ({ adsAllowed }) },
    'react-native-google-mobile-ads': {
      NativeAd: { createForAdRequest: (...args) => { requests.push(args); return pending; } },
      NativeAdView: 'NativeAdView', NativeMediaView: 'NativeMediaView', NativeAsset: 'NativeAsset',
      NativeAssetType: { ICON: 'icon', HEADLINE: 'headline', BODY: 'body', CALL_TO_ACTION: 'cta' },
      TestIds: { NATIVE: 'test-native' },
    },
  };
  const output = {};
  vm.runInNewContext(ts.transpileModule(read('src/components/AdMobNativeCard.native.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports: output, __DEV__: dev, require: id => {
    assert.ok(id in modules, `Unexpected import: ${id}`);
    return modules[id];
  } });
  const wrapper = output.default();
  const render = () => {
    cursor = 0;
    const tree = wrapper ? wrapper.type(wrapper.props) : null;
    while (effects.length) cleanups.push(effects.shift()());
    return tree;
  };
  return { render, requests, resolve, reject, cleanup: () => cleanups.forEach(fn => fn?.()) };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
test('Pro or unverified subscription never requests a native advertisement', () => {
  const h = nativeCard({ adsAllowed: false });
  assert.equal(h.render(), null);
  assert.equal(h.requests.length, 0);
});
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...(tree.props?.children || []).flatMap(child => nodes(child, type))];
}

test('no consent readiness means no native ad request', () => {
  const h = nativeCard({ ready: false });
  assert.equal(h.render(), null);
  assert.equal(h.requests.length, 0);
});

test('test IDs, non-personalized request, media view and SDK-owned CTA', async () => {
  const h = nativeCard();
  assert.equal(h.render(), null);
  assert.equal(h.requests[0][0], 'test-native');
  assert.equal(h.requests[0][1].requestNonPersonalizedAdsOnly, true);
  let destroyed = 0;
  h.resolve({ headline: 'Test ad', body: 'Description', callToAction: 'Open', mediaContent: {}, destroy: () => destroyed++ });
  await flush();
  const tree = h.render();
  assert.equal(nodes(tree, 'NativeMediaView').length, 1);
  assert.equal(nodes(tree, 'NativeAsset').find(n => n.props.assetType === 'cta').props.children[0].type, 'Text');
  assert.equal(nodes(tree, 'Pressable').length, 0);
  assert.equal(h.requests.length, 1, 'rerenders must not repeatedly load advertisements');
  h.cleanup();
  assert.equal(destroyed, 1);
});

test('late native load is destroyed after navigating away', async () => {
  const h = nativeCard();
  h.render();
  h.cleanup();
  let destroyed = 0;
  h.resolve({ destroy: () => destroyed++ });
  await flush();
  assert.equal(destroyed, 1);
  assert.equal(h.render(), null);
});

test('no-fill leaves no advertising card or retry loop', async () => {
  const h = nativeCard();
  h.render();
  h.reject(new Error('no fill'));
  await flush();
  assert.equal(h.render(), null);
  assert.equal(h.requests.length, 1);
  h.cleanup();
});

test('production requests use the matching platform unit and optional assets stay absent', async () => {
  for (const [platform, suffix] of [['ios', '5664845432'], ['android', '1721730996']]) {
    const h = nativeCard({ dev: false, personalized: true, platform });
    h.render();
    assert.ok(h.requests[0][0].endsWith('/' + suffix));
    assert.equal(h.requests[0][1].requestNonPersonalizedAdsOnly, false);
    h.resolve({ headline: 'Test', destroy: () => {} });
    await flush();
    const tree = h.render();
    assert.equal(nodes(tree, 'NativeMediaView').length, 0);
    assert.equal(nodes(tree, 'NativeAsset').length, 1);
    h.cleanup();
  }
});

test('new placements remain single, content-bound and out of forms and exported reports', () => {
  const dashboard = read('src/screens/DashboardScreen.tsx');
  assert.equal((dashboard.match(/<AdMobNativeCard\s*\/>/g) || []).length, 1);
  assert.ok(dashboard.indexOf('<AdMobNativeCard />') < dashboard.indexOf('title="Yaklaşan tahsilatlar"'));
  assert.ok(dashboard.includes("onPress={() => onNavigate('creditStore')}"));
  const prices = read('src/screens/FactoryPricesScreen.tsx');
  assert.match(prices, /!isAdmin && index === Math\.min\(1, visibleRows\.length - 1\) && <AdMobNativeCard/);
  const reports = read('src/screens/ReportsScreen.tsx');
  assert.match(reports, /\(selected\.length > 0 \|\| selectedExpenses\.length > 0\) && <AdMobNativeCard/);
  assert.equal(reports.slice(0, reports.indexOf('return <View>')).includes('<AdMobNativeCard'), false);
});
