const crypto = require('node:crypto');
const KEY_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const units = new Set(['7255812058', '3226384358', 'ca-app-pub-4870931624363029/7255812058', 'ca-app-pub-4870931624363029/3226384358']);

function createVerifier(fetchKeys = async () => {
  const response = await fetch(KEY_URL, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('AdMob doğrulama anahtarları alınamadı.');
  return response.json();
}) {
  let cache = { keys: [], at: 0 };
  return async function verify(rawUrl) {
    const query = rawUrl.slice(rawUrl.indexOf('?') + 1);
    const params = new URLSearchParams(query);
    for (const name of params.keys()) if (params.getAll(name).length !== 1) throw new Error('Tekrarlı doğrulama alanı.');
    const split = query.indexOf('&signature=');
    if (split < 0 || !/^signature=[^&]+&key_id=[^&]+$/.test(query.slice(split + 1))) throw new Error('Geçersiz imza biçimi.');
    const keyId = params.get('key_id');
    if (Date.now() - cache.at > 23 * 3600000 || !cache.keys.some(key => String(key.keyId) === keyId)) {
      if (Date.now() - cache.at < 60000) throw new Error('Bilinmeyen doğrulama anahtarı.');
      const data = await fetchKeys().catch(error => { error.retryable = true; throw error; });
      if (!Array.isArray(data.keys)) throw new Error('Geçersiz anahtar yanıtı.');
      cache = { keys: data.keys, at: Date.now() };
    }
    const key = cache.keys.find(key => String(key.keyId) === keyId);
    if (!key || !crypto.verify('sha256', Buffer.from(query.slice(0, split)), key.pem, Buffer.from(params.get('signature'), 'base64url'))) throw new Error('AdMob imzası doğrulanamadı.');
    const data = Object.fromEntries(params);
    if (!units.has(data.ad_unit) || !/^[\w-]{8,200}$/.test(data.transaction_id || '') || !/^[a-f0-9]{48}$/.test(data.custom_data || '') || !data.user_id) throw new Error('Reklam veya oturum bilgisi geçersiz.');
    return data;
  };
}

module.exports = { createVerifier };
