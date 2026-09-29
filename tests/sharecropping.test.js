const test = require('node:test');
const assert = require('node:assert/strict');
const { shareAmounts, deliveryInput, deliveryMessage } = require('../shared/sharecropping');
const register = require('../server/sharecroppingRoutes');
const { validateBackup } = require('../server/backupRestore');
const base = { kg: '100', price: '30', factory: 'ÇAYKUR', date: '2026-09-29', dueDate: '2026-10-31', requestId: 'request-1234567890' };
test('net proceeds are split after 2%, preserving every cent', () => {
  assert.equal(shareAmounts(100, 30, 2).cropperCents, 147000);
  assert.equal(shareAmounts(100, 30, 3).cropperCents, 98000);
  assert.equal(shareAmounts(100, 30, 3).ownerCents, 196000);
  for (const denominator of [2, 3]) for (let cents = 1; cents < 1000; cents++) {
    const r = shareAmounts(1, cents / 100, denominator);
    assert.equal(r.cropperCents + r.ownerCents + r.taxCents, r.grossCents);
  }
});
test('input rejects invalid dates, negatives, malformed numbers; ignores forged amounts and shares', () => {
  for (const changes of [{ kg: '-1' }, { price: '' }, { date: '2026-02-30' }, { dueDate: '2025-01-01' }, { kg: 'Infinity' }, { kg: {} }, { factory: '' }]) assert.throws(() => deliveryInput({ ...base, ...changes }, 2));
  assert.throws(() => shareAmounts(1, 1, 4));
  assert.throws(() => shareAmounts(Number.MAX_VALUE, 100, 2));
  const r = deliveryInput({ ...base, kg: '100,5', netCents: 1, ownerId: 'hacker', denominator: 3 }, 2);
  assert.equal(r.kg, 100.5); assert.equal(r.denominator, 2); assert.equal(r.ownerId, undefined);
  assert.match(deliveryMessage(r), /ÇAYKUR/); assert.match(deliveryMessage(r), /31.10.2026/);
});

