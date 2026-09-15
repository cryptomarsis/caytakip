/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;

function handlers(result) {
  const file = ts.createSourceFile('index.tsx', read('src/app/index.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = {};
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ['handleSaveHarvest', 'handleSpecificHarvestPayment'].includes(node.name.getText(file))) selected[node.name.getText(file)] = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const state = { rewards: [], sounds: [], feedback: [], dismissed: 0 };
  const noop = () => {};
  const exports = {};
  vm.runInNewContext(transpile(Object.entries(selected).map(([name, source]) => `exports.${name} = ${source};`).join('\n')), {
    exports, currentUser: { userId: 'u1', name: 'Test' }, harvestSavingRef: { current: false },
    hForm: { producer: '', kg: '125', firma: 'ÇAYKUR', fiyat: '35', tahsilat: '0', date: '15.09.2026' },
    payHarvestId: 'h1', payAmount: '100', payDate: '15.09.2026', payDesc: '', harvests: [{ _id: 'h1' }],
    toServerDate: () => '2026-09-15', todayDisplayDate: () => '15.09.2026', parseMoney: Number,
    calculateAgriculturalDeductions: () => ({ netTutar: 4287.5 }), remainingTotalOf: () => 200,
    postOrQueue: async () => { if (result instanceof Error) throw result; return result; },
    formatTL: value => `${value} TL`,
    showOperationFeedback: (...args) => state.feedback.push(args),
    setOperationFeedback: noop, Keyboard: { dismiss: () => state.dismissed++ },
    playFeedbackSound: (...args) => state.sounds.push(args), setHarvestReward: value => state.rewards.push(value),
    setLoading: noop, setReceiptNotice: noop, setHForm: noop, setActiveTab: noop, fetchData: async () => {},
    setPayHarvestId: noop, setPayAmount: noop, setPayDesc: noop, setPayDate: noop,
  });
  return { state, exports };
}

test('server-confirmed harvest and payment use one visible effect with their real saved amounts, not a covering alert', async () => {
  const h = handlers({ response: { ok: true, json: async () => ({}) } });
  await h.exports.handleSaveHarvest();
  await h.exports.handleSpecificHarvestPayment();
  assert.deepEqual(h.state.rewards.map(item => [item.kind, item.value, item.userId]), [['harvest', '125 KG', 'u1'], ['payment', '100 TL', 'u1']]);
  assert.deepEqual(h.state.sounds.map(args => args[0]), ['harvest', 'payment']);
  assert.equal(h.state.dismissed, 2);
  assert.equal(h.state.feedback.length, 0);
});

test('offline queued, rejected and failed saves cannot celebrate or play success audio', async () => {
  for (const result of [{ queued: true }, { response: { ok: false, status: 400, json: async () => ({ error: 'Rejected' }) } }, new Error('Offline')]) {
    const h = handlers(result);
    await h.exports.handleSaveHarvest();
    await h.exports.handleSpecificHarvestPayment();
    assert.equal(h.state.rewards.length, 0);
    assert.equal(h.state.sounds.length, 0);
    assert.equal(h.state.feedback.length, 2);
  }
});

async function reward({ reduced = false, screenReader = false, vibration = false } = {}) {
  const effects = [], states = [], timers = new Map(), animations = [], vibrations = [], spoken = [];
  let cursor = 0;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    interpolate(config) { return config; }
    stopAnimation() {}
  }
  const tween = (_value, config) => ({ start: () => animations.push(config) });
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: initial => { const id = cursor++; if (!(id in states)) states[id] = typeof initial === 'function' ? initial() : initial; return [states[id], next => { states[id] = next; }]; },
    useEffect: effect => effects.push(effect),
  };
  const native = {
    Modal: 'Modal', ScrollView: 'ScrollView', View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', Switch: 'Switch',
    Platform: { OS: 'android' }, StyleSheet: { create: value => value },
    Vibration: { vibrate: value => vibrations.push(value) },
    AccessibilityInfo: { announceForAccessibility: text => spoken.push(text), isReduceMotionEnabled: async () => reduced, isScreenReaderEnabled: async () => screenReader },
    Animated: { Value, View: 'Animated.View', spring: tween, timing: tween, parallel: actions => ({ start: () => actions.forEach(action => action.start()) }) },
  };
  const modules = {
    react, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@react-native-async-storage/async-storage': { getItem: async () => String(vibration) },
    'react-native-paper': { useTheme: () => ({ colors: {} }) },
    './app-icon': { AppIcon: 'AppIcon' }, '../context/app-theme': { caylikDesign: { spacing: {}, radius: {}, type: {} } }, '../styles/styles': { styles: {} },
  };
  const exports = {};
  vm.runInNewContext(transpile(read('src/components/HarvestReward.tsx')), {
    exports, require: name => { assert(name in modules, name); return modules[name]; },
    setTimeout: (fn, ms) => { timers.set(fn, ms); return fn; }, clearTimeout: fn => timers.delete(fn),
  });
  const render = () => { cursor = 0; return exports.default({ userId: 'u1', kind: 'payment', value: '100 TL' }); };
  const tree = render();
  const cleanup = effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  return { tree, timers, animations, vibrations, spoken, render, cleanup };
}

test('success is a dismissible modal independent of scroll position and automatically closes', async () => {
  const h = await reward({ vibration: true });
  assert.equal(h.tree.type, 'Modal');
  assert.equal(h.animations.length, 2);
  assert.deepEqual(h.vibrations, [30]);
  assert.equal([...h.timers.values()][0], 3500);
  [...h.timers.keys()][0]();
  assert.equal(h.render(), null);
  h.cleanup(); assert.equal(h.timers.size, 0);
});

test('reduced motion disables decorative animation/vibration; screen readers retain manual dismissal', async () => {
  const h = await reward({ reduced: true, screenReader: true, vibration: true });
  assert.equal(h.animations.length, 0); assert.equal(h.vibrations.length, 0); assert.equal(h.timers.size, 0);
  assert.match(h.spoken[0], /Tahsilatın kaydedildi! 100 TL/);
  h.tree.props.onRequestClose(); assert.equal(h.render(), null);
  h.cleanup();
});
