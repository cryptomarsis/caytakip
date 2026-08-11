require('dotenv').config(); // .env dosyasındaki değişkenleri yükler
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

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
const isAdminRequest = (req) => {
  if (req.headers['admin-secret'] === ADMIN_SECRET) return true;
  const { userId, userPhone } = getUserIdentifier(req);
  return normalizePhone(userPhone) === ADMIN_PHONE || String(userId || '') === `usr_${ADMIN_PHONE}`;
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
  role: { type: String, enum: ['admin', 'user'], default: 'user' }
}, { timestamps: true });

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
const getUserIdentifier = (req) => {
  const userId = req.headers['user-id'] || req.query.userId || req.body?.userId;
  const userPhone = req.headers['user-phone'] || req.query.userPhone || req.body?.userPhone;
  return { userId, userPhone };
};

const buildUserFilter = (req) => {
  if (req.headers['admin-secret'] === ADMIN_SECRET) {
    return {};
  }

  const { userId, userPhone } = getUserIdentifier(req);

  if (!userId && !userPhone) {
    return { _id: null };
  }

  const conditions = [];
  if (userId) conditions.push({ userId });
  if (userPhone) conditions.push({ userPhone });

  return conditions.length > 1 ? { $or: conditions } : conditions[0];
};

// --- ROUTES ---

app.get('/', (req, res) => {
  res.send('🌱 Çay Takip Sistemi API Çalışıyor!');
});


// USER PROFILE ROUTES
app.get('/api/users/profile', async (req, res) => {
  try {
    const phone = normalizePhone(req.query.phone || req.headers['user-phone']);
    if (!phone) return res.status(400).json({ error: 'Telefon numarası zorunludur.' });
    const profile = await UserProfile.findOne({ phone });
    if (!profile) return res.status(404).json({ error: 'Üretici profili bulunamadı.' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/profile', async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone || req.headers['user-phone']);
    const name = String(req.body.name || '').trim();
    if (!phone || phone.length < 10) return res.status(400).json({ error: 'Geçerli telefon numarası zorunludur.' });
    if (!name) return res.status(400).json({ error: 'Ad Soyad zorunludur.' });
    const role = phone === ADMIN_PHONE ? 'admin' : 'user';
    const userId = `usr_${phone}`;
    const profile = await UserProfile.findOneAndUpdate(
      { phone },
      { userId, phone, name, role },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: `Üretici profili kaydedilemedi: ${err.message}` });
  }
});

// HARVEST ROUTES
app.get('/api/harvests', async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);

    const data = await Harvest.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/harvests', async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

    if (!userId && !userPhone) {
      return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });
    }

    const kgVal = Number(req.body.kg || req.body.weight) || 0;
    const fiyatVal = Number(req.body.fiyat) || 0;
    const tahsilatVal = Number(req.body.tahsilat) || 0;
    const toplam = kgVal * fiyatVal;
    const kalan = toplam - tahsilatVal;

    let durum = 'Bekliyor';
    if (kalan <= 0 && toplam > 0) durum = 'Ödendi';
    else if (tahsilatVal > 0) durum = 'Kısmi Ödendi';

    const payload = {
      ...req.body,
      userId: userId || req.body.userId,
      userPhone: userPhone || req.body.userPhone,
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

app.put('/api/harvests/:id', async (req, res) => {
  try {
    const existing = await Harvest.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı.' });

    const kgVal = Number(req.body.kg ?? req.body.weight ?? existing.kg) || 0;
    const fiyatVal = Number(req.body.fiyat ?? existing.fiyat) || 0;
    const tahsilatVal = Number(req.body.tahsilat ?? existing.tahsilat) || 0;
    const toplam = kgVal * fiyatVal;
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

    const updated = await Harvest.findByIdAndUpdate(req.params.id, updatePayload, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/harvests/:id', async (req, res) => {
  try {
    const deleted = await Harvest.findByIdAndDelete(req.params.id);
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
app.post('/api/payments', async (req, res) => {
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
    if (userId && harvest.userId && harvest.userId !== userId) {
      return res.status(403).json({ error: 'Bu satış kaydına erişim yetkiniz yok.' });
    }
    if (userPhone && harvest.userPhone && harvest.userPhone !== userPhone) {
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
        userId: userId || harvest.userId,
        userPhone: userPhone || harvest.userPhone,
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
app.get('/api/gardens/summary', async (req, res) => {
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
app.get('/api/reports/receivables', async (req, res) => {
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
app.get('/api/factory-prices', async (req, res) => {
  try {
    const data = await FactoryPrice.find().sort({ firma: 1, tarih: -1, createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/factory-prices', async (req, res) => {
  try {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Bu işlemi sadece yönetici yapabilir.' });
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
      userId: userId || req.body.userId,
      userPhone: userPhone || req.body.userPhone
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/factory-prices/:id', async (req, res) => {
  try {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Bu işlemi sadece yönetici yapabilir.' });
    const deleted = await FactoryPrice.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Fiyat kaydı bulunamadı.' });
    res.json({ message: 'Fiyat kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. REKLAM ALANLARI
app.get('/api/ads', async (req, res) => {
  try {
    const data = await Ad.find({ aktif: true }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);
    if (!userId && !userPhone) return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });

    const firma = String(req.body.firma || '').trim();
    if (!firma) return res.status(400).json({ error: 'Reklam veren firma adı zorunludur.' });

    const item = await Ad.create({
      ...req.body,
      firma,
      userId: userId || req.body.userId,
      userPhone: userPhone || req.body.userPhone
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const deleted = await Ad.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Reklam bulunamadı.' });
    res.json({ message: 'Reklam silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EXPENSE ROUTES
app.get('/api/expenses', async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);

    const data = await Expense.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

    if (!userId && !userPhone) {
      return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });
    }

    const payload = {
      ...req.body,
      userId: userId || req.body.userId,
      userPhone: userPhone || req.body.userPhone,
      tutar: Number(req.body.tutar) || 0
    };

    const newExpense = new Expense(payload);
    await newExpense.save();
    res.status(201).json(newExpense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ message: 'Gider kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GARDEN ROUTES
app.get('/api/gardens', async (req, res) => {
  try {
    const filter = buildUserFilter(req);
    if (filter._id === null) return res.json([]);

    const data = await Garden.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gardens', async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

    if (!userId && !userPhone) {
      return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi bulunamadı.' });
    }

    const payload = {
      ...req.body,
      userId: userId || req.body.userId,
      userPhone: userPhone || req.body.userPhone
    };

    const newGarden = new Garden(payload);
    await newGarden.save();
    res.status(201).json(newGarden);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/gardens/:id', async (req, res) => {
  try {
    const deleted = await Garden.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ message: 'Bahçe kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN ROUTES
app.get('/api/admin/all-data', async (req, res) => {
  try {
    const adminSecret = req.headers['admin-secret'];
    if (adminSecret !== ADMIN_SECRET) return res.status(403).json({ error: 'Bu alana erişim yetkiniz yok.' });
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda dinleniyor...`));