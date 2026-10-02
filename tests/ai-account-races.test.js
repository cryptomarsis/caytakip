/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  let slots = [], cursor = 0, layouts = [], effects = [], user = 'A';
  const requests = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  };
  const effect = queue => (fn, deps) => {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) { const cleanup = slots[i]?.cleanup; slots[i] = { deps }; queue.push(() => { cleanup?.(); slots[i].cleanup = fn(); }); }
  };
  react.useLayoutEffect = effect(layouts); react.useEffect = effect(effects);
  const compile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const services = {};
  vm.runInNewContext(compile('src/services/aiAssistant.ts'), { exports: services });
  const exports = {};
  vm.runInNewContext(compile('src/hooks/useAiAssistant.ts'), { exports, require: n => n === 'react' ? react : n === '../services/api' ? { API_URL: '/api' } : services });
  const fetchers = {};
  const fetcher = id => fetchers[id] ||= (url, options) => {
    // Headers already arrived; hold the JSON body to reproduce the real race.
    let resolve, reject;
    const body = new Promise((a, b) => { resolve = a; reject = b; });
    requests.push({ id, url, options, resolve, reject });
    return Promise.resolve({ ok: true, json: () => body });
  };
  function render() {
    cursor = 0;
    const result = exports.useAiAssistant(user, fetcher(user));
    layouts.splice(0).forEach(fn => fn()); effects.splice(0).forEach(fn => fn());
    return result;
  }
  return { render, requests, switchTo(id) { user = id; return render(); }, unmount() { slots.forEach(s => s?.cleanup?.()); } };
}

test('delayed A wallet never overwrites B credits or transaction history', async () => {
  const h = harness(); h.render(); await flush();
  h.switchTo('B'); await flush();
  h.requests[1].resolve({ credits: 20, transactions: [] }); await flush();
  h.requests[0].resolve({ credits: 777, transactions: [{ description: 'private-A' }] }); await flush();
  assert.equal(h.render().credits, 20); assert.equal(h.render().transactions.length, 0);
});

test('logout masks state immediately and A logout A rejects the former session', async () => {
  const h = harness(); const old = h.render(); await flush();
  assert.equal(h.switchTo(undefined).credits, null);
  assert.equal(await old.ask('stale caller'), false);
  h.switchTo('A'); await flush();
  h.requests[1].resolve({ credits: 12, transactions: [] }); await flush();
  h.requests[0].resolve({ credits: 999, transactions: [] }); await flush();
  assert.equal(h.render().credits, 12);
  const count = h.requests.length; await old.refreshWallet(); assert.equal(h.requests.length, count);
});

for (const kind of ['chat', 'voice']) test(`late ${kind} cannot publish A content or release B operation lock`, async () => {
  const h = harness(); h.render(); await flush();
  const invoke = hook => kind === 'chat' ? hook.ask('hello there') : hook.transcribeVoice('audio', 'audio/wav');
  const old = invoke(h.render()); await flush();
  const reqA = h.requests.find(r => r.url.endsWith(kind === 'chat' ? '/chat' : '/transcribe'));
  h.switchTo('B'); await flush();
  const fresh = invoke(h.render()); await flush();
  const reqB = h.requests.find(r => r.id === 'B' && r.url === reqA.url);
  reqA.resolve({ answer: 'PRIVATE A', text: 'PRIVATE A', credits: 999 });
  assert.equal(await old, kind === 'chat' ? false : null);
  assert.equal(kind === 'chat' ? h.render().busy : h.render().transcribing, true);
  assert.ok(!JSON.stringify(h.render().messages).includes('PRIVATE A'));
  assert.equal(h.render().credits, null);
  reqB.resolve({ answer: 'B answer', text: 'B text', credits: 8 });
  assert.equal(await fresh, kind === 'chat' ? true : 'B text');
  assert.equal(h.render().credits, 8);
});

test('out-of-order wallets and unmounted completions are ignored', async () => {
  const h = harness(); h.render(); await flush();
  const newer = h.render().refreshWallet(); await flush();
  h.requests[1].resolve({ credits: 3, transactions: [] }); await newer;
  h.requests[0].resolve({ credits: 100, transactions: [] }); await flush();
  assert.equal(h.render().credits, 3);
  const last = h.render().refreshWallet(); await flush(); h.unmount();
  h.requests[2].resolve({ credits: 999, transactions: [] }); await last;
  assert.equal(h.render().credits, 3);
});
