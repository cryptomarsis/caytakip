const SEASON_NOTIFICATION = {
  title: 'Çaylık’ta günün hesabı',
  body: 'Bugünkü teslimat ve ödemelerinizi kontrol edin. Sorularınız için Çaylık Asistan yanınızda.',
};
const DUE_NOTIFICATION_RULES = [
  { key: 'two-days', days: -2, title: 'Çaylık Asistan · Vade yaklaşıyor', body: '{firma} ödemesine 2 gün kaldı. Bekleyen tutar: {tutar}.' },
  { key: 'due-day', days: 0, title: 'Çaylık Asistan · Ödeme günü', body: '{firma} için {tutar} tutarındaki alacağınızın vadesi bugün.' },
  { key: 'overdue', days: 1, title: 'Çaylık Asistan · Geciken alacak', body: '{firma} için {tutar} tutarındaki ödeme gecikmiş görünüyor. Tahsilat durumunu kontrol edin.' },
];
module.exports = { SEASON_NOTIFICATION, DUE_NOTIFICATION_RULES };
