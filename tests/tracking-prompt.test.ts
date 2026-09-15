import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequestTracking } from '../src/utils/trackingPromptPolicy.ts';

test('iOS only requests undecided ATT, including users who dismissed the old pre-prompt', () => {
  assert.equal(shouldRequestTracking('ios', true, false, 'not-determined'), true);
  assert.equal(shouldRequestTracking('ios', true, true, 'not-determined'), true);
  for (const state of ['denied', 'disabled', 'granted', 'unsupported']) {
    assert.equal(shouldRequestTracking('ios', true, false, state), false);
  }
});
test('onboarding, Expo Go and web never trigger tracking prematurely', () => {
  assert.equal(shouldRequestTracking('ios', false, false, 'not-determined'), false);
  assert.equal(shouldRequestTracking('ios', true, false, 'unsupported'), false);
  assert.equal(shouldRequestTracking('web', true, false, 'disabled'), false);
});
test('Android retains its optional one-time consent flow', () => {
  assert.equal(shouldRequestTracking('android', true, false, 'disabled'), true);
  assert.equal(shouldRequestTracking('android', true, true, 'disabled'), false);
  assert.equal(shouldRequestTracking('android', true, false, 'granted'), false);
});
