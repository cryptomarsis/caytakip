/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup(fail = false) {
  let error = '';
  const opened = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children: children.flat(Infinity) }),
    useState: () => [error, value => { error = value; }],
  };
  const mocks = {
    react: React,
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: s => s }, Linking: { openURL: async url => { opened.push(url); if (fail) throw Error('Unavailable'); } } },
    'react-native-paper': { useTheme: () => ({ colors: {} }) },
    './app-icon': { AppIcon: 'Icon' },
    '../context/app-theme': { caylikDesign: { touchTarget: 48, radius: { md: 16 } } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/SocialFollow.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(mocks[name], name); return mocks[name]; } });
  const render = () => exports.default();
  const flatten = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(flatten)] : [];
  return { opened, render, nodes: () => flatten(render()) };
}

test('social links open only on tap and preserve the supplied profile URLs', async () => {
  const h = setup();
  const links = h.nodes().filter(n => n.type === 'Pressable');
  const heading = h.nodes().find(n => n.type === 'Text' && n.children.includes('Çaylık’ı takip et'));
  assert.equal(heading.props.style[0].textAlign, 'center');
  assert.equal(heading.props.style[0].fontSize, 18);
  assert.equal(h.opened.length, 0);
  assert.equal(links.length, 2);
  for (const link of links) {
    assert.equal(link.props.accessibilityRole, 'link');
    assert.equal(link.props.style({ pressed: false })[0].minHeight, 48);
    assert.equal(link.props.style({ pressed: false })[0].flex, 1);
    assert.equal(link.props.style({ pressed: false })[0].minWidth, 0);
    link.props.onPress();
    await Promise.resolve();
  }
  assert.deepEqual(h.opened, ['https://www.instagram.com/caylikapp/', 'https://www.facebook.com/profile.php?id=61593694898641']);
});

test('failed social link displays an actionable error without an unhandled rejection', async () => {
  const h = setup(true);
  h.nodes().find(n => n.type === 'Pressable').props.onPress();
  await new Promise(require('node:timers').setImmediate);
  assert.match(h.nodes().find(n => n.props?.accessibilityRole === 'alert').children.join(''), /Instagram açılamadı/);
});
