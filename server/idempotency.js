const crypto = require('node:crypto');

module.exports = function createIdempotencyMiddleware(Record) {
  return async (req, res, next) => {
    const key = String(req.headers['idempotency-key'] || '').trim();
    if (!key || !req.auth?.userId) return next(); // compatibility with existing clients
    if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(key)) return res.status(400).json({ error: 'İşlem kimliği geçersiz.' });
    const identity = { userId: req.auth.userId, key, method: req.method, path: req.path };
    const hash = crypto.createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
    try {
      try {
        // Reserve before any business write. A crashed request remains blocked for review,
        // never retried blindly after a lease expires and duplicates a payment.
        await Record.create({ ...identity, status: 409, body: { error: 'Bu kayıt işleniyor. Biraz sonra yeniden deneyin; sürerse destek alın.', code: 'REQUEST_IN_PROGRESS' }, requestHash: hash });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const previous = await Record.findOne(identity).lean();
        if (!previous) return res.status(503).json({ error: 'İşlem durumu kontrol edilemedi. Yeniden deneyin.' });
        if (previous.requestHash && previous.requestHash !== hash) return res.status(409).json({ error: 'Aynı işlem kimliği farklı bilgilerle kullanılamaz.', code: 'REQUEST_MISMATCH' });
        return res.status(previous.status).json(previous.body);
      }
      const json = res.json.bind(res);
      res.json = body => {
        const status = res.statusCode;
        // Store the result before replying. No fire-and-forget race with a retry.
        void Record.updateOne(identity, { $set: { status, body, completed: true } }).then(() => {
          res.status(status); json(body);
        }).catch(error => {
          console.error('REQUEST_RESULT_SAVE_FAILED', { path: req.path, error: error.message });
          res.status(503); json({ error: 'Kayıt sonucu doğrulanıyor. Aynı kaydı yeniden oluşturmayın; biraz sonra tekrar kontrol edin.' });
        });
        return res;
      };
      next();
    } catch (error) { next(error); }
  };
};
