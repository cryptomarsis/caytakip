const { validateQuotaPlans, eligibleRecord } = require('../shared/quota');
module.exports = function registerQuotaRoutes(app, { requireAuth, UserProfile, Harvest }) {
  // Only the signed-in producer's own records, never the admin-wide list.
  const owned = (req) => ({ $or: [{ userId: req.auth.userId }, ...(req.auth.phone ? [{ userId: { $in: ['', null] }, userPhone: req.auth.phone }] : [])] });
  app.get('/api/quota', requireAuth, async (req, res) => {
    try {
      const [profile, records] = await Promise.all([
        UserProfile.findOne({ userId: req.auth.userId }).select('quotaPlans quotaRevision').lean(),
        Harvest.find(owned(req)).select('_id firma tarih surum kg weight').sort({ tarih: -1 }).lean(),
      ]);
      res.json({ plans: profile?.quotaPlans || [], revision: profile?.quotaRevision || 0, records });
    } catch { res.status(500).json({ error: 'Kota bilgileri yüklenemedi.' }); }
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
