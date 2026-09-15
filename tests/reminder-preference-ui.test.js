/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/components/DailyReminderPreference.tsx'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText + '\nexports.Inner = ReminderPreference;';

function harness({ supported = true, policyFails = false, initiallyEnabled = true } = {}) {
  const hooks = []; let cursor = 0; let pendingEffects = []; let dirty = true; let tree;
  const state = { enabled: initiallyEnabled, saves: [] };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; dirty = true; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) {
      const index = cursor++; const previous = hooks[index];
      if (previous && deps && previous.deps && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const colors = { surface: '#fff', outline: '#888', onSurface: '#222', primary: '#174e3a', onSurfaceVariant: '#555', error: '#b00' };
  const modules = {
    react,
    'react-native': { ActivityIndicator: 'ActivityIndicator', Linking: { openSettings: async () => {} }, Pressable: 'Pressable', Switch: 'Switch', Text: 'Text', View: 'View' },
    'react-native-paper': { useTheme: () => ({ colors }) },
    '../styles/styles': { styles: {} },
    '../services/dailyReminder': {
      dailyReminderSupported: supported,
      getSeasonReminderOptIn: async () => state.enabled,
      refreshDailyReminderPolicy: async () => {},
      saveSeasonReminderOptIn: async (userId, enabled) => {
        state.saves.push({ userId, enabled }); state.enabled = enabled;
        return { permissionGranted: true };
      },
    },
    '../services/seasonReminderPolicy': {
      loadSeasonReminderPolicy: async () => {
        if (policyFails) throw Error('Policy server offline');
        return { revision: 3, settings: { enabled: true, hour: 19, minute: 30, seasonStart: '2027-05-15', seasonEnd: '2027-10-15' } };
      },
    },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, Error, require: name => { assert.ok(modules[name], `Unexpected dependency: ${name}`); return modules[name]; } });
  const props = { userId: 'producer-1', token: 'test-token', request: async () => {} };
  const render = () => {
    cursor = 0; dirty = false; tree = exports.Inner(props);
    const effects = pendingEffects; pendingEffects = []; effects.forEach(effect => effect());
  };
  const settle = async () => {
    for (let turn = 0; turn < 12; turn++) { if (dirty) render(); await Promise.resolve(); }
    if (dirty) render();
  };
  const nodes = () => {
    const found = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      found.push(node); node.children?.forEach(visit);
    };
    visit(tree); return found;
  };
  const text = () => nodes().filter(node => node.type === 'Text').flatMap(node => node.children).filter(value => typeof value === 'string').join('\n');
  return { state, settle, nodes, text };
}

test('offline policy failure retains local opt-in and leaves opt-out usable', async () => {
  const h = harness({ policyFails: true });
  await h.settle();
  const toggle = h.nodes().find(node => node.type === 'Switch');
  assert.ok(toggle, 'Local consent must not wait for a successful policy request');
  assert.equal(toggle.props.value, true);
  assert.equal(toggle.props.disabled, false);
  assert.match(h.text(), /Policy server offline/);
  toggle.props.onValueChange(false);
  await h.settle();
  assert.deepEqual(h.state.saves, [{ userId: 'producer-1', enabled: false }]);
  assert.equal(h.nodes().find(node => node.type === 'Switch').props.value, false);
});

test('producer preference shows the manager plan without date or time editing controls', async () => {
  const h = harness();
  await h.settle();
  assert.match(h.text(), /15\.05\.2027.*15\.10\.2027, 19:30/);
  assert.equal(h.nodes().filter(node => node.type === 'Switch').length, 1);
  assert.equal(h.nodes().filter(node => /TextInput|DatePicker|TimePicker/.test(String(node.type))).length, 0);
  assert.ok(!h.nodes().some(node => 'onChangeText' in node.props || 'onChange' in node.props));
});

test('unsupported web preference remains disabled even when policy loading fails', async () => {
  const h = harness({ supported: false, policyFails: true });
  await h.settle();
  const toggle = h.nodes().find(node => node.type === 'Switch');
  assert.equal(toggle.props.value, true);
  assert.equal(toggle.props.disabled, true);
  assert.match(h.text(), /kurulu iOS\/Android uygulamasında/);
  assert.deepEqual(h.state.saves, []);
});
