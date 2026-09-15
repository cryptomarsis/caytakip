const MAX_USERS = 20000;
const BATCH_SIZE = 500;
const MAX_GROUPS = 500000;
const QUERY_TIMEOUT_MS = 10000;
const EXPORT_TIMEOUT_MS = 90000;
const DAY_MS = 86400000;
const countFields = ['harvestCount', 'paymentCount', 'expenseCount', 'gardenCount'];
const emptyCounts = () => ({ harvestCount: 0, paymentCount: 0, expenseCount: 0, gardenCount: 0, totalCount: 0 });
const failure = (exportStatus, message) => Object.assign(Error(message), { exportStatus });

function readRange(query) {
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
  };
  const start = date(query?.start);
  const end = date(query?.end);
  if (!start || !end || end < start) throw failure(400, 'Başlangıç ve bitiş tarihlerini YYYY-MM-DD biçiminde, doğru sırayla girin.');
  if ((end - start) / DAY_MS >= 366) throw failure(400, 'Bir dışa aktarım en fazla 366 günü kapsayabilir.');
  return { start, endExclusive: new Date(end.getTime() + DAY_MS) };
}

function uniqueOwners(profiles, field) {
  const owners = new Map();
  for (const profile of profiles) {
    const value = profile[field];
    if (typeof value !== 'string' || !value) continue;
    // Do not guess which account owns a corrupt/ambiguous legacy identifier.
    owners.set(value, owners.has(value) ? null : profile);
  }
  return owners;
}

function ownershipFilter(batch, owners) {
  const userIds = batch.filter(p => owners.userId.get(p.userId) === p).map(p => p.userId);
  const phones = batch.filter(p => owners.phone.get(p.phone) === p).map(p => p.phone);
  const branches = [];
  if (userIds.length) branches.push({ userId: { $in: userIds } });
  // A present userId is authoritative. A conflicting or deleted account ID must
  // never be reassigned to somebody else merely because a phone number matches.
  if (phones.length) branches.push({ userId: { $in: [null, ''] }, userPhone: { $in: phones } });
  return branches.length ? { $or: branches } : null;
}

function activityPipeline(match, range, unknownDates, limit) {
  if (unknownDates) return [
    { $match: { ...match, createdAt: { $not: { $type: 'date' } } } },
    { $count: 'count' },
  ];
  const missingId = { $in: [{ $ifNull: ['$userId', ''] }, ['']] };
  return [
    { $match: { ...match, createdAt: { $type: 'date', $gte: range.start, $lt: range.endExclusive } } },
    { $group: {
      _id: {
        userId: { $ifNull: ['$userId', ''] },
        userPhone: { $cond: [missingId, '$userPhone', ''] },
        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
      },
      count: { $sum: 1 },
      lastEntryAt: { $max: '$createdAt' },
    } },
    // A resource limit produces an explicit failure, never a partial export.
    { $limit: limit },
  ];
}

