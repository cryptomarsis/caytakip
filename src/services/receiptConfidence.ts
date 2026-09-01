export type ReceiptFields = { date?: unknown; company?: unknown; netWeightKg?: unknown };

export function assessReceiptConfidence(fields: ReceiptFields) {
  const checks = [
    ['Tarih', fields.date],
    ['Firma', fields.company],
    ['Net ağırlık', fields.netWeightKg],
  ] as const;
  const missing = checks.filter(([, value]) => value === undefined || value === null || String(value).trim() === '').map(([label]) => label);
  const confidence = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { confidence, warnings: missing.length ? [`${missing.join(', ')} alanı okunamadı; kaydetmeden önce kontrol edin.`] : [] };
}
