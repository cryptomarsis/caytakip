const mongoNumeric = (input, fallback = 0) => ({ $convert: { input: { $ifNull: [input, fallback] }, to: 'double', onError: fallback, onNull: fallback } });

const createAdminMetricPipeline = (match = {}, withholdingRate = 2) => [
  { $match: match },
  { $project: { userId: { $ifNull: ['$userId', ''] }, userPhone: { $ifNull: ['$userPhone', ''] }, kgValue: mongoNumeric({ $ifNull: ['$kg', '$weight'] }), priceValue: mongoNumeric('$fiyat'), storedNetValue: mongoNumeric({ $ifNull: ['$toplamTutar', null] }, null), storedDeductionValue: mongoNumeric({ $ifNull: ['$kesintiTutar', { $ifNull: ['$gelirVergisiKesintisi', null] }] }, null), withholdingRate: mongoNumeric('$gelirVergisiOrani', withholdingRate), paidValue: mongoNumeric('$tahsilat') } },
  { $set: { grossValue: { $multiply: ['$kgValue', '$priceValue'] } } },
  { $set: { netValue: { $max: [0, { $ifNull: ['$storedNetValue', { $subtract: ['$grossValue', { $ifNull: ['$storedDeductionValue', { $multiply: ['$grossValue', { $divide: ['$withholdingRate', 100] }] }] }] }] }] } } },
  { $group: { _id: { userId: '$userId', userPhone: '$userPhone' }, totalKg: { $sum: '$kgValue' }, totalSales: { $sum: '$netValue' }, totalPaid: { $sum: '$paidValue' }, harvestCount: { $sum: 1 } } },
];

const getAdminProducerFilter = (search = '', city = '', activity = 'all') => {
  const filters = [{ role: { $ne: 'admin' } }];
  const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const phrase = String(search || '').trim();
  const normalizedCity = String(city || '').trim();
  if (phrase) { const escaped = escapeRegex(phrase); filters.push({ $or: [{ name: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }, { city: { $regex: escaped, $options: 'i' } }] }); }
  if (normalizedCity) filters.push({ city: { $regex: escapeRegex(normalizedCity), $options: 'i' } });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (activity === 'active') filters.push({ active: { $ne: false } });
  if (activity === 'inactive') filters.push({ active: false });
  if (activity === 'recent') filters.push({ lastActiveAt: { $gte: thirtyDaysAgo } });
  if (activity === 'stale') filters.push({ $or: [{ lastActiveAt: null }, { lastActiveAt: { $lt: thirtyDaysAgo } }] });
  return filters.length === 1 ? filters[0] : { $and: filters };
};

const metricKey = (metric = {}) => `${String(metric?._id?.userId || '').trim()}::${String(metric?._id?.userPhone || '').trim()}`;
const numericValue = (value) => Number(value || 0);
const toAdminProducer = (profile = {}, metric = {}) => {
  const totalSales = numericValue(metric.totalSales); const totalPaid = numericValue(metric.totalPaid);
  const userId = String(profile.userId || metric?._id?.userId || '').trim(); const phone = String(profile.phone || metric?._id?.userPhone || '').trim();
  return { _id: profile?._id ? String(profile._id) : `legacy:${userId || phone || metricKey(metric)}`, userId, phone, name: profile.name || phone || userId || 'Kayıtlı üretici', city: profile.city || '', role: profile.role || 'user', active: profile.active !== false, lastActiveAt: profile.lastActiveAt || null, createdAt: profile.createdAt || null, totalKg: numericValue(metric.totalKg), totalSales, totalPaid, harvestCount: numericValue(metric.harvestCount), remaining: Math.max(0, totalSales - totalPaid) };
};

const summarizeAdminHarvests = (records = [], withholdingRate = 2) => records.reduce((summary, record) => {
  const kg = numericValue(record.kg ?? record.weight);
  const gross = kg * numericValue(record.fiyat);
  const deduction = record.kesintiTutar ?? record.gelirVergisiKesintisi;
  const net = record.toplamTutar != null ? numericValue(record.toplamTutar) : Math.max(0, gross - (deduction != null ? numericValue(deduction) : gross * numericValue(record.gelirVergisiOrani ?? withholdingRate) / 100));
  const paid = numericValue(record.tahsilat);
  summary.totalKg += kg; summary.totalSales += net; summary.totalPaid += paid; summary.harvestCount += 1;
  summary.remaining = Math.max(0, summary.totalSales - summary.totalPaid);
  return summary;
}, { totalKg: 0, totalSales: 0, totalPaid: 0, remaining: 0, harvestCount: 0 });

module.exports = { createAdminMetricPipeline, getAdminProducerFilter, metricKey, numericValue, toAdminProducer, summarizeAdminHarvests };
