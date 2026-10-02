/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function renderOffer({ credits = 10, adsAllowed = true, ready = true, platform = 'android', disabled = false } = {}) {
  let opened = 0;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const modules = {
    react: { ...react, default: react },
    'react-native': { Platform: { OS: platform }, Text: 'Text', View: 'View' },
    'react-native-paper': { useTheme: () => ({ colors: {} }) },
    '../context/ad-access': { useAdAccess: () => ({ adsAllowed }) },
    '../context/ads-privacy': { useAdsPrivacy: () => ({ ready }) },
    './caylik-ui': { CaylikButton: 'Button' },
  };
  const output = {};
  vm.runInNewContext(ts.transpileModule(read('src/components/AssistantRewardOffer.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText, { exports: output, require: name => { assert.ok(name in modules); return modules[name]; } });
  const tree = output.default({ credits, disabled, onOpenStore: () => opened++ });
  return { tree, opened: () => opened };
}

test('reward offer is hidden for Pro/unverified access, consent not ready, web and unknown/high balances', () => {
  for (const state of [{ adsAllowed: false }, { ready: false }, { platform: 'web' }, { credits: null }, { credits: 16 }, { credits: NaN }, { credits: -1 }]) {
    assert.equal(renderOffer(state).tree, null);
  }
});

test('low-credit offer is opt-in and routes to the existing reward flow on both mobile platforms', () => {
  for (const platform of ['ios', 'android']) for (const credits of [0, 15]) {
    const result = renderOffer({ platform, credits });
    assert.equal(result.opened(), 0);
    const button = result.tree.props.children[0];
    assert.equal(button.props.disabled, false);
    button.props.onPress();
    assert.equal(result.opened(), 1);
  }
  assert.equal(renderOffer({ disabled: true }).tree.props.children[0].props.disabled, true);
});

test('native placements occur once, after content, outside editing forms', () => {
  const share = read('src/screens/SharecroppingScreen.tsx');
  assert.equal((share.match(/<AdMobNativeCard/g) || []).length, 1);
  const position = share.indexOf('<AdMobNativeCard');
  assert.ok(position > share.indexOf("{page === 'overview' &&"));
  assert.ok(position < share.indexOf("{page === 'create' &&"));
  assert.match(share, /!!links.length && <AdMobNativeCard/);
  const quota = read('src/screens/QuotaScreen.tsx');
  assert.equal((quota.match(/<AdMobNativeCard/g) || []).length, 1);
  assert.match(quota, /!!plans.length && <AdMobNativeCard/);
  assert.ok(quota.indexOf('<AdMobNativeCard') > quota.indexOf('plans.map((p)'));
  const assistant = read('src/screens/AssistantScreen.tsx');
  assert.match(assistant, /disabled=\{busy \|\| transcribing \|\| recorderState.isRecording \|\| speakingId !== null\}/);
});
