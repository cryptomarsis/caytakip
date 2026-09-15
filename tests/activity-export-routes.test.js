const test = require('node:test');
const assert = require('node:assert/strict');
const register = require('../server/activityExportRoutes');

const route = '/api/admin/activity-export';
const profile = (index, overrides = {}) => ({ _id: index.toString(16).padStart(24, '0'), userId: `usr_555${index}`, phone: `555${index}`, createdAt: new Date('2026-01-01T10:00:00Z'), ...overrides });
const entry = (owner, createdAt, overrides = {}) => ({ userId: owner.userId, userPhone: owner.phone, createdAt: new Date(createdAt), ...overrides });
const a = profile(1);
const b = profile(2);
const c = profile(3);

// Evaluate only the $match operators this route emits; aggregation grouping below
// independently checks its canonical owner/date shape against representative data.
function matches(record, match) {
  return Object.entries(match).every(([field, condition]) => {
    if (field === '$or') return condition.some(branch => matches(record, branch));
    const value = record[field];
    return Object.entries(condition).every(([operator, expected]) => {
      if (operator === '$in') return expected.some(item => item === value || item === null && value == null);
      if (operator === '$ne') return value !== expected;
      if (operator === '$type') return expected === 'date' && value instanceof Date;
      if (operator === '$not') return !matches(record, { [field]: expected });
      if (operator === '$gte') return value >= expected;
      if (operator === '$lt') return value < expected;
      throw Error(`Unexpected operator ${operator}`);
    });
  });
}

function harness() {
  const captures = { routes: [], profileReads: [], aggregates: [], headers: {}, authReads: 0 };
  const state = { admin: { role: 'admin', active: true }, profiles: [a, b, c], records: { harvest: [], payment: [], expense: [], garden: [] }, error: null, tooManyGroups: false, now: 0, advanceClock: 0, disconnect: false, revokeAdmin: false, profileReadGate: null };
  let handlers;
  const requireAuth = (req, res, next) => {
    if (!req.token?.userId) return res.status(401).json({ error: 'Oturum gerekli.' });
    req.auth = req.token;
    return next();
  };
  const Model = kind => ({ aggregate(pipeline) {
    const capture = { kind, pipeline };
    captures.aggregates.push(capture);
    return { async option(options) {
      capture.options = options;
      state.now += state.advanceClock;
      if (state.disconnect) captures.currentReq.aborted = true;
      if (state.revokeAdmin) state.admin = { role: 'user', active: true };
      if (state.error) throw state.error;
      const rows = state.records[kind].filter(record => matches(record, pipeline[0].$match));
      if (pipeline[1].$count) return rows.length ? [{ count: rows.length }] : [];
      assert.equal(pipeline[1].$group._id.date.$dateToString.date, '$createdAt');
      assert.equal(pipeline[1].$group._id.date.$dateToString.timezone, 'UTC');
      assert.deepEqual(pipeline[1].$group._id.userId, { $ifNull: ['$userId', ''] });
      assert.deepEqual(pipeline[1].$group._id.userPhone, { $cond: [{ $in: [{ $ifNull: ['$userId', ''] }, ['']] }, '$userPhone', ''] });
      assert.equal(pipeline[1].$group.lastEntryAt.$max, '$createdAt');
      assert.equal(pipeline[1].$group.count.$sum, 1);
      if (state.tooManyGroups && kind === 'harvest') return Array(500001).fill({});
      const grouped = new Map();
      for (const record of rows) {
        const userId = record.userId ?? '';
        const id = { userId, userPhone: userId ? '' : record.userPhone, date: record.createdAt.toISOString().slice(0, 10) };
        const key = JSON.stringify(id);
        const group = grouped.get(key) || { _id: id, count: 0, lastEntryAt: record.createdAt };
        group.count++;
        if (record.createdAt > group.lastEntryAt) group.lastEntryAt = record.createdAt;
        grouped.set(key, group);
      }
      return [...grouped.values()].slice(0, pipeline[2].$limit);
    } };
  } });
  register({ get(url, ...callbacks) { captures.routes.push(url); handlers = callbacks; } }, {
    requireAuth, now: () => state.now,
    UserProfile: {
      findOne(filter) {
        captures.authReads++;
        captures.authFilter = filter;
        const query = { select(fields) { captures.authFields = fields; return query; }, maxTimeMS() { return query; }, lean: async () => state.admin };
        return query;
      },
      find(filter) {
        const read = { filter };
        captures.profileReads.push(read);
        const query = {
          select(fields) { read.fields = fields; return query; },
          sort(sort) { read.sort = sort; return query; },
          limit(limit) { read.limit = limit; return query; },
          maxTimeMS(timeout) { read.timeout = timeout; return query; },
          async lean() { if (state.profileReadGate) await state.profileReadGate; return state.profiles.slice(0, read.limit); },
        };
        return query;
      },
    },
    Harvest: Model('harvest'), Payment: Model('payment'), Expense: Model('expense'), Garden: Model('garden'),
  });
  async function request({ token = { userId: 'admin-user', role: 'admin' }, query = { start: '2026-09-01', end: '2026-09-02' } } = {}) {
    const req = { token, query };
    captures.currentReq = req;
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set(name, value) { captures.headers[name] = value; } };
    let index = 0;
    const next = () => handlers[index++]?.(req, res, next);
    await next();
    return res;
  }
  return { captures, state, request, handlers, requireAuth };
}

