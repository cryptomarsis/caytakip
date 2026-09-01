import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateAgriculturalDeductions,
  grossTotalOf,
  netTotalOf,
  parseMoney,
  remainingTotalOf,
  toServerDate,
} from '../src/utils/format.ts';

test('Türkçe ve uluslararası para değerlerini güvenli biçimde okur', () => {
  assert.equal(parseMoney('1.250,50'), 1250.5);
  assert.equal(parseMoney('1,250.50'), 1250.5);
  assert.equal(parseMoney('35,25'), 35.25);
  assert.equal(parseMoney('geçersiz'), 0);
});

test('hasat brüt, yüzde 2 kesinti ve net tutarını hesaplar', () => {
  const result = calculateAgriculturalDeductions('1000', '35');
  assert.deepEqual(result, {
    brutTutar: 35000,
    gelirVergisiOrani: 2,
    gelirVergisiKesintisi: 700,
    kesintiTutar: 700,
    netTutar: 34300,
  });
});

test('kayıt toplamları kaydedilmiş kesintiyi ve tahsilatı dikkate alır', () => {
  const harvest = { kg: 1000, fiyat: 35, kesintiTutar: 700, tahsilat: 11995.2 };
  assert.equal(grossTotalOf(harvest), 35000);
  assert.equal(netTotalOf(harvest), 34300);
  assert.equal(remainingTotalOf(harvest), 22304.8);
});

test('fazla tahsilatta kalan alacak eksiye düşmez', () => {
  assert.equal(remainingTotalOf({ kg: 10, fiyat: 20, tahsilat: 500 }), 0);
});

test('takvim tarihini doğrular ve sunucu biçimine çevirir', () => {
  assert.equal(toServerDate('20.08.2026'), '2026-08-20');
  assert.equal(toServerDate('31.02.2026'), '');
});
