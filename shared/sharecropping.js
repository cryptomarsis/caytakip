function shareAmounts(kg, price, denominator) {
  if (![2, 3].includes(denominator)) throw Error('Yarıcı payı 1/2 veya 1/3 olmalıdır.');
  if (!Number.isFinite(kg) || kg <= 0 || !Number.isFinite(price) || price < 0) throw Error('KG ve birim fiyatı kontrol edin.');
  const grossCents = Math.round((kg * price + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(grossCents) || grossCents > Number.MAX_SAFE_INTEGER / 4) throw Error('Tutar hesaplama sınırını aşıyor.');
  const taxCents = Math.round(grossCents * 0.02);
  const netCents = grossCents - taxCents;
  const cropperCents = Math.round(netCents / denominator);
  return { grossCents, taxCents, netCents, cropperCents, ownerCents: netCents - cropperCents, taxPercent: 2, denominator };
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Geçerli bir tarih seçin.');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Error('Geçerli bir tarih seçin.');
  return value;
}
function deliveryInput(body, denominator) {
  const number = value => {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    const text = String(value).trim().replace(',', '.');
    return /^\d+(\.\d{1,3})?$/.test(text) ? Number(text) : NaN;
  };
  const kg = number(body.kg), price = number(body.price);
  const factory = typeof body.factory === 'string' ? body.factory.trim() : '';
  if (!factory || factory.length > 100) throw Error('Alım yeri / fabrika adı girin (en fazla 100 karakter).');
  const date = calendarDate(body.date);
  const dueDate = body.dueDate ? calendarDate(body.dueDate) : '';
  if (dueDate && dueDate < date) throw Error('Vade teslimat tarihinden önce olamaz.');
  return { kg, price, factory, date, dueDate, ...shareAmounts(kg, price, denominator) };
}
function deliveryMessage(data) {
  return `${data.factory} · ${data.kg.toLocaleString('tr-TR')} kg çay teslim edildi.${data.dueDate ? ` Vade: ${data.dueDate.split('-').reverse().join('.')}.` : ' Vade belirtilmedi.'}`;
}
function deliveryChanges(before, after) {
  const fields = [['kg', 'KG'], ['price', 'Birim fiyat (TL)'], ['factory', 'Fabrika'], ['date', 'Teslim tarihi'], ['dueDate', 'Vade']];
  return fields.filter(([key]) => before[key] !== after[key]).map(([key, label]) => `${label}: ${before[key] === '' ? 'Yok' : before[key]} → ${after[key] === '' ? 'Yok' : after[key]}`);
}
module.exports = { shareAmounts, deliveryInput, deliveryMessage, deliveryChanges };
