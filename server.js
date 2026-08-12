require('dotenv').config(); // .env dosyasındaki değişkenleri yükler
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
const isProduction = process.env.NODE_ENV === 'production';
const APP_NAME = process.env.APP_NAME || 'Çaylık';
const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || '').trim();
const ADMIN_PHONE_RAW = process.env.ADMIN_PHONE || '';
const normalizePhone = (value) => {
  let p = String(value || '').replace(/\D/g, '');
  if (p.startsWith('90')) p = '0' + p.slice(2);
  if (p.length === 10 && p.startsWith('5')) p = '0' + p;
  return p;
};
const normalizeCalendarDate = (value) => {
  const raw = String(value || '').trim();
  const tr = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  const iso = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  const year = Number(tr?.[3] || iso?.[1]);
  const month = Number(tr?.[2] || iso?.[2]);
  const day = Number(tr?.[1] || iso?.[3]);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const todayServerDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const ADMIN_PHONE = normalizePhone(ADMIN_PHONE_RAW);
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'development-only-change-me');
// OTP, NetGSM hesabı ve gönderici adı hazır olduğunda Render'da açıkça true yapılır.
// Böylece eksik üçüncü taraf hesabı yeni dağıtımı çalışmaz hâle getirmez.
const AUTH_REQUIRE_OTP = process.env.AUTH_REQUIRE_OTP === 'true';
// İlk sürümden kalan belirli bir hesabın 6 haneli şifre oluşturabilmesi için
// kısa süreliğine açılır. Kullanımdan hemen sonra tekrar false yapılmalıdır.
const AUTH_ALLOW_PIN_MIGRATION = process.env.AUTH_ALLOW_PIN_MIGRATION === 'true';
const PIN_MIGRATION_PHONE = normalizePhone(process.env.PIN_MIGRATION_PHONE || '');
const OTP_SECRET = process.env.OTP_SECRET || JWT_SECRET;
const NETGSM_USERCODE = String(process.env.NETGSM_USERCODE || '').trim();
const NETGSM_PASSWORD = String(process.env.NETGSM_PASSWORD || '').trim();
const NETGSM_HEADER = String(process.env.NETGSM_HEADER || '').trim();
const BACKUP_WEBHOOK_URL = String(process.env.BACKUP_WEBHOOK_URL || '').trim();
const BACKUP_ENCRYPTION_KEY = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();

