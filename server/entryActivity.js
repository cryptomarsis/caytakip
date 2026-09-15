// Aggregate existing records only; never copy entry contents into analytics.
const entryActivityPipeline = (match, now = Date.now()) => [
  { $match: match },
  { $group: {
    _id: { userId: '$userId', userPhone: '$userPhone' },
    count: { $sum: 1 },
    recent: { $sum: { $cond: [{ $gte: ['$createdAt', new Date(now - 30 * 86400000)] }, 1, 0] } },
    lastEntryAt: { $max: '$createdAt' },
  } },
];
const mergeEntryActivity = (profile, groups) => {
  const result = { counts: {}, recent: 0, lastEntryAt: null };
  for (const [kind, rows] of Object.entries(groups)) {
    result.counts[kind] = 0;
    for (const row of rows) {
      if (!((profile.userId && row._id?.userId === profile.userId) || (profile.phone && row._id?.userPhone === profile.phone))) continue;
      result.counts[kind] += row.count;
      result.recent += row.recent;
      if (row.lastEntryAt && (!result.lastEntryAt || new Date(row.lastEntryAt) > new Date(result.lastEntryAt))) result.lastEntryAt = row.lastEntryAt;
    }
  }
  return result;
};
module.exports = { entryActivityPipeline, mergeEntryActivity };
