// Personal balances are projections of one delivery, never duplicate harvests.
const ownShare = (row, userId) => row.data[row.cropperId === userId ? 'cropperCents' : 'ownerCents'];
const paidCents = (row, userId) => (row.collections || []).filter(p => p.userId === userId && !p.voided).reduce((n, p) => n + p.amountCents, 0);
function assertCollectionsFit(row, nextData, voided = false) {
  for (const userId of [row.cropperId, row.ownerId]) {
    const paid = paidCents(row, userId);
    if (paid > (voided ? 0 : ownShare({ ...row, data: nextData }, userId))) {
      throw Object.assign(Error('Bu teslimata tahsilat girilmiş. Önce ilgili taraf kendi tahsilatını düzeltmeli veya iptal etmeli.'), { httpCode: 409 });
    }
  }
}
function projectDelivery(row, userId, link, source) {
  if (![row.cropperId, row.ownerId].includes(userId)) throw Error('Yetkisiz hesap.');
  const share = row.voided ? 0 : ownShare(row, userId), paid = paidCents(row, userId);
  return {
    _id: String(row._id), sharedDeliveryId: String(row._id), shareLinkId: String(row.linkId),
    sourceHarvestId: row.harvestId ? String(row.harvestId) : undefined,
    sharedRole: row.cropperId === userId ? 'cropper' : 'owner', sharedVoided: Boolean(row.voided),
    sharedPartner: row.cropperId === userId ? link.ownerName : link.cropperName,
    sharedLabel: link.label, shareDenominator: row.data.denominator,
    kg: row.data.kg, weight: row.data.kg, fiyat: row.data.price, firma: row.data.factory,
    tarih: row.data.date, vadeTarihi: row.data.dueDate, isVadeli: Boolean(row.data.dueDate),
    surum: source?.surum || '', sharedNetCents: share, toplamTutar: share / 100,
    tahsilat: paid / 100, kalanBakiye: Math.max(0, share - paid) / 100,
    sharedSaleNetCents: row.data.netCents,
    sharedGrossCents: row.data.grossCents, sharedTaxCents: row.data.taxCents,
    legacySharedCollection: row.legacyAllocation?.state === 'applied' ? 0 : Number(source?.tahsilat || 0),
    legacyAllocation: row.legacyAllocation ? {
      proposalId: row.legacyAllocation.proposalId, state: row.legacyAllocation.state,
      cropperCents: row.legacyAllocation.cropperCents, ownerCents: row.legacyAllocation.ownerCents,
      sourceCents: row.legacyAllocation.sourceCents,
    } : undefined,
    sharedCollectionHistory: (row.collections || []).filter(p => p.userId === userId && (p.history?.length || p.voided)).map(p => ({
      paymentId: String(p._id), voided: Boolean(p.voided),
      changes: (p.history || []).map(h => ({ at: h.at, action: h.action,
        before: { amountCents: h.before?.amountCents, date: h.before?.date, note: h.before?.note || '' },
        after: { amountCents: h.after?.amountCents, date: h.after?.date, note: h.after?.note || '' },
      })),
    })),
    sharedPayments: (row.collections || []).filter(p => p.userId === userId && !p.voided).map(p => ({
      _id: String(p._id), sharedDeliveryId: String(row._id), revision: p.revision || 0,
      tarih: p.date, tutar: p.amountCents / 100, aciklama: p.note || '',
      harvestId: { _id: String(row._id), firma: row.data.factory, tarih: row.data.date, kg: row.data.kg },
    })),
  };
}
module.exports = { ownShare, paidCents, assertCollectionsFit, projectDelivery };
