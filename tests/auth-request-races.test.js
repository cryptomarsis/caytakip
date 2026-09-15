/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const userA = { userId: 'A', token: 'access-A', refreshToken: 'refresh-A' };
const userB = { userId: 'B', token: 'access-B', refreshToken: 'refresh-B' };
const response = status => ({ status, ok: status < 400, json: async () => ({}) });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

async function harness(fetcher) {
  const lifecycle = {};
  vm.runInNewContext(transpile(fs.readFileSync(path.join(__dirname, '../src/services/sessionLifecycle.ts'), 'utf8')), { exports: lifecycle });
  const state = { current: null, requests: [], refreshes: 0 };
  const authSession = lifecycle.createSessionLifecycle({ save: async () => {}, clear: async () => {}, changed: user => { state.current = user; } });
  await authSession.replace(userA, authSession.capture());
  const source = ts.createSourceFile('index.tsx', fs.readFileSync(path.join(__dirname, '../src/app/index.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  const find = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['authFetchScoped', 'authFetch'].includes(node.name.text)) {
      declarations.push('const ' + node.name.text + ' = ' + node.initializer.getText(source) + '; exports.' + node.name.text + ' = ' + node.name.text + ';');
    }
    ts.forEachChild(node, find);
  };
  find(source);
  const api = {};
  vm.runInNewContext(transpile(declarations.join('\n')), {
    exports: api, authSession, currentUser: userA, useCallback: callback => callback, API_TIMEOUTS: { default: 1 },
    refreshAccessToken: async user => { state.refreshes++; return { ...user, token: 'renewed-A', refreshToken: 'renewed-refresh-A' }; },
    fetchWithTimeout: async (url, options) => { state.requests.push({ url, options }); return fetcher(url, options, state.requests.length); },
  });
  return { api, authSession, state };
}

test('a pending 401 from the old account is rejected before refresh or retry after logout/login B', async () => {
  const pending = deferred();
  const h = await harness(() => pending.promise);
  const request = h.api.authFetch('/season-reminder');
  await h.authSession.invalidate();
  await h.authSession.replace(userB, h.authSession.capture());
  pending.resolve(response(401));
  await assert.rejects(request, /Oturum değişti/);
  assert.equal(h.state.requests.length, 1); assert.equal(h.state.refreshes, 0);
  assert.equal(h.state.current.userId, 'B');
});

test('stale successful data responses cannot be returned to an old account caller', async () => {
  const pending = deferred();
  const h = await harness(() => pending.promise);
  const request = h.api.authFetch('/season-reminder');
  await h.authSession.invalidate();
  pending.resolve(response(200));
  await assert.rejects(request, /Oturum değişti/);
  assert.equal(h.state.current, null);
});

test('a delayed token-1 401 retries token-2 without consuming another refresh token', async () => {
  const pending = deferred();
  const h = await harness((_url, _options, count) => count === 1 ? pending.promise : response(200));
  const scope = h.authSession.capture();
  const request = h.api.authFetch('/season-reminder');
  await h.authSession.refreshOnce(scope, async user => ({ ...user, token: 'already-renewed', refreshToken: 'already-rotated' }));
  pending.resolve(response(401));
  assert.equal((await request).status, 200);
  assert.equal(h.state.refreshes, 0);
  assert.equal(h.state.requests.length, 2);
  assert.equal(h.state.requests[1].options.headers.Authorization, 'Bearer already-renewed');
});

test('an old render authFetch callback cannot begin a new request authenticated as account B', async () => {
  const h = await harness(() => response(200));
  await h.authSession.replace(userB, h.authSession.capture());
  await assert.rejects(h.api.authFetch('/account-A-resource'), /Oturum değişti/);
  assert.equal(h.state.requests.length, 0);
});