const timestamp = value => {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

module.exports = function registerActivityExportRoutes(app, { requireAuth, UserProfile, Harvest, Payment, Expense, Garden, now = Date.now }) {
  const activeExports = new Set();
  app.get('/api/admin/activity-export', requireAuth, async (req, res) => {
    const startedAt = now();
    let lockHeld = false;
    const disconnected = () => req.aborted === true || res.destroyed === true;
    const checkBudget = () => {
      if (disconnected()) throw failure(503, 'İndirme bağlantısı kapandı.');
      if (now() - startedAt >= EXPORT_TIMEOUT_MS) throw failure(503, 'Rapor hazırlama süresi aşıldı. Daha kısa bir tarih aralığıyla yeniden deneyin.');
    };
    const loadAdmin = () => UserProfile.findOne({ userId: req.auth.userId }).select('role active').maxTimeMS(QUERY_TIMEOUT_MS).lean();
    const isAdmin = profile => profile?.role === 'admin' && profile.active !== false;
    try {
      // Re-read current authorization from the DB; manager permissions and old
      // admin claims in a JWT cannot authorize this all-user export.
      const admin = await loadAdmin();
      checkBudget();
      if (!isAdmin(admin)) return res.status(403).json({ error: 'Kullanım analizini yalnızca aktif ana yönetici indirebilir.' });
      const range = readRange(req.query);
      if (activeExports.has(req.auth.userId) || activeExports.size >= 2) return res.status(429).json({ error: 'Bir kullanım raporu zaten hazırlanıyor. Lütfen tamamlanmasını bekleyip yeniden deneyin.' });
      activeExports.add(req.auth.userId);
      lockHeld = true;
      const profiles = await UserProfile.find({}).select('_id userId phone createdAt').sort({ _id: 1 }).limit(MAX_USERS + 1).maxTimeMS(QUERY_TIMEOUT_MS).lean();
      checkBudget();
      if (profiles.length > MAX_USERS) throw failure(413, 'Bu indirme en fazla 20.000 kullanıcıyı destekler. Veriler kesilmedi; daha büyük rapor için destek alın.');
      const owners = { userId: uniqueOwners(profiles, 'userId'), phone: uniqueOwners(profiles, 'phone') };
      const summaries = new Map();
      for (const profile of profiles) {
        const id = String(profile._id || '');
        // Never fall back to userId: legacy userIds contain the user's phone.
        if (!/^[a-f\d]{24}$/i.test(id)) throw failure(503, 'Kullanıcıların gizli rapor anahtarları hazırlanamadı. Lütfen daha sonra deneyin.');
        summaries.set(profile, { userKey: `user_${id.toLowerCase()}`, registeredAt: timestamp(profile.createdAt), ...emptyCounts(), activeDays: new Set(), lastEntryAt: null });
      }
      const days = new Map();
      for (let ms = range.start.getTime(); ms < range.endExclusive.getTime(); ms += DAY_MS) {
        const date = new Date(ms).toISOString().slice(0, 10);
        days.set(date, { date, ...emptyCounts(), activeUsers: new Set() });
      }
      let excludedUnknownDates = 0;
      let groupCount = 0;
      const models = [Harvest, Payment, Expense, Garden];
      for (let offset = 0; offset < profiles.length; offset += BATCH_SIZE) {
        checkBudget();
        const match = ownershipFilter(profiles.slice(offset, offset + BATCH_SIZE), owners);
        if (!match) continue;
        const results = await Promise.all(models.map(async (Model, index) => {
          const filter = index === 1 ? { ...match, legacyDetail: { $ne: true } } : match;
          const query = pipeline => Model.aggregate(pipeline).option({ maxTimeMS: QUERY_TIMEOUT_MS, allowDiskUse: true });
          const rows = await query(activityPipeline(filter, range, false, MAX_GROUPS - groupCount + 1));
          checkBudget();
          const undated = await query(activityPipeline(filter, range, true));
          checkBudget();
          return { rows, undated, field: countFields[index] };
        }));
        checkBudget();
        for (const { rows, undated, field } of results) {
          groupCount += rows.length;
          if (groupCount > MAX_GROUPS) throw failure(413, 'Bu tarih aralığında çok fazla kayıt grubu var. Veriler kesilmedi; daha kısa bir tarih aralığı seçin.');
          excludedUnknownDates += undated[0]?.count || 0;
          for (const row of rows) {
            const profile = row._id.userId ? owners.userId.get(row._id.userId) : owners.phone.get(row._id.userPhone);
            const summary = summaries.get(profile);
            const daily = days.get(row._id.date);
            if (!summary || !daily) continue;
            summary[field] += row.count;
            summary.totalCount += row.count;
            summary.activeDays.add(row._id.date);
            const lastEntryAt = timestamp(row.lastEntryAt);
            if (lastEntryAt && (!summary.lastEntryAt || lastEntryAt > summary.lastEntryAt)) summary.lastEntryAt = lastEntryAt;
            daily[field] += row.count;
            daily.totalCount += row.count;
            daily.activeUsers.add(summary.userKey);
          }
        }
      }
      const users = [...summaries.values()].map(summary => ({ ...summary, activeDays: summary.activeDays.size }));
      // A role revoked during a long report must not receive its all-user data.
      checkBudget();
      const finalAdmin = await loadAdmin();
      checkBudget();
      if (!isAdmin(finalAdmin)) return res.status(403).json({ error: 'Yönetici yetkisi değişti. Kullanım raporu indirilemedi.' });
      res.set?.('Cache-Control', 'no-store');
      return res.json({
        generatedAt: new Date().toISOString(), start: req.query.start, end: req.query.end, timezone: 'UTC', users,
        daily: [...days.values()].map(day => ({ ...day, activeUsers: day.activeUsers.size })),
        totals: { userCount: users.length, activeUsers: users.filter(user => user.totalCount > 0).length, totalCount: users.reduce((sum, user) => sum + user.totalCount, 0) },
        excludedUnknownDates,
        notes: [
          'Tarih aralığı UTC ve iki uç gün dahil; işlem tarihi createdAt alanıdır, hasat/ödeme günü değildir.',
          'Tüm mevcut kullanıcılar, sıfır kayıtlı olanlar dahil listelenir. Yalnızca halen saklanan hasat, tahsilat, gider ve bahçe kayıtları sayılır; silinen kayıtlar ve tıklama/oturum geçmişi ölçülmez.',
          'Tahsilat legacyDetail kopyaları sayılmaz. Kullanıcı kodları profil kimliğinden türetilir; ad, telefon, tutar ve kayıt içeriği içermez.',
          'Tarihsiz veya geçersiz createdAt kayıtları aralığa atanamaz; excludedUnknownDates eşleşen kullanıcıların tüm tarihsiz kayıt sayısıdır, seçili dönemin sayısı değildir.',
          'Kullanıcı kimliği önceliklidir; yalnızca kimliği boş eski kayıtlarda tekil telefon eşleşmesi kullanılır. Sahipsiz veya belirsiz kimlikler başka hesaba atanmaz.',
        ],
      });
    } catch (error) {
      if (disconnected()) return;
      const status = [400, 413, 503].includes(error.exportStatus) ? error.exportStatus : 503;
      return res.status(status).json({ error: error.exportStatus ? error.message : 'Kullanım analizi hazırlanamadı. Daha kısa bir tarih aralığıyla yeniden deneyin.' });
    } finally {
      if (lockHeld) activeExports.delete(req.auth.userId);
    }
  });
};
