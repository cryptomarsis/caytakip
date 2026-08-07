const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Bağlantısı (Kendi MONGO_URI bilginizi buraya yazın)
const MONGO_URI = process.env.MONGO_URI || 'MONGODB_BAGLANTI_CUMLESINIZ';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB bağlantısı başarılı.'))
  .catch((err) => console.error('MongoDB bağlantı hatası:', err));

// --- MODELLER (SCHEMAS) ---

// Hasat Modeli
const HarvestSchema = new mongoose.Schema({
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
  tarih: String,
  kategori: String,
  aciklama: String,
  tutar: Number
}, { timestamps: true });

// Bahçe Modeli
const GardenSchema = new mongoose.Schema({
  name: String,
  adaParsel: String,
  alan: String
}, { timestamps: true });

const Harvest = mongoose.model('Harvest', HarvestSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Garden = mongoose.model('Garden', GardenSchema);

// --- API ROTALARI (ROUTES) ---

// Hasat Rotaları
app.get('/api/harvests', async (req, res) => {
  try {
    const data = await Harvest.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/harvests', async (req, res) => {
  try {
    const newHarvest = new Harvest(req.body);
    await newHarvest.save();
    res.json(newHarvest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/harvests/:id', async (req, res) => {
  try {
    const updated = await Harvest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/harvests/:id', async (req, res) => {
  try {
    await Harvest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Hasat kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gider Rotaları
app.get('/api/expenses', async (req, res) => {
  try {
    const data = await Expense.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const newExpense = new Expense(req.body);
    await newExpense.save();
    res.json(newExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Gider kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bahçe Rotaları
app.get('/api/gardens', async (req, res) => {
  try {
    const data = await Garden.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gardens', async (req, res) => {
  try {
    const newGarden = new Garden(req.body);
    await newGarden.save();
    res.json(newGarden);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gardens/:id', async (req, res) => {
  try {
    await Garden.findByIdAndDelete(req.params.id);
    res.json({ message: 'Bahçe kaydı silindi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));