const { validateQuotaPlans, eligibleRecord, resolveQuotaPlan } = require('../shared/quota');
module.exports = function registerQuotaRoutes(app, { requireAuth, UserProfile, Harvest }) {
  // Only the signed-in producer's own records, never the admin-wide list.
  const owned = (req) => ({ $or: [{ userId: req.auth.userId }, ...(req.auth.phone ? [{ userId: { $in: ['', null] }, userPhone: req.auth.phone }] : [])] });
  app.get('/api/quota/plans', requireAuth, async (req, res) => {
    try {
      const profile = await UserProfile.findOne({ userId: req.auth.userId }).select('quotaPlans').lean();
      res.json({ plans: profile?.quotaPlans || [] });
    } catch { res.status(500).json({ error: 'Cüzdanlar yüklenemedi.' }); }
  });
  app.get('/api/quota', requireAuth, async (req, res) => {
    try {
      const [profile, records] = await Promise.all([
        UserProfile.findOne({ userId: req.auth.userId }).select('quotaPlans quotaRevision').lean(),
        Harvest.find(owned(req)).select('_id firma tarih surum kg weight quotaPlanId').sort({ tarih: -1 }).lean(),
      ]);
      // Retain only live legacy links; deleted/moved harvests no longer consume quota.
      const byId = new Map(records.map(r => [String(r._id), r]));
      const plans = (profile?.quotaPlans || []).map(p => ({ ...p, recordIds: (p.recordIds || []).filter(id => {
        const r = byId.get(id);
        return r && !r.quotaPlanId && eligibleRecord(p, r);
      }) }));
      res.json({ plans, revision: profile?.quotaRevision || 0, records });
    } catch { res.status(500).json({ error: 'Kota bilgileri yüklenemedi.' }); }
  });
  app.patch('/api/quota/records/:id', requireAuth, async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id) || typeof req.body?.quotaPlanId !== 'string' || !req.body.quotaPlanId) return res.status(400).json({ error: 'Teslimat ve cüzdan seçin.' });
    try {
      const filter = { $and: [owned(req), { _id: req.params.id }] };
      const [record, profile] = await Promise.all([
        Harvest.findOne(filter).lean(),
        UserProfile.findOne({ userId: req.auth.userId }).select('quotaPlans').lean(),
      ]);
      if (!record) return res.status(404).json({ error: 'Teslimat bulunamadı.' });
      let quotaPlanId;
      try { quotaPlanId = resolveQuotaPlan(profile?.quotaPlans || [], record, req.body.quotaPlanId); }
      catch (error) { return res.status(400).json({ error: error.message }); }
      if (!quotaPlanId) return res.status(400).json({ error: 'Yalnızca ÇAYKUR teslimatları cüzdana bağlanabilir.' });
      // Compare assignment/date/company to avoid overwriting a concurrent edit.
      const updated = await Harvest.findOneAndUpdate({ $and: [filter, {
        firma: record.firma, surum: record.surum, tarih: record.tarih,
        quotaPlanId: record.quotaPlanId || { $in: ['', null] },
      }] }, { $set: { quotaPlanId } }, { new: true });
      if (!updated) return res.status(409).json({ error: 'Teslimat değişti. Sayfayı yeniden açın.' });
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Cüzdan seçimi kaydedilemedi.' }); }
  });
  app.put('/api/quota', requireAuth, async (req, res) => {
    let plans;
    try { plans = validateQuotaPlans(req.body?.plans); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!Number.isInteger(req.body.revision) || req.body.revision < 0) return res.status(400).json({ error: 'Kota bilgilerini yeniden yükleyin.' });
    try {
      const ids = plans.flatMap((p) => p.recordIds);
      const records = await Harvest.find({ $and: [owned(req), { _id: { $in: ids } }] }).lean();
      const byId = new Map(records.map((r) => [String(r._id), r]));
      for (const p of plans) for (const id of p.recordIds) {
        const record = byId.get(id);
        if (!record || !eligibleRecord(p, record)) return res.status(400).json({ error: 'Seçilen teslimat size, Çaykur’a veya bu sürgün dönemine ait değil. Seçimleri kontrol edin.' });
      }
      const updated = await UserProfile.findOneAndUpdate({ userId: req.auth.userId, ...(req.body.revision === 0 ? { $or: [{ quotaRevision: 0 }, { quotaRevision: { $exists: false } }] } : { quotaRevision: req.body.revision }) }, { $set: { quotaPlans: plans }, $inc: { quotaRevision: 1 } }, { new: true });
      if (!updated) return res.status(409).json({ error: 'Bilgiler başka bir cihazda değişmiş olabilir. Sayfayı yeniden açın.' });
      res.json({ revision: updated.quotaRevision });
    } catch { res.status(500).json({ error: 'Kota kaydedilemedi. Lütfen yeniden deneyin.' }); }
  });
};
