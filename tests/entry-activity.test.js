const test = require('node:test');
const assert = require('node:assert/strict');
const { entryActivityPipeline, mergeEntryActivity } = require('../server/entryActivity');
test('counts each matching row once even if id and phone both match', () => {
  const profile = { userId: 'u1', phone: '123' };
  const activity = mergeEntryActivity(profile, {
    harvest: [
      { _id: { userId: 'u1', userPhone: '123' }, count: 4, recent: 2, lastEntryAt: '2026-09-01' },
      { _id: { userPhone: '123' }, count: 1, recent: 1, lastEntryAt: '2026-09-02' },
      { _id: { userId: 'u2', userPhone: '456' }, count: 99, recent: 99 },
    ], payment: [{ _id: { userId: 'u1' }, count: 2, recent: 1, lastEntryAt: '2026-09-03' }],
  });
  assert.deepEqual(activity, { counts: { harvest: 5, payment: 2 }, recent: 4, lastEntryAt: '2026-09-03' });
});
test('empty users do not match unowned rows and aggregate uses creation date not entry financial date', () => {
  assert.equal(mergeEntryActivity({}, { harvest: [{ _id: {}, count: 7, recent: 7 }] }).counts.harvest, 0);
  const pipeline = entryActivityPipeline({ userId: 'u1' }, 30 * 86400000);
  assert.equal(pipeline[1].$group.lastEntryAt.$max, '$createdAt');
  assert.equal(pipeline[1].$group.recent.$sum.$cond[0].$gte[1].getTime(), 0);
});
