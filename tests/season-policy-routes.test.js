const test = require('node:test');
const assert = require('node:assert/strict');
const register = require('../server/seasonReminderRoutes');
const { defaultSeasonReminderSettings } = require('../shared/seasonReminders');

const READ_PATH = '/api/season-reminder';
const WRITE_PATH = '/api/admin/season-reminder';
const actor = { userId: 'current-admin', role: 'admin' };
const futureYear = new Date().getFullYear() + 1;
const plan = { enabled: true, hour: 18, minute: 20, seasonStart: `${futureYear}-05-01`, seasonEnd: `${futureYear}-05-31` };

function harness() {
  const routes = new Map();
  const captures = { auth: [], profiles: [], reads: [], writes: [] };
  const state = { profile: { role: 'admin', active: true }, record: null, profileError: null, readError: null, writeError: null, conflict: false };
  const requireAuth = (req, res, next) => {
    captures.auth.push(req);
    if (!req.token?.userId) return res.status(401).json({ error: 'Oturum gerekli.' });
    req.auth = req.token;
    return next();
  };
  const add = method => (url, ...handlers) => routes.set(`${method} ${url}`, handlers);
  register({ get: add('GET'), put: add('PUT') }, {
    requireAuth,
    UserProfile: {
      findOne(filter) {
        const read = { filter };
        captures.profiles.push(read);
        return { select(fields) {
          read.fields = fields;
          return { lean: async () => {
            if (state.profileError) throw state.profileError;
            return state.profile;
          } };
        } };
      },
    },
    SeasonReminderPolicy: {
      findById(id) {
        captures.reads.push(id);
        return { lean: async () => {
          if (state.readError) throw state.readError;
          return state.record;
        } };
      },
      async findOneAndUpdate(filter, change, options) {
        captures.writes.push({ filter, change, options });
        if (state.writeError) throw state.writeError;
        if (state.conflict) return null;
        return { _id: filter._id, ...change.$set, revision: filter.revision + change.$inc.revision };
      },
    },
  });
  async function request(method, url, { token = actor, body } = {}) {
    const req = { token, body };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    const handlers = routes.get(`${method} ${url}`);
    assert(handlers, `Missing route: ${method} ${url}`);
    let index = 0;
    const next = () => handlers[index++]?.(req, res, next);
    await next();
    return res;
  }
  return { routes, captures, state, requireAuth, request };
}

test('only GET policy and PUT admin policy are registered, both behind authentication', async () => {
  const h = harness();
  assert.deepEqual([...h.routes.keys()], [`GET ${READ_PATH}`, `PUT ${WRITE_PATH}`]);
  for (const handlers of h.routes.values()) assert.equal(handlers[0], h.requireAuth);
  for (const [method, url] of [['GET', READ_PATH], ['PUT', WRITE_PATH]]) {
    const res = await h.request(method, url, { token: null, body: { revision: 0, settings: plan } });
    assert.equal(res.code, 401);
  }
  assert.equal(h.captures.auth.length, 2);
  assert.equal(h.captures.reads.length, 0);
  assert.equal(h.captures.profiles.length, 0);
  assert.equal(h.captures.writes.length, 0);
});

test('authenticated producer can read the shared default-off policy and cannot select another policy', async () => {
  const h = harness();
  const res = await h.request('GET', READ_PATH, { token: { userId: 'producer', role: 'producer' }, body: { _id: 'other-policy' } });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { settings: defaultSeasonReminderSettings(), revision: 0 });
  assert.deepEqual(h.captures.reads, ['season-reminder']);
  assert.equal(h.captures.profiles.length, 0);
});

test('GET returns saved settings/revision without admin audit or database fields', async () => {
  const h = harness();
  h.state.record = { _id: 'season-reminder', settings: plan, revision: 8, updatedBy: 'private-admin-id', createdAt: 'private-date', __v: 0 };
  const res = await h.request('GET', READ_PATH);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { settings: plan, revision: 8 });
});

test('GET database failures are reported instead of returning a misleading default-off plan', async () => {
  const h = harness();
  h.state.readError = Error('database unavailable');
  const res = await h.request('GET', READ_PATH);
  assert.equal(res.code, 503);
  assert.equal(typeof res.body.error, 'string');
  assert.equal(res.body.settings, undefined);
});

test('only a current active DB admin can save, regardless of token or body role claims', async () => {
  for (const profile of [
    null,
    { role: 'producer', active: true },
    { role: 'manager', active: true, adminPermissions: ['view_metrics', 'manage_users', 'manage_ads', 'manage_prices'] },
    { role: 'admin', active: false },
  ]) {
    const h = harness();
    h.state.profile = profile;
    const res = await h.request('PUT', WRITE_PATH, { body: { revision: 0, settings: plan, role: 'admin', active: true, userId: 'other-admin' } });
    assert.equal(res.code, 403, JSON.stringify(profile));
    assert.deepEqual(h.captures.profiles, [{ filter: { userId: actor.userId }, fields: 'role active' }]);
    assert.equal(h.captures.writes.length, 0);
  }
  const h = harness();
  const res = await h.request('PUT', WRITE_PATH, { token: { ...actor, role: 'producer' }, body: { revision: 0, settings: plan } });
  assert.equal(res.code, 200, 'A newly promoted DB admin does not need a stale admin token claim.');
});

test('role revocation and account deactivation are rechecked on each subsequent save', async () => {
  const h = harness();
  const body = { revision: 1, settings: plan };
  assert.equal((await h.request('PUT', WRITE_PATH, { body })).code, 200);
  h.state.profile = { role: 'manager', active: true };
  assert.equal((await h.request('PUT', WRITE_PATH, { body })).code, 403);
  h.state.profile = { role: 'admin', active: false };
  assert.equal((await h.request('PUT', WRITE_PATH, { body })).code, 403);
  assert.equal(h.captures.profiles.length, 3);
  assert.equal(h.captures.writes.length, 1);
});

