/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function harness({ deleted = true, notificationCleanup, offlineCleanup, remoteLogout, deleteResponse } = {}) {
  const text = fs.readFileSync(path.join(__dirname, '../src/app/index.tsx'), 'utf8');
  const source = ts.createSourceFile('index.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = {};
  const find = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && ['handleLogout', 'handleDeleteAccount', 'handleAuth'].includes(node.name.text)) handlers[node.name.text] = node.initializer.getText(source);
    ts.forEachChild(node, find);
  };
  find(source);
  const user = { userId: 'u1', token: 'access', refreshToken: 'test' };
  const state = { user, owner: 'u1', cleared: false, soundStopped: false, feedback: [], loading: false };
  const lifecycle = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/sessionLifecycle.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: lifecycle.exports });
  const authSession = lifecycle.exports.createSessionLifecycle({
    save: async () => {}, clear: async () => { state.cleared = true; },
    changed: value => { state.user = value; state.owner = value?.userId || null; },
  });
  await authSession.replace(user, authSession.capture());
  const authCleanupRef = { current: null };
  const exports = {};
  const code = ts.transpileModule(Object.entries(handlers).map(([key, value]) => `exports.${key} = ${value};`).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports, currentUser: user, authSession, authCleanupRef, API_URL: 'https://example.invalid',
    stopFeedbackSound: () => { state.soundStopped = true; }, setNotificationOwner: value => { state.owner = value; },
    setHarvestReward: () => {}, setLoading: value => { state.loading = value; }, fetchWithTimeout: remoteLogout || (async () => ({})),
    authFetch: deleteResponse || (async () => ({ ok: deleted, json: async () => ({ error: 'server rejected' }) })), getAuthHeaders: () => ({}),
    cancelDailyReminder: notificationCleanup || (async () => {}), clearDueNotifications: async () => {},
    clearOfflineData: offlineCleanup || (async () => {}),
    showAuthFeedback: (...args) => state.feedback.push(args), Alert: { alert: () => {} },
  });
  return { api: exports, state, authSession, authCleanupRef };
}

test('logout clears active auth while notification cleanup is still pending', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await harness({ notificationCleanup: () => pending });
  const logout = h.api.handleLogout();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.user, null); assert.equal(h.state.owner, null); assert.equal(h.state.soundStopped, true);
  finish(); await logout;
});
test('confirmed account deletion remains successful despite local cleanup failure', async () => {
  const h = await harness({ notificationCleanup: async () => { throw Error('native failed'); }, offlineCleanup: async () => { throw Error('cache failed'); } });
  await h.api.handleDeleteAccount();
  assert.equal(h.state.cleared, true); assert.equal(h.state.user, null); assert.equal(h.state.owner, null);
  assert.match(h.state.feedback[0][0], /Hesap silindi/);
});
test('server-rejected account deletion preserves authentication and notification ownership', async () => {
  const h = await harness({ deleted: false });
  await assert.rejects(h.api.handleDeleteAccount(), /server rejected/);
  assert.equal(h.state.cleared, false); assert.equal(h.state.user.userId, 'u1'); assert.equal(h.state.owner, 'u1');
});

test('logout invalidates before remote revocation returns and blocks sign-in during global cleanup', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await harness({ remoteLogout: () => pending });
  const logout = h.api.handleLogout();
  assert.equal(h.state.user, null); assert.equal(h.state.owner, null);
  assert.equal(h.state.loading, true);
  assert(h.authCleanupRef.current);
  // No form/network mocks: the pending-cleanup guard must return before any login work.
  await h.api.handleAuth();
  assert.equal(h.state.user, null);
  finish({}); await logout;
  assert.equal(h.authCleanupRef.current, null);
  assert.equal(h.state.loading, false);
});

test('a late account-deletion response cannot sign out the replacement account', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await harness({ deleteResponse: () => pending });
  const deletion = h.api.handleDeleteAccount();
  await h.authSession.replace({ userId: 'u2', token: 'B', refreshToken: 'refresh-B' }, h.authSession.capture());
  finish({ ok: true, json: async () => ({}) });
  await assert.rejects(deletion, /Oturum değişti/);
  assert.equal(h.state.user.userId, 'u2'); assert.equal(h.state.owner, 'u2');
  assert.equal(h.state.cleared, false);
});
