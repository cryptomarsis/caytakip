function assessReceiptConfidence(fields) {
  const checks = [['Tarih', fields?.date], ['Firma', fields?.company], ['Net ağırlık', fields?.netWeightKg]];
  const missing = checks.filter(([, value]) => value == null || String(value).trim() === '').map(([label]) => label);
  return { confidence: Math.round(((checks.length - missing.length) / checks.length) * 100), warnings: missing.length ? [`${missing.join(', ')} alanı okunamadı; kaydetmeden önce kontrol edin.`] : [] };
}
module.exports = { assessReceiptConfidence };
