import { AppIconName } from './components/app-icon';

export type ActiveTab =
  | 'dashboard' | 'harvest' | 'history' | 'collections' | 'receivables'
  | 'more' | 'expense' | 'gardens' | 'prices' | 'reports' | 'settings'
  | 'assistant' | 'creditStore' | 'admin';

export type DesktopMenuItem = {
  group: string;
  tab: ActiveTab;
  icon: AppIconName;
  label: string;
  helper: string;
};

export const getDesktopMenuItems = (isAdmin: boolean): DesktopMenuItem[] => [
  { group: 'GENEL', tab: 'dashboard', icon: 'view-dashboard-outline', label: 'Ana Sayfa', helper: 'Genel durum ve özet' },
  { group: 'GENEL', tab: 'assistant', icon: 'robot-happy-outline', label: 'Çaylık Asistan', helper: 'Çay üretimi için yapay zekâ desteği' },
  { group: 'GENEL', tab: 'creditStore', icon: 'credit-card-outline', label: 'Kredi Yükle', helper: 'Kredi paketleri ve Çaylık Pro' },
  { group: 'GENEL', tab: 'harvest', icon: 'leaf-circle-outline', label: 'Hasat Ekle', helper: 'Yeni hasat kaydı' },
  { group: 'GENEL', tab: 'history', icon: 'history', label: 'Hasat Geçmişi', helper: 'Eski kayıtları bul ve düzenle' },
  { group: 'ÖDEMELER', tab: 'collections', icon: 'hand-coin-outline', label: 'Ödeme Al', helper: 'Tahsilat işlemleri' },
  { group: 'ÖDEMELER', tab: 'receivables', icon: 'cash-clock', label: 'Alacaklar', helper: 'Bekleyen ödemeler' },
  { group: 'ÖDEMELER', tab: 'expense', icon: 'receipt-text-outline', label: 'Giderler', helper: 'Masraf kaydı ve listesi' },
  { group: 'TAKİP', tab: 'gardens', icon: 'greenhouse', label: 'Bahçeler', helper: 'Bahçe bilgileri' },
  { group: 'TAKİP', tab: 'prices', icon: 'factory', label: 'Fabrika Fiyatları', helper: 'Güncel fiyat karşılaştırması' },
  { group: 'TAKİP', tab: 'reports', icon: 'chart-box-outline', label: 'Raporlar', helper: 'PDF, Excel ve analizler' },
  { group: 'HESAP', tab: 'more', icon: 'view-grid-outline', label: 'Diğer', helper: 'Tüm bölümlere kısa yol' },
  { group: 'HESAP', tab: 'settings', icon: 'cog-outline', label: 'Ayarlar', helper: 'Şifre ve hesap işlemleri' },
  ...(isAdmin ? [{ group: 'YÖNETİM', tab: 'admin' as const, icon: 'shield-account-outline' as AppIconName, label: 'Yönetim', helper: 'Yönetici paneli' }] : []),
];

export const mobileNavItems = [
  { tab: 'dashboard' as const, label: 'Ana Sayfa', icon: 'view-dashboard-outline' as AppIconName },
  { tab: 'collections' as const, label: 'Ödeme Al', icon: 'hand-coin-outline' as AppIconName },
  { tab: 'harvest' as const, label: 'Hasat Ekle', icon: 'leaf-circle-outline' as AppIconName },
  { tab: 'receivables' as const, label: 'Alacaklar', icon: 'cash-clock' as AppIconName },
  { tab: 'more' as const, label: 'Diğer', icon: 'view-grid-outline' as AppIconName },
];
