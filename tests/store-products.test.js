const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStoreProductId, findStorePackage } = require('../shared/storeProducts');
const pro = 'caylik_pro_monthly';
const pkg = (id, identifier = '$rc_monthly') => ({ identifier, product: { identifier: id, priceString: '119,99 TL' } });

test('Android Pro base plan resolves to catalog and original purchasable package', () => {
  const monthly = pkg(`${pro}:monthly`);
  assert.equal(normalizeStoreProductId(monthly.product.identifier, 'android'), pro);
  assert.equal(findStorePackage([monthly], pro, 'android'), monthly);
  assert.equal(findStorePackage([monthly], pro, 'android').product.priceString, '119,99 TL');
});
test('iOS and legacy Android identifiers continue to resolve', () => {
  for (const platform of ['ios', 'android']) {
    for (const id of [pro, 'caylik_credits_250', 'caylik_credits_750', 'caylik_credits_2000']) {
      const item = pkg(id);
      assert.equal(findStorePackage([item], id, platform), item);
    }
  }
});
test('Reject unknown products, Apple suffixes and malformed base plans', () => {
  for (const id of ['other:monthly', `${pro}:`, `${pro}:monthly:offer`, 'caylik_credits_250:monthly']) {
    assert.equal(normalizeStoreProductId(id, 'android'), null);
  }
  assert.equal(normalizeStoreProductId(`${pro}:monthly`, 'ios'), null);
  assert.equal(findStorePackage([], pro, 'android'), undefined);
});
test('Multiple base plans require an unambiguous configured monthly package', () => {
  const monthly = pkg(`${pro}:monthly`);
  const other = pkg(`${pro}:other`, 'other');
  assert.equal(findStorePackage([other, monthly], pro, 'android'), monthly);
  assert.equal(findStorePackage([other, pkg(`${pro}:another`, 'another')], pro, 'android'), undefined);
  assert.equal(findStorePackage([pkg('unrelated'), other], pro, 'android'), other);
});