test('missing, noninteger, unsafe, and negative revisions never reach the policy write', async () => {
  for (const revision of [undefined, null, '0', -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const h = harness();
    const res = await h.request('PUT', WRITE_PATH, { body: { revision, settings: plan } });
    assert.equal(res.code, 400, String(revision));
    assert.equal(h.captures.writes.length, 0);
  }
});

test('missing or invalid enabled settings are rejected before saving', async () => {
  const invalidSettings = [
    undefined, null, {}, { ...plan, enabled: 'true' },
    { ...plan, hour: -1 }, { ...plan, hour: 24 }, { ...plan, hour: '18' },
    { ...plan, minute: 60 }, { ...plan, minute: 1.5 },
    { ...plan, seasonStart: '' }, { ...plan, seasonEnd: '' },
    { ...plan, seasonStart: `${futureYear}-02-30` },
    { ...plan, seasonStart: `${futureYear}-06-01` },
    { ...plan, seasonEnd: `${futureYear + 2}-05-31` },
    { ...plan, seasonStart: '2000-01-01', seasonEnd: '2000-02-01' },
  ];
  for (const settings of invalidSettings) {
    const h = harness();
    const res = await h.request('PUT', WRITE_PATH, { body: { revision: 0, settings } });
    assert.equal(res.code, 400, JSON.stringify(settings));
    assert.equal(typeof res.body.error, 'string');
    assert.equal(h.captures.writes.length, 0);
  }
});

test('first save uses an atomic fixed-ID revision-zero upsert and increments revision', async () => {
  const h = harness();
  const res = await h.request('PUT', WRITE_PATH, { body: { revision: 0, settings: plan } });
  assert.equal(res.code, 200);
  assert.deepEqual(h.captures.writes, [{
    filter: { _id: 'season-reminder', revision: 0 },
    change: { $set: { settings: plan, updatedBy: actor.userId }, $inc: { revision: 1 } },
    options: { new: true, upsert: true, runValidators: true },
  }]);
  assert.deepEqual(res.body, { settings: plan, revision: 1 });
});

test('existing plan updates are revision-matched and never upsert a replacement', async () => {
  const h = harness();
  const res = await h.request('PUT', WRITE_PATH, { body: { revision: 7, settings: plan } });
  assert.equal(res.code, 200);
  assert.deepEqual(h.captures.writes[0].filter, { _id: 'season-reminder', revision: 7 });
  assert.deepEqual(h.captures.writes[0].options, { new: true, upsert: false, runValidators: true });
  assert.equal(res.body.revision, 8);
});

test('stale revisions and duplicate-key races return conflicts without retrying an overwrite', async () => {
  for (const duplicate of [false, true]) {
    const h = harness();
    h.state.conflict = !duplicate;
    h.state.writeError = duplicate ? Object.assign(Error('duplicate'), { code: 11000 }) : null;
    const res = await h.request('PUT', WRITE_PATH, { body: { revision: duplicate ? 0 : 4, settings: plan } });
    assert.equal(res.code, 409);
    assert.equal(typeof res.body.error, 'string');
    assert.equal(h.captures.writes.length, 1);
    assert.equal(h.captures.writes[0].options.upsert, duplicate);
    assert.equal(res.body.settings, undefined);
  }
});

test('authorization lookup and save failures fail closed without exposing database error details', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  for (const failure of ['profileError', 'writeError']) {
    const h = harness();
    h.state[failure] = Object.assign(Error('private database credentials'), { code: 'DATABASE_OFFLINE' });
    const res = await h.request('PUT', WRITE_PATH, { body: { revision: 2, settings: plan } });
    assert.equal(res.code, 503);
    assert.equal(typeof res.body.error, 'string');
    assert(!res.body.error.includes('private database credentials'));
    assert.equal(h.captures.writes.length, failure === 'profileError' ? 0 : 1);
  }
  assert.equal(log.mock.callCount(), 2);
  for (const call of log.mock.calls) {
    assert.deepEqual(call.arguments, ['SEASON_POLICY_SAVE_FAILED', { userId: actor.userId, code: 'DATABASE_OFFLINE' }]);
  }
});

test('admin can disable a malformed old plan without having to repair its dates or time', async () => {
  const h = harness();
  const res = await h.request('PUT', WRITE_PATH, { body: { revision: 3, settings: { enabled: false, hour: -50, minute: 'bad', seasonStart: 'bad', seasonEnd: null } } });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { settings: defaultSeasonReminderSettings(), revision: 4 });
  assert.deepEqual(h.captures.writes[0].change.$set.settings, defaultSeasonReminderSettings());
});

test('message, recipient, immediate-send, identity, and database-update payloads are not persisted', async () => {
  const h = harness();
  const injected = { title: 'Injected title', body: 'Injected text', recipients: ['victim'], userId: 'victim', sendNow: true, repeats: true, pushToken: 'private-token', $set: { role: 'admin' } };
  const res = await h.request('PUT', WRITE_PATH, { body: {
    ...injected, _id: 'attacker-policy', updatedBy: 'attacker', revision: 2,
    settings: { ...plan, ...injected },
  } });
  assert.equal(res.code, 200);
  assert.deepEqual(h.captures.writes[0].filter, { _id: 'season-reminder', revision: 2 });
  assert.deepEqual(h.captures.writes[0].change, { $set: { settings: plan, updatedBy: actor.userId }, $inc: { revision: 1 } });
  assert.deepEqual(res.body, { settings: plan, revision: 3 });
});
