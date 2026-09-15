/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const messages = require('../shared/notificationMessages');

const plan = { enabled: true, hour: 18, minute: 20, seasonStart: '2026-09-15', seasonEnd: '2026-10-15' };
const optInKey = userId => '@caylik_season_optin_v1:' + userId;
const policyKey = userId => '@caylik_season_policy_v1:' + userId;
const plain = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ granted = true, canAskAgain = false, platform = 'ios', expoGo = false } = {}) {
  const storage = new Map(); const scheduled = new Map(); const channels = new Map(); const loads = [];
  let requests = 0; let added = 0; let nativeImports = 0;
  const state = {
    now: new Date(2026, 8, 15, 10).getTime(), failSchedule: 0, failPersist: false, failCancel: false, failRead: false,
    policy: { settings: { ...plan }, revision: 1 }, loadPolicy: null, seasonAudible: true,
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  }
  const shared = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/seasonReminders.js'), 'utf8'), { module: shared, Date: ClockDate });
  const parsePolicy = value => {
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('invalid policy revision');
    return { settings: shared.exports.validateSeasonReminderSettings(value.settings, new ClockDate(), true), revision: value.revision };
  };
  const notifications = {
    getPermissionsAsync: async () => ({ granted, canAskAgain, status: granted ? 'granted' : 'denied' }),
    requestPermissionsAsync: async () => { requests++; return { granted, canAskAgain, status: granted ? 'granted' : 'denied' }; },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async (id) => { if (state.failCancel) throw Error('cancel failed'); scheduled.delete(id); },
    scheduleNotificationAsync: async (item) => {
      added++;
      if (state.failSchedule === added) throw Error('schedule failed');
      const identifier = item.identifier || 'due-' + added;
      scheduled.set(identifier, { ...item, identifier }); return identifier;
    },
    setNotificationChannelAsync: async (id, value) => { channels.set(id, value); },
    AndroidImportance: { DEFAULT: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
  };
  const mocks = {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => { if (state.failRead) throw Error('read failed'); return storage.get(key) ?? null; },
      removeItem: async key => storage.delete(key),
      setItem: async (key, value) => {
        if (state.failPersist && key.startsWith('@caylik_season_optin_v1:') && value === 'true') throw Error('disk failed');
        storage.set(key, value);
      },
    },
    'expo-constants': { executionEnvironment: expoGo ? 'storeClient' : 'standalone', appOwnership: null },
    'react-native': { Platform: { OS: platform } }, 'expo-notifications': notifications,
    '../../shared/seasonReminders': shared.exports,
    '../../shared/notificationMessages': messages,
    './seasonReminderPolicy': {
      parseSeasonPolicy: parsePolicy,
      loadSeasonReminderPolicy: async (token) => {
        loads.push(token);
        if (!token) throw Error('token required');
        const snapshot = state.loadPolicy ? await state.loadPolicy(token) : plain(state.policy);
        return parsePolicy(snapshot);
      },
    },
    '../utils/format': { formatTL: String, remainingTotalOf: r => r.toplamTutar - r.tahsilat },
  };
  const load = (filename) => {
    const source = fs.readFileSync(path.join(__dirname, '../src/services/' + filename + '.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, Date: ClockDate, console, require: (name) => {
      if (!mocks[name]) throw Error(name);
      if (name === 'expo-notifications') nativeImports++;
      return mocks[name];
    } });
    return exports;
  };
  mocks['./soundPreferences'] = { ...load('soundPreferences'), getSoundPreferences: async () => ({ harvest: true, payment: true, due: true, season: state.seasonAudible }) };
  mocks['./notificationQueue'] = load('notificationQueue');
  const queueApi = mocks['./notificationQueue'];
  queueApi.setNotificationOwner('u1');
  const api = load('dailyReminder');
  mocks['./dailyReminder'] = api;
  async function publish(settings = plan, userId = 'u1') {
    state.policy = { settings: { ...settings }, revision: state.policy.revision + 1 };
    return api.refreshDailyReminderPolicy(userId, 'token-' + userId);
  }
  async function activate(settings = plan, userId = 'u1') {
    await publish(settings, userId);
    return api.saveSeasonReminderOptIn(userId, true);
  }
  return { api, due: load('dueNotifications'), queue: queueApi, scheduled, storage, channels, loads, state, publish, activate,
    added: () => added, requests: () => requests, nativeImports: () => nativeImports };
}

