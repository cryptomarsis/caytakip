require('dotenv').config(); // .env dosyasındaki değişkenleri yükler
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const OpenAI = require('openai');

const app = express();
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin: (origin, callback) => {
    // Mobil istemciler Origin başlığı göndermez; web sürümünde yalnızca açıkça
    // izin verilen alan adları kabul edilir. Geliştirme ortamında eski davranış korunur.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) return callback(null, true);
    return callback(new Error('Bu web alan adına API erişim izni verilmedi.'));
  }
};

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Veritabanı adresi (.env yoksa varsayılan lokal adresi kullanır)
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/cay_takip';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'cryptomarsisadmin';
const ADMIN_PHONE_RAW = process.env.ADMIN_PHONE || '05432037007';
const normalizePhone = (value) => {
  let p = String(value || '').replace(/\D/g, '');
  if (p.startsWith('90')) p = '0' + p.slice(2);
  if (p.length === 10 && p.startsWith('5')) p = '0' + p;
  return p;
};
const ADMIN_PHONE = normalizePhone(ADMIN_PHONE_RAW);
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'cay-takip-change-this-secret';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const RECEIPT_MAX_BYTES = 6 * 1024 * 1024;
const acceptedReceiptTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECEIPT_MAX_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!acceptedReceiptTypes.has(file.mimetype)) return callback(new Error('Sadece JPEG, PNG veya WEBP fiş fotoğrafı yükleyin.'));
    callback(null, true);
  }
});
const uploadReceipt = (req, res, next) => receiptUpload.single('receipt')(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fiş fotoğrafı en fazla 6 MB olabilir.' });
  }
  return res.status(400).json({ error: error.message || 'Fiş fotoğrafı yüklenemedi.' });
});

const base64url = (value) => Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromBase64url = (value) => Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const signAccessToken = (payload) => {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
};
const verifyAccessToken = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const expected = base64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());
    const a = Buffer.from(parts[2]); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(fromBase64url(parts[1]));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
};
const hashRefreshToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const makeRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const isAdminRequest = (req) => {
  const auth = getAuthUser(req);
  return Boolean(auth?.role === 'admin');
};

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('✅ MongoDB bağlantısı başarılı.'))
  .catch((err) => console.error('❌ MongoDB bağlantı hatası:', err.message));

// --- SCHEMAS ---

const HarvestSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  userPhone: { type: String, required: false },
  tarih: String,
  surum: String,
  uretici: String,
  producerName: String,
  kg: Number,
  weight: Number,
  firma: String,
  fiyat: Number,
  toplamTutar: Number,     // kg * fiyat
  tahsilat: Number,        // Toplam yapılan tahsilat
  kalanBakiye: Number,     // toplamTutar - tahsilat
  aciklama: String,
  bahce: String,
  
  // Vadeli Takip İçin Alanlar
  isVadeli: { type: Boolean, default: false },
  vadeTarihi: String,      // YYYY-AA veya YYYY-AA-GG (Örn: "2026-08")
  odemeDurumu: { type: String, enum: ['Ödendi', 'Kısmi Ödendi', 'Bekliyor'], default: 'Bekliyor' }
}, { timestamps: true });

// Tahsilat Geçmişi Kaydı (Hangi hasada ne kadar ödeme yapıldı?)
const PaymentSchema = new mongoose.Schema({
  userId: String,
  userPhone: String,
  harvestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Harvest', required: true },
  tarih: String,
  tutar: Number,
  aciklama: String
}, { timestamps: true });

const ExpenseSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  userPhone: { type: String, required: false },
  tarih: String,
  kategori: String,
  aciklama: String,
  tutar: Number
}, { timestamps: true });

const GardenSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  userPhone: { type: String, required: false },
  name: String,
  adaParsel: String,
  alan: String
}, { timestamps: true });


// Fabrika fiyat/politika takip kayıtları
const FactoryPriceSchema = new mongoose.Schema({
  firma: { type: String, required: true },
  fiyat: { type: Number, required: true },
  tarih: { type: String, required: true },
  fiyatTuru: { type: String, enum: ['Haftalık', 'Aylık', 'Peşin', 'Vadeli', 'Diğer'], default: 'Peşin' },
  vadeGun: { type: Number, default: 0 },
  gecerlilikBaslangic: String,
  politika: String,
  kaynak: String,
  aciklama: String,
  userId: String,
  userPhone: String
}, { timestamps: true });

// Uygulama reklam alanları
const UserProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const SessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  revokedAt: { type: Date, default: null }
}, { timestamps: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Session = mongoose.model('Session', SessionSchema);

// Mobil uygulamanın çevrimdışı kuyruğu aynı isteği bağlantı koptuğunda yeniden
// gönderebilir. Bu kayıt, aynı Idempotency-Key ile oluşabilecek çift kayıtları engeller.
const IdempotencySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  key: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  status: { type: Number, required: true },
  body: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });
