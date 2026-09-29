const { deliveryInput, deliveryMessage, deliveryChanges } = require('../shared/sharecropping');
const { assertCollectionsFit } = require('../shared/shareLedger');
const fail = message => Object.assign(Error(message), { httpCode: 409 });

// Called inside the SAME transaction as the harvest mutation. Never creates a
// second harvest or copies a sale into the producer's private accounts.
module.exports = ({ ShareLink, ShareDelivery, ShareEvent, UserProfile }) => async function syncHarvest(harvest, session, { deleted = false } = {}) {
  if (!harvest.shareLinkId) return;
  const prior = await ShareDelivery.findOne({ harvestId: harvest._id }).session(session);
  if (prior?.voided) throw fail('Paylaşılan teslimat iptal edilmiş. Listeyi yenileyin.');
  const link = await ShareLink.findOneAndUpdate({
    _id: harvest.shareLinkId, cropperId: harvest.userId,
    // Closing stops NEW sales, but existing source records remain correctable.
    ...(!prior ? { status: 'active' } : {}),
  }, { $inc: { mutationSerial: 1 } }, { new: true, session });
  if (!link || !await UserProfile.exists({ userId: link.ownerId, active: { $ne: false } }).session(session)) throw fail('Paylaşılacak anlaşma aktif değil veya müstahsil onayı yok.');
  if (!await UserProfile.exists({ userId: harvest.userId, active: { $ne: false } }).session(session)) throw fail('Aktif hesap gerekli.');
  if (deleted && !prior) throw fail('Bağlı teslimat bulunamadı; kayıt silinmedi.');
  if (deleted && Number(harvest.tahsilat) > 0 && prior?.legacyAllocation?.state !== 'applied') throw fail('Eski tahsilatı önce Pay Takibi üzerinden onaylı olarak aktarın.');
  const data = deleted ? prior.data : deliveryInput({ kg: harvest.kg, price: harvest.fiyat, factory: harvest.firma, date: harvest.tarih, dueDate: harvest.isVadeli ? harvest.vadeTarihi : '' }, prior?.data.denominator || link.denominator);
  if (prior) assertCollectionsFit(prior.toObject ? prior.toObject() : prior, data, deleted);
  if (prior && !deleted && JSON.stringify(data) === JSON.stringify(prior.data)) return;
  if (prior && prior.history.length >= 100) throw fail('Paylaşılan kaydın düzeltme sınırına ulaşıldı.');
  let row;
  if (prior) {
    row = await ShareDelivery.findOneAndUpdate({ _id: prior._id, revision: prior.revision, voided: false }, {
      $set: { data, voided: deleted }, $inc: { revision: 1 },
      $push: { history: { data: prior.data, revision: prior.revision, at: new Date() } },
    }, { new: true, session });
    if (!row) throw fail('Teslimat değişmiş. Listeyi yenileyin.');
  } else {
    [row] = await ShareDelivery.create([{ harvestId: harvest._id, linkId: link._id, cropperId: harvest.userId, ownerId: link.ownerId, requestId: `harvest-${harvest._id}`, data }], { session });
  }
  const message = deleted ? `Teslimat iptal edildi: ${deliveryMessage(data)}` : prior ? `Teslimat düzeltildi: ${deliveryChanges(prior.data, data).join(' · ')}` : deliveryMessage(data);
  await ShareEvent.create([{ key: `${row._id}:${row.revision}`, recipient: link.ownerId, linkId: link._id, deliveryId: row._id, message }], { session });
};