test('season reminders default off; old indefinite and personal-date preferences cannot auto-activate', async () => {
  const h = harness();
  h.storage.set('@caylik_daily_reminder_v1:u1', 'true');
  h.storage.set('@caylik_season_reminder_v2:u1', JSON.stringify(plan));
  h.scheduled.set('caylik-daily-reminder-v1', { identifier: 'caylik-daily-reminder-v1' });
  const result = await h.api.syncDailyReminder('u1');
  assert.equal(result.settings.enabled, false);
  assert.equal(h.scheduled.size, 0); assert.equal(h.requests(), 0);
  await h.publish();
  assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, false);
  assert.equal(await h.api.getSeasonReminderOptIn('u1'), false);
  assert.equal(h.scheduled.size, 0);
});

test('central time uses finite dates within a 14-day lease; parallel sync is idempotent', async () => {
  const h = harness();
  const result = await h.activate();
  assert.equal(result.settings.enabled, true); assert.equal(result.scheduledCount, 14);
  await Promise.all([h.api.syncDailyReminder('u1'), h.api.syncDailyReminder('u1')]);
  assert.equal(h.scheduled.size, 14); assert.equal(h.added(), 14);
  assert.deepEqual(h.loads, ['token-u1']);
  for (const item of h.scheduled.values()) {
    assert.equal(item.trigger.date.getHours(), 18); assert.equal(item.trigger.date.getMinutes(), 20);
    assert.equal(item.trigger.type, 'date'); assert.equal(item.trigger.repeats, undefined);
    assert.equal(item.content.data.owner, 'u1');
    assert.equal(item.content.title, messages.SEASON_NOTIFICATION.title);
    assert.equal(item.content.body, messages.SEASON_NOTIFICATION.body);
  }
});

test('season end stops notifications without background execution; no automatic yearly renewal', async () => {
  const h = harness();
  await h.activate({ ...plan, seasonEnd: '2026-09-16' });
  assert.equal(h.scheduled.size, 2);
  for (const item of h.scheduled.values()) assert(item.trigger.date < new Date(2026, 8, 17));
  h.state.now = new Date(2026, 8, 17, 10).getTime();
  assert.equal((await h.api.syncDailyReminder('u1')).settings.enabled, false);
  assert.equal(h.scheduled.size, 0);
  h.state.now = new Date(2027, 8, 15, 10).getTime();
  assert.equal((await h.api.syncDailyReminder('u1')).scheduledCount, 0);
});

test('account switch and logout cancel only seasonal alerts; saved opt-in stays account scoped', async () => {
  const h = harness();
  await h.activate();
  h.queue.setNotificationOwner('u2');
  await h.api.syncDailyReminder('u2'); assert.equal(h.scheduled.size, 0);
  assert.equal(await h.api.getSeasonReminderOptIn('u2'), false);
  h.queue.setNotificationOwner('u1');
  await h.api.syncDailyReminder('u1');
  h.scheduled.set('due-1', { identifier: 'due-1', content: { data: { type: 'vade' } } });
  await h.api.cancelDailyReminder();
  assert.equal(h.scheduled.size, 1); assert(h.scheduled.has('due-1'));
  assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, true);
  await h.api.saveSeasonReminderOptIn('u1', false);
  assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, false);
  assert.equal(h.storage.get(optInKey('u1')), 'false');
});

test('storage read failure removes old infinite and previous account notifications', async () => {
  const h = harness();
  await h.activate();
  h.scheduled.set('caylik-daily-reminder-v1', { identifier: 'caylik-daily-reminder-v1' });
  h.queue.setNotificationOwner('u2'); h.state.failRead = true;
  await assert.rejects(h.api.syncDailyReminder('u2'));
  assert.equal(h.scheduled.size, 0);
});

test('late previous-account sync cannot recreate reminders after logout or affect new account', async () => {
  const h = harness();
  await h.activate();
  h.queue.setNotificationOwner(null);
  await h.api.cancelDailyReminder();
  await h.api.syncDailyReminder('u1'); assert.equal(h.scheduled.size, 0);
  h.queue.setNotificationOwner('u2');
  await h.activate(plan, 'u2');
  await h.api.syncDailyReminder('u1');
  assert.equal(h.scheduled.size, 14);
  assert([...h.scheduled.values()].every(n => n.content.data.owner === 'u2'));
});