const clone = value => value === undefined ? undefined : structuredClone(value);
const matches = (row, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(part => matches(row, part));
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, v]) => ({ $ne: () => row[key] !== v, $gt: () => row[key] > v, $lt: () => row[key] < v, $in: () => v.includes(row[key]) }[op])());
  return row[key] === value;
});
function harness() {
  let seq = 100;
  const db = { users: [{ userId: 'cropper', name: 'Yarıcı' }, { userId: 'owner', name: 'Müstahsil' }, { userId: 'outsider', name: 'Diğer' }], links: [], records: [], events: [] };
  const query = get => { const q = { select: () => q, session: () => q, sort: () => q, limit: () => q, lean: async () => clone(get()), then: (ok, no) => Promise.resolve().then(() => clone(get())).then(ok, no) }; return q; };
  const model = key => ({
    findOne: filter => query(() => db[key].find(row => matches(row, filter)) || null),
    find: (filter = {}) => query(() => db[key].filter(row => matches(row, filter))),
    exists: filter => query(() => db[key].some(row => matches(row, filter))),
    countDocuments: async filter => db[key].filter(row => matches(row, filter)).length,
    async create(input) {
      const create = data => { const row = { _id: (++seq).toString(16).padStart(24, '0'), status: 'pending', revision: 0, voided: false, history: [], ...clone(data) }; db[key].push(row); return clone(row); };
      return Array.isArray(input) ? input.map(create) : create(input);
    },
    findOneAndUpdate(filter, change, options = {}) { return query(() => {
      const row = db[key].find(r => matches(r, filter)); if (!row) return null;
      const before = clone(row); Object.assign(row, clone(change.$set || {}));
      for (const [k, v] of Object.entries(change.$inc || {})) row[k] = (row[k] || 0) + v;
      for (const [k, v] of Object.entries(change.$push || {})) row[k].push(clone(v));
      return options.new ? row : before;
    }); },
    async updateOne(filter, change) { return this.findOneAndUpdate(filter, change, { new: true }); },
    async aggregate(pipeline) {
      const rows = db[key].filter(row => matches(row, pipeline[0].$match));
      if (pipeline[1].$group._id === '$linkId') {
        const groups = new Map();
        for (const row of rows) { const sum = groups.get(row.linkId) || { _id: row.linkId, kg: 0, cropperCents: 0, ownerCents: 0 }; for (const field of ['kg', 'cropperCents', 'ownerCents']) sum[field] += row.data[field]; groups.set(row.linkId, sum); }
        return [...groups.values()];
      }
      return [rows.reduce((total, row) => { for (const field of ['kg', 'netCents', 'cropperCents', 'ownerCents']) total[field] += row.data[field]; return total; }, { kg: 0, netCents: 0, cropperCents: 0, ownerCents: 0 })];
    },
  });
  const routes = new Map(), add = method => (path, ...handlers) => routes.set(method + path, handlers);
  const requireAuth = (req, res, next) => req.auth ? next() : res.status(401).json({ error: 'auth' });
  register({ get: add('GET'), post: add('POST'), patch: add('PATCH') }, {
    requireAuth, limitPublicUsage: () => (req, res, next) => next(),
    mongoose: { startSession: async () => ({ endSession: async () => {}, withTransaction: async fn => { const snapshot = clone(db); try { await fn(); } catch (e) { Object.assign(db, snapshot); throw e; } } }) },
    UserProfile: model('users'), ShareLink: model('links'), ShareDelivery: model('records'), ShareEvent: model('events'),
  });
  async function call(method, path, user = 'cropper', body = {}, params = {}) {
    const req = { auth: user ? { userId: user } : null, body, params, query: {} };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    const handlers = routes.get(method + path); let index = 0;
    await (function next() { return handlers[index++]?.(req, res, next); })(); return res;
  }
  async function pair(denominator = 3) {
    const invite = await call('POST', '/api/sharecropping/invites', 'cropper', { label: 'Bahçe', denominator });
    const result = await call('POST', '/api/sharecropping/invites/accept', 'owner', { code: invite.body.code, accept: true });
    assert.equal(result.code, 200); return result.body.link._id;
  }
  return { db, call, pair, routes, requireAuth };
}
test('every endpoint authenticates; inactive account is blocked', async () => {
  const h = harness(); for (const handlers of h.routes.values()) assert.equal(handlers[0], h.requireAuth);
  assert.equal((await h.call('GET', '/api/sharecropping', null)).code, 401);
  h.db.users[0].active = false; assert.equal((await h.call('GET', '/api/sharecropping')).code, 403);
});
test('invitations require explicit mutual approval and cannot be stolen or self-accepted', async () => {
  const h = harness(), invite = await h.call('POST', '/api/sharecropping/invites', 'cropper', { label: 'Test', denominator: 2 });
  const body = { code: invite.body.code, accept: true };
  assert.equal((await h.call('POST', '/api/sharecropping/invites/accept', 'cropper', body)).code, 409);
  assert.equal((await h.call('POST', '/api/sharecropping/invites/accept', 'owner', { ...body, accept: false })).code, 400);
  assert.equal((await h.call('POST', '/api/sharecropping/invites/accept', 'owner', body)).code, 200);
  assert.equal((await h.call('POST', '/api/sharecropping/invites/accept', 'owner', body)).code, 200);
  assert.equal((await h.call('POST', '/api/sharecropping/invites/accept', 'outsider', body)).code, 409);
  assert.equal(invite.body.link.inviteHash, undefined);
});
test('deliveries isolate members, allow only cropper writes, and replay without duplicate notifications', async () => {
  const h = harness(), id = await h.pair(), path = '/api/sharecropping/:id/deliveries';
  assert.equal((await h.call('POST', path, 'owner', base, { id })).code, 403);
  assert.equal((await h.call('GET', path, 'outsider', {}, { id })).code, 404);
  const first = await h.call('POST', path, 'cropper', base, { id }); assert.equal(first.code, 201);
  assert.equal((await h.call('POST', path, 'cropper', base, { id })).body.record._id, first.body.record._id);
  assert.equal(h.db.records.length, 1); assert.equal(h.db.events.length, 1); assert.equal(h.db.events[0].recipient, 'owner');
  assert.equal((await h.call('POST', path, 'cropper', { ...base, kg: '101' }, { id })).code, 409);
  const read = await h.call('GET', path, 'owner', {}, { id }); assert.equal(read.body.totals.kg, 100); assert.equal(read.body.records[0].history, undefined);
  assert.equal((await h.call('GET', '/api/sharecropping-events', 'outsider')).body.events.length, 0);
});
test('edits preserve share and audit trail, reject stale revisions and cross-link records; void removes totals', async () => {
  const h = harness(), id = await h.pair(), id2 = await h.pair(2);
  const createPath = '/api/sharecropping/:id/deliveries', editPath = createPath + '/:recordId';
  const recordId = (await h.call('POST', createPath, 'cropper', base, { id })).body.record._id;
  assert.equal((await h.call('PATCH', editPath, 'cropper', { ...base, revision: 0 }, { id: id2, recordId })).code, 409);
  assert.equal((await h.call('PATCH', editPath, 'owner', { ...base, revision: 0 }, { id, recordId })).code, 403);
  const edit = await h.call('PATCH', editPath, 'cropper', { ...base, kg: '200', denominator: 2, revision: 0 }, { id, recordId });
  assert.equal(edit.code, 200); assert.equal(edit.body.record.data.denominator, 3); assert.equal(h.db.records[0].history[0].data.kg, 100);
  assert.equal((await h.call('PATCH', editPath, 'cropper', { ...base, revision: 0 }, { id, recordId })).code, 409);
  assert.equal((await h.call('PATCH', editPath, 'cropper', { revision: 1, voided: true }, { id, recordId })).code, 200);
  assert.equal((await h.call('GET', createPath, 'owner', {}, { id })).body.totals.kg, 0);
  assert.equal(h.db.events.length, 3);
});
test('closed connections reject new deliveries but retain readable history and idempotent confirmations', async () => {
  const h = harness(), id = await h.pair(), path = '/api/sharecropping/:id/deliveries';
  await h.call('POST', path, 'cropper', base, { id });
  await h.call('POST', '/api/sharecropping/:id/close', 'owner', {}, { id });
  assert.equal((await h.call('POST', path, 'cropper', base, { id })).code, 201);
  assert.equal((await h.call('POST', path, 'cropper', { ...base, requestId: 'new-request-1234567890' }, { id })).code, 409);
  assert.equal((await h.call('GET', path, 'owner', {}, { id })).body.records.length, 1);
});
test('backup accepts older format but rejects orphan shared records', () => {
  const body = { users: [], harvests: [], payments: [] };
  const names = [...Object.keys(body), 'shareLinks', 'shareDeliveries'];
  assert.equal(validateBackup(body, names), 0);
  assert.throws(() => validateBackup({ ...body, shareDeliveries: [{ _id: '0'.repeat(24), linkId: '1'.repeat(24) }] }, names));
});

