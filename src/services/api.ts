export const API_URL = 'https://cay-ureticisi-takip.onrender.com/api';

export const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') throw new Error('Sunucu yanıt vermekte gecikti. Lütfen birkaç saniye sonra tekrar deneyin.');
    throw new Error('İnternet veya sunucu bağlantısı kurulamadı.');
  }
};