IdempotencySchema.index({ userId: 1, key: 1, method: 1, path: 1 }, { unique: true });
const IdempotencyRecord = mongoose.model('IdempotencyRecord', IdempotencySchema);

const AdSchema = new mongoose.Schema({
  slot: { type: String, enum: ['dashboard_top', 'dashboard_middle', 'prices_top'], default: 'dashboard_middle' },
  firma: { type: String, required: true },
  kategori: String,
  baslik: String,
  aciklama: String,
  telefon: String,
  link: String,
  gorselUrl: String,
  aktif: { type: Boolean, default: true },
  baslangic: String,
  bitis: String,
  userId: String,
  userPhone: String
}, { timestamps: true });

const Harvest = mongoose.model('Harvest', HarvestSchema);
const Payment = mongoose.model('Payment', PaymentSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Garden = mongoose.model('Garden', GardenSchema);
const FactoryPrice = mongoose.model('FactoryPrice', FactoryPriceSchema);
const Ad = mongoose.model('Ad', AdSchema);
const UserProfile = mongoose.model('UserProfile', UserProfileSchema);

// HELPER FUNCTIONS
const getAuthUser = (req) => {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  return verifyAccessToken(header.slice(7).trim());
};

const getUserIdentifier = (req) => {
  const auth = getAuthUser(req);
  if (auth?.userId) return { userId: auth.userId, userPhone: auth.phone, role: auth.role };
  // Legacy headers are accepted only for public profile migration routes; protected data routes reject them.
  return { userId: null, userPhone: null, role: null };
};

const requireAuth = (req, res, next) => {
  const auth = getAuthUser(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş.' });
  req.auth = auth;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'Bu işlemi sadece yönetici yapabilir.' });
  next();
};

const publicRateWindows = new Map();
const limitPublicUsage = (scope, maxRequests, windowMs) => (req, res, next) => {
  const key = `${req.ip || 'unknown'}:${scope}`;
  const now = Date.now();
  const current = publicRateWindows.get(key);
  const active = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  if (active.count >= maxRequests) {
    return res.status(429).json({ error: 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.' });
  }
  active.count += 1;
  publicRateWindows.set(key, active);
  next();
};
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of publicRateWindows.entries()) if (value.resetAt <= now) publicRateWindows.delete(key);
}, 60 * 60 * 1000).unref();

// Yapay zekâ isteklerini kullanıcı bazında sınırlıyoruz. Bu bellek içi sınır,
// tek sunucu çalıştıran mevcut Render kurulumu için yeterlidir; çoklu sunucuya
// geçildiğinde Redis gibi paylaşılan bir rate-limit deposuna taşınmalıdır.
const aiRateWindows = new Map();
const limitAiUsage = (scope, maxRequests, windowMs) => (req, res, next) => {
  const key = `${req.auth?.userId || 'anonymous'}:${scope}`;
  const now = Date.now();
  const current = aiRateWindows.get(key);
  const active = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  if (active.count >= maxRequests) {
    const minutes = Math.max(1, Math.ceil((active.resetAt - now) / 60000));
    return res.status(429).json({ error: `Bu özellik için kullanım sınırına ulaştınız. ${minutes} dakika sonra tekrar deneyin.` });
  }
  active.count += 1;
  aiRateWindows.set(key, active);
  next();
};
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of aiRateWindows.entries()) if (value.resetAt <= now) aiRateWindows.delete(key);
}, 60 * 60 * 1000).unref();

const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    date: { type: 'string' },
    kg: { type: 'number' },
    firma: { type: 'string' },
    fiyat: { type: 'number' },
    tahsilat: { type: 'number' },
    aciklama: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  },
  required: ['date', 'kg', 'firma', 'fiyat', 'tahsilat', 'aciklama', 'confidence']
};

const reportInsightSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
        required: ['title', 'detail']
      }
    },
    disclaimer: { type: 'string' }
  },
  required: ['summary', 'insights', 'disclaimer']
};

const runStructuredAi = async (name, schema, input) => {
  if (!openai) {
    const error = new Error('Yapay zekâ henüz etkin değil. Sunucunun OPENAI_API_KEY ayarını ekleyin.');
    error.status = 503;
    throw error;
  }
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input,
    text: { format: { type: 'json_schema', name, strict: true, schema } }
  });
  if (!response.output_text) throw new Error('Yapay zekâ yanıtı alınamadı.');
  return JSON.parse(response.output_text);
};

