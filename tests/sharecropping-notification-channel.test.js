/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(platform, expoGo = false) {
  const channels = [], requests = [];
  const notifications = {
    AndroidImportance: { DEFAULT: 3 },
    setNotificationChannelAsync: async (id, options) => {
      // SDK 57 validates channel sound strings as bundled resource filenames.
      assert.notEqual(options.sound, 'default'); channels.push({ id, options });
    },
    getPermissionsAsync: async () => ({ granted: true }),
    getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[test]' }),
  };
  const mocks = {
    react: { useCallback: fn => fn, useEffect: () => {}, useLayoutEffect: fn => fn(), useRef: current => ({ current }) },
    'react-native': { Platform: { OS: platform }, AppState: {} },
    'expo-constants': { executionEnvironment: expoGo ? 'storeClient' : 'standalone', expoConfig: { extra: { eas: { projectId: 'project' } } } },
    'expo-notifications': notifications,
    '../services/sharecropping': { shareRequest: async (...args) => { requests.push(args); return { pushEnabled: true }; } },
  };
  const filename = path.join(__dirname, '../src/hooks/useSharecroppingPush.native.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert(mocks[name], name); return mocks[name]; } });
  return { channels, requests, api: exports.useSharecroppingPush({ userId: 'owner', refreshToken: 'session' }, () => {}, () => {}) };
}
test('Android sharecropping channel uses system sound without custom filename and keeps push registration', async () => {
  const h = harness('android'); await h.api.enable();
  assert.equal(h.channels.length, 1); assert.equal(h.channels[0].id, 'sharecropping');
  assert.equal(Object.hasOwn(h.channels[0].options, 'sound'), false);
  assert.equal(h.channels[0].options.importance, 3); assert.equal(h.requests.length, 1);
});
test('iOS never creates an Android channel and Expo Go never registers remote push', async () => {
  const ios = harness('ios'); await ios.api.enable(); assert.equal(ios.channels.length, 0); assert.equal(ios.requests.length, 1);
  const go = harness('android', true); await go.api.enable(); assert.equal(go.channels.length, 0); assert.equal(go.requests.length, 0);
});
