const AD_CAMPAIGN_PACKAGES = Object.freeze({ 7: 500, 14: 900, 30: 1500 });
const PROHIBITED_AD_CONTENT = /(kumar|bahis|casino|pornografi|müstehcen|uyuşturucu|silah satışı)/i;

function getAdCampaignCredits(durationDays) {
  return AD_CAMPAIGN_PACKAGES[Number(durationDays)] || 0;
}

function isAdContentAllowed(...values) {
  return !PROHIBITED_AD_CONTENT.test(values.map((value) => String(value || '')).join(' '));
}

module.exports = { AD_CAMPAIGN_PACKAGES, getAdCampaignCredits, isAdContentAllowed };