test('export is authenticated and requires the current active DB admin, never JWT/manager claims', async () => {
  const h = harness();
  assert.deepEqual(h.captures.routes, [route]);
  assert.equal(h.handlers[0], h.requireAuth);
  assert.equal((await h.request({ token: null })).code, 401);
  assert.equal(h.captures.authFilter, undefined);
  for (const admin of [null, { role: 'user', active: true }, { role: 'manager', active: true, adminPermissions: ['view_metrics', 'manage_users'] }, { role: 'admin', active: false }]) {
    h.state.admin = admin;
    assert.equal((await h.request()).code, 403);
  }
  assert.equal(h.captures.profileReads.length, 0);
  assert.equal(h.captures.aggregates.length, 0);
  h.state.admin = { role: 'admin', active: true };
  assert.equal((await h.request({ token: { userId: 'current-admin', role: 'user' } })).code, 200);
  assert.deepEqual(h.captures.authFilter, { userId: 'current-admin' });
});

test('strict inclusive UTC ranges reject malformed, impossible, reversed, repeated and >366-day inputs', async () => {
  for (const query of [
    {}, { start: '2026-9-01', end: '2026-09-02' }, { start: '2026-02-30', end: '2026-03-01' },
    { start: '2026-09-02', end: '2026-09-01' }, { start: ['2026-09-01'], end: '2026-09-02' },
    { start: '2024-01-01', end: '2025-01-01' }, { start: '2026-09-01T00:00:00Z', end: '2026-09-02' },
  ]) {
    const h = harness();
    assert.equal((await h.request({ query })).code, 400);
    assert.equal(h.captures.profileReads.length, 0);
  }
  const h = harness();
  const response = await h.request({ query: { start: '2024-01-01', end: '2024-12-31' } });
  assert.equal(response.code, 200);
  assert.equal(response.body.daily.length, 366);
  const match = h.captures.aggregates[0].pipeline[0].$match.createdAt;
  assert.equal(match.$gte.toISOString(), '2024-01-01T00:00:00.000Z');
  assert.equal(match.$lt.toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(match.$type, 'date');
});

test('counts createdAt rather than financial day and includes zeros, unique active days/users and last entry', async () => {
  const h = harness();
  h.state.records.harvest = [
    entry(a, '2026-09-01T00:00:00Z', { tarih: '2020-01-01', tutar: 999, aciklama: 'secret' }),
    entry(a, '2026-09-01T15:00:00Z'),
    entry(a, '2026-08-31T23:59:59.999Z', { tarih: '2026-09-01' }),
    entry(a, '2026-09-03T00:00:00Z', { tarih: '2026-09-02' }),
  ];
  h.state.records.payment = [entry(a, '2026-09-01T17:00:00Z'), entry(a, '2026-09-02T13:00:00Z', { legacyDetail: true })];
  h.state.records.expense = [entry(a, '2026-09-02T23:59:59.999Z')];
  h.state.records.garden = [entry(b, '2026-09-01T10:00:00Z')];
  const res = await h.request();
  assert.equal(res.code, 200);
  assert.equal(res.body.timezone, 'UTC');
  assert.deepEqual(res.body.totals, { userCount: 3, activeUsers: 2, totalCount: 5 });
  assert.deepEqual(res.body.users[0], { userKey: `user_${a._id}`, registeredAt: '2026-01-01T10:00:00.000Z', harvestCount: 2, paymentCount: 1, expenseCount: 1, gardenCount: 0, totalCount: 4, activeDays: 2, lastEntryAt: '2026-09-02T23:59:59.999Z' });
  assert.equal(res.body.users[2].totalCount, 0);
  assert.equal(res.body.users[2].activeDays, 0);
  assert.equal(res.body.users[2].lastEntryAt, null);
  assert.deepEqual(res.body.daily, [
    { date: '2026-09-01', harvestCount: 2, paymentCount: 1, expenseCount: 0, gardenCount: 1, totalCount: 4, activeUsers: 2 },
    { date: '2026-09-02', harvestCount: 0, paymentCount: 0, expenseCount: 1, gardenCount: 0, totalCount: 1, activeUsers: 1 },
  ]);
  assert.equal(h.captures.headers['Cache-Control'], 'no-store');
  const payment = h.captures.aggregates.find(call => call.kind === 'payment');
  assert.deepEqual(payment.pipeline[0].$match.legacyDetail, { $ne: true });
  assert.equal(h.captures.profileReads[0].fields, '_id userId phone createdAt');
  for (const secret of ['5551', 'userId', 'userPhone', 'tutar', 'secret', 'aciklama', 'pinHash', 'name']) assert.equal(JSON.stringify(res.body.users).includes(secret), false);
});

test('exact userId wins over conflicting phone and legacy fallback is missing-ID-only with no double count', async () => {
  const h = harness();
  h.state.records.harvest = [
    entry(a, '2026-09-01T10:00:00Z'),
    entry(a, '2026-09-01T11:00:00Z', { userPhone: b.phone }),
    entry(a, '2026-09-01T12:00:00Z', { userId: undefined }),
    entry(a, '2026-09-01T13:00:00Z', { userId: null }),
    entry(a, '2026-09-01T14:00:00Z', { userId: '' }),
    entry(a, '2026-09-01T15:00:00Z', { userId: 'deleted-account-id' }),
    entry(a, '2026-09-01T16:00:00Z', { userId: undefined, userPhone: undefined }),
  ];
  const res = await h.request();
  assert.equal(res.body.totals.totalCount, 5);
  assert.equal(res.body.users[0].harvestCount, 5);
  assert.equal(res.body.users[1].harvestCount, 0);
  h.state.profiles = [a, { ...b, phone: a.phone }, c];
  const ambiguous = await h.request();
  assert.equal(ambiguous.body.totals.totalCount, 2);
});

test('unknown entry dates are excluded without borrowing business dates and reported separately across all time', async () => {
  const h = harness();
  h.state.records.harvest = [entry(a, '2026-09-01T10:00:00Z', { createdAt: undefined, tarih: '2026-09-01' }), entry(a, '2026-09-01T10:00:00Z', { createdAt: '2026-09-01T10:00:00Z' })];
  h.state.records.payment = [entry(a, '2026-09-01T10:00:00Z', { createdAt: null }), entry(a, '2026-09-01T10:00:00Z', { createdAt: null, legacyDetail: true })];
  h.state.records.garden = [entry(a, '2026-09-01T10:00:00Z')];
  const res = await h.request();
  assert.equal(res.body.excludedUnknownDates, 3);
  assert.equal(res.body.totals.totalCount, 1);
  assert(res.body.notes.some(note => note.includes('seçili dönemin sayısı değildir')));
});

test('all profiles are exported past seven rows and identifiers are batched without cross-batch double counting', async () => {
  const h = harness();
  h.state.profiles = Array.from({ length: 501 }, (_, i) => profile(i + 1));
  const last = h.state.profiles[500];
  h.state.records.harvest = [entry(a, '2026-09-01T10:00:00Z', { userPhone: last.phone }), entry(last, '2026-09-01T11:00:00Z', { userId: null })];
  const res = await h.request();
  assert.equal(res.body.users.length, 501);
  assert.equal(res.body.totals.totalCount, 2);
  assert.equal(res.body.users[0].harvestCount, 1);
  assert.equal(res.body.users[500].harvestCount, 1);
  assert.equal(h.captures.aggregates.length, 16);
  for (const call of h.captures.aggregates) {
    assert(call.pipeline[0].$match.$or.every(branch => (branch.userPhone?.$in || branch.userId.$in).length <= 500));
    assert.equal(call.options.maxTimeMS, 10000);
  }
});

test('resource caps and database failures return errors rather than truncated reports or leaked internals', async () => {
  const h = harness();
  h.state.profiles = Array.from({ length: 20001 }, (_, i) => profile(i + 1));
  assert.equal((await h.request()).code, 413);
  assert.equal(h.captures.aggregates.length, 0);
  h.state.profiles = [a];
  h.state.tooManyGroups = true;
  const oversized = await h.request();
  assert.equal(oversized.code, 413);
  assert.equal(oversized.body.users, undefined);
  h.state.tooManyGroups = false;
  h.state.error = Object.assign(Error('secret database connection'), { status: 500 });
  const failed = await h.request();
  assert.equal(failed.code, 503);
  assert.equal(failed.body.users, undefined);
  assert.equal(JSON.stringify(failed.body).includes('secret'), false);
  h.state.error = null;
  h.state.profiles = [{ ...a, _id: 'phone-containing-id' }];
  assert.equal((await h.request()).code, 503);
});

test('authorization is checked again before releasing a long all-user report', async () => {
  const h = harness();
  h.state.revokeAdmin = true;
  const revoked = await h.request();
  assert.equal(revoked.code, 403);
  assert.equal(revoked.body.users, undefined);
  assert.equal(h.captures.authReads, 2);
  assert(h.captures.aggregates.length > 0);
});

test('deadline and disconnect stop additional query phases and release the export lock', async () => {
  const h = harness();
  h.state.advanceClock = 50000;
  const timeout = await h.request();
  assert.equal(timeout.code, 503);
  assert.match(timeout.body.error, /süresi aşıldı/);
  assert.equal(timeout.body.users, undefined);
  assert.equal(h.captures.aggregates.length, 4);
  h.state.advanceClock = 0;
  h.state.disconnect = true;
  const disconnected = await h.request();
  assert.equal(disconnected.body, undefined);
  assert.equal(h.captures.aggregates.length, 8);
  h.state.disconnect = false;
  const retry = await h.request();
  assert.equal(retry.code, 200);
});

test('only one export per admin and two exports globally run concurrently; completion frees slots', async () => {
  const h = harness();
  let release;
  h.state.profileReadGate = new Promise(resolve => { release = resolve; });
  const first = h.request();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await h.request()).code, 429);
  const second = h.request({ token: { userId: 'other-admin' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await h.request({ token: { userId: 'third-admin' } })).code, 429);
  assert.equal(h.captures.profileReads.length, 2);
  release();
  assert.equal((await first).code, 200);
  assert.equal((await second).code, 200);
  assert.equal((await h.request()).code, 200);
});
