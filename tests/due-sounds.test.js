/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DUE_NOTIFICATION_RULES } = require('../shared/notificationMessages');

function harness(platform = 'android') {
  const store = new Map(); const scheduled = new Map(); const channels = new Map(); const cancelled = [];
  let counter = 0;
  let queue = Promise.resolve();
  const notifications = {
    getPermissionsAsync: async () => ({ status: 'granted' }),
    getAllScheduledNotificationsAsync: async () => [...scheduled].map(([identifier, item]) => ({ ...item, identifier })),
    setNotificationChannelAsync: async (id, settings) => channels.set(id, settings),
    scheduleNotificationAsync: async (item) => { const id = `n${++counter}`; scheduled.set(id, item); return id; },
    cancelScheduledNotificationAsync: async (id) => { cancelled.push(id); scheduled.delete(id); },
    AndroidImportance: { DEFAULT: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
  };
  const modules = {
    '@react-native-async-storage/async-storage': { getItem: async (key) => store.get(key) ?? null, setItem: async (key, value) => store.set(key, value), removeItem: async (key) => store.delete(key) },
    'expo-constants': { executionEnvironment: 'standalone' }, 'react-native': { Platform: { OS: platform } },
    'expo-notifications': notifications,
    '../utils/format': { formatTL: String, remainingTotalOf: (r) => r.toplamTutar - r.tahsilat },
    '../../shared/notificationMessages': { DUE_NOTIFICATION_RULES },
    './notificationQueue': { isNotificationOwner: () => true, MAX_PENDING_LOCAL_NOTIFICATIONS: 60, serializeNotifications: (task) => { const next = queue.then(task, task); queue = next.catch(() => {}); return next; } },
    './dailyReminder': { clearSeasonReminderInQueue: async () => {}, syncSeasonReminderInQueue: async () => {} },
  };
  const load = (filename) => {
    const source = fs.readFileSync(path.join(__dirname, '../src/services/' + filename + '.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, require: (name) => { if (!modules[name]) throw Error(name); return modules[name]; }, console });
    return exports;
  };
  modules['./soundPreferences'] = load('soundPreferences');
  const api = load('dueNotifications');
  const date = new Date(Date.now() + 5 * 86400000);
  const record = { _id: 'h1', isVadeli: true, firma: 'Firma', vadeTarihi: date.toISOString().slice(0, 10), toplamTutar: 100, tahsilat: 0 };
  return { api, store, scheduled, channels, cancelled, record,
    setAudible: (value) => { store.set('@caylik_sounds_v1:u1', JSON.stringify({ harvest: true, payment: true, due: value, season: true })); } };
}
test('Android custom sound and channel; unchanged sync is idempotent, concurrent sync serialized', async () => {
  const h = harness();
  await Promise.all([h.api.syncDueNotifications('u1', [h.record], true), h.api.syncDueNotifications('u1', [h.record], true)]);
  assert.equal(h.scheduled.size, 3);
  for (const n of h.scheduled.values()) { assert.equal(n.content.sound, 'due_reminder.wav'); assert.equal(n.trigger.channelId, 'caylik-due-sound-v1'); }
  assert.equal(h.channels.get('caylik-due-sound-v1').sound, 'due_reminder.wav');
  for (const n of h.scheduled.values()) {
    const rule = DUE_NOTIFICATION_RULES.find(item => item.title === n.content.title);
    assert(rule, 'The scheduled title must use a shared transactional template.');
    assert.equal(n.content.body, rule.body.replace('{firma}', h.record.firma).replace('{tutar}', '100'));
  }
});
test('muting reschedules pending alerts into silent channel without removing reminders', async () => {
  const h = harness();
  await h.api.syncDueNotifications('u1', [h.record], true);
  h.setAudible(false);
  await h.api.syncDueNotifications('u1', [h.record], true);
  assert.equal(h.cancelled.length, 3); assert.equal(h.scheduled.size, 3);
  assert.equal(h.channels.get('caylik-due-silent-v1').sound, null);
  for (const n of h.scheduled.values()) { assert.equal(n.content.sound, false); assert.equal(n.trigger.channelId, 'caylik-due-silent-v1'); }
});
test('iOS sound false and custom filename; fully paid record cancels reminders', async () => {
  const h = harness('ios');
  await h.api.syncDueNotifications('u1', [h.record], true);
  assert.equal([...h.scheduled.values()][0].content.sound, 'due_reminder.wav');
  assert.equal(h.channels.size, 0);
  h.setAudible(false); await h.api.syncDueNotifications('u1', [h.record], true);
  assert.equal([...h.scheduled.values()][0].content.sound, false);
  await h.api.syncDueNotifications('u1', [{ ...h.record, tahsilat: 100 }], true);
  assert.equal(h.scheduled.size, 0);
});
test('legacy default-sound schedules migrate and logout cancels owned reminders', async () => {
  const h = harness();
  h.store.set('@caylik_due_notifications_v1:u1', JSON.stringify({ 'h1:due-day': { notificationId: 'legacy', signature: 'old' } }));
  await h.api.syncDueNotifications('u1', [h.record], true);
  assert.ok(h.cancelled.includes('legacy'));
  await h.api.clearDueNotifications('u1'); assert.equal(h.scheduled.size, 0);
  assert.equal(h.store.has('@caylik_due_notifications_v1:u1'), false);
});
test('lost native due requests are reconstructed even if the storage signature is unchanged', async () => {
  const h = harness();
  await h.api.syncDueNotifications('u1', [h.record], true);
  h.scheduled.clear();
  await h.api.syncDueNotifications('u1', [h.record], true);
  assert.equal(h.scheduled.size, 3);
});
