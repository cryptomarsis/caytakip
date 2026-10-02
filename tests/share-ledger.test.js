/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const register = require('../server/shareLedgerRoutes');
const { shareAmounts } = require('../shared/sharecropping');
const { projectDelivery, assertCollectionsFit, paidCents } = require('../shared/shareLedger');
const id = 'a'.repeat(24), linkId = 'b'.repeat(24), sourceId = 'c'.repeat(24);
const clone = value => JSON.parse(JSON.stringify(value));
const sale = () => ({ _id: id, linkId, harvestId: sourceId, cropperId: 'c', ownerId: 'o', collections: [], voided: false, data: { ...shareAmounts(100, 30, 2), kg: 100, price: 30, factory: 'ÇAYKUR', date: '2026-09-29', dueDate: '2026-10-31' } });
const match = (row, query) => Object.entries(query).every(([k, v]) => {
  if (k === '$or') return v.some(part => match(row, part));
  if (v && typeof v === 'object') return Object.entries(v).every(([op, value]) => op === '$in' ? value.includes(row[k]) : op === '$ne' ? row[k] !== value : op === '$lt' ? row[k] < value : false);
  return row[k] === v;
});
function harness() {
  const db = { users: ['c', 'o', 'x'].map(userId => ({ userId })), links: [{ _id: linkId, cropperId: 'c', ownerId: 'o', cropperName: 'Ali', ownerName: 'Ayşe', label: 'Bahçe', status: 'active' }], rows: [sale()], sources: [{ _id: sourceId, tahsilat: 0, surum: '2. Sürüm' }] };
  const control = { failSave: false }; let seq = 10, tail = Promise.resolve();
  const model = key => {
    const doc = value => {
      if (!value || Array.isArray(value) || typeof value !== 'object') return value;
      const row = clone(value);
      row.save = async () => {
        if (control.failSave) throw Error('db down');
        if (row.collections) row.collections = row.collections.map(p => ({ _id: (++seq).toString(16).padStart(24, '0'), revision: 0, ...p }));
        db[key][db[key].findIndex(r => r._id === row._id)] = clone(row);
      };
      return row;
    };
    const query = get => {
      let limit = Infinity; const q = { session: () => q, select: () => q, sort: () => q, limit: n => { limit = n; return q; },
        lean: async () => { const x = get(); return clone(Array.isArray(x) ? x.slice(0, limit) : x); },
        then: (a, b) => Promise.resolve().then(() => doc(get())).then(a, b) }; return q;
    };
    return {
      find: filter => query(() => db[key].filter(r => match(r, filter))),
      findOne: filter => query(() => db[key].find(r => match(r, filter)) || null),
      exists: filter => query(() => db[key].some(r => match(r, filter))),
      findOneAndUpdate: (filter, update) => query(() => { const row = db[key].find(r => match(r, filter)); if (!row) return null; for (const [k, v] of Object.entries(update.$inc || {})) row[k] = (row[k] || 0) + v; return row; }),
      updateOne: async (filter, update) => { const row = db[key].find(r => match(r, filter)); if (row) Object.assign(row, update.$set); },
    };
  };
  const routes = new Map(), add = method => (route, ...handlers) => routes.set(method + route, handlers);
  const auth = (req, res, next) => req.auth ? next() : res.status(401).json({});
  register({ get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') }, {
    requireAuth: auth, UserProfile: model('users'), ShareLink: model('links'), ShareDelivery: model('rows'), Harvest: model('sources'),
    mongoose: { startSession: async () => ({ endSession: async () => {}, withTransaction: fn => { const work = tail.then(async () => { const snapshot = clone(db); try { return await fn(); } catch (e) { Object.assign(db, snapshot); throw e; } }); tail = work.catch(() => {}); return work; } }) },
  });
  async function call(method, suffix = '', user = 'c', body = {}, paymentId, requestId = 'request-1234567890', query = {}) {
    const route = suffix === 'list' ? '/api/shared-ledger' : `/api/shared-ledger/:id/${suffix === 'legacy' ? 'legacy-allocation' : 'payments' + (paymentId ? '/:paymentId' : '')}`;
    const req = { auth: user ? { userId: user } : null, params: { id, paymentId }, body, headers: { 'idempotency-key': requestId }, query };
    const res = { code: 200, status(n) { this.code = n; return this; }, json(value) { this.body = value; return this; } }; let index = 0;
    const handlers = routes.get(method + route); assert(handlers, method + route);
    await (function next() { return handlers[index++]?.(req, res, next); })(); return res;
  }
  return { db, control, call, routes, auth };
}
const payment = { tutar: 100, tarih: '2026-09-29', aciklama: 'Ödendi' };
test('ledger requires authentication, active account and membership; no private source content or other party payments leak', async () => {
  const h = harness(); for (const handlers of h.routes.values()) assert.equal(handlers[0], h.auth);
  assert.equal((await h.call('GET', 'list', null)).code, 401);
  assert.deepEqual((await h.call('GET', 'list', 'x')).body, []);
  h.db.sources[0].secretNote = 'private'; await h.call('POST', '', 'c', payment);
  const owner = (await h.call('GET', 'list', 'o')).body[0];
  assert.equal(owner.sharedNetCents, 147000); assert.equal(owner.tahsilat, 0); assert.deepEqual(owner.sharedPayments, []); assert.equal(owner.secretNote, undefined);
  assert.equal((await h.call('GET', 'list', 'c')).body[0].tahsilat, 100);
  h.db.users[0].active = false; assert.equal((await h.call('POST', '', 'c', payment)).code, 403);
});
test('independent collections are bounded by own share, exactly-once, and reject foreign or stale mutations', async () => {
  const h = harness(); const created = await h.call('POST', '', 'c', payment); assert.equal(created.code, 201);
  assert.match(created.body.payment._id, /^[a-f0-9]{24}$/); // existing durable offline queue acknowledgement
  assert.equal((await h.call('POST', '', 'c', payment)).body.replayed, true);
  assert.equal((await h.call('POST', '', 'c', { ...payment, tutar: 101 })).code, 409);
  const p = h.db.rows[0].collections[0];
  assert.equal((await h.call('PUT', '', 'o', { ...payment, revision: 0 }, p._id)).code, 404);
  assert.equal((await h.call('PUT', '', 'c', { ...payment, tutar: 200, revision: 0 }, p._id)).code, 200);
  assert.equal((await h.call('DELETE', '', 'c', { revision: 0 }, p._id)).code, 409);
  assert.equal((await h.call('DELETE', '', 'c', { revision: 1 }, p._id)).code, 200);
  assert.equal(paidCents(h.db.rows[0], 'c'), 0);
  assert.equal((await h.call('POST', '', 'c', payment)).body.replayed, true); // deleted request never resurrects
});

