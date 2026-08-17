export const API_ORIGIN = 'https://cay-ureticisi-takip.onrender.com';
export const API_URL = `${API_ORIGIN}/api`;
export const API_TIMEOUTS = {
  default: 25000,
  authentication: 25000,
};

export const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = API_TIMEOUTS.default) => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error('Sunucu yanıt vermekte gecikti. Lütfen birkaç saniye sonra tekrar deneyin.');
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, timeout);
  });
  try {
    return await Promise.race([fetch(url, { ...options, signal: controller.signal }), timeoutPromise]);
  } catch (error: any) {
    if (error === timeoutError || error?.name === 'AbortError') throw timeoutError;
    throw new Error('İnternet veya sunucu bağlantısı kurulamadı.');
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};