if (isProduction) {
  if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET üretimde en az 32 karakter olmalıdır.');
  if (!ADMIN_PHONE) throw new Error('ADMIN_PHONE üretimde zorunludur.');
  if (AUTH_REQUIRE_OTP && (!NETGSM_USERCODE || !NETGSM_PASSWORD || !NETGSM_HEADER || OTP_SECRET.length < 32)) {
    throw new Error('OTP etkinleştirilmiş üretim ortamında NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER ve en az 32 karakterlik OTP_SECRET zorunludur.');
  }
  if (BACKUP_WEBHOOK_URL && BACKUP_ENCRYPTION_KEY.length < 32) {
    throw new Error('BACKUP_WEBHOOK_URL kullanılırken BACKUP_ENCRYPTION_KEY en az 32 karakter olmalıdır.');
  }
  if (!AUTH_REQUIRE_OTP) console.warn('UYARI: AUTH_REQUIRE_OTP=false. Herkese açık yayın öncesinde SMS doğrulamayı etkinleştirin.');
  if (AUTH_ALLOW_PIN_MIGRATION) console.warn('UYARI: AUTH_ALLOW_PIN_MIGRATION=true. Geçiş şifresi oluşturulduktan sonra bu değeri false yapın.');
}

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
const normalizePin = (value) => String(value || '').replace(/\D/g, '');
const isValidPin = (pin) => /^\d{6}$/.test(pin);
const hashPin = (pin, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => {
  crypto.scrypt(pin, salt, 64, (error, derivedKey) => {
    if (error) reject(error);
    else resolve({ salt, hash: derivedKey.toString('hex') });
  });
});
const verifyPin = async (profile, pin) => {
  if (!profile?.pinHash || !profile?.pinSalt || !isValidPin(pin)) return false;
  const { hash } = await hashPin(pin, profile.pinSalt);
  const expected = Buffer.from(profile.pinHash, 'hex');
  const supplied = Buffer.from(hash, 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};
const hashOtp = (phone, purpose, code) => crypto.createHmac('sha256', OTP_SECRET).update(`${phone}:${purpose}:${code}`).digest('hex');
const createOtpCode = () => String(crypto.randomInt(100000, 1000000));
const toNetgsmPhone = (phone) => normalizePhone(phone).replace(/^0/, '');

const sendOtpSms = async (phone, code) => {
  if (!NETGSM_USERCODE || !NETGSM_PASSWORD || !NETGSM_HEADER) {
    throw new Error('SMS doğrulama servisi henüz yapılandırılmadı.');
  }
  const response = await fetch('https://api.netgsm.com.tr/sms/rest/v2/otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NETGSM_USERCODE}:${NETGSM_PASSWORD}`).toString('base64')}`
    },
    body: JSON.stringify({
      msgheader: NETGSM_HEADER,
      msg: `${APP_NAME} dogrulama kodunuz: ${code}. Bu kodu kimseyle paylasmayin.`,
      no: toNetgsmPhone(phone),
      appname: 'CayUreticisi'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.code !== '00') {
    console.error('NETGSM OTP ERROR:', response.status, data?.code || 'unknown', data?.description || '');
    throw new Error('Doğrulama kodu gönderilemedi. Lütfen biraz sonra tekrar deneyin.');
  }
};

const createEncryptedBackup = (payload) => {
  if (!BACKUP_ENCRYPTION_KEY) return null;
  const key = crypto.createHash('sha256').update(BACKUP_ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  });
};

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
HarvestSchema.index({ userId: 1, createdAt: -1 });
HarvestSchema.index({ userPhone: 1, createdAt: -1 });

// Tahsilat Geçmişi Kaydı (Hangi hasada ne kadar ödeme yapıldı?)
const PaymentSchema = new mongoose.Schema({
  userId: String,
  userPhone: String,
  harvestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Harvest', required: true },
  tarih: String,
  tutar: Number,
  aciklama: String
}, { timestamps: true });
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ userPhone: 1, createdAt: -1 });

const ExpenseSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  userPhone: { type: String, required: false },
  tarih: String,
  kategori: String,
  aciklama: String,
  tutar: Number
}, { timestamps: true });
ExpenseSchema.index({ userId: 1, createdAt: -1 });
ExpenseSchema.index({ userPhone: 1, createdAt: -1 });

const GardenSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  userPhone: { type: String, required: false },
  name: String,
  adaParsel: String,
  alan: String
}, { timestamps: true });
GardenSchema.index({ userId: 1, createdAt: -1 });
GardenSchema.index({ userPhone: 1, createdAt: -1 });


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
  pinHash: { type: String, select: false },
  pinSalt: { type: String, select: false },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const SessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null }
}, { timestamps: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Session = mongoose.model('Session', SessionSchema);

const OtpChallengeSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  purpose: { type: String, enum: ['login', 'register'], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null }
}, { timestamps: true });
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const OtpChallenge = mongoose.model('OtpChallenge', OtpChallengeSchema);

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

const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

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

