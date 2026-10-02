const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function configWith(env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.config.js'), 'utf8'), { module, process: { env } });
  return module.exports;
}

test('dynamic config preserves injected static fields without mutating app.json', () => {
  const base = structuredClone(require('../app.json').expo);
  base.version = '9.8.7';
  base.extra.auditSentinel = true;
  const before = JSON.stringify(base);
  const config = configWith()({ config: base });
  assert.equal(config.version, '9.8.7');
  assert.equal(config.extra.auditSentinel, true);
  assert.equal(config.android.package, base.android.package);
  assert.equal(config.ios.bundleIdentifier, base.ios.bundleIdentifier);
  assert.ok(config.android.permissions.includes('com.google.android.gms.permission.AD_ID'));
  assert.ok(config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-notifications')[1].sounds.includes('./assets/sounds/due_reminder.wav'));
  assert.equal(JSON.stringify(base), before);
  assert.equal(config.plugins.filter(p => p === '@react-native-firebase/analytics').length, 1);
});

test('Meta stays opt-in and Firebase credential paths support build environment overrides', () => {
  const config = configWith({ EXPO_PUBLIC_META_APP_ID: '123', EXPO_PUBLIC_META_CLIENT_TOKEN: 'test-token', GOOGLE_SERVICES_JSON: '/build/android.json', GOOGLE_SERVICE_INFO_PLIST: '/build/ios.plist' })({ config: require('../app.json').expo });
  const meta = config.plugins.find(p => Array.isArray(p) && p[0] === 'react-native-fbsdk-next')[1];
  assert.equal(meta.autoLogAppEventsEnabled, false);
  assert.equal(meta.isAutoInitEnabled, false);
  assert.equal(meta.advertiserIDCollectionEnabled, false);
  assert.equal(config.android.googleServicesFile, '/build/android.json');
  assert.equal(config.ios.googleServicesFile, '/build/ios.plist');
});

test('package release name matches Expo and EAS retains remote auto-increment', () => {
  assert.equal(require('../package.json').version, require('../app.json').expo.version);
  assert.equal(require('../eas.json').cli.appVersionSource, 'remote');
  assert.equal(require('../eas.json').build.production.autoIncrement, true);
});