const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const yearFromDate = (value) => {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})[-./]/);
  if (iso) return Number(iso[1]);
  const tr = raw.match(/^\d{1,2}[-./]\d{1,2}[-./](\d{4})$/);
  if (tr) return Number(tr[1]);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
};

const idempotencyMiddleware = async (req, res, next) => {
  const key = String(req.headers['idempotency-key'] || '').trim();
  if (!key || !req.auth?.userId) return next();
  const identity = { userId: req.auth.userId, key, method: req.method, path: req.path };
  try {
    const existing = await IdempotencyRecord.findOne(identity).lean();
    if (existing) return res.status(existing.status).json(existing.body);
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        IdempotencyRecord.create({ ...identity, status: res.statusCode, body }).catch((error) => console.error('Idempotency kaydı yazılamadı:', error.message));
      }
      return originalJson(body);
    };
    next();
  } catch (error) {
    next(error);
  }
};

const buildUserFilter = (req) => {
  const auth = getAuthUser(req);
  if (!auth?.userId) return { _id: null };
  return { $or: [{ userId: auth.userId }, { userPhone: auth.phone }] };
};

// --- ROUTES ---

app.get('/api/health', (req, res) => res.json({ ok: true, version: '2026-08-11-secure-v1', service: 'cay-ureticisi-takip' }));

app.get('/', (req, res) => {
  res.send('🌱 Çay Takip Sistemi API Çalışıyor!');
});


// AUTH ROUTES
const issueTokens = async (profile) => {
  const accessToken = signAccessToken({
    userId: profile.userId,
    phone: profile.phone,
    role: profile.role,
    name: profile.name,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS
  });
  const refreshToken = makeRefreshToken();
  await Session.create({ tokenHash: hashRefreshToken(refreshToken), userId: profile.userId, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) });
  return { token: accessToken, refreshToken, userId: profile.userId, phone: profile.phone, name: profile.name, role: profile.role };
};

const findLegacyUser = async (phone) => {
  const checks = [
    () => Harvest.findOne({ userPhone: phone }).sort({ createdAt: -1 }),
    () => Expense.findOne({ userPhone: phone }).sort({ createdAt: -1 }),
    () => Garden.findOne({ userPhone: phone }).sort({ createdAt: -1 }),
    () => Payment.findOne({ userPhone: phone }).sort({ createdAt: -1 })
  ];
  for (const check of checks) {
    const doc = await check();
    if (doc) return doc;
  }
  return null;
};