app.get('/api/health', (req, res) => res.json({ ok: true, version: '2026-08-12-pin-migration-v3', service: 'cay-ureticisi-takip' }));

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
    const pin = normalizePin(req.body.pin);
    if (!phone || phone.length !== 11) return res.status(400).json({ error: 'Geçerli telefon numarası zorunludur.' });
    if (AUTH_REQUIRE_OTP) return res.status(403).json({ error: 'SMS doğrulaması gereklidir.', code: 'OTP_REQUIRED' });
    if (!isValidPin(pin)) return res.status(400).json({ error: '6 haneli giriş şifrenizi girin.' });
    const profile = await UserProfile.findOne({ phone }).select('+pinHash +pinSalt');
    if (!profile) {
      const legacy = await findLegacyUser(phone);
      if (legacy) return res.status(409).json({ error: 'Bu eski hesap için önce oturumun açık olduğu cihazdan giriş şifresi oluşturun.', code: 'PIN_SETUP_REQUIRED' });
      return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    }
    if (profile.active === false) return res.status(403).json({ error: 'Kullanıcı hesabı pasif durumda.' });
    if (!profile.pinHash || !profile.pinSalt) return res.status(409).json({ error: 'Bu hesap için giriş şifresi henüz oluşturulmamış. Oturumun açık olduğu cihazdan Ayarlar ekranını açın.', code: 'PIN_SETUP_REQUIRED' });
    if (!await verifyPin(profile, pin)) return res.status(401).json({ error: 'Telefon numarası veya giriş şifresi hatalı.' });
    const tokens = await issueTokens(profile);
    res.json(tokens);
  } catch (err) {
    console.error('AUTH LOGIN ERROR:', err);
    res.status(500).json({ error: 'Giriş yapılamadı.' });
  }
});

