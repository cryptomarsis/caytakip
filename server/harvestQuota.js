const { resolveQuotaPlan, isCaykur } = require('../shared/quota');

// No counter mutation: quota usage is derived from persisted harvests, including
// edits/deletions. This keeps offline retries and idempotent saves from double charging.
module.exports = async function harvestQuota(UserProfile, userId, record, requestedId) {
  if (!isCaykur(record.firma)) return '';
  let profile;
  try { profile = await UserProfile.findOne({ userId }).select('quotaPlans').lean(); }
  catch { throw Error('ÇAYKUR cüzdan bilgileri doğrulanamadı. Lütfen yeniden deneyin.'); }
  return resolveQuotaPlan(profile?.quotaPlans || [], record, requestedId);
};