app.post('/api/auth/login', limitPublicUsage('login', 10, 15 * 60 * 1000), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone || phone.length !== 11) return res.status(400).json({ error: 'Geçerli telefon numarası zorunludur.' });
    let profile = await UserProfile.findOne({ phone });
    if (!profile) {
      const legacy = await findLegacyUser(phone);
      if (!legacy) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
      const name = String(legacy.producerName || legacy.ureticici || legacy.uretici || legacy.name || 'Üretici').trim();
      profile = await UserProfile.create({ userId: `usr_${phone}`, phone, name: name || 'Üretici', role: phone === ADMIN_PHONE ? 'admin' : 'user' });
    }
    if (profile.active === false) return res.status(403).json({ error: 'Kullanıcı hesabı pasif durumda.' });
    const tokens = await issueTokens(profile);
    res.json(tokens);
  } catch (err) {
    console.error('AUTH LOGIN ERROR:', err);
    res.status(500).json({ error: 'Giriş yapılamadı.' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body.refreshToken || '');
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token gerekli.' });
    const session = await Session.findOne({ tokenHash: hashRefreshToken(refreshToken), revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ error: 'Refresh oturumu geçersiz veya süresi dolmuş.' });
    const profile = await UserProfile.findOne({ userId: session.userId });
    if (!profile) return res.status(401).json({ error: 'Kullanıcı profili bulunamadı.' });
    session.revokedAt = new Date();
    await session.save();
    res.json(await issueTokens(profile));
  } catch (err) {
    console.error('AUTH REFRESH ERROR:', err);
    res.status(500).json({ error: 'Oturum yenilenemedi.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const refreshToken = String(req.body.refreshToken || '');
    if (refreshToken) await Session.updateOne({ tokenHash: hashRefreshToken(refreshToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Çıkış yapılamadı.' }); }
});

// USER PROFILE ROUTES
app.get('/api/users/profile', requireAuth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.auth.userId });
    if (!profile) return res.status(404).json({ error: 'Üretici profili bulunamadı.' });
    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/profile', limitPublicUsage('profile', 10, 15 * 60 * 1000), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const name = String(req.body.name || '').trim();
    if (!phone || phone.length !== 11) return res.status(400).json({ error: 'Geçerli telefon numarası zorunludur.' });
    if (!name) return res.status(400).json({ error: 'Ad Soyad zorunludur.' });
    let profile = await UserProfile.findOne({ phone });
    if (profile && profile.name !== name) {
      profile.name = name;
      await profile.save();
    } else if (!profile) {
      profile = await UserProfile.create({ userId: `usr_${phone}`, phone, name, role: phone === ADMIN_PHONE ? 'admin' : 'user' });
    }
    res.json(await issueTokens(profile));
  } catch (err) {
    console.error('PROFILE ERROR:', err);
    res.status(500).json({ error: `Üretici profili kaydedilemedi: ${err.message}` });
  }
});

// Fiş görseli yalnızca bu istek boyunca bellekte tutulur; veritabanına veya diske yazılmaz.
// Modelin döndürdüğü alanlar, mobil uygulamada kullanıcı onayı olmadan kayıt oluşturmaz.
app.post('/api/receipts/analyze', requireAuth, uploadReceipt, limitAiUsage('receipt', 20, 24 * 60 * 60 * 1000), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Okunacak fiş fotoğrafı bulunamadı.' });

    const imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const extracted = await runStructuredAi('tea_receipt', receiptSchema, [{
      role: 'developer',
      content: 'Sen Türkiye’deki yaş çay alım fişlerinden alan çıkaran dikkatli bir asistansın. Sadece fişte açıkça görünen bilgileri çıkar. Tarihi YYYY-AA-GG formatına çevir. kg alanına yaş çay kilogramını, firma alanına alıcı/fabrika adını, fiyat alanına kilogram başına TL fiyatını, tahsilat alanına fişte açıkça ödenmiş TL tutarını yaz. Birim fiyat fişte yoksa ancak toplam tutar ve kilogram açıkça görünüyorsa hesaplayabilirsin. Görünmeyen metin alanlarını boş string, sayısal alanları 0 yap. Tahmin etme; fiş hasat fişi değilse tüm alanları boş/0 yap ve confidence low seç. Kişisel bilgileri çıkarma.'
    }, {
      role: 'user',
      content: [
        { type: 'input_text', text: 'Bu fişi incele ve hasat formu alanlarını döndür.' },
        { type: 'input_image', image_url: imageUrl, detail: 'high' }
      ]
    }]);

    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(String(extracted.date || '')) ? extracted.date : null;
    const fields = {
      date: validDate,
      kg: numeric(extracted.kg) > 0 ? numeric(extracted.kg) : null,
      firma: String(extracted.firma || '').trim() || null,
      fiyat: numeric(extracted.fiyat) > 0 ? numeric(extracted.fiyat) : null,
      tahsilat: numeric(extracted.tahsilat) > 0 ? numeric(extracted.tahsilat) : null,
      aciklama: String(extracted.aciklama || '').trim() || null
    };
    res.json({ fields, confidence: extracted.confidence });
  } catch (err) {
    console.error('RECEIPT ANALYZE ERROR:', err.message);
    res.status(err.status || 502).json({ error: err.status ? err.message : 'Fiş okunurken bir sorun oluştu. Fotoğrafı daha net çekip tekrar deneyin.' });
  } finally {
    if (req.file?.buffer) req.file.buffer.fill(0);
  }
});

