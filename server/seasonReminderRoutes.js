const { defaultSeasonReminderSettings, validateSeasonReminderSettings } = require('../shared/seasonReminders');

// One shared policy. No arbitrary message / recipient / immediate-send endpoint.
module.exports = function registerSeasonReminderRoutes(app, { requireAuth, UserProfile, SeasonReminderPolicy }) {
  const publicPolicy = (record) => ({ settings: record?.settings || defaultSeasonReminderSettings(), revision: record?.revision || 0 });
  app.get('/api/season-reminder', requireAuth, async (_req, res) => {
    try { res.json(publicPolicy(await SeasonReminderPolicy.findById('season-reminder').lean())); }
    catch { res.status(503).json({ error: 'Sezon bildirim planı yüklenemedi.' }); }
  });
  app.put('/api/admin/season-reminder', requireAuth, async (req, res) => {
    try {
      // Re-check the current database role, not a stale token or a client flag.
      const admin = await UserProfile.findOne({ userId: req.auth.userId }).select('role active').lean();
      if (admin?.role !== 'admin' || admin.active === false) return res.status(403).json({ error: 'Sezon planını yalnızca ana yönetici değiştirebilir.' });
      const revision = req.body?.revision;
      if (!Number.isSafeInteger(revision) || revision < 0) return res.status(400).json({ error: 'Planı yeniden yükleyin.' });
      let settings;
      try { settings = validateSeasonReminderSettings(req.body?.settings); }
      catch (error) { return res.status(400).json({ error: error.message }); }
      // Empty first plan is created atomically. Duplicate id means another admin saved first.
      const updated = await SeasonReminderPolicy.findOneAndUpdate(
        { _id: 'season-reminder', revision },
        { $set: { settings, updatedBy: req.auth.userId }, $inc: { revision: 1 } },
        { new: true, upsert: revision === 0, runValidators: true },
      );
      if (!updated) return res.status(409).json({ error: 'Plan başka bir oturumda değişti. Yeniden yükleyin.' });
      res.json(publicPolicy(updated));
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: 'Plan başka bir oturumda değişti. Yeniden yükleyin.' });
      console.error('SEASON_POLICY_SAVE_FAILED', { userId: req.auth.userId, code: error.code || 'UNKNOWN' });
      res.status(503).json({ error: 'Sezon planı kaydedilemedi. Lütfen yeniden deneyin.' });
    }
  });
};