app.post('/api/auth/request-otp', limitPublicUsage('otp-request', 3, 15 * 60 * 1000), async (req, res) => {
  try {
    if (!AUTH_REQUIRE_OTP) return res.status(400).json({ error: 'SMS doğrulaması bu ortamda etkin değil.' });
    const phone = normalizePhone(req.body.phone);
    const purpose = req.body.purpose === 'register' ? 'register' : 'login';
    if (!phone || phone.length !== 11) return res.status(400).json({ error: 'Geçerli telefon numarası zorunludur.' });
    const profile = await UserProfile.findOne({ phone });
    if (purpose === 'login' && !profile) {
      const legacy = await findLegacyUser(phone);
      if (!legacy) return res.status(404).json({ error: 'Bu telefon numarasıyla kayıt bulunamadı.' });
    }
    if (profile?.active === false) return res.status(403).json({ error: 'Kullanıcı hesabı pasif durumda.' });
    const code = createOtpCode();
    await OtpChallenge.deleteMany({ phone, purpose, consumedAt: null });
    await sendOtpSms(phone, code);
    await OtpChallenge.create({
      phone,
      purpose,
      codeHash: hashOtp(phone, purpose, code),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    res.json({ ok: true, expiresInSeconds: 300 });
  } catch (err) {
    console.error('OTP REQUEST ERROR:', err.message);
    res.status(503).json({ error: err.message || 'Doğrulama kodu gönderilemedi.' });
  }
});

app.post('/api/auth/verify-otp', limitPublicUsage('otp-verify', 10, 15 * 60 * 1000), async (req, res) => {
  try {
    if (!AUTH_REQUIRE_OTP) return res.status(400).json({ error: 'SMS doğrulaması bu ortamda etkin değil.' });
    const phone = normalizePhone(req.body.phone);
    const purpose = req.body.purpose === 'register' ? 'register' : 'login';
    const code = String(req.body.code || '').replace(/\D/g, '');
    const name = String(req.body.name || '').trim();
    if (!phone || phone.length !== 11 || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Telefon numarası ve 6 haneli kod zorunludur.' });
    if (purpose === 'register' && !name) return res.status(400).json({ error: 'Kayıt için Ad Soyad zorunludur.' });
    const challenge = await OtpChallenge.findOne({ phone, purpose, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!challenge) return res.status(400).json({ error: 'Kodun süresi dolmuş. Yeni kod isteyin.' });
    if (challenge.attempts >= 5) return res.status(429).json({ error: 'Çok fazla hatalı deneme yapıldı. Yeni kod isteyin.' });
    const suppliedHash = Buffer.from(hashOtp(phone, purpose, code));
    const storedHash = Buffer.from(challenge.codeHash);
    if (suppliedHash.length !== storedHash.length || !crypto.timingSafeEqual(suppliedHash, storedHash)) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(400).json({ error: 'Doğrulama kodu hatalı.' });
    }
    challenge.consumedAt = new Date();
    await challenge.save();
    let profile = await UserProfile.findOne({ phone });
    if (purpose === 'login' && !profile) {
      const legacy = await findLegacyUser(phone);
      if (!legacy) return res.status(404).json({ error: 'Bu telefon numarasıyla kayıt bulunamadı.' });
      const legacyName = String(legacy.producerName || legacy.ureticici || legacy.uretici || legacy.name || 'Üretici').trim();
      profile = await UserProfile.create({ userId: `usr_${phone}`, phone, name: legacyName || 'Üretici', role: phone === ADMIN_PHONE ? 'admin' : 'user' });
    }
    if (!profile) profile = await UserProfile.create({ userId: `usr_${phone}`, phone, name, role: phone === ADMIN_PHONE ? 'admin' : 'user' });
    if (profile.active === false) return res.status(403).json({ error: 'Kullanıcı hesabı pasif durumda.' });
    res.json(await issueTokens(profile));
  } catch (err) {
    console.error('OTP VERIFY ERROR:', err.message);
    res.status(500).json({ error: 'Doğrulama tamamlanamadı.' });
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

app.get('/api/legal/privacy', (req, res) => {
  res.json({
    title: `${APP_NAME} Gizlilik Politikası`,
    updatedAt: '2026-08-12',
    contactEmail: SUPPORT_EMAIL || 'Destek e-posta adresi henüz tanımlanmadı.',
    sections: [
      { heading: 'Toplanan bilgiler', body: 'Ad Soyad, telefon numarası, hasat, ödeme, gider, bahçe ve uygulamada oluşturduğunuz kayıtlar hesabınızı sunmak için işlenir.' },
      { heading: 'Kullanım amacı', body: 'Bilgiler hasat ve alacak takibi, raporlama, oturum güvenliği ve destek taleplerini yanıtlamak için kullanılır.' },
      { heading: 'Saklama ve güvenlik', body: 'Oturum bilgileri cihazda güvenli depoda tutulur; çevrimdışı kullanım için kayıtların geçici bir kopyası cihazda saklanabilir. Sunucu iletişimi HTTPS üzerinden yapılır. Veriler üçüncü taraflara satılmaz.' },
      { heading: 'Saklama süresi', body: 'Hesabınız aktif olduğu sürece kayıtlarınız saklanır. Hesap silme talebinde hesap ve ilişkili kayıtlar silinir; yasal saklama zorunlulukları varsa yalnızca gerekli süre boyunca tutulabilir.' },
      { heading: 'Haklarınız', body: 'Bilgilerinize erişme, düzeltme ve hesabınızı silme talebinde bulunabilirsiniz. Hesap silme işlemi uygulama içinden veya destek e-postası yoluyla başlatılabilir.' }
    ]
  });
});

app.get('/privacy', (req, res) => {
  const email = SUPPORT_EMAIL || 'uygulama içindeki Ayarlar ve Gizlilik ekranı';
  res.type('html').send(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME} Gizlilik Politikası</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#183A2A;line-height:1.6}h1,h2{color:#1F513D}a{color:#246548}</style></head><body><h1>${APP_NAME} Gizlilik Politikası</h1><p>Son güncelleme: 12 Ağustos 2026</p><h2>Toplanan bilgiler</h2><p>Ad Soyad, telefon numarası, hasat, ödeme, gider, bahçe ve uygulamada oluşturduğunuz kayıtlar hesabınızı sunmak için işlenir.</p><h2>Kullanım amacı</h2><p>Bilgiler hasat ve alacak takibi, raporlama, oturum güvenliği ve destek taleplerini yanıtlamak için kullanılır. Veriler üçüncü taraflara satılmaz.</p><h2>Saklama ve güvenlik</h2><p>Oturum bilgileri cihazda güvenli depoda tutulur. Çevrimdışı kullanım için kayıtların geçici bir kopyası cihazda saklanabilir. Sunucu iletişimi HTTPS üzerinden yapılır. Hesap silindiğinde bu cihaz içi kopya ile sunucudaki ilişkili kayıtlar silinir; yasal saklama zorunluluğu varsa yalnızca gerekli süre boyunca tutulabilir.</p><h2>Hesap silme</h2><p>Uygulama içindeki Ayarlar ve Gizlilik ekranından hesabınızı kalıcı olarak silebilirsiniz. Uygulamaya erişemiyorsanız silme talebinizi ${email.includes('@') ? `<a href="mailto:${email}">${email}</a>` : email} üzerinden başlatabilirsiniz.</p></body></html>`);
});

app.get('/delete-account', (req, res) => {
  const email = SUPPORT_EMAIL || 'uygulama içindeki Ayarlar ve Gizlilik ekranı';
  res.type('html').send(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME} Hesap Silme</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#183A2A;line-height:1.6}h1{color:#9F3030}a{color:#246548}</style></head><body><h1>Hesap silme</h1><p>Hesabınızı uygulama içindeki <strong>Ayarlar ve Gizlilik</strong> ekranından silebilirsiniz. Bu işlem hasat, ödeme, gider ve bahçe kayıtlarınızı kalıcı olarak siler.</p><p>Uygulamaya erişemiyorsanız talebinizi ${email.includes('@') ? `<a href="mailto:${email}">${email}</a>` : email} üzerinden başlatabilirsiniz.</p><p><a href="/privacy">Gizlilik politikasını görüntüle</a></p></body></html>`);
});

// USER PROFILE ROUTES
app.get('/api/users/profile', requireAuth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.auth.userId });
    if (!profile) return res.status(404).json({ error: 'Üretici profili bulunamadı.' });
    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/me', requireAuth, async (req, res) => {
  try {
    const auth = req.auth;
    await Promise.all([
      Harvest.deleteMany({ $or: [{ userId: auth.userId }, { userPhone: auth.phone }] }),
      Payment.deleteMany({ $or: [{ userId: auth.userId }, { userPhone: auth.phone }] }),
      Expense.deleteMany({ $or: [{ userId: auth.userId }, { userPhone: auth.phone }] }),
      Garden.deleteMany({ $or: [{ userId: auth.userId }, { userPhone: auth.phone }] }),
      Session.deleteMany({ userId: auth.userId }),
      IdempotencyRecord.deleteMany({ userId: auth.userId }),
      OtpChallenge.deleteMany({ phone: auth.phone }),
      UserProfile.deleteOne({ userId: auth.userId })
    ]);
    res.json({ ok: true, message: 'Hesabınız ve ilişkili kayıtlarınız silindi.' });
  } catch (err) {
    console.error('ACCOUNT DELETE ERROR:', err.message);
    res.status(500).json({ error: 'Hesap silinemedi. Lütfen destek ile iletişime geçin.' });
  }
});

app.post('/api/users/profile', limitPublicUsage('profile', 10, 15 * 60 * 1000), async (req, res) => {
  try {
    if (AUTH_REQUIRE_OTP) return res.status(403).json({ error: 'SMS doğrulaması gereklidir.', code: 'OTP_REQUIRED' });
    const phone = normalizePhone(req.body.phone);
    const name = String(req.body.name || '').trim();
    const pin = normalizePin(req.body.pin);
    if (!phone || phone.length !== 11) return res.status(400).json({ error: 'Geçerli telefon numarası zorunludur.' });
    if (!name) return res.status(400).json({ error: 'Ad Soyad zorunludur.' });
    if (!isValidPin(pin)) return res.status(400).json({ error: 'Giriş şifresi 6 haneli olmalıdır.' });
    const existing = await UserProfile.findOne({ phone }).select('+pinHash +pinSalt');
    const canMigratePin = AUTH_ALLOW_PIN_MIGRATION && Boolean(PIN_MIGRATION_PHONE) && phone === PIN_MIGRATION_PHONE;
    const migrationError = () => {
      if (!AUTH_ALLOW_PIN_MIGRATION) return { error: 'Eski hesap için şifre geçişi etkin değil.', code: 'PIN_MIGRATION_DISABLED' };
      if (!PIN_MIGRATION_PHONE) return { error: 'Şifre geçişi için Render’da PIN_MIGRATION_PHONE tanımlanmalı.', code: 'PIN_MIGRATION_PHONE_REQUIRED' };
      return { error: 'Bu telefon numarası geçici şifre geçişi için yetkili değil.', code: 'PIN_MIGRATION_PHONE_MISMATCH' };
    };
    if (existing) {
      if (existing.pinHash || existing.pinSalt) return res.status(409).json({ error: 'Bu telefon numarasıyla zaten kayıtlı bir hesap var. Giriş yapın.', code: 'ACCOUNT_EXISTS' });
      if (!canMigratePin) return res.status(409).json(migrationError());
      const { salt, hash } = await hashPin(pin);
      existing.pinSalt = salt;
      existing.pinHash = hash;
      await existing.save();
      return res.json(await issueTokens(existing));
    }
    const legacy = await findLegacyUser(phone);
    if (legacy && !canMigratePin) return res.status(409).json(migrationError());
    const { salt, hash } = await hashPin(pin);
    const legacyName = legacy ? String(legacy.producerName || legacy.ureticici || legacy.uretici || legacy.name || '').trim() : '';
    const profile = await UserProfile.create({ userId: `usr_${phone}`, phone, name: legacyName || name, pinSalt: salt, pinHash: hash, role: phone === ADMIN_PHONE ? 'admin' : 'user' });
    res.json(await issueTokens(profile));
  } catch (err) {
    console.error('PROFILE ERROR:', err);
    res.status(500).json({ error: `Üretici profili kaydedilemedi: ${err.message}` });
  }
});

app.put('/api/users/me/pin', requireAuth, limitPublicUsage('pin-change', 5, 15 * 60 * 1000), async (req, res) => {
  try {
    const newPin = normalizePin(req.body.newPin);
    const currentPin = normalizePin(req.body.currentPin);
    if (!isValidPin(newPin)) return res.status(400).json({ error: 'Yeni giriş şifresi 6 haneli olmalıdır.' });
    const profile = await UserProfile.findOne({ userId: req.auth.userId }).select('+pinHash +pinSalt');
    if (!profile) return res.status(404).json({ error: 'Üretici profili bulunamadı.' });
    if (profile.pinHash && !await verifyPin(profile, currentPin)) return res.status(401).json({ error: 'Mevcut giriş şifresi hatalı.' });
    const { salt, hash } = await hashPin(newPin);
    profile.pinSalt = salt;
    profile.pinHash = hash;
    await profile.save();
    await Session.deleteMany({ userId: profile.userId });
    res.json(await issueTokens(profile));
  } catch (err) {
    console.error('PIN CHANGE ERROR:', err.message);
    res.status(500).json({ error: 'Giriş şifresi güncellenemedi.' });
  }
});

// HARVEST ROUTES
app.get('/api/harvests', requireAuth, async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 200;
    const before = String(req.query.before || '').trim();
    if (before && mongoose.Types.ObjectId.isValid(before)) filter._id = { $lt: new mongoose.Types.ObjectId(before) };
    const data = await Harvest.find(filter).sort({ _id: -1 }).limit(limit);
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
    const tarih = normalizeCalendarDate(req.body.tarih) || (req.body.tarih ? '' : todayServerDate());
    const isVadeli = req.body.isVadeli === true || req.body.isVadeli === 'true';
    const vadeTarihi = isVadeli ? normalizeCalendarDate(req.body.vadeTarihi) : '';
    if (!Number.isFinite(kgVal) || kgVal <= 0) return res.status(400).json({ error: 'KG 0’dan büyük olmalıdır.' });
    if (!Number.isFinite(fiyatVal) || fiyatVal < 0) return res.status(400).json({ error: 'Geçerli bir fiyat girin.' });
    if (!Number.isFinite(tahsilatVal) || tahsilatVal < 0) return res.status(400).json({ error: 'Geçerli bir tahsilat girin.' });
    if (!tarih) return res.status(400).json({ error: 'Tarih GG.AA.YYYY biçiminde geçerli olmalıdır.' });
    if (isVadeli && !vadeTarihi) return res.status(400).json({ error: 'Vade tarihi GG.AA.YYYY biçiminde geçerli olmalıdır.' });
    const toplam = kgVal * fiyatVal;
    if (tahsilatVal > toplam + 0.01) return res.status(400).json({ error: 'Tahsilat toplam satış tutarından fazla olamaz.' });
    const kalan = toplam - tahsilatVal;

    let durum = 'Bekliyor';
    if (kalan <= 0 && toplam > 0) durum = 'Ödendi';
    else if (tahsilatVal > 0) durum = 'Kısmi Ödendi';

    const payload = {
      userId: req.auth.userId,
      userPhone: req.auth.phone,
      tarih,
      surum: String(req.body.surum || '1. Sürüm').trim(),
      uretici: String(req.body.uretici || req.body.producerName || '').trim(),
      producerName: String(req.body.producerName || req.body.uretici || '').trim(),
      kg: kgVal,
      weight: kgVal,
      firma: String(req.body.firma || '').trim(),
      fiyat: fiyatVal,
      tahsilat: tahsilatVal,
      aciklama: String(req.body.aciklama || '').trim(),
      bahce: String(req.body.bahce || req.body.garden || '').trim(),
      isVadeli,
      vadeTarihi,
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

    const kgVal = Number(String(req.body.kg ?? req.body.weight ?? existing.kg).replace(',', '.')) || 0;
    const fiyatVal = Number(String(req.body.fiyat ?? existing.fiyat).replace(',', '.')) || 0;
    const tahsilatVal = Number(String(req.body.tahsilat ?? existing.tahsilat).replace(',', '.')) || 0;
    const tarih = req.body.tarih === undefined ? existing.tarih : normalizeCalendarDate(req.body.tarih);
    const isVadeli = req.body.isVadeli === undefined ? Boolean(existing.isVadeli) : (req.body.isVadeli === true || req.body.isVadeli === 'true');
    const vadeTarihi = !isVadeli ? '' : req.body.vadeTarihi === undefined ? existing.vadeTarihi : normalizeCalendarDate(req.body.vadeTarihi);
    const toplam = kgVal * fiyatVal;
    if (kgVal <= 0 || !Number.isFinite(kgVal)) return res.status(400).json({ error: 'KG 0’dan büyük olmalıdır.' });
    if (fiyatVal < 0 || !Number.isFinite(fiyatVal)) return res.status(400).json({ error: 'Geçerli bir fiyat girin.' });
    if (tahsilatVal < 0 || !Number.isFinite(tahsilatVal)) return res.status(400).json({ error: 'Geçerli bir tahsilat girin.' });
    if (tahsilatVal > toplam + 0.01) return res.status(400).json({ error: 'Tahsilat toplam satış tutarından fazla olamaz.' });
    if (!tarih) return res.status(400).json({ error: 'Tarih GG.AA.YYYY biçiminde geçerli olmalıdır.' });
    if (isVadeli && !vadeTarihi) return res.status(400).json({ error: 'Vade tarihi GG.AA.YYYY biçiminde geçerli olmalıdır.' });
    const kalan = toplam - tahsilatVal;

    let durum = 'Bekliyor';
    if (kalan <= 0 && toplam > 0) durum = 'Ödendi';
    else if (tahsilatVal > 0) durum = 'Kısmi Ödendi';

    const updatePayload = {
      tarih,
      surum: req.body.surum === undefined ? existing.surum : String(req.body.surum || '').trim(),
      uretici: req.body.uretici === undefined ? existing.uretici : String(req.body.uretici || '').trim(),
      producerName: req.body.producerName === undefined ? existing.producerName : String(req.body.producerName || '').trim(),
      kg: kgVal,
      weight: kgVal,
      firma: req.body.firma === undefined ? existing.firma : String(req.body.firma || '').trim(),
      fiyat: fiyatVal,
      tahsilat: tahsilatVal,
      aciklama: req.body.aciklama === undefined ? existing.aciklama : String(req.body.aciklama || '').trim(),
      bahce: req.body.bahce === undefined ? existing.bahce : String(req.body.bahce || '').trim(),
      isVadeli,
      vadeTarihi,
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
    const tarih = normalizeCalendarDate(req.body.tarih);
    const gecerlilikRaw = String(req.body.gecerlilikBaslangic || '').trim();
    const gecerlilikBaslangic = gecerlilikRaw ? normalizeCalendarDate(gecerlilikRaw) : '';
    const fiyatTuru = ['Haftalık','Aylık','Peşin','Vadeli','Diğer'].includes(String(req.body.fiyatTuru)) ? String(req.body.fiyatTuru) : 'Peşin';
    const vadeGun = Number(req.body.vadeGun) || 0;

    if (!firma) return res.status(400).json({ error: 'Fabrika adı zorunludur.' });
    if (!Number.isFinite(fiyat) || fiyat < 0) return res.status(400).json({ error: 'Geçerli bir fiyat girin.' });
    if (!tarih) return res.status(400).json({ error: 'Fiyat tarihi GG.AA.YYYY biçiminde geçerli olmalıdır.' });
    if (gecerlilikRaw && !gecerlilikBaslangic) return res.status(400).json({ error: 'Geçerlilik başlangıcı GG.AA.YYYY biçiminde geçerli olmalıdır.' });

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

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 200;
    const data = await Expense.find(filter).sort({ _id: -1 }).limit(limit);
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

    const tarih = normalizeCalendarDate(req.body.tarih) || (req.body.tarih ? '' : todayServerDate());
    if (!tarih) return res.status(400).json({ error: 'Tarih GG.AA.YYYY biçiminde geçerli olmalıdır.' });
    const payload = {
      userId: req.auth.userId,
      userPhone: req.auth.phone,
      tarih,
      kategori: String(req.body.kategori || 'Diğer').trim(),
      aciklama: String(req.body.aciklama || '').trim(),
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
    const [users, harvestSummary] = await Promise.all([
      UserProfile.find().sort({ name: 1 }).lean(),
      Harvest.aggregate([
        { $group: {
          _id: '$userId',
          totalKg: { $sum: { $ifNull: ['$kg', '$weight'] } },
          totalSales: { $sum: { $ifNull: ['$toplamTutar', { $multiply: [{ $ifNull: ['$kg', '$weight'] }, { $ifNull: ['$fiyat', 0] }] }] } },
          totalPaid: { $sum: { $ifNull: ['$tahsilat', 0] } },
          harvestCount: { $sum: 1 }
        } }
      ])
    ]);
    const summaryByUserId = new Map(harvestSummary.map((item) => [item._id, item]));
    const summary = users.map((u) => {
      const item = summaryByUserId.get(u.userId) || { totalKg: 0, totalSales: 0, totalPaid: 0, harvestCount: 0 };
      return { ...u, ...item, remaining: Math.max(0, item.totalSales - item.totalPaid) };
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
    const [users, harvests, payments, expenses, gardens, factoryPrices, ads] = await Promise.all([
      UserProfile.find().lean(), Harvest.find().lean(), Payment.find().lean(), Expense.find().lean(), Garden.find().lean(), FactoryPrice.find().lean(), Ad.find().lean()
    ]);
    const payload = { version: 'V17.0', exportedAt: new Date().toISOString(), users, harvests, payments, expenses, gardens, factoryPrices, ads };
    if (BACKUP_WEBHOOK_URL) {
      const encrypted = createEncryptedBackup(payload);
      if (!encrypted) throw new Error('Dış yedek için BACKUP_ENCRYPTION_KEY zorunludur.');
      const response = await fetch(BACKUP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: encrypted
      });
      if (!response.ok) throw new Error(`Dış yedek sunucusu ${response.status} yanıtını verdi.`);
      console.log('💾 Şifreli dış yedek gönderildi.');
      return;
    }
    if (isProduction) {
      console.warn('BACKUP_WEBHOOK_URL ayarlanmadı; üretimde yerel diske yedek yazılmadı.');
      return;
    }
    const dir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `cay-takip-${stamp}.json`), JSON.stringify(payload));
    console.log('💾 Geliştirme yedeği oluşturuldu.');
  } catch (err) { console.error('Otomatik yedek hatası:', err.message); }
};
setTimeout(runAutomaticBackup, 15000);
setInterval(runAutomaticBackup, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda dinleniyor...`));