test('due and seasonal reconciliation share capacity; nearest due dates get priority', async () => {
  const h = harness();
  await h.publish();
  const records = Array.from({ length: 18 }, (_, index) => ({ _id: 'h' + index, isVadeli: true, firma: 'Firma', vadeTarihi: '2026-09-20', toplamTutar: 100, tahsilat: 0 }));
  await Promise.all([h.api.saveSeasonReminderOptIn('u1', true), h.due.syncDueNotifications('u1', records, true), h.api.syncDailyReminder('u1')]);
  assert.equal(h.scheduled.size, 60);
  assert.equal([...h.scheduled.values()].filter(n => n.content.data.type === 'vade').length, 54);
  assert.equal([...h.scheduled.values()].filter(n => n.content.data.type === 'daily-reminder').length, 6);
  await h.due.syncDueNotifications('u1', [...records, ...records.map(r => ({ ...r, _id: 'extra' + r._id, vadeTarihi: '2026-10-20' }))], true);
  assert.equal(h.scheduled.size, 60);
  assert([...h.scheduled.values()].every(n => n.content.data.type === 'vade'));
  assert.equal([...h.scheduled.values()].filter(n => new Date(n.trigger.date).getMonth() === 8).length, 54);
});

test('late due sync after logout does not recreate either notification family', async () => {
  const h = harness();
  await h.activate();
  h.queue.setNotificationOwner(null);
  await h.api.cancelDailyReminder();
  await h.due.syncDueNotifications('u1', [{ _id: 'late', isVadeli: true, vadeTarihi: '2026-09-20', toplamTutar: 100, tahsilat: 0 }], true);
  assert.equal(h.scheduled.size, 0);
});

test('admin time changes or shorter seasons replace pending dates without changing user consent', async () => {
  const h = harness({ platform: 'android' });
  await h.activate();
  const oldRevision = JSON.parse(h.storage.get(policyKey('u1'))).policy.revision;
  await h.publish({ ...plan, hour: 21, minute: 5, seasonEnd: '2026-09-17' });
  assert.equal(h.scheduled.size, 3);
  assert.equal(JSON.parse(h.storage.get(policyKey('u1'))).policy.revision, oldRevision + 1);
  assert.equal(h.storage.get(optInKey('u1')), 'true');
  for (const item of h.scheduled.values()) {
    assert.equal(item.trigger.date.getHours(), 21); assert.equal(item.trigger.date.getMinutes(), 5);
    assert.equal(item.trigger.channelId, 'caylik-season-sound-v1');
  }
});

test('denied permission is never reported as enabled; policy refresh and foreground sync never prompt', async () => {
  const h = harness({ granted: false, canAskAgain: true });
  await h.publish();
  assert.equal(h.requests(), 0);
  const result = await h.api.saveSeasonReminderOptIn('u1', true);
  assert.equal(result.settings.enabled, false); assert.equal(result.permissionGranted, false);
  assert.equal(h.storage.get(optInKey('u1')), 'false');
  assert.equal(h.requests(), 1); assert.equal(h.scheduled.size, 0);
  h.storage.set(optInKey('u1'), 'true');
  await h.api.syncDailyReminder('u1');
  await h.publish();
  assert.equal(h.requests(), 1); assert.equal(h.scheduled.size, 0);
});

test('unsupported platforms cannot configure or import native notification scheduling', async () => {
  for (const options of [{ expoGo: true }, { platform: 'web' }]) {
    const h = harness(options);
    await assert.rejects(h.api.saveSeasonReminderOptIn('u1', true));
    assert.equal((await h.api.syncDailyReminder('u1')).scheduledCount, 0);
    assert.equal(h.scheduled.size, 0);
    assert.equal(h.nativeImports(), 0);
  }
});

test('notification capacity preserves unrelated due reminders and does not overfill schedule', async () => {
  const h = harness();
  for (let i = 0; i < 58; i++) h.scheduled.set('due-' + i, { identifier: 'due-' + i, content: {} });
  const result = await h.activate();
  assert.equal(result.scheduledCount, 2); assert.equal(result.capacityLimited, true); assert.equal(h.scheduled.size, 60);
  await h.api.cancelDailyReminder(); assert.equal(h.scheduled.size, 58);
});

