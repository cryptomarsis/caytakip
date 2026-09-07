const test = require('node:test');
const assert = require('node:assert/strict');
const { getAdCampaignCredits, isAdContentAllowed } = require('../server/adCampaign');

test('reklam süreleri doğru krediyle eşleşir', () => {
  assert.equal(getAdCampaignCredits(7), 500);
  assert.equal(getAdCampaignCredits('14'), 900);
  assert.equal(getAdCampaignCredits(30), 1500);
  assert.equal(getAdCampaignCredits(10), 0);
});

test('uygunsuz reklam içeriği engellenir', () => {
  assert.equal(isAdContentAllowed('Çay makinesi', 'Sezon indirimi'), true);
  assert.equal(isAdContentAllowed('Bahis sitesi', 'Kazanmaya başla'), false);
});