app.post('/api/ai/report-insights', requireAuth, limitAiUsage('report', 12, 60 * 60 * 1000), async (req, res) => {
  try {
    const year = Number(req.body?.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return res.status(400).json({ error: 'Geçerli bir rapor yılı seçin.' });

    const filter = buildUserFilter(req);
    const [allHarvests, allExpenses] = await Promise.all([
      Harvest.find(filter).lean(),
      Expense.find(filter).lean()
    ]);
    const harvests = allHarvests.filter((item) => yearFromDate(item.tarih) === year);
    const expenses = allExpenses.filter((item) => yearFromDate(item.tarih) === year);
    const totalKg = harvests.reduce((sum, item) => sum + numeric(item.kg ?? item.weight), 0);
    const totalSales = harvests.reduce((sum, item) => sum + numeric(item.kg ?? item.weight) * numeric(item.fiyat), 0);
    const totalPaid = harvests.reduce((sum, item) => sum + numeric(item.tahsilat), 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + numeric(item.tutar), 0);
    const factories = new Map();
    harvests.forEach((item) => {
      const name = String(item.firma || 'Belirtilmeyen alıcı').trim();
      const current = factories.get(name) || { name, kg: 0, sales: 0 };
      current.kg += numeric(item.kg ?? item.weight);
      current.sales += numeric(item.kg ?? item.weight) * numeric(item.fiyat);
      factories.set(name, current);
    });
    const byFactory = [...factories.values()].sort((a, b) => b.kg - a.kg).slice(0, 5);

    const reportData = {
      year,
      harvestRecordCount: harvests.length,
      totalKg: Math.round(totalKg * 100) / 100,
      totalSales: Math.round(totalSales * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      receivable: Math.round(Math.max(0, totalSales - totalPaid) * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netAfterExpenses: Math.round((totalSales - totalExpenses) * 100) / 100,
      averageSalePrice: totalKg > 0 ? Math.round((totalSales / totalKg) * 100) / 100 : 0,
      factories: byFactory
    };

    const insight = await runStructuredAi('tea_report_insights', reportInsightSchema, [{
      role: 'developer',
      content: 'Sen çay üreticileri için sade Türkçe rapor yorumları hazırlayan bir asistansın. Yalnızca sana verilen sayısal özet veriden çıkarım yap; eksik veriyi uydurma. En fazla 3 kısa, uygulanabilir gözlem yaz. Finansal veya hukuki tavsiye verme; yorumların karar yerine geçmediğini belirt. Teknik terim kullanma ve üreticinin anlayacağı yalın Türkçe kullan.'
    }, {
      role: 'user',
      content: `Yıllık anonim çay üretim özeti: ${JSON.stringify(reportData)}`
    }]);
    res.json(insight);
  } catch (err) {
    console.error('AI REPORT ERROR:', err.message);
    res.status(err.status || 502).json({ error: err.status ? err.message : 'Yapay zekâ raporu hazırlanırken bir sorun oluştu.' });
  }
});

// HARVEST ROUTES
app.get('/api/harvests', requireAuth, async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);

    const data = await Harvest.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/harvests', requireAuth, idempotencyMiddleware, async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

    if (!userId && !userPhone) {
      return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });
    }

    const kgVal = Number(String(req.body.kg ?? req.body.weight ?? '').replace(',', '.'));
    const fiyatVal = Number(String(req.body.fiyat ?? '').replace(',', '.'));
    const tahsilatVal = Number(String(req.body.tahsilat ?? '0').replace(',', '.'));
    if (!Number.isFinite(kgVal) || kgVal <= 0) return res.status(400).json({ error: 'KG 0’dan büyük olmalıdır.' });
    if (!Number.isFinite(fiyatVal) || fiyatVal < 0) return res.status(400).json({ error: 'Geçerli bir fiyat girin.' });
    if (!Number.isFinite(tahsilatVal) || tahsilatVal < 0) return res.status(400).json({ error: 'Geçerli bir tahsilat girin.' });
    const toplam = kgVal * fiyatVal;
    if (tahsilatVal > toplam + 0.01) return res.status(400).json({ error: 'Tahsilat toplam satış tutarından fazla olamaz.' });
    const kalan = toplam - tahsilatVal;

    let durum = 'Bekliyor';
    if (kalan <= 0 && toplam > 0) durum = 'Ödendi';
    else if (tahsilatVal > 0) durum = 'Kısmi Ödendi';

    const payload = {
      ...req.body,
      userId: req.auth.userId,
      userPhone: req.auth.phone,
      kg: kgVal,
      weight: kgVal,
      fiyat: fiyatVal,
      tahsilat: tahsilatVal,
      toplamTutar: toplam,
      kalanBakiye: kalan,
      odemeDurumu: durum
    };

    const newHarvest = new Harvest(payload);
    await newHarvest.save();
    res.status(201).json(newHarvest);
  } catch (err) {
    console.error('Hasat Ekleme Hatası:', err);
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/harvests/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Harvest.findOne({ _id: req.params.id, $or: [{ userId: req.auth.userId }, { userPhone: req.auth.phone }] });
    if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı.' });

    const kgVal = Number(req.body.kg ?? req.body.weight ?? existing.kg) || 0;
    const fiyatVal = Number(req.body.fiyat ?? existing.fiyat) || 0;
    const tahsilatVal = Number(req.body.tahsilat ?? existing.tahsilat) || 0;
    const toplam = kgVal * fiyatVal;
    if (kgVal <= 0 || !Number.isFinite(kgVal)) return res.status(400).json({ error: 'KG 0’dan büyük olmalıdır.' });
    if (fiyatVal < 0 || !Number.isFinite(fiyatVal)) return res.status(400).json({ error: 'Geçerli bir fiyat girin.' });
    if (tahsilatVal < 0 || !Number.isFinite(tahsilatVal)) return res.status(400).json({ error: 'Geçerli bir tahsilat girin.' });
    if (tahsilatVal > toplam + 0.01) return res.status(400).json({ error: 'Tahsilat toplam satış tutarından fazla olamaz.' });
    const kalan = toplam - tahsilatVal;

    let durum = 'Bekliyor';
    if (kalan <= 0 && toplam > 0) durum = 'Ödendi';
    else if (tahsilatVal > 0) durum = 'Kısmi Ödendi';

    const updatePayload = {
      ...req.body,
      kg: kgVal,
      weight: kgVal,
      fiyat: fiyatVal,
      tahsilat: tahsilatVal,
      toplamTutar: toplam,
      kalanBakiye: kalan,
      odemeDurumu: durum
    };

    const updated = await Harvest.findByIdAndUpdate(req.params.id, updatePayload, { returnDocument: 'after' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/harvests/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await Harvest.findOneAndDelete({ _id: req.params.id, $or: [{ userId: req.auth.userId }, { userPhone: req.auth.phone }] });
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    // İlişkili ödemeleri de temizle
    await Payment.deleteMany({ harvestId: req.params.id });
    res.json({ message: 'Hasat kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- YENİ EKLENEN ÖZEL ROTALAR ---

// --- YENİ RAPOR VE TAKİP ROTALARI ---

// 1. Belirli satışa tahsilat ekle
app.post('/api/payments', requireAuth, idempotencyMiddleware, async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);
    const { harvestId, tutar, tarih, aciklama } = req.body;

    if (!harvestId) return res.status(400).json({ error: 'Tahsilat yapılacak satış seçilmedi.' });
    if (!mongoose.Types.ObjectId.isValid(harvestId)) {
      return res.status(400).json({ error: 'Seçilen satış kaydının kimliği geçersiz.' });
    }

    const ödemeTutar = Number(String(tutar ?? '').replace(',', '.'));
    if (!Number.isFinite(ödemeTutar) || ödemeTutar <= 0) {
      return res.status(400).json({ error: 'Geçerli ve 0’dan büyük bir tahsilat tutarı girin.' });
    }

    const harvest = await Harvest.findById(harvestId);
    if (!harvest) return res.status(404).json({ error: 'Seçilen satış kaydı bulunamadı.' });

    // Kullanıcının başka bir kaydına ödeme yazılmasını engelle
    if (harvest.userId && harvest.userId !== req.auth.userId) {
      return res.status(403).json({ error: 'Bu satış kaydına erişim yetkiniz yok.' });
    }
    if (harvest.userPhone && harvest.userPhone !== req.auth.phone) {
      return res.status(403).json({ error: 'Bu satış kaydına erişim yetkiniz yok.' });
    }

    const toplam = (Number(harvest.kg || harvest.weight) || 0) * (Number(harvest.fiyat) || 0);
    const mevcutTahsilat = Number(harvest.tahsilat) || 0;
    const kalan = toplam - mevcutTahsilat;

    if (kalan <= 0) return res.status(400).json({ error: 'Bu satışın borcu zaten kapanmış.' });
    if (ödemeTutar > kalan + 0.01) {
      return res.status(400).json({ error: `Tahsilat kalan borçtan fazla olamaz. Kalan: ${kalan.toFixed(2)} TL` });
    }

    const yeniTahsilat = mevcutTahsilat + ödemeTutar;
    harvest.tahsilat = yeniTahsilat;
    harvest.toplamTutar = toplam;
    harvest.kalanBakiye = Math.max(0, toplam - yeniTahsilat);
    harvest.odemeDurumu = harvest.kalanBakiye <= 0.01 ? 'Ödendi' : 'Kısmi Ödendi';
    await harvest.save();

    try {
      const newPayment = await Payment.create({
        userId: req.auth.userId,
        userPhone: req.auth.phone,
        harvestId,
        tarih: tarih || new Date().toISOString().split('T')[0],
        tutar: ödemeTutar,
        aciklama: aciklama || ''
      });
      return res.status(201).json({ message: 'Tahsilat başarıyla kaydedildi.', harvest, payment: newPayment });
    } catch (paymentError) {
      // Tahsilat geçmişi yazılamazsa satış bakiyesini geri al
      harvest.tahsilat = mevcutTahsilat;
      harvest.kalanBakiye = kalan;
      harvest.odemeDurumu = mevcutTahsilat > 0 ? 'Kısmi Ödendi' : 'Bekliyor';
      await harvest.save();
      throw paymentError;
    }
  } catch (err) {
    console.error('Tahsilat Kaydetme Hatası:', err);
    res.status(500).json({ error: `Tahsilat kaydedilemedi: ${err.message}` });
  }
});

// 2. BAHÇELERE GÖRE TOPLAM KG VE KAZANÇ ÖZETİ
app.get('/api/gardens/summary', requireAuth, async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);

    const summary = await Harvest.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$bahce",
          toplamKg: { $sum: { $ifNull: ["$kg", "$weight"] } },
          toplamKazanc: { $sum: { $multiply: [{ $ifNull: ["$kg", "$weight"] }, { $ifNull: ["$fiyat", 0] }] } },
          toplamTahsilat: { $sum: { $ifNull: ["$tahsilat", 0] } },
          toplamKayıt: { $sum: 1 }
        }
      },
      { $sort: { toplamKg: -1 } }
    ]);

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. VADELİ SATIŞLAR VE BEKLENEN ALACAK RAPORU
app.get('/api/reports/receivables', requireAuth, async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json({ toplamAlacak: 0, detaylar: [] });

    // Bakiyesi kalan tüm satışlar
    const query = {
      ...filter,
      $expr: {
        $gt: [
          { $subtract: [{ $multiply: [{ $ifNull: ["$kg", "$weight"] }, { $ifNull: ["$fiyat", 0] }] }, { $ifNull: ["$tahsilat", 0] }] },
          0
        ]
      }
    };

    const pendingHarvests = await Harvest.find(query).sort({ vadeTarihi: 1, tarih: 1 });

    const detaylar = pendingHarvests.map(h => {
      const toplam = (h.kg || h.weight || 0) * (h.fiyat || 0);
      const kalan = toplam - (h.tahsilat || 0);
      return {
        _id: h._id,
        tarih: h.tarih,
        surum: h.surum,
        firma: h.firma,
        bahce: h.bahce,
        kg: h.kg || h.weight,
        fiyat: h.fiyat,
        toplamTutar: toplam,
        tahsilat: h.tahsilat || 0,
        kalanAlacak: kalan,
        isVadeli: h.isVadeli,
        vadeTarihi: h.vadeTarihi || 'Belirtilmedi',
        odemeDurumu: h.odemeDurumu
      };
    });

    const toplamAlacak = detaylar.reduce((acc, curr) => acc + curr.kalanAlacak, 0);

    res.json({
      toplamAlacak,
      toplamKayıt: detaylar.length,
      detaylar
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. FABRİKA ÇAY FİYATLARI / FİYAT POLİTİKASI
app.get('/api/factory-prices', requireAuth, async (req, res) => {
  try {
    const data = await FactoryPrice.find().sort({ firma: 1, tarih: -1, createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/factory-prices', requireAuth, requireAdmin, idempotencyMiddleware, async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);
    if (!userId && !userPhone) return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });

    const firma = String(req.body.firma || '').trim();
    const fiyat = Number(String(req.body.fiyat ?? '').replace(',', '.'));
    const tarihRaw = String(req.body.tarih || '').trim();
    const tarihMatch = tarihRaw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    const tarih = tarihMatch ? `${tarihMatch[3]}-${tarihMatch[2].padStart(2,'0')}-${tarihMatch[1].padStart(2,'0')}` : tarihRaw;
    const gecerlilikRaw = String(req.body.gecerlilikBaslangic || '').trim();
    const gecerlilikMatch = gecerlilikRaw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    const gecerlilikBaslangic = gecerlilikMatch ? `${gecerlilikMatch[3]}-${gecerlilikMatch[2].padStart(2,'0')}-${gecerlilikMatch[1].padStart(2,'0')}` : gecerlilikRaw;
    const fiyatTuru = ['Haftalık','Aylık','Peşin','Vadeli','Diğer'].includes(String(req.body.fiyatTuru)) ? String(req.body.fiyatTuru) : 'Peşin';
    const vadeGun = Number(req.body.vadeGun) || 0;

    if (!firma) return res.status(400).json({ error: 'Fabrika adı zorunludur.' });
    if (!Number.isFinite(fiyat) || fiyat < 0) return res.status(400).json({ error: 'Geçerli bir fiyat girin.' });
    if (!tarih) return res.status(400).json({ error: 'Fiyat tarihi zorunludur.' });

    const item = await FactoryPrice.create({
      ...req.body,
      firma, fiyat, tarih,
      userId: req.auth.userId,
      userPhone: req.auth.phone
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/factory-prices/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const deleted = await FactoryPrice.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Fiyat kaydı bulunamadı.' });
    res.json({ message: 'Fiyat kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. REKLAM ALANLARI
app.get('/api/ads', requireAuth, async (req, res) => {
  try {
    const data = await Ad.find({ aktif: true }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ads', requireAuth, requireAdmin, idempotencyMiddleware, async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);
    if (!userId && !userPhone) return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });

    const firma = String(req.body.firma || '').trim();
    if (!firma) return res.status(400).json({ error: 'Reklam veren firma adı zorunludur.' });

    const item = await Ad.create({
      ...req.body,
      firma,
      userId: req.auth.userId,
      userPhone: req.auth.phone
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/ads/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const deleted = await Ad.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Reklam bulunamadı.' });
    res.json({ message: 'Reklam silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EXPENSE ROUTES
app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);

    const data = await Expense.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', requireAuth, idempotencyMiddleware, async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

    if (!userId && !userPhone) {
      return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });
    }

    const payload = {
      ...req.body,
      userId: req.auth.userId,
      userPhone: req.auth.phone,
      tutar: Number(req.body.tutar) || 0
    };

    const newExpense = new Expense(payload);
    await newExpense.save();
    res.status(201).json(newExpense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await Expense.findOneAndDelete({ _id: req.params.id, $or: [{ userId: req.auth.userId }, { userPhone: req.auth.phone }] });
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ message: 'Gider kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GARDEN ROUTES
app.get('/api/gardens', requireAuth, async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);

    const data = await Garden.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gardens', requireAuth, idempotencyMiddleware, async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

    if (!userId && !userPhone) {
      return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });
    }

    const payload = {
      ...req.body,
      userId: req.auth.userId,
      userPhone: req.auth.phone
    };

    const newGarden = new Garden(payload);
    await newGarden.save();
    res.status(201).json(newGarden);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/gardens/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await Garden.findOneAndDelete({ _id: req.params.id, $or: [{ userId: req.auth.userId }, { userPhone: req.auth.phone }] });
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ message: 'Bahçe kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN ROUTES
// ADMIN / PRODUCER MANAGEMENT
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await UserProfile.find().sort({ name: 1 }).lean();
    const [harvests, payments] = await Promise.all([Harvest.find().lean(), Payment.find().lean()]);
    const summary = users.map(u => {
      const hs = harvests.filter(h => h.userId === u.userId || h.userPhone === u.phone);
      const ps = payments.filter(p => p.userId === u.userId || p.userPhone === u.phone);
      const totalKg = hs.reduce((s,h)=>s+(Number(h.kg)||0),0);
      const totalSales = hs.reduce((s,h)=>s+(Number(h.toplamTutar)||((Number(h.kg)||0)*(Number(h.fiyat)||0))),0);
      const totalPaid = hs.reduce((s,h)=>s+(Number(h.tahsilat)||0),0) + ps.reduce((s,p)=>s+(Number(p.tutar)||0),0);
      return { ...u, totalKg, totalSales, totalPaid, remaining: Math.max(0,totalSales-totalPaid), harvestCount: hs.length };
    });
    res.json(summary);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/users/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const active = Boolean(req.body.active);
    const user = await UserProfile.findOneAndUpdate({ _id: req.params.id }, { $set: { active } }, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ error: 'Üretici bulunamadı.' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/backup', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [users, harvests, payments, expenses, gardens, factoryPrices, ads] = await Promise.all([
      UserProfile.find().lean(), Harvest.find().lean(), Payment.find().lean(), Expense.find().lean(), Garden.find().lean(), FactoryPrice.find().lean(), Ad.find().lean()
    ]);
    res.json({ version: 'V16.6', exportedAt: new Date().toISOString(), users, harvests, payments, expenses, gardens, factoryPrices, ads });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/restore', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const models = [
      [UserProfile, body.users], [Harvest, body.harvests], [Payment, body.payments], [Expense, body.expenses], [Garden, body.gardens], [FactoryPrice, body.factoryPrices], [Ad, body.ads]
    ];
    let restored = 0;
    for (const [Model, rows] of models) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const copy = { ...row }; delete copy._id; delete copy.__v;
        try { await Model.create(copy); restored++; } catch {}
      }
    }
    res.json({ ok: true, restored });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/all-data', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [harvests, expenses, gardens, factoryPrices, ads] = await Promise.all([
      Harvest.find().sort({ createdAt: -1 }),
      Expense.find().sort({ createdAt: -1 }),
      Garden.find().sort({ createdAt: -1 }),
      FactoryPrice.find().sort({ tarih: -1 }),
      Ad.find().sort({ createdAt: -1 })
    ]);
    res.json({ harvests, expenses, gardens, factoryPrices, ads });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


const runAutomaticBackup = async () => {
  try {
    const dir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const [users, harvests, payments, expenses, gardens, factoryPrices, ads] = await Promise.all([
      UserProfile.find().lean(), Harvest.find().lean(), Payment.find().lean(), Expense.find().lean(), Garden.find().lean(), FactoryPrice.find().lean(), Ad.find().lean()
    ]);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `cay-takip-${stamp}.json`), JSON.stringify({ version:'V16.6', exportedAt:new Date().toISOString(), users, harvests, payments, expenses, gardens, factoryPrices, ads }));
    console.log('💾 Otomatik yedek oluşturuldu.');
  } catch (err) { console.error('Otomatik yedek hatası:', err.message); }
};
setTimeout(runAutomaticBackup, 15000);
setInterval(runAutomaticBackup, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda dinleniyor...`));