test('collection edits keep immutable before/after audit, deletion stays visible only to its owner', async () => {
  const h = harness(); await h.call('POST', '', 'c', payment);
  const p = h.db.rows[0].collections[0];
  await h.call('PUT', '', 'c', { ...payment, tutar: 150, aciklama: 'Düzeltme', revision: 0, history: ['forged'] }, p._id);
  let audit = h.db.rows[0].collections[0].history;
  assert.equal(audit.length, 1); assert.equal(audit[0].before.amountCents, 10000); assert.equal(audit[0].after.amountCents, 15000);
  assert.equal(audit[0].before.note, payment.aciklama); assert.equal(audit[0].action, 'update');
  assert.deepEqual((await h.call('GET', 'list', 'o')).body[0].sharedCollectionHistory, []);
  h.control.failSave = true;
  assert.equal((await h.call('DELETE', '', 'c', { revision: 1 }, p._id)).code, 500);
  assert.equal(h.db.rows[0].collections[0].history.length, 1);
  h.control.failSave = false;
  await h.call('DELETE', '', 'c', { revision: 1 }, p._id);
  const row = (await h.call('GET', 'list', 'c')).body[0];
  assert.equal(row.tahsilat, 0); assert.equal(row.sharedPayments.length, 0);
  assert.equal(row.sharedCollectionHistory[0].voided, true);
  audit = row.sharedCollectionHistory[0].changes;
  assert.equal(audit.length, 2); assert.equal(audit[1].before.amountCents, 15000); assert.equal(audit[1].after.amountCents, 0);
  assert.equal(audit[1].action, 'delete');
});
test('concurrent payments cannot exceed remaining share; failures roll back both balance and idempotency', async () => {
  const h = harness(); const results = await Promise.all(['request-1111111111', 'request-2222222222'].map(key => h.call('POST', '', 'c', { ...payment, tutar: 1000 }, undefined, key)));
  assert.deepEqual(results.map(r => r.code).sort(), [201, 400]); assert.equal(paidCents(h.db.rows[0], 'c'), 100000);
  h.control.failSave = true; assert.equal((await h.call('POST', '', 'o', payment)).code, 500); assert.equal(paidCents(h.db.rows[0], 'o'), 0);
  h.control.failSave = false; assert.equal((await h.call('POST', '', 'o', payment)).code, 201);
});
test('invalid dates, sub-cent amounts, missing request keys and voided deliveries never accept collections', async () => {
  const h = harness(); for (const body of [{ ...payment, tutar: 0 }, { ...payment, tutar: 1.001 }, { ...payment, tarih: '2026-02-30' }, { ...payment, tutar: Infinity }]) assert.equal((await h.call('POST', '', 'c', body)).code, 400);
  assert.equal((await h.call('POST', '', 'c', payment, undefined, '')).code, 400);
  h.db.rows[0].voided = true; assert.equal((await h.call('POST', '', 'c', payment)).code, 409);
});
test('source edit or cancellation cannot remove already collected shares; untouched partner share remains independent', () => {
  const row = sale(); row.collections.push({ userId: 'o', amountCents: 100000 });
  assert.throws(() => assertCollectionsFit(row, shareAmounts(10, 30, 2)), /tahsilat/);
  assert.throws(() => assertCollectionsFit(row, row.data, true), /tahsilat/);
  assert.doesNotThrow(() => assertCollectionsFit(row, shareAmounts(120, 30, 2)));
  assert.equal(projectDelivery(row, 'c', {}).tahsilat, 0); assert.throws(() => projectDelivery(row, 'x', {}), /Yetkisiz/);
});
test('legacy money stays unallocated until cropper proposes and owner explicitly approves, once only', async () => {
  const h = harness(); h.db.sources[0].tahsilat = 200;
  assert.equal((await h.call('GET', 'list', 'c')).body[0].legacySharedCollection, 200);
  assert.equal((await h.call('POST', '', 'c', payment)).code, 409);
  assert.equal((await h.call('POST', 'legacy', 'c', { cropperAmount: ' ' })).code, 400);
  assert.equal((await h.call('POST', 'legacy', 'o', { cropperAmount: 50 })).code, 403);
  assert.equal((await h.call('POST', 'legacy', 'c', { cropperAmount: 50 })).code, 200);
  const proposalId = h.db.rows[0].legacyAllocation.proposalId;
  assert.equal(paidCents(h.db.rows[0], 'c'), 0);
  assert.equal((await h.call('POST', 'legacy', 'c', { confirm: true, proposalId })).code, 403);
  assert.equal((await h.call('POST', 'legacy', 'o', { confirm: true, proposalId: 'stale' })).code, 409);
  assert.equal((await h.call('POST', 'legacy', 'o', { confirm: true, proposalId })).code, 200);
  assert.equal(paidCents(h.db.rows[0], 'c'), 5000); assert.equal(paidCents(h.db.rows[0], 'o'), 15000);
  assert.equal(h.db.sources[0].tahsilat, 200); assert.equal((await h.call('GET', 'list', 'c')).body[0].legacySharedCollection, 0);
  assert.equal((await h.call('POST', 'legacy', 'o', { confirm: true, proposalId })).code, 409);
  assert.equal((await h.call('POST', '', 'c', payment)).code, 201);
});
test('changed legacy totals or failed approvals leave originals and both personal ledgers untouched', async () => {
  const h = harness(); h.db.sources[0].tahsilat = 200; await h.call('POST', 'legacy', 'c', { cropperAmount: 100 });
  const proposalId = h.db.rows[0].legacyAllocation.proposalId;
  h.db.sources[0].tahsilat = 210; assert.equal((await h.call('POST', 'legacy', 'o', { confirm: true, proposalId })).code, 409);
  h.db.sources[0].tahsilat = 200; h.control.failSave = true;
  assert.equal((await h.call('POST', 'legacy', 'o', { confirm: true, proposalId })).code, 500);
  assert.equal(h.db.rows[0].collections.length, 0); assert.equal(h.db.rows[0].legacyAllocation.state, 'pending');
});
function loadTS(file) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}; vm.runInNewContext(output, { exports, require }); return exports;
}
test('client replaces source exactly once, preserves personal data, includes shared KG and uses own monetary share', () => {
  const { mergeShareLedger } = loadTS('src/services/shareLedger.ts'), { netTotalOf, remainingTotalOf } = loadTS('src/utils/format.ts');
  const row = sale(); row.collections.push({ _id: 'p', userId: 'c', amountCents: 10000 });
  const projected = projectDelivery(row, 'c', {});
  const result = mergeShareLedger([{ _id: sourceId, shareLinkId: linkId, bahce: 'Private garden', kg: 100, fiyat: 30 }, { _id: 'other', kg: 20, fiyat: 30 }], [{ _id: 'legacy', harvestId: sourceId, tutar: 200 }], [projected]);
  assert.equal(result.harvests.length, 2); assert.equal(result.harvests.reduce((n, h) => n + h.kg, 0), 120);
  const shared = result.harvests.find(h => h.sharedDeliveryId); assert.equal(shared.bahce, 'Private garden'); assert.equal(netTotalOf(shared), 1470); assert.equal(remainingTotalOf(shared), 1370);
  assert.equal(result.payments.length, 1); assert.equal(result.payments[0]._id, 'p');
  const owner = mergeShareLedger([], [], [projectDelivery(row, 'o', {})]); assert.equal(owner.harvests[0].bahce, undefined); assert.equal(owner.payments.length, 0);
  assert.throws(() => mergeShareLedger([{ _id: sourceId, shareLinkId: linkId }], [], []), /eşleşmedi/);
  row.voided = true; assert.equal(mergeShareLedger([{ _id: sourceId, shareLinkId: linkId }], [], [projectDelivery(row, 'c', {})]).harvests.length, 0);
});
