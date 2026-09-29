import type { HarvestRecord, PaymentRecord } from '../types';

export function mergeShareLedger(personal: HarvestRecord[], payments: PaymentRecord[], shared: HarvestRecord[]) {
  const sourceIds = new Set(shared.map(row => row.sourceHarvestId).filter(Boolean));
  if (personal.some(row => row.shareLinkId && !sourceIds.has(row._id))) throw Error('Paylaşılan hasat hesabı eşleşmedi. Listeyi tekrar yenileyin; önceki hesap korunuyor.');
  // Source IDs stay in the tombstones too, so cancellations cannot resurrect
  // their personal copy. No virtual copy is ever sent back to /harvests.
  const byId = new Map(personal.map(row => [row._id, row]));
  const visible = shared.filter(row => !row.sharedVoided).map(row => ({ ...(row.sharedRole === 'cropper' && row.sourceHarvestId ? byId.get(row.sourceHarvestId) : {}), ...row }));
  return {
    harvests: [...personal.filter(row => !sourceIds.has(row._id)), ...visible],
    payments: [
      ...payments.filter(payment => !sourceIds.has(typeof payment.harvestId === 'string' ? payment.harvestId : payment.harvestId?._id)),
      ...visible.flatMap(row => row.sharedPayments || []),
    ],
  };
}

export function collectionEndpoint(harvest: HarvestRecord) {
  return harvest.sharedDeliveryId ? `/shared-ledger/${harvest.sharedDeliveryId}/payments` : '/payments';
}
export function paymentEndpoint(payment: PaymentRecord) {
  return payment.sharedDeliveryId ? `/shared-ledger/${payment.sharedDeliveryId}/payments/${payment._id}` : `/payments/${payment._id}`;
}
