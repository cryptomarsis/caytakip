module.exports = function models(mongoose) {
  const schema = fields => new mongoose.Schema(fields, { timestamps: true });
  const link = schema({
    cropperId: { type: String, required: true }, ownerId: { type: String, default: '' },
    cropperName: String, ownerName: String, label: String,
    denominator: { type: Number, enum: [2, 3], required: true },
    status: { type: String, enum: ['pending', 'active', 'closed'], default: 'pending' },
    inviteHash: { type: String, select: false }, expiresAt: Date,
    mutationSerial: { type: Number, default: 0 }, acceptedAt: Date,
  });
  link.index({ cropperId: 1, createdAt: -1 }); link.index({ ownerId: 1, createdAt: -1 });
  link.index({ inviteHash: 1 }, { unique: true, sparse: true });
  const delivery = schema({
    harvestId: { type: mongoose.Schema.Types.ObjectId },
    linkId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    cropperId: { type: String, required: true }, ownerId: { type: String, required: true },
    requestId: { type: String, required: true }, requestHash: String,
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 0 }, voided: { type: Boolean, default: false },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  });
  delivery.index({ cropperId: 1, requestId: 1 }, { unique: true });
  delivery.index({ harvestId: 1 }, { unique: true, partialFilterExpression: { harvestId: { $type: 'objectId' } } });
  delivery.index({ linkId: 1, _id: -1 });
  const event = schema({
    key: { type: String, unique: true, required: true }, recipient: { type: String, required: true, index: true },
    linkId: mongoose.Schema.Types.ObjectId, deliveryId: mongoose.Schema.Types.ObjectId,
    message: String, readAt: Date,
    state: { type: String, default: 'pending' }, attempts: { type: Number, default: 0 },
    nextAt: { type: Date, default: Date.now }, tickets: [mongoose.Schema.Types.Mixed], lastError: String,
  });
  event.index({ state: 1, nextAt: 1 });
  const device = schema({
    _id: String, userId: { type: String, required: true, index: true },
    sessionHash: String, sessionCreatedAt: Date, expiresAt: Date,
  });
  device.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return {
    ShareLink: mongoose.model('ShareLink', link), ShareDelivery: mongoose.model('ShareDelivery', delivery),
    ShareEvent: mongoose.model('ShareEvent', event), SharePushDevice: mongoose.model('SharePushDevice', device),
  };
};
