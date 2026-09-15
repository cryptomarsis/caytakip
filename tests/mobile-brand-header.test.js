/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/components/mobile-brand-header.tsx'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

function render({ home, dark = false, width = 390, fontScale = 1, children } = {}) {
  const actions = [];
  const colors = { background: dark ? '#202521' : '#F5F1E8', onBackground: dark ? '#F2EEE5' : '#26332B', primary: '#254B37', onPrimary: '#fff', surface: '#fff', onSurface: '#26332B', outline: '#777', outlineVariant: '#ddd' };
  const design = { spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20 }, radius: { sm: 12, lg: 20 }, type: { caption: 12, body: 14, title: 20 }, font: { editorial: 'Georgia' }, touchTarget: 48 };
  const react = { createElement: (type, props, ...content) => ({ type, props: props || {}, children: content }), Children: { toArray: value => [value].flat(Infinity).filter(child => child != null && typeof child !== 'boolean') } };
  const modules = {
    react,
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width, fontScale }) },
    'react-native-paper': { useTheme: () => ({ dark, colors }) },
    './tea-brand': { TeaLandscape: 'TeaLandscape', TeaWordmark: 'TeaWordmark' },
    './app-icon': { AppIcon: 'AppIcon' },
    '../context/app-theme': { caylikDesign: design },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { assert.ok(modules[name], `Unexpected dependency: ${name}`); return modules[name]; } });
  const tree = exports.MobileBrandHeader({ name: '  Ayşe Yılmaz  ', home, children, onBack: () => actions.push('back') });
  const nodes = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node); node.children?.forEach(visit);
  };
  visit(tree);
  return { actions, nodes, text: nodes.filter(node => node.type === 'Text').flatMap(node => node.children).filter(value => typeof value === 'string') };
}

for (const dark of [false, true]) {
  test(`home ${dark ? 'dark' : 'light'} header keeps artwork, greeting and exact slogan without account buttons`, () => {
    const h = render({ home: true, dark, width: 320, fontScale: 1.4 });
    assert.deepEqual(h.text, ['Çayının hesabı cebinde!', 'Merhaba, Ayşe']);
    assert.equal(h.nodes.filter(node => node.type === 'Pressable').length, 0);
    assert.equal(h.nodes.filter(node => node.type === 'TeaLandscape' && node.props.background).length, 1);
    assert.equal(h.nodes.find(node => node.type === 'TeaWordmark').props.compact, true);
  });
}

for (const dark of [false, true]) {
  test(`non-home ${dark ? 'dark' : 'light'} header uses home artwork and only exposes the back action`, () => {
    const h = render({ home: false, dark, width: 320, fontScale: 1.4 });
    const button = h.nodes.find(node => node.props.accessibilityLabel === 'Ana sayfaya dön');
    assert.ok(button);
    assert.equal(button.props.accessibilityRole, 'button');
    const style = Object.assign({}, ...button.props.style({ pressed: false }).filter(Boolean));
    assert.ok(style.minHeight >= 44);
    button.props.onPress();
    assert.equal(h.actions.at(-1), 'back');
    assert.equal(h.nodes.filter(node => node.type === 'Pressable').length, 1);
    assert.equal(h.nodes.filter(node => node.type === 'TeaLandscape' && node.props.background).length, 1);
    const home = render({ home: true, dark });
    assert.deepEqual(JSON.parse(JSON.stringify(h.nodes[1].props.style)), JSON.parse(JSON.stringify(home.nodes[1].props.style)));
    assert.ok(!h.text.includes('Çayının hesabı cebinde!'));
  });
}

test('logout is wired exclusively through Settings; More keeps Settings reachable', () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/app/index.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(__dirname, '../src/screens/SettingsScreen.tsx'), 'utf8');
  const more = fs.readFileSync(path.join(__dirname, '../src/screens/MoreScreen.tsx'), 'utf8');
  assert.doesNotMatch(app, /onPress=\{handleLogout\}/);
  assert.match(app, /<SettingsScreen[\s\S]*?onLogout=\{handleLogout\}/);
  assert.doesNotMatch(source, /onLogout|onAccount|Çıkış yap|Hesap ve ayarlar/);
  assert.match(settings, /accessibilityLabel="Çıkış yap"/);
  assert.match(settings, /await onLogout\(\)/);
  assert.match(settings, /minHeight: caylikDesign.touchTarget/);
  assert.match(more, /onNavigate\('settings'\)/);
});

test('home still renders supplied synchronization status', () => {
  const status = { type: 'Text', props: {}, children: ['2 kayıt senkronizasyon bekliyor'] };
  const h = render({ home: true, children: [false, status] });
  assert.ok(h.text.includes('2 kayıt senkronizasyon bekliyor'));
});
