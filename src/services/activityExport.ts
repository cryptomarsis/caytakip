import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import { API_URL, type fetchWithTimeout } from './api';
import { buildActivityWorkbook, parseActivityExport, validateActivityRange, type ActivityExport } from '../utils/activityExport';

export async function loadActivityExport(token: string, start: string, end: string, request: typeof fetchWithTimeout, signal?: AbortSignal) {
  validateActivityRange(start, end);
  if (!token) throw Error('Rapor için yönetici hesabınızla giriş yapın.');
  const response = await request(`${API_URL}/admin/activity-export?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }, 120000);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error(response.status === 404 ? 'Kullanım raporu sunucuda henüz hazır değil. Sunucu güncellemesi gerekiyor.'
    : response.status === 401 || response.status === 403 ? 'Bu raporu yalnızca asıl yönetici indirebilir. Oturumunuzu kontrol edin.'
      : data?.error || 'Kullanım raporu hazırlanamadı. Tekrar deneyin.');
  return parseActivityExport(data, { start, end });
}

export async function saveActivityExport(data: ActivityExport, isActive: () => boolean): Promise<void> {
  if (!isActive()) return;
  const fileName = `Caylik_Kullanim_${data.start}_${data.end}_${Date.now()}.xlsx`;
  const workbook = buildActivityWorkbook(data);
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (Platform.OS === 'web') {
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
    if (!isActive()) return;
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const link = document.createElement('a');
    try {
      link.href = url; link.download = fileName; document.body.appendChild(link); link.click();
    } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return;
  }
  const [FileSystem, Sharing] = await Promise.all([import('expo-file-system/legacy'), import('expo-sharing')]);
  if (!isActive()) return;
  if (!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) throw Error('Bu cihazda dosya paylaşımı kullanılamıyor. Bilgisayardaki yönetici panelinden indirebilirsiniz.');
  if (!isActive()) return;
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(uri, XLSX.write(workbook, { bookType: 'xlsx', type: 'base64', compression: true }), { encoding: FileSystem.EncodingType.Base64 });
    if (isActive()) await Sharing.shareAsync(uri, { mimeType, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Çaylık kullanım raporunu kaydet' });
  } finally {
    // Only this export's generated cache file; never user-selected files.
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
