const crypto = require('crypto');
const { deliveryInput, deliveryMessage, deliveryChanges } = require('../shared/sharecropping');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const oid = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const member = userId => ({ $or: [{ cropperId: userId }, { ownerId: userId }] });
const publicLink = (r, userId) => ({
  _id: String(r._id), cropperName: r.cropperName, ownerName: r.ownerName, label: r.label,
  denominator: r.denominator, status: r.status, myRole: r.cropperId === userId ? 'cropper' : 'owner',
});
const publicDelivery = r => ({ _id: String(r._id), data: r.data, revision: r.revision, voided: r.voided,
  harvestId: r.harvestId ? String(r.harvestId) : undefined,
  changes: (r.history || []).map((entry, index, history) => ({
    at: entry.at, revision: entry.revision + 1,
    details: index === history.length - 1 && r.voided ? ['Teslimat iptal edildi'] : deliveryChanges(entry.data, history[index + 1]?.data || r.data),
  })).reverse(),
});
module.exports = function register(app, { requireAuth, limitPublicUsage, mongoose, UserProfile, ShareLink, ShareDelivery, ShareEvent }) {
  const fail = (code, message) => Object.assign(Error(message), { httpCode: code });
  const run = fn => async (req, res) => {
    try {
      const profile = await UserProfile.findOne({ userId: req.auth.userId, active: { $ne: false } }).select('name').lean();
      if (!profile) return res.status(403).json({ error: 'Aktif hesap gerekli.' });
      await fn(req, res, profile);
    } catch (e) {
      if (!e.httpCode) console.error('SHARECROPPING_ERROR', { code: e.code || 'INTERNAL' });
      res.status(e.httpCode || 500).json({ error: e.httpCode ? e.message : 'İşlem tamamlanamadı. Yeniden deneyin.' });
    }
  };
  const transaction = async fn => {
    const session = await mongoose.startSession();
    try { let result; await session.withTransaction(async () => { result = await fn(session); }); return result; }
    finally { await session.endSession(); }
  };
  const codeHash = body => {
    const code = String(body?.code || '').trim().toLowerCase();
    if (!/^[a-f0-9]{24}$/.test(code)) throw fail(400, '24 karakterli davet kodunu kontrol edin.');
    return digest(code);
  };
  const getLink = async req => {
    if (!oid(req.params.id)) throw fail(404, 'Bağlantı bulunamadı.');
    const r = await ShareLink.findOne({ _id: req.params.id, ...member(req.auth.userId) }).lean();
    if (!r) throw fail(404, 'Bağlantı bulunamadı.');
    return r;
  };
  const notify = async (session, record, text) => ShareEvent.create([{
    key: `${record._id}:${record.revision}`, recipient: record.ownerId,
    linkId: record.linkId, deliveryId: record._id, message: text,
  }], { session });
  app.get('/api/sharecropping', requireAuth, run(async (req, res) => {
    const rows = await ShareLink.find(member(req.auth.userId)).sort({ createdAt: -1 }).limit(201).lean();
    if (rows.length > 200) throw fail(409, 'Bağlantı listesi sınırı aşıldı; destek ile iletişime geçin.');
    res.json({ links: rows.map(r => publicLink(r, req.auth.userId)), harvestSharing: true });
  }));
  app.get('/api/sharecropping-summary', requireAuth, run(async (req, res) => {
    const links = await ShareLink.find(member(req.auth.userId)).sort({ createdAt: -1 }).limit(201).lean();
    if (links.length > 200) throw fail(409, 'Bağlantı listesi sınırı aşıldı.');
    const totals = await ShareDelivery.aggregate([
      { $match: { linkId: { $in: links.map(link => link._id) }, voided: false } },
      { $group: { _id: '$linkId', kg: { $sum: '$data.kg' }, cropperCents: { $sum: '$data.cropperCents' }, ownerCents: { $sum: '$data.ownerCents' } } },
    ]);
    const byId = new Map(totals.map(row => [String(row._id), row]));
    res.json({ links: links.map(link => {
      const total = byId.get(String(link._id));
      return { ...publicLink(link, req.auth.userId), kg: total?.kg || 0, myShareCents: (link.cropperId === req.auth.userId ? total?.cropperCents : total?.ownerCents) || 0 };
    }) });
  }));
  app.post('/api/sharecropping/invites', requireAuth, limitPublicUsage('share-invite', 20, 3600000), run(async (req, res, profile) => {
    const denominator = req.body.denominator;
    const label = typeof req.body.label === 'string' ? req.body.label.trim() : '';
    if (![2, 3].includes(denominator) || !label || label.length > 80) throw fail(400, 'Anlaşma adı ve 1/2 veya 1/3 yarıcı payı seçin.');
    if (await ShareLink.countDocuments({ cropperId: req.auth.userId }) >= 100) throw fail(409, 'Bağlantı sınırına ulaşıldı.');
    const code = crypto.randomBytes(12).toString('hex');
    const row = await ShareLink.create({ cropperId: req.auth.userId, cropperName: profile.name, label, denominator,
      inviteHash: digest(code), expiresAt: new Date(Date.now() + 72 * 3600000) });
    res.status(201).json({ link: publicLink(row, req.auth.userId), code });
  }));
  app.post('/api/sharecropping/invites/preview', requireAuth, limitPublicUsage('share-preview', 30, 600000), run(async (req, res) => {
    const row = await ShareLink.findOne({ inviteHash: codeHash(req.body), status: 'pending', expiresAt: { $gt: new Date() } }).lean();
    if (!row || row.cropperId === req.auth.userId) throw fail(404, 'Davet bulunamadı, süresi doldu veya kendi davetiniz.');
    res.json({ cropperName: row.cropperName, denominator: row.denominator, label: row.label });
  }));
  app.post('/api/sharecropping/invites/accept', requireAuth, limitPublicUsage('share-accept', 20, 600000), run(async (req, res, profile) => {
    if (req.body.accept !== true) throw fail(400, 'Paylaşım onayı gerekli.');
    const hash = codeHash(req.body);
    const row = await transaction(async session => {
      const result = await ShareLink.findOneAndUpdate({ inviteHash: hash, status: 'pending', cropperId: { $ne: req.auth.userId }, expiresAt: { $gt: new Date() } },
        { $set: { ownerId: req.auth.userId, ownerName: profile.name, status: 'active', acceptedAt: new Date() }, $inc: { mutationSerial: 1 } }, { new: true, session });
      if (result) {
        if (!await UserProfile.exists({ userId: result.cropperId, active: { $ne: false } }).session(session)) throw fail(404, 'Davet geçerli değil.');
        return result;
      }
      const existing = await ShareLink.findOne({ inviteHash: hash, ownerId: req.auth.userId, status: 'active' }).session(session);
      if (!existing) throw fail(409, 'Davet kullanılmış, kapatılmış veya süresi dolmuş.');
      return existing;
    });
    res.json({ link: publicLink(row, req.auth.userId) });
  }));
  app.post('/api/sharecropping/:id/close', requireAuth, run(async (req, res) => {
    await getLink(req);
    await ShareLink.updateOne({ _id: req.params.id, ...member(req.auth.userId) }, { $set: { status: 'closed' }, $inc: { mutationSerial: 1 } });
    res.json({ ok: true });
  }));
  app.get('/api/sharecropping/:id/deliveries', requireAuth, run(async (req, res) => {
    const link = await getLink(req);
    const cursor = req.query.before;
    if (cursor && !oid(cursor)) throw fail(400, 'Geçersiz sayfa.');
    const rows = await ShareDelivery.find({ linkId: link._id, ...(cursor ? { _id: { $lt: cursor } } : {}) }).sort({ _id: -1 }).limit(51).lean();
    const totals = await ShareDelivery.aggregate([
      { $match: { linkId: link._id, voided: false } },
      { $group: { _id: null, kg: { $sum: '$data.kg' }, netCents: { $sum: '$data.netCents' }, cropperCents: { $sum: '$data.cropperCents' }, ownerCents: { $sum: '$data.ownerCents' } } },
    ]);
    res.json({ link: publicLink(link, req.auth.userId), records: rows.slice(0, 50).map(publicDelivery),
      next: rows.length > 50 ? String(rows[49]._id) : null, totals: totals[0] || { kg: 0, netCents: 0, cropperCents: 0, ownerCents: 0 } });
  }));
  app.post('/api/sharecropping/:id/deliveries', requireAuth, limitPublicUsage('share-delivery', 120, 600000), run(async (req, res) => {
    const link = await getLink(req);
    if (link.cropperId !== req.auth.userId) throw fail(403, 'Teslimatı yalnızca yarıcı ekleyebilir.');
    if (typeof req.body.requestId !== 'string' || !/^[a-z0-9-]{16,80}$/i.test(req.body.requestId)) throw fail(400, 'İşlem kimliği gerekli.');
    let data; try { data = deliveryInput(req.body, link.denominator); } catch (e) { throw fail(400, e.message); }
    const requestHash = digest(JSON.stringify({ linkId: String(link._id), data }));
    const requestKey = { cropperId: req.auth.userId, requestId: req.body.requestId };
    const replay = async session => {
      const prior = await ShareDelivery.findOne(requestKey).session(session || null);
      if (prior && prior.requestHash !== requestHash) throw fail(409, 'Bu işlem kimliği başka bir kayıt için kullanıldı.');
      return prior;
    };
    let record;
    try { record = await transaction(async session => {
      const prior = await replay(session); if (prior) return prior;
      const active = await ShareLink.findOneAndUpdate({ _id: link._id, cropperId: req.auth.userId, status: 'active' }, { $inc: { mutationSerial: 1 } }, { new: true, session });
      if (!active || !await UserProfile.exists({ userId: active.ownerId, active: { $ne: false } }).session(session)) throw fail(409, 'Müstahsil onayı gerekli veya bağlantı kapatıldı.');
      const [row] = await ShareDelivery.create([{ ...requestKey, ownerId: active.ownerId, linkId: active._id, data, requestHash }], { session });
      await notify(session, row, deliveryMessage(data)); return row;
    }); } catch (e) { if (e.code !== 11000) throw e; record = await replay(); if (!record) throw e; }
    res.status(201).json({ record: publicDelivery(record) });
  }));
  app.patch('/api/sharecropping/:id/deliveries/:recordId', requireAuth, limitPublicUsage('share-edit', 120, 600000), run(async (req, res) => {
    const link = await getLink(req);
    if (link.cropperId !== req.auth.userId) throw fail(403, 'Yalnızca yarıcı düzeltebilir.');
    if (!oid(req.params.recordId) || !Number.isInteger(req.body.revision) || req.body.revision < 0) throw fail(400, 'Kaydı yeniden yükleyin.');
    const record = await transaction(async session => {
      if (!await ShareLink.findOneAndUpdate({ _id: link._id, status: 'active', cropperId: req.auth.userId }, { $inc: { mutationSerial: 1 } }, { session })) throw fail(409, 'Bağlantı kapalı.');
      const old = await ShareDelivery.findOne({ _id: req.params.recordId, linkId: link._id, revision: req.body.revision, voided: false }).session(session);
      if (!old) throw fail(409, 'Kayıt değişmiş veya iptal edilmiş. Listeyi yenileyin.');
      if (old.harvestId) throw fail(409, 'Bu teslimatı bağlı hasat kaydından düzenleyin veya silin.');
      if (old.history.length >= 100) throw fail(409, 'Düzeltme sınırına ulaşıldı.');
      let data = old.data;
      if (req.body.voided !== true) { try { data = deliveryInput(req.body, old.data.denominator); } catch (e) { throw fail(400, e.message); } }
      const row = await ShareDelivery.findOneAndUpdate({ _id: old._id, revision: old.revision }, {
        $set: { data, voided: req.body.voided === true }, $inc: { revision: 1 },
        $push: { history: { data: old.data, revision: old.revision, at: new Date() } },
      }, { new: true, session });
      await notify(session, row, row.voided ? `Teslimat iptal edildi: ${deliveryMessage(old.data)}` : `Teslimat düzeltildi: ${deliveryChanges(old.data, data).join(' · ') || 'Bilgiler yenilendi.'}`);
      return row;
    });
    res.json({ record: publicDelivery(record) });
  }));
  app.get('/api/sharecropping-events', requireAuth, run(async (req, res) => {
    const rows = await ShareEvent.find({ recipient: req.auth.userId }).select('_id linkId message createdAt readAt').sort({ createdAt: -1 }).limit(30).lean();
    res.json({ events: rows });
  }));
};
