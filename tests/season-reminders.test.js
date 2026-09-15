const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultSeasonReminderSettings, validateSeasonReminderSettings, seasonReminderDates } = require('../shared/seasonReminders');
const now = new Date(2026, 8, 15, 10);
const plan = { enabled: true, hour: 18, minute: 20, seasonStart: '2026-09-15', seasonEnd: '2026-10-15' };

test('season dates must be explicitly chosen; malformed dates/time and reversed or expired ranges rejected', () => {
  assert.deepEqual(defaultSeasonReminderSettings(), { enabled: false, hour: 19, minute: 0, seasonStart: '', seasonEnd: '' });
  for (const bad of [
    { seasonStart: '' }, { seasonEnd: '' }, { seasonStart: '2026-02-30' }, { seasonStart: '15.09.2026' },
    { hour: 24 }, { minute: 60 }, { minute: -1 }, { minute: 1.5 }, { hour: '18' },
    { seasonEnd: '2026-09-14' }, { seasonEnd: '2028-09-15' }, { enabled: 'true' },
  ]) assert.throws(() => validateSeasonReminderSettings({ ...plan, ...bad }, now));
});
test('daily dates respect selected season boundaries and selected time including midnight', () => {
  const dates = seasonReminderDates({ ...plan, seasonStart: '2026-09-17', seasonEnd: '2026-09-18', hour: 0, minute: 0 }, now);
  assert.equal(dates.length, 2);
  assert.equal(dates[0].getDate(), 17); assert.equal(dates[1].getDate(), 18);
  assert.equal(dates[0].getHours(), 0);
  assert.deepEqual(seasonReminderDates(plan, new Date(2026, 10, 1)), []);
  assert.deepEqual(seasonReminderDates(plan, new Date(2027, 8, 15)), []);
});
test('no past immediate catch-up, no schedules outside inactivity window or next year', () => {
  const dates = seasonReminderDates(plan, new Date(2026, 8, 15, 18, 21));
  assert.equal(dates.length, 13); assert.equal(dates[0].getDate(), 16);
  assert.deepEqual(seasonReminderDates({ ...plan, seasonStart: '2026-10-01' }, now), []);
  assert.deepEqual(seasonReminderDates({ ...plan, enabled: false }, now), []);
});
test('leap day and local calendar increments remain valid and nonrepeating', () => {
  const settings = { ...plan, seasonStart: '2028-02-28', seasonEnd: '2028-03-01' };
  const dates = seasonReminderDates(settings, new Date(2028, 1, 28, 10));
  assert.equal(dates.length, 3);
  assert.equal(dates[1].getDate(), 29); assert.equal(dates[2].getMonth(), 2);
  assert(dates.every(date => date.getHours() === settings.hour && date.getMinutes() === settings.minute));
});
test('disabled preference can always be saved; expired enabled preference is normalized off', () => {
  assert.equal(validateSeasonReminderSettings({ enabled: false, hour: -50 }, now).enabled, false);
  const expired = validateSeasonReminderSettings(plan, new Date(2027, 8, 15), true);
  assert.equal(expired.enabled, false); assert.equal(expired.seasonEnd, plan.seasonEnd);
});
