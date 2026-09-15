const idPattern = /^[a-f0-9]{24}$/i;
function validateBackup(body, names) {
  let count = 0;
  for (const name of names) {
    if (!Array.isArray(body?.[name])) throw Error(`Yedekte ${name} listesi eksik.`);
    const ids = new Set();
    for (const row of body[name]) {
      if (!row || !idPattern.test(String(row._id)) || ids.has(String(row._id))) throw Error(`${name}: geçersiz veya tekrarlı kayıt kimliği.`);
      ids.add(String(row._id));
      if (++count > 100000) throw Error('Bu yedek kontrollü yönetici aktarımı gerektiriyor.');
    }
  }
  const harvests = new Map(body.harvests.map(row => [String(row._id), row]));
  for (const payment of body.payments) {
    const harvest = harvests.get(String(payment.harvestId));
    if (!harvest || (payment.userId && harvest.userId && payment.userId !== harvest.userId)) throw Error('Tahsilatın bağlı olduğu hasat yedekte eksik veya başka kullanıcıya ait.');
  }
  for (const user of body.users) for (const plan of user.quotaPlans || []) for (const id of plan.recordIds || []) {
    if (!harvests.has(String(id))) throw Error('Kota planının bağlı olduğu hasat yedekte eksik.');
  }
  return count;
}

async function readBackup(models, mongoose) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = { version: 'V20', exportedAt: new Date().toISOString(), containsAuthentication: false };
      // Sequential reads in a single snapshot, not separate racing collection reads.
      // Password verification hashes remain excluded by schema selection.
      for (const [name, Model] of Object.entries(models)) result[name] = await Model.find().session(session).lean();
    }, { readConcern: { level: 'snapshot' } });
    return result;
  } finally { await session.endSession(); }
}

module.exports = { validateBackup, readBackup, restoreBackup: async (body, models, mongoose) => {
  const names = Object.keys(models);
  validateBackup(body, names);
  const session = await mongoose.startSession();
  let restored = 0;
  try {
    await session.withTransaction(async () => {
      restored = 0;
      // Never merge stale wallet balances into live business data. Restore is recovery
      // into empty domain collections, preserving all original relationship IDs.
      for (const name of names.filter(name => name !== 'users')) {
        if (await models[name].exists({}).session(session)) throw Error('Hedef veritabanında kayıt var. Mevcut verilerin üzerine geri yükleme yapılmaz; ayrı kurtarma ortamı kullanın.');
      }
      for (const name of names) for (const row of body[name]) {
        if (name === 'users') {
          const existing = await models.users.findOne({ userId: row.userId }).session(session).lean();
          if (existing) {
            if (String(existing._id) !== String(row._id) || Number(existing.aiCredits || 0) !== Number(row.aiCredits || 0) || JSON.stringify(existing.quotaPlans || []) !== JSON.stringify(row.quotaPlans || [])) throw Error('Mevcut kullanıcı ile yedek uyuşmuyor; otomatik birleştirme yapılmadı.');
            continue;
          }
          if (!row.pinHash || !row.pinSalt) throw Error('Yedek oturum doğrulama bilgilerini içermiyor. Kullanıcı hesaplarını ayrı, güvenli kurtarma süreciyle hazırlayın; eksik hesap oluşturulmadı.');
        }
        const copy = { ...row }; delete copy.__v;
        await models[name].create([copy], { session });
        restored++;
      }
    });
    return { ok: true, restored };
  } finally { await session.endSession(); }
} };
