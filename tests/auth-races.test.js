/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/sessionLifecycle.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const account = (userId, version = 1) => ({ userId, name: userId, phone: '05555555555', role: 'user', token: `${userId}-token-${version}`, refreshToken: `${userId}-refresh-${version}` });

function harness({ save, clear } = {}) {
  const exports = {};
  vm.runInNewContext(code, { exports });
  const state = { user: null, persisted: null, events: [], changes: [] };
  const api = exports.createSessionLifecycle({
    changed: user => { state.user = user; state.changes.push(user?.token ?? null); },
    save: async user => {
      state.events.push(`save:${user.token}:start`);
      if (save) await save(user);
      state.persisted = user;
      state.events.push(`save:${user.token}:done`);
    },
    clear: async () => {
      state.events.push('clear:start');
      if (clear) await clear();
      state.persisted = null;
      state.events.push('clear:done');
    },
  });
  return { api, state };
}

for (const destination of ['logout', 'account B']) {
  for (const outcome of ['success', 'invalid credentials', 'network failure']) {
    test(`delayed account A refresh ${outcome} cannot change ${destination}`, async () => {
      const h = harness();
      await h.api.replace(account('A'), h.api.capture());
      const pending = deferred();
      const refresh = h.api.refreshOnce(h.api.capture(), () => pending.promise);
      await h.api.invalidate();
      if (destination === 'account B') await h.api.replace(account('B'), h.api.capture());
      if (outcome === 'network failure') pending.reject(Error('offline'));
      else pending.resolve(outcome === 'success' ? account('A', 2) : null);
      assert.equal(await refresh, null);
      assert.equal(h.state.user?.userId ?? null, destination === 'logout' ? null : 'B');
      assert.equal(h.state.persisted?.userId ?? null, destination === 'logout' ? null : 'B');
    });
  }
}

test('late token-1 401 reuses published token-2 without another refresh', async () => {
  const h = harness();
  await h.api.replace(account('A'), h.api.capture());
  const originalRequest = h.api.capture();
  let loads = 0;
  const load = async () => { loads++; return account('A', 2); };
  await h.api.refreshOnce(originalRequest, load);
  const next = await h.api.refreshOnce(originalRequest, load);
  assert.equal(next.token, 'A-token-2');
  assert.equal(loads, 1);
});

test('refresh singleflight is shared and an old finally cannot clear account B flight', async () => {
  const h = harness();
  await h.api.replace(account('A'), h.api.capture());
  const a = deferred(); const b = deferred();
  let aLoads = 0; let bLoads = 0;
  const aScope = h.api.capture();
  const loadA = () => { aLoads++; return a.promise; };
  const aFlight = h.api.refreshOnce(aScope, loadA);
  assert.equal(h.api.refreshOnce(aScope, loadA), aFlight);
  await h.api.invalidate();
  await h.api.replace(account('B'), h.api.capture());
  const bScope = h.api.capture();
  const loadB = () => { bLoads++; return b.promise; };
  const bFlight = h.api.refreshOnce(bScope, loadB);
  a.resolve(account('A', 2));
  assert.equal(await aFlight, null);
  assert.equal(h.api.refreshOnce(bScope, loadB), bFlight);
  assert.equal(aLoads, 1); assert.equal(bLoads, 1);
  b.resolve(account('B', 2));
  assert.equal((await bFlight).token, 'B-token-2');
  assert.equal(h.state.persisted.token, 'B-token-2');
});

test('running old save finishes before queued logout clear and account B save', async () => {
  const blocked = deferred(); const started = deferred();
  const h = harness({ save: async user => { if (user.userId === 'A') { started.resolve(); await blocked.promise; } } });
  const oldSave = h.api.replace(account('A'), h.api.capture());
  await started.promise;
  const logout = h.api.invalidate();
  const newSave = h.api.replace(account('B'), h.api.capture());
  await tick();
  assert.equal(h.state.user.userId, 'B');
  assert.deepEqual(h.state.events, ['save:A-token-1:start']);
  blocked.resolve();
  assert.equal(await oldSave, false);
  assert.equal(await logout, true);
  assert.equal(await newSave, true);
  assert.deepEqual(h.state.events, ['save:A-token-1:start', 'save:A-token-1:done', 'clear:start', 'clear:done', 'save:B-token-1:start', 'save:B-token-1:done']);
  assert.equal(h.state.persisted.userId, 'B');
});

test('stale restore including legacy migration cannot overwrite newer login', async () => {
  const h = harness(); const reading = deferred(); const finish = deferred();
  const restore = h.api.restore(async () => {
    reading.resolve(); await finish.promise;
    h.state.persisted = account('legacy');
    return h.state.persisted;
  }, () => true);
  await reading.promise;
  const logout = h.api.invalidate();
  const login = h.api.replace(account('B'), h.api.beginAuthentication());
  finish.resolve();
  await Promise.all([restore, logout, login]);
  assert.equal(h.state.user.userId, 'B');
  assert.equal(h.state.persisted.userId, 'B');
  assert.ok(!h.state.changes.includes('legacy-token-1'));
});

test('inactive restore completion does not publish saved credentials', async () => {
  const h = harness(); const reading = deferred(); const finish = deferred(); let active = true;
  const restore = h.api.restore(async () => { reading.resolve(); await finish.promise; return account('legacy'); }, () => active);
  await reading.promise; active = false; finish.resolve(); await restore;
  assert.equal(h.state.user, null);
  assert.deepEqual(h.state.changes, []);
});

test('new authentication attempt invalidates older login completion', async () => {
  const h = harness();
  const older = h.api.beginAuthentication();
  const latest = h.api.beginAuthentication();
  assert.equal(await h.api.replace(account('A'), older), false);
  assert.equal(await h.api.replace(account('B'), latest), true);
  assert.equal(h.state.persisted.userId, 'B');
  assert.deepEqual(h.state.changes, ['B-token-1']);
});

test('PIN-style exact-credential replacement rejects a pre-refresh scope', async () => {
  const h = harness();
  await h.api.replace(account('A'), h.api.capture());
  const pinRequest = h.api.capture();
  await h.api.refreshOnce(pinRequest, async () => account('A', 2));
  assert.equal(h.api.isCurrent(pinRequest), true);
  assert.equal(h.api.isCurrent(pinRequest, true), false);
  assert.equal(await h.api.replace(account('A', 3), pinRequest, true), false);
  assert.equal(h.state.user.token, 'A-token-2');
  assert.equal(h.state.persisted.token, 'A-token-2');
});

test('failed persistence does not poison the logout and next-login queue', async () => {
  const h = harness({ save: async user => { if (user.userId === 'A') throw Error('disk failed'); } });
  await assert.rejects(h.api.replace(account('A'), h.api.capture()), /disk failed/);
  await h.api.invalidate();
  await h.api.replace(account('B'), h.api.capture());
  assert.equal(h.state.persisted.userId, 'B');
});
