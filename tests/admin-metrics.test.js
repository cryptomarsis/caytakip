const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAdminHarvests, toAdminProducer } = require('../server/adminMetrics');

test('yönetici özeti tüm üreticilerin kayıtlarını toplar', () => {
  const summary = summarizeAdminHarvests([
    { userId: 'u1', kg: 100, fiyat: 40, tahsilat: 1000 },
    { userId: 'u2', kg: 200, fiyat: 35, tahsilat: 2000 },
  ]);
  assert.equal(summary.totalKg, 300);
  assert.equal(summary.totalSales, 10780);
  assert.equal(summary.totalPaid, 3000);
  assert.equal(summary.remaining, 7780);
});

test('eski weight alanı ve kaydedilmiş net tutar doğru kullanılır', () => {
  const summary = summarizeAdminHarvests([{ weight: '125', fiyat: '40', toplamTutar: '4800', tahsilat: '800' }]);
  assert.deepEqual(summary, { totalKg: 125, totalSales: 4800, totalPaid: 800, remaining: 4000, harvestCount: 1 });
});

test('fazla tahsilatta yönetici kalan toplamı eksiye düşmez', () => {
  assert.equal(summarizeAdminHarvests([{ kg: 10, fiyat: 10, tahsilat: 500 }]).remaining, 0);
});

test('profil bulunmayan eski üretici yönetici listesine dönüştürülür', () => {
  const producer = toAdminProducer({}, { _id: { userId: 'legacy-user', userPhone: '05550000000' }, totalKg: 50, totalSales: 1000, totalPaid: 250, harvestCount: 1 });
  assert.equal(producer.userId, 'legacy-user');
  assert.equal(producer.remaining, 750);
});
