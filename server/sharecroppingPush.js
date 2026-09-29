const crypto = require('crypto');
const tokenValid = token => typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token) && token.length < 250;
module.exports = function setup(app, deps) {
  const { requireAuth, UserProfile, Session, SharePushDevice: Device, ShareEvent: Event, ShareLink, mongoose } = deps;
  const enabled = () => process.env.SHARECROPPING_PUSH_ENABLED === 'true';
  app.post('/api/sharecropping-push/device', requireAuth, async (req, res) => {
    try {
      if (!tokenValid(req.body.token) || typeof req.body.refreshToken !== 'string' || req.body.refreshToken.length > 500) return res.status(400).json({ error: 'Bildirim kaydı geçersiz.' });
      const sessionHash = crypto.createHash('sha256').update(req.body.refreshToken).digest('hex');
      const session = await Session.findOne({ tokenHash: sessionHash, userId: req.auth.userId, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
      const profile = await UserProfile.exists({ userId: req.auth.userId, active: { $ne: false } });
      if (!session || !profile) return res.status(401).json({ error: 'Bildirim için oturumunuzu yenileyin.' });
      // Late registration from an old login must not reclaim this device token.
      await Device.updateOne({ _id: req.body.token, $or: [{ sessionCreatedAt: { $lte: session.createdAt } }, { sessionCreatedAt: { $exists: false } }] },
        { $set: { userId: req.auth.userId, sessionHash, sessionCreatedAt: session.createdAt, expiresAt: session.expiresAt } }, { upsert: true });
      res.json({ registered: true, pushEnabled: enabled() });
    } catch (e) { res.status(e.code === 11000 ? 409 : 500).json({ error: 'Bildirim kaydı yenilenemedi.' }); }
  });
  const post = async (path, body) => {
    const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(`EXPO_HTTP_${response.status}`);
    const result = await response.json();
    if (!result.data || result.errors?.length) throw Error('EXPO_RESPONSE');
    return result.data;
  };
  let busy = false;
  const tick = async () => {
    if (busy || !enabled() || mongoose.connection.readyState !== 1) return;
    busy = true;
    try {
      const job = await Event.findOneAndUpdate({ state: { $in: ['pending', 'sending', 'receipts'] }, nextAt: { $lte: new Date() } },
        { $set: { state: 'sending', nextAt: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { sort: { nextAt: 1 }, new: false });
      if (!job) return;
      try {
        if (job.state === 'receipts') {
          const tickets = job.tickets || [];
          const receipts = await post('getReceipts', { ids: tickets.map(t => t.id) });
          for (const ticket of tickets) if (receipts[ticket.id]?.details?.error === 'DeviceNotRegistered') {
            await Device.deleteOne({ _id: ticket.token, sessionHash: ticket.sessionHash });
          }
          const missing = tickets.some(t => !receipts[t.id]);
          await Event.updateOne({ _id: job._id }, { $set: { state: missing && job.attempts < 4 ? 'receipts' : 'done', nextAt: new Date(Date.now() + 900000) } });
          return;
        }
        // A crashed sender may already have handed off its notification: never
        // resend an ambiguous job. The durable in-app event remains available.
        if (job.state === 'sending') { await Event.updateOne({ _id: job._id }, { $set: { state: 'failed', lastError: 'AMBIGUOUS_SEND' } }); return; }
        const [profile, link, devices] = await Promise.all([
          UserProfile.exists({ userId: job.recipient, active: { $ne: false } }),
          ShareLink.exists({ _id: job.linkId, ownerId: job.recipient, status: 'active' }),
          Device.find({ userId: job.recipient }).sort({ updatedAt: -1 }).limit(10).lean(),
        ]);
        const valid = [];
        if (profile && link && Date.now() - new Date(job.createdAt).getTime() < 86400000) for (const device of devices) {
          if (await Session.exists({ tokenHash: device.sessionHash, userId: job.recipient, revokedAt: null, expiresAt: { $gt: new Date() } })) valid.push(device);
        }
        if (!valid.length) { await Event.updateOne({ _id: job._id }, { $set: { state: 'done' } }); return; }
        const results = await post('send', valid.map(device => ({
          to: device._id, title: 'Çaylık · Pay Takibi',
          // Lock screens and devices with an offline logout never expose sales data.
          body: 'Ortak teslimat kayıtlarınızda yeni bir gelişme var. Ayrıntıları Çaylık’ta görün.',
          sound: 'default', channelId: 'sharecropping',
          data: { type: 'sharecropping', owner: job.recipient, linkId: String(job.linkId), eventId: String(job._id) },
        })));
        if (!Array.isArray(results) || results.length !== valid.length) throw Error('EXPO_TICKETS');
        const tickets = [];
        for (let index = 0; index < results.length; index++) {
          const result = results[index], device = valid[index];
          if (result.status === 'ok' && result.id) tickets.push({ id: result.id, token: device._id, sessionHash: device.sessionHash });
          if (result.details?.error === 'DeviceNotRegistered') await Device.deleteOne({ _id: device._id, sessionHash: device.sessionHash });
        }
        await Event.updateOne({ _id: job._id }, { $set: { state: tickets.length ? 'receipts' : 'failed', tickets, nextAt: new Date(Date.now() + 900000) } });
      } catch (e) {
        // Receipt lookups are safe to retry; a send with uncertain delivery is not.
        const retryReceipt = job.state === 'receipts' && job.attempts < 4;
        await Event.updateOne({ _id: job._id }, { $set: { state: retryReceipt ? 'receipts' : 'failed', nextAt: new Date(Date.now() + 900000), lastError: String(e.message).slice(0, 100) } });
      }
    } catch { console.error('SHARE_PUSH_WORKER_ERROR'); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 30000); timer.unref();
  return { tick, stop: () => clearInterval(timer) };
};
module.exports.tokenValid = tokenValid;
