const crypto = require('crypto');
const { ownShare, paidCents, projectDelivery } = require('../shared/shareLedger');
const { deliveryInput } = require('../shared/sharecropping');
const oid = value => /^[a-f0-9]{24}$/i.test(String(value || ''));
const fail = (status, message) => Object.assign(Error(message), { status });
const member = userId => ({ $or: [{ cropperId: userId }, { ownerId: userId }] });

module.exports = (app, { requireAuth, mongoose, UserProfile, ShareLink, ShareDelivery, Harvest }) => {
  const run = fn => async (req, res) => {
    try {
      if (!await UserProfile.exists({ userId: req.auth.userId, active: { $ne: false } })) throw fail(403, 'Aktif hesap gerekli.');
      await fn(req, res);
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Pay hesabı güncellenemedi. Tekrar deneyin.' }); }
  };
  app.get('/api/shared-ledger', requireAuth, run(async (req, res) => {
    const limit = Math.min(Math.max(Math.floor(Number(req.query.limit)) || 200, 1), 500);
    if (req.query.before && !oid(req.query.before)) throw fail(400, 'Geçersiz sayfa.');
    const links = await ShareLink.find(member(req.auth.userId)).select('_id cropperName ownerName label').lean();
    const rows = await ShareDelivery.find({ linkId: { $in: links.map(l => l._id) }, ...member(req.auth.userId),
      ...(req.query.before ? { _id: { $lt: req.query.before } } : {}) }).sort({ _id: -1 }).limit(limit).lean();
    const sources = await Harvest.find({ _id: { $in: rows.filter(r => r.harvestId).map(r => r.harvestId) } }).select('_id surum tahsilat').lean();
    const byLink = new Map(links.map(l => [String(l._id), l])), bySource = new Map(sources.map(h => [String(h._id), h]));
    res.json(rows.map(row => projectDelivery(row, req.auth.userId, byLink.get(String(row.linkId)), bySource.get(String(row.harvestId)))));
  }));

  const input = body => {
    const amount = Number(String(body.tutar ?? '').replace(',', '.')), cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || Math.abs(amount * 100 - cents) > 0.00001) throw fail(400, 'İki ondalıklı, pozitif bir tahsilat girin.');
    try { deliveryInput({ kg: 1, price: 1, factory: 'date', date: body.tarih }, 2); } catch { throw fail(400, 'Geçerli bir tahsilat tarihi girin.'); }
    const note = String(body.aciklama || '').trim();
    if (note.length > 500) throw fail(400, 'Açıklama en fazla 500 karakter olabilir.');
    return { amountCents: cents, date: body.tarih, note };
  };
  async function mutate(req, mode) {
    const userId = req.auth.userId, id = req.params.id;
    if (!oid(id) || (mode !== 'create' && !oid(req.params.paymentId))) throw fail(404, 'Kayıt bulunamadı.');
    const data = mode === 'delete' ? null : input(req.body);
    const requestId = String(req.get?.('Idempotency-Key') || req.headers?.['idempotency-key'] || req.body.requestId || '');
    if (mode === 'create' && !/^[a-z0-9-]{16,100}$/i.test(requestId)) throw fail(400, 'İşlem kimliği gerekli.');
    const requestHash = data && crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
      // A write lock serializes collection edits, source edits and cancellation.
      const row = await ShareDelivery.findOneAndUpdate({ _id: id, ...member(userId) }, { $inc: { financeSerial: 1 } }, { new: true, session });
      if (!row) throw fail(404, 'Kayıt bulunamadı.');
      if (!await ShareLink.exists({ _id: row.linkId, ...member(userId) }).session(session)) throw fail(403, 'Anlaşmaya erişilemiyor.');
      const entries = row.collections || [];
      if (mode === 'create') {
        const replay = entries.find(p => p.userId === userId && p.requestId === requestId);
        if (replay) {
          if (replay.requestHash !== requestHash) throw fail(409, 'İşlem kimliği başka bir tahsilat için kullanılmış.');
          return { ok: true, replayed: true, payment: { _id: String(replay._id) } };
        }
      }
      if (row.voided) throw fail(409, 'Teslimat iptal edilmiş.');
      if (row.harvestId) {
        const source = await Harvest.findOne({ _id: row.harvestId }).session(session);
        if (Number(source?.tahsilat) > 0 && row.legacyAllocation?.state !== 'applied') throw fail(409, 'Eski toplam tahsilatın paylara ayrılması gerekiyor. Eski tutar korunuyor; yeni tahsilat eklenmedi.');
      }
      const entry = mode === 'create' ? null : entries.find(p => String(p._id) === req.params.paymentId && p.userId === userId && !p.voided);
      if (mode !== 'create' && !entry) throw fail(404, 'Tahsilat bulunamadı.');
      if (mode !== 'create' && req.body.revision !== (entry.revision || 0)) throw fail(409, 'Tahsilat değişmiş. Listeyi yenileyin.');
      const nextPaid = paidCents(row, userId) - (entry?.amountCents || 0) + (data?.amountCents || 0);
      if (nextPaid > ownShare(row, userId)) throw fail(400, 'Tahsilat kendi kalan payınızdan fazla olamaz.');
      if (mode === 'create') {
        if (entries.length >= 1000) throw fail(409, 'Bu teslimatın tahsilat sınırına ulaşıldı.');
        row.collections.push({ userId, requestId, requestHash, ...data });
      } else {
        if (mode === 'update' && (entry.history || []).length >= 100) throw fail(409, 'Tahsilat düzeltme sınırına ulaşıldı. Gerekirse iptal edip yeni kayıt oluşturun.');
        entry.history = [...(entry.history || []), {
          at: new Date(), action: mode,
          before: { amountCents: entry.amountCents, date: entry.date, note: entry.note || '' },
          after: mode === 'delete' ? { amountCents: 0, date: entry.date, note: entry.note || '' } : data,
        }];
        if (mode === 'delete') entry.voided = true;
        else Object.assign(entry, data);
        entry.revision = (entry.revision || 0) + 1;
      }
      await row.save({ session });
      return { ok: true, ...(mode === 'create' ? { payment: { _id: String(row.collections[row.collections.length - 1]._id) } } : {}) };
    }); } finally { await session.endSession(); }
  }
  app.post('/api/shared-ledger/:id/payments', requireAuth, run(async (req, res) => res.status(201).json(await mutate(req, 'create'))));
  app.put('/api/shared-ledger/:id/payments/:paymentId', requireAuth, run(async (req, res) => res.json(await mutate(req, 'update'))));
  app.delete('/api/shared-ledger/:id/payments/:paymentId', requireAuth, run(async (req, res) => res.json(await mutate(req, 'delete'))));

  // Historical full-sale collections require a proposal and the other party's
  // consent. Originals remain untouched as an audit source, never counted twice.
  app.post('/api/shared-ledger/:id/legacy-allocation', requireAuth, run(async (req, res) => {
    if (!oid(req.params.id)) throw fail(404, 'Teslimat bulunamadı.');
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const row = await ShareDelivery.findOneAndUpdate({ _id: req.params.id, ...member(req.auth.userId), voided: false }, { $inc: { financeSerial: 1 } }, { new: true, session });
        if (!row?.harvestId) throw fail(404, 'Bağlı teslimat bulunamadı.');
        if (!await ShareLink.exists({ _id: row.linkId, ...member(req.auth.userId) }).session(session)) throw fail(403, 'Anlaşma bulunamadı.');
        if (row.legacyAllocation?.state === 'applied') throw fail(409, 'Bu tahsilat daha önce aktarılmış.');
        const source = await Harvest.findOne({ _id: row.harvestId }).session(session);
        const sourceCents = Math.round(Number(source?.tahsilat || 0) * 100);
        if (!source || !Number.isSafeInteger(sourceCents) || sourceCents <= 0) throw fail(409, 'Aktarılacak eski tahsilat bulunamadı.');
        if (req.body.confirm === true) {
          if (req.auth.userId !== row.ownerId) throw fail(403, 'Aktarımı müstahsil onaylamalı.');
          const proposal = row.legacyAllocation;
          if (!proposal || proposal.state !== 'pending' || proposal.proposalId !== req.body.proposalId || proposal.sourceCents !== sourceCents) throw fail(409, 'Teklif veya eski tahsilat değişmiş. Yarıcı yeniden teklif oluşturmalı.');
          if (paidCents(row, row.cropperId) + proposal.cropperCents > row.data.cropperCents || paidCents(row, row.ownerId) + proposal.ownerCents > row.data.ownerCents) throw fail(409, 'Aktarım kalan paylardan fazla.');
          if ((row.collections || []).length > 998) throw fail(409, 'Tahsilat sınırına ulaşıldı.');
          for (const [userId, amountCents] of [[row.cropperId, proposal.cropperCents], [row.ownerId, proposal.ownerCents]]) {
            if (amountCents > 0) row.collections.push({ userId, amountCents, date: row.data.date, note: 'Eski toplam tahsilattan iki tarafın onayıyla aktarıldı.', requestId: `legacy-${row._id}-${userId}` });
          }
          row.legacyAllocation = { ...proposal, state: 'applied', appliedAt: new Date() };
        } else {
          if (req.auth.userId !== row.cropperId) throw fail(403, 'Eski tahsilatın dağılımını yarıcı önermeli.');
          if (!/^\d+(?:[.,]\d{1,2})?$/.test(String(req.body.cropperAmount ?? '').trim())) throw fail(400, 'Yarıcıya ait tutarı sayı olarak girin.');
          const value = Number(String(req.body.cropperAmount ?? '').replace(',', '.')), cropperCents = Math.round(value * 100);
          if (req.body.cropperAmount === undefined || !Number.isSafeInteger(cropperCents) || cropperCents < 0 || Math.abs(value * 100 - cropperCents) > 0.00001 || cropperCents > sourceCents) throw fail(400, 'Yarıcıya ait eski tahsilatı geçerli tutarda girin.');
          const ownerCents = sourceCents - cropperCents;
          if (cropperCents + paidCents(row, row.cropperId) > row.data.cropperCents || ownerCents + paidCents(row, row.ownerId) > row.data.ownerCents) throw fail(400, 'Eski tahsilat dağılımı tarafların payını aşamaz.');
          row.legacyAllocation = { proposalId: crypto.randomUUID(), state: 'pending', sourceCents, cropperCents, ownerCents, proposedAt: new Date() };
        }
        // Touch the source too: conflicts with simultaneous original payment edits.
        await Harvest.updateOne({ _id: source._id }, { $set: { updatedAt: new Date() } }, { session });
        await row.save({ session });
      });
      res.json({ ok: true });
    } finally { await session.endSession(); }
  }));
};
