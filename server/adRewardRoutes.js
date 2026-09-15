const crypto = require('node:crypto');
const { createVerifier } = require('./adRewardVerification');

module.exports = function registerAdRewards(app, { mongoose, UserProfile, AiCreditTransaction, requireAuth, limitPublicUsage }) {
  const schema = new mongoose.Schema({
    nonce: { type: String, unique: true }, userId: String, expiresAt: Date,
    transactionId: { type: String, unique: true, sparse: true }, rewarded: Boolean,
    mode: { type: String, enum: ['legacy', 'ssv'], default: 'ssv' },
  }, { timestamps: true });
  const Reward = mongoose.models.AdRewardSession || mongoose.model('AdRewardSession', schema);
  const verify = createVerifier();
  const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const legacyEnabled = () => process.env.ADMOB_LEGACY_REWARDS_ENABLED !== 'false';
  // Temporary compatibility, NOT Google-verified. Retire only after store rollout.
  app.post('/api/ai/rewarded-ad', requireAuth, limitPublicUsage('reward-legacy', 20, 3600000), async (req, res) => {
    let session;
    try {
      const nonce = req.body?.customData;
      if (nonce !== undefined && !/^[a-f0-9]{48}$/.test(nonce)) return res.status(400).json({ error: 'Reklam oturumu geçersiz.' });
      session = await mongoose.startSession();
      let result;
      await session.withTransaction(async () => {
        const userId = req.auth.userId;
        const record = nonce ? await Reward.findOne({ nonce, userId }).session(session) : null;
        if (nonce && (!record || record.mode !== 'legacy')) throw Object.assign(Error('Reklam sunucu doğrulaması bekleniyor.'), { status: 409 });
        const profile = await UserProfile.findOne({ userId }).session(session);
        if (!profile) throw Object.assign(Error('Üretici profili bulunamadı.'), { status: 404 });
        if (record?.rewarded) { result = { credits: profile.aiCredits, creditsGranted: 0, replayed: true }; return; }
        // Existing, previously issued compatibility sessions are allowed to finish.
        if (!nonce && !legacyEnabled()) throw Object.assign(Error('Reklam ödülü için Çaylık uygulamasını güncelleyin.'), { status: 426 });
        if (record && record.expiresAt < new Date()) throw Object.assign(Error('Reklam oturumunun süresi doldu. Yeni bir reklam izleyebilirsiniz.'), { status: 410, code: 'AD_REWARD_EXPIRED' });
        const filter = { userId, type: 'rewarded_ad', status: 'completed', createdAt: { $gte: today() } };
        // Old binaries have no operation ID: short retries replay the last award.
        const recent = !nonce ? await AiCreditTransaction.findOne(filter).sort({ createdAt: -1 }).session(session) : null;
        if (recent && Date.now() - new Date(recent.createdAt).getTime() < 60000) { result = { credits: profile.aiCredits, creditsGranted: 0, replayed: true }; return; }
        const count = await AiCreditTransaction.countDocuments(filter).session(session);
        if (count >= 3) throw Object.assign(Error('Bugünkü ücretsiz reklam kredisi sınırına ulaştınız.'), { status: 429 });
        const wallet = await UserProfile.findOneAndUpdate({ userId }, { $inc: { aiCredits: 10 } }, { session, returnDocument: 'after' });
        if (!wallet) throw Error('Reward owner not found');
        await AiCreditTransaction.create([{ userId, requestId: nonce ? `legacy-ad:${nonce}` : `rewarded-ad:${userId}:${today().toISOString().slice(0, 10)}:${count + 1}`, type: 'rewarded_ad', status: 'completed', amount: 10, balanceAfter: wallet.aiCredits, description: 'Geçiş dönemi reklam ödülü (istemci bildirimi)' }], { session });
        if (record) { record.rewarded = true; await record.save({ session }); }
        result = { credits: wallet.aiCredits, creditsGranted: 10 };
      });
      res.json(result);
    } catch (error) {
      console.warn('LEGACY_AD_REWARD', { code: error.status || error.code || 'FAILED' });
      res.status(error.status || 503).json({ error: error.status ? error.message : 'Reklam ödülü doğrulanamadı. Daha sonra tekrar deneyin.', ...(error.code === 'AD_REWARD_EXPIRED' ? { code: error.code } : {}) });
    } finally { if (session) await session.endSession(); }
  });
  app.post('/api/ai/rewarded-ad/session', requireAuth, limitPublicUsage('reward-session', 20, 3600000), async (req, res) => {
    try {
      const mode = process.env.ADMOB_SSV_ENABLED === 'true' ? 'ssv' : 'legacy';
      if (mode === 'legacy' && !legacyEnabled()) return res.status(503).json({ error: 'Ödüllü reklam şu anda hazırlanıyor. Daha sonra tekrar deneyin.' });
      const daily = await AiCreditTransaction.countDocuments({ userId: req.auth.userId, type: 'rewarded_ad', status: 'completed', createdAt: { $gte: today() } });
      if (daily >= 3) return res.status(429).json({ error: 'Bugünkü 3 reklam ödülünü aldınız.' });
      const nonce = crypto.randomBytes(24).toString('hex');
      await Reward.create({ nonce, userId: req.auth.userId, expiresAt: new Date(Date.now() + 86400000), rewarded: false, mode });
      res.json({ userId: req.auth.userId, customData: nonce, mode });
    } catch { res.status(503).json({ error: 'Reklam oturumu hazırlanamadı.' }); }
  });
  app.get('/api/ai/rewarded-ad/status/:nonce', requireAuth, async (req, res) => {
    try {
      const record = await Reward.findOne({ nonce: req.params.nonce, userId: req.auth.userId }).lean();
      res.json({ rewarded: Boolean(record?.rewarded) });
    } catch { res.status(503).json({ error: 'Ödül durumu alınamadı.' }); }
  });
  app.get('/api/webhooks/admob', async (req, res) => {
    let data;
    try { data = await verify(req.originalUrl); }
    catch (error) { console.warn('ADMOB_SSV_REJECTED', { error: error.message }); return res.status(error.retryable ? 503 : 400).send('Invalid verification'); }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const record = await Reward.findOne({ nonce: data.custom_data, userId: data.user_id }).session(session);
        if (!record) throw new Error('Reward session not found');
        // Panel can be enabled while a compatibility ad is already playing.
        // Its original completion path owns the reward; never credit both paths.
        if (record.mode === 'legacy') return;
        if (record.rewarded) {
          if (record.transactionId !== data.transaction_id) throw new Error('Session already used');
          return;
        }
        if (record.expiresAt < new Date()) throw new Error('Reward session expired');
        const count = await AiCreditTransaction.countDocuments({ userId: record.userId, type: 'rewarded_ad', status: 'completed', createdAt: { $gte: today() } }).session(session);
        if (count >= 3) throw new Error('Daily limit reached');
        // Every reward writes this wallet: concurrent callbacks conflict and retry,
        // so the daily limit is recalculated against the committed balance/ledger.
        const wallet = await UserProfile.findOneAndUpdate({ userId: record.userId }, { $inc: { aiCredits: 10 } }, { session, returnDocument: 'after' });
        if (!wallet) throw new Error('Reward owner not found');
        await AiCreditTransaction.create([{ userId: record.userId, requestId: `admob:${data.transaction_id}`, type: 'rewarded_ad', status: 'completed', amount: 10, balanceAfter: wallet.aiCredits, description: 'Google tarafından doğrulanan reklam ödülü' }], { session });
        record.rewarded = true;
        record.transactionId = data.transaction_id;
        await record.save({ session });
      });
      res.json({ received: true });
    } catch (error) {
      console.error('ADMOB_SSV_PROCESSING', { transactionId: data.transaction_id, error: error.message });
      res.status(503).json({ error: 'Reward not recorded' });
    } finally { await session.endSession(); }
  });
};