test('summary isolates agreements and shows each members own net share without voided records', async () => {
  const h = harness(), id = await h.pair(), route = '/api/sharecropping/:id/deliveries';
  await h.call('POST', route, 'cropper', base, { id });
  const cropper = await h.call('GET', '/api/sharecropping-summary', 'cropper');
  const owner = await h.call('GET', '/api/sharecropping-summary', 'owner');
  assert.equal(cropper.body.links[0].kg, 100); assert.equal(cropper.body.links[0].myShareCents, 98000);
  assert.equal(owner.body.links[0].myShareCents, 196000); assert.equal(owner.body.links[0].myRole, 'owner');
  assert.equal((await h.call('GET', '/api/sharecropping-summary', 'outsider')).body.links.length, 0);
  h.db.records[0].voided = true;
  assert.equal((await h.call('GET', '/api/sharecropping-summary', 'owner')).body.links[0].kg, 0);
});

test('delivery DTO exposes sanitized before-after changes; linked source cannot be edited independently', async () => {
  const h = harness(), id = await h.pair(), route = '/api/sharecropping/:id/deliveries';
  const record = (await h.call('POST', route, 'cropper', base, { id })).body.record;
  await h.call('PATCH', route + '/:recordId', 'cropper', { ...base, kg: 120, revision: 0 }, { id, recordId: record._id });
  const read = (await h.call('GET', route, 'owner', {}, { id })).body.records[0];
  assert.deepEqual(read.changes[0].details, ['KG: 100 → 120']); assert.equal(read.requestHash, undefined); assert.equal(read.history, undefined);
  h.db.records[0].harvestId = 'd'.repeat(24);
  const rejected = await h.call('PATCH', route + '/:recordId', 'cropper', { ...base, revision: 1 }, { id, recordId: record._id });
  assert.equal(rejected.code, 409); assert.match(rejected.body.error, /hasat kaydından/); assert.equal(h.db.records[0].data.kg, 120);
});
