const test = require('node:test');
const assert = require('node:assert/strict');
const register = require('../server/quotaRoutes');
const id = 'a'.repeat(24);
const p = { id: 'one', label: 'Cüzdan', season: '1. Sürüm', startDate: '2026-05-01', endDate: '2026-06-30', area: 1, quotaRate: 100, dailyRate: null, dailyDate: '', openingKg: 0, recordIds: [id] };
function setup(records, updated = { quotaRevision: 1 }) {
  const routes = {}; const captures = {};
  const auth = () => {};
  register({ get: (url, guard, handler) => { assert.equal(guard, auth); routes.get = handler; }, patch: (url, guard, handler) => { assert.equal(guard, auth); routes.patch = handler; }, put: (url, guard, handler) => { assert.equal(guard, auth); routes.put = handler; } }, {
    requireAuth: auth,
    Harvest: { find: (filter) => { captures.ownership = filter; return { lean: async () => records }; } },
    UserProfile: { findOneAndUpdate: async (filter, change) => { captures.write = { filter, change }; return updated; } },
  });
  const res = { code: 200, status(n) { this.code = n; return this; }, json(value) { this.body = value; return this; } };
  return { routes, captures, res };
}
test('quota write is authenticated and scoped to token owner, never body userId', async () => {
  const h = setup([{ _id: id, firma: 'ÇAYKUR', surum: p.season, tarih: p.startDate }]);
  await h.routes.put({ auth: { userId: 'owner', phone: '123' }, body: { userId: 'victim', plans: [p], revision: 0 } }, h.res);
  assert.equal(h.res.code, 200);
  assert.equal(h.captures.write.filter.userId, 'owner');
  assert.equal(h.captures.ownership.$and[0].$or[0].userId, 'owner');
});
test('missing/foreign selected record cannot be saved', async () => {
  const h = setup([]);
  await h.routes.put({ auth: { userId: 'owner' }, body: { plans: [p], revision: 0 } }, h.res);
  assert.equal(h.res.code, 400); assert.equal(h.captures.write, undefined);
  assert.equal(h.captures.ownership.$and[0].$or.length, 1);
});
test('stale revision returns conflict instead of overwriting', async () => {
  const h = setup([], null);
  await h.routes.put({ auth: { userId: 'owner' }, body: { plans: [], revision: 4 } }, h.res);
  assert.equal(h.res.code, 409); assert.equal(h.captures.write.filter.quotaRevision, 4);
});