test('native or consent-storage failures cannot leave a partially enabled personal preference', async () => {
  for (const failure of ['native', 'storage']) {
    const h = harness();
    await h.publish();
    if (failure === 'native') h.state.failSchedule = 2;
    else h.state.failPersist = true;
    await assert.rejects(h.api.saveSeasonReminderOptIn('u1', true));
    assert.equal(h.scheduled.size, 0);
    assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, false);
    assert.equal(h.storage.get(optInKey('u1')), 'false');
  }
});

test('failed cancellation persists opt-out first; next sync cleans up instead of enabling again', async () => {
  const h = harness();
  await h.activate();
  h.state.failCancel = true;
  await assert.rejects(h.api.saveSeasonReminderOptIn('u1', false));
  assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, false);
  h.state.failCancel = false;
  await h.api.syncDailyReminder('u1'); assert.equal(h.scheduled.size, 0);
});

test('successful foreground policy refresh rolls the finite window; invalid cached policy stays safely off', async () => {
  const h = harness();
  await h.activate();
  h.state.now = new Date(2026, 8, 20, 20).getTime();
  const result = await h.publish();
  assert.equal(result.scheduledCount, 13);
  for (const item of h.scheduled.values()) assert(item.trigger.date.getTime() > h.state.now);
  h.storage.set(policyKey('u1'), '{bad');
  await h.api.syncDailyReminder('u1'); assert.equal(h.scheduled.size, 0);
});

test('users can save only boolean consent, never custom dates/time or a personal plan', async () => {
  const h = harness();
  assert.equal(h.api.saveDailyReminderSettings, undefined);
  await h.publish();
  for (const value of [plan, { enabled: true, hour: 4 }, 'true', 1, null]) {
    await assert.rejects(h.api.saveSeasonReminderOptIn('u1', value));
  }
  await h.api.saveSeasonReminderOptIn('u1', true);
  const before = h.storage.get(policyKey('u1'));
  h.storage.set('@caylik_season_reminder_v2:u1', JSON.stringify({ ...plan, hour: 4, seasonEnd: '2099-12-31' }));
  const settings = await h.api.getDailyReminderSettings('u1');
  assert.equal(settings.hour, plan.hour);
  assert.equal(settings.seasonEnd, '2026-09-28');
  assert.equal(h.storage.get(policyKey('u1')), before);
});

test('user opt-out survives subsequent admin changes and admin disabling preserves the consent choice', async () => {
  const h = harness();
  await h.activate();
  await h.api.saveSeasonReminderOptIn('u1', false);
  await h.publish({ ...plan, hour: 21 });
  assert.equal(await h.api.getSeasonReminderOptIn('u1'), false);
  assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, false);
  assert.equal(h.scheduled.size, 0);
  await h.api.saveSeasonReminderOptIn('u1', true);
  await h.publish({ ...plan, enabled: false });
  assert.equal(await h.api.getSeasonReminderOptIn('u1'), true);
  assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, false);
  assert.equal(h.scheduled.size, 0);
});

test('offline sync cannot extend the fetchedAt lease beyond 14 calendar days', async () => {
  const h = harness();
  await h.activate();
  const fetchedAt = JSON.parse(h.storage.get(policyKey('u1'))).fetchedAt;
  h.state.now = new Date(2026, 8, 20, 20).getTime();
  const result = await h.api.syncDailyReminder('u1');
  assert.equal(result.scheduledCount, 8);
  assert.equal(result.settings.seasonEnd, '2026-09-28');
  assert.equal(JSON.parse(h.storage.get(policyKey('u1'))).fetchedAt, fetchedAt);
  assert([...h.scheduled.values()].every(n => n.trigger.date < new Date(2026, 8, 29)));
  h.state.now = new Date(2026, 8, 29, 0).getTime();
  assert.equal((await h.api.syncDailyReminder('u1')).settings.enabled, false);
  assert.equal(h.scheduled.size, 0);
  h.state.loadPolicy = async () => { throw Error('offline'); };
  await assert.rejects(h.api.refreshDailyReminderPolicy('u1', 'token-u1'));
  assert.equal(JSON.parse(h.storage.get(policyKey('u1'))).fetchedAt, fetchedAt);
  assert.equal(h.scheduled.size, 0);
});

