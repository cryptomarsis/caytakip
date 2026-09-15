const PRODUCT_IDS = ['caylik_credits_250', 'caylik_credits_750', 'caylik_credits_2000', 'caylik_pro_monthly'];

// Google Play subscriptions include a base-plan suffix in RevenueCat.
// Never strip suffixes from consumables or from Apple product identifiers.
function normalizeStoreProductId(identifier, platform) {
  if (typeof identifier !== 'string') return null;
  if (PRODUCT_IDS.includes(identifier)) return identifier;
  if (platform === 'android' && /^caylik_pro_monthly:[a-z0-9][a-z0-9-]*$/.test(identifier)) {
    return 'caylik_pro_monthly';
  }
  return null;
}

function findStorePackage(packages, productId, platform) {
  const matches = packages.filter(item => normalizeStoreProductId(item.product.identifier, platform) === productId);
  if (matches.length === 1) return matches[0];
  // Respect the explicitly configured monthly package when multiple plans exist.
  const monthly = matches.filter(item => item.identifier === '$rc_monthly');
  return productId === 'caylik_pro_monthly' && monthly.length === 1 ? monthly[0] : undefined;
}

module.exports = { normalizeStoreProductId, findStorePackage };
