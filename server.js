const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const ExcelJS = require('exceljs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Bağlantısı 
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/cay_takip';

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('✅ MongoDB bağlantısı başarılı.'))
  .catch((err) => console.error('❌ MongoDB bağlantı hatası:', err.message));

// --- MODELLER (SCHEMAS) ---

// Hasat Modeli (userId ve userPhone eklendi/esnetildi)
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
  tahsilat: Number,
  aciklama: String,
  bahce: String
}, { timestamps: true });

// Gider Modeli
const ExpenseSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  userPhone: { type: String, required: false },
  tarih: String,
  kategori: String,
  aciklama: String,
  tutar: Number
}, { timestamps: true });

// Bahçe Modeli
const GardenSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  userPhone: { type: String, required: false },
  name: String,
  adaParsel: String,
  alan: String
}, { timestamps: true });

const Harvest = mongoose.model('Harvest', HarvestSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Garden = mongoose.model('Garden', GardenSchema);

// Yardımcı Fonksiyon: İstekten Kullanıcı Kimliği veya Telefonunu Alır
const getUserIdentifier = (req) => {
  const userId = req.body?.userId || req.headers['user-id'];
  const userPhone = req.body?.userPhone || req.headers['user-phone'];
  return { userId, userPhone };
};

// --- API ROTALARI ---

// Test/Ana Sayfa Rotası
app.get('/', (req, res) => {
  res.send('🌱 Çay Takip Sistemi API Çalışıyor!');
});

// ------------------------------------
// 🍃 HASAT ROTALARI (KULLANICI BAZLI)
// ------------------------------------
app.get('/api/harvests', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const userPhone = req.headers['user-phone'];

    let filter = {};
    if (userId) {
      filter = { $or: [{ userId }, { userPhone }] };
    } else if (userPhone) {
      filter = { userPhone };
    }

    const data = await Harvest.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/harvests', async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);
    
    // En az bir kimlik bilgisi (userId veya userPhone) bulunmalı
    if (!userId && !userPhone) {
      return res.status(400).json({ error: 'Kullanıcı doğrulama bilgisi (userId veya userPhone) bulunamadı.' });
    }

    const payload = {
      ...req.body,
      userId: userId || req.body.userId,
      userPhone: userPhone || req.body.userPhone,
      kg: Number(req.body.kg) || 0,
      fiyat: Number(req.body.fiyat) || 0,
      tahsilat: Number(req.body.tahsilat) || 0
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
    const updated = await Harvest.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/harvests/:id', async (req, res) => {
  try {
    const deleted = await Harvest.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });

    res.json({ message: 'Hasat kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------
// 💸 GİDER ROTALARI (KULLANICI BAZLI)
// ------------------------------------
app.get('/api/expenses', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const userPhone = req.headers['user-phone'];

    let filter = {};
    if (userId) {
      filter = { $or: [{ userId }, { userPhone }] };
    } else if (userPhone) {
      filter = { userPhone };
    }

    const data = await Expense.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

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

// ------------------------------------
// 🏡 BAHÇE ROTALARI (KULLANICI BAZLI)
// ------------------------------------
app.get('/api/gardens', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const userPhone = req.headers['user-phone'];

    let filter = {};
    if (userId) {
      filter = { $or: [{ userId }, { userPhone }] };
    } else if (userPhone) {
      filter = { userPhone };
    }

    const data = await Garden.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gardens', async (req, res) => {
  try {
    const { userId, userPhone } = getUserIdentifier(req);

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

// ------------------------------------
// 👑 ADMIN ROTALARI
// ------------------------------------
app.get('/api/admin/all-data', async (req, res) => {
  try {
    const adminSecret = req.headers['admin-secret'];
    
    if (adminSecret !== 'ADMIN_OZEL_SIFRESI_123') {
      return res.status(403).json({ error: 'Bu alana erişim yetkiniz yok.' });
    }

    const allHarvests = await Harvest.find().sort({ createdAt: -1 });
    const allExpenses = await Expense.find().sort({ createdAt: -1 });
    const allGardens = await Garden.find().sort({ createdAt: -1 });

    res.json({
      harvests: allHarvests,
      expenses: allExpenses,
      gardens: allGardens
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN EXCEL DIŞA AKTARMA ENDPOINT'I
app.get('/api/admin/export-excel', async (req, res) => {
  try {
    const harvests = await Harvest.find().lean();
    const expenses = await Expense.find().lean();

    const workbook = new ExcelJS.Workbook();
    
    // 1. Sayfa: Hasat ve Satış Kayıtları
    const harvestSheet = workbook.addWorksheet('Hasat ve Satışlar');
    harvestSheet.columns = [
      { header: 'Tarih', key: 'tarih', width: 15 },
      { header: 'Üretici Adı', key: 'uretici', width: 25 },
      { header: 'Sürüm', key: 'surum', width: 12 },
      { header: 'Bahçe', key: 'bahce', width: 20 },
      { header: 'KG', key: 'kg', width: 12 },
      { header: 'Firma', key: 'firma', width: 15 },
      { header: 'Fiyat (TL)', key: 'fiyat', width: 12 },
      { header: 'Toplam Tutar (TL)', key: 'toplam', width: 18 },
      { header: 'Tahsilat (TL)', key: 'tahsilat', width: 15 },
      { header: 'Kalan Bakiye (TL)', key: 'kalan', width: 18 },
      { header: 'Açıklama', key: 'aciklama', width: 25 },
    ];

    harvests.forEach(h => {
      const kg = Number(h.kg || h.weight) || 0;
      const fiyat = Number(h.fiyat) || 0;
      const tahsilat = Number(h.tahsilat) || 0;
      const toplam = kg * fiyat;
      const kalan = toplam - tahsilat;

      harvestSheet.addRow({
        tarih: h.tarih || '',
        uretici: h.uretici || h.producerName || 'Belirtilmedi',
        surum: h.surum || '',
        bahce: h.bahce || '-',
        kg: kg,
        firma: h.firma || '-',
        fiyat: fiyat,
        toplam: toplam,
        tahsilat: tahsilat,
        kalan: kalan,
        aciklama: h.aciklama || ''
      });
    });

    // 2. Sayfa: Giderler
    const expenseSheet = workbook.addWorksheet('Giderler');
    expenseSheet.columns = [
      { header: 'Tarih', key: 'tarih', width: 15 },
      { header: 'Kategori', key: 'kategori', width: 20 },
      { header: 'Tutar (TL)', key: 'tutar', width: 15 },
      { header: 'Açıklama', key: 'aciklama', width: 30 },
    ];

    expenses.forEach(e => {
      expenseSheet.addRow({
        tarih: e.tarih || '',
        kategori: e.kategori || '-',
        tutar: Number(e.tutar) || 0,
        aciklama: e.aciklama || ''
      });
    });

    // Başlık Stili
    [harvestSheet, expenseSheet].forEach(sheet => {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1B4332' }
      };
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + `Cay_Uretim_Raporu_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel Oluşturma Hatası:', error);
    res.status(500).json({ error: 'Excel raporu oluşturulamadı.' });
  }
});

// Port Tanımlaması ve Sunucunun Başlatılması (En Alt Kısımda Olmalı)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda dinleniyor...`));