test('missing, future or malformed fetchedAt cannot activate a cached central policy', async () => {
  const h = harness();
  h.storage.set(optInKey('u1'), 'true');
  for (const fetchedAt of [undefined, null, 'yesterday', h.state.now + 1]) {
    h.storage.set(policyKey('u1'), JSON.stringify({ policy: { settings: plan, revision: 4 }, fetchedAt }));
    assert.equal((await h.api.getDailyReminderSettings('u1')).enabled, false);
  }
});

test('older asynchronous policy responses cannot roll back a newer revision or renew its lease', async () => {
  const h = harness();
  await h.activate();
  const pending = deferred();
  const oldPolicy = { settings: { ...plan, hour: 5 }, revision: 3 };
  h.state.loadPolicy = () => pending.promise;
  const oldRequest = h.api.refreshDailyReminderPolicy('u1', 'old-token');
  h.state.loadPolicy = null;
  h.state.policy = { settings: { ...plan, hour: 22 }, revision: 5 };
  await h.api.refreshDailyReminderPolicy('u1', 'new-token');
  const cache = h.storage.get(policyKey('u1'));
  const added = h.added();
  h.state.now += 3600000;
  pending.resolve(oldPolicy);
  await oldRequest;
  assert.equal(h.storage.get(policyKey('u1')), cache);
  assert.equal(h.added(), added);
  assert.equal((await h.api.getDailyReminderSettings('u1')).hour, 22);
  assert([...h.scheduled.values()].every(n => n.trigger.date.getHours() === 22));
});

test('policy response after account switch cannot replace the next account schedule or cache', async () => {
  const h = harness();
  await h.activate();
  const pending = deferred();
  h.state.loadPolicy = () => pending.promise;
  const oldRequest = h.api.refreshDailyReminderPolicy('u1', 'old-token');
  h.queue.setNotificationOwner('u2');
  h.state.loadPolicy = null;
  await h.activate({ ...plan, hour: 20 }, 'u2');
  const oldCache = h.storage.get(policyKey('u1'));
  pending.resolve({ settings: { ...plan, hour: 4 }, revision: 50 });
  await oldRequest;
  assert.equal(h.storage.get(policyKey('u1')), oldCache);
  assert([...h.scheduled.values()].every(n => n.content.data.owner === 'u2' && n.trigger.date.getHours() === 20));
});

test('a policy refresh already in flight cannot undo a user opt-out', async () => {
  const h = harness();
  await h.activate();
  const pending = deferred();
  h.state.loadPolicy = () => pending.promise;
  const request = h.api.refreshDailyReminderPolicy('u1', 'token-u1');
  await h.api.saveSeasonReminderOptIn('u1', false);
  pending.resolve({ settings: { ...plan, hour: 21 }, revision: 20 });
  await request;
  assert.equal(await h.api.getSeasonReminderOptIn('u1'), false);
  assert.equal(h.scheduled.size, 0);
});

test('season sound toggle moves Android alerts between audible and silent channels without changing consent', async () => {
  const h = harness({ platform: 'android' });
  await h.activate();
  assert(h.channels.has('caylik-season-sound-v1'));
  assert([...h.scheduled.values()].every(n => n.content.sound && n.trigger.channelId === 'caylik-season-sound-v1'));
  h.state.seasonAudible = false;
  await h.api.syncDailyReminder('u1');
  assert.equal(h.scheduled.size, 14);
  assert.equal(h.channels.get('caylik-season-silent-v1').sound, null);
  assert([...h.scheduled.values()].every(n => n.content.sound === false && n.trigger.channelId === 'caylik-season-silent-v1'));
  assert.equal(await h.api.getSeasonReminderOptIn('u1'), true);
  const added = h.added();
  await h.api.syncDailyReminder('u1');
  assert.equal(h.added(), added);
});

test('season alerts use the user sound preference on iOS without Android channels', async () => {
  const h = harness();
  await h.activate();
  assert([...h.scheduled.values()].every(n => Boolean(n.content.sound)));
  h.state.seasonAudible = false;
  await h.api.syncDailyReminder('u1');
  assert([...h.scheduled.values()].every(n => n.content.sound === false));
  assert.equal(h.channels.size, 0);
});
