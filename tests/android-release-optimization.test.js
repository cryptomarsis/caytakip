/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBuildProperties } = require('expo-build-properties');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const config = require('../app.config').expo;
const plugins = config.plugins.filter(item => Array.isArray(item) && item[0] === 'expo-build-properties');

test('cloud prebuild keeps Android release shrinking in the source config and preserves iOS', () => {
  assert.equal(plugins.length, 1);
  const options = plugins[0][1];
  assert.equal(options.android.enableMinifyInReleaseBuilds, true);
  assert.equal(options.android.enableShrinkResourcesInReleaseBuilds, true);
  assert.deepEqual(options.ios, { useFrameworks: 'static' });
  assert.equal(options.android.kotlinVersion, undefined);
  assert.equal(options.android.extraProguardRules, undefined, 'Do not defeat SDK consumer rules with blanket keeps');
  assert(config.android.permissions.includes('com.google.android.gms.permission.AD_ID'));
  assert.match(read('.easignore'), /^\/android\/$/m);
});

test('installed Expo plugin writes both optimization flags on a clean cloud prebuild', async () => {
  const prepared = withBuildProperties({ name: 'test', slug: 'test' }, plugins[0][1]);
  const result = await prepared.mods.android.gradleProperties({
    ...prepared,
    modResults: [],
    modRequest: { projectRoot: root, platform: 'android', modName: 'gradleProperties' },
  });
  for (const key of ['android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds']) {
    assert.equal(result.modResults.find(item => item.key === key)?.value, 'true');
    assert.match(read('android/gradle.properties'), new RegExp(`^${key.replaceAll('.', '\\.')}=true$`, 'm'));
  }
});
