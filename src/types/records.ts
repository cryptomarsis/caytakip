export interface HarvestRecord {
  _id: string;
  userId?: string;
  tarih?: string;
  surum?: string;
  uretici?: string;
  producerName?: string;
  kg?: number | string;
  weight?: number | string;
  firma?: string;
  fiyat?: number | string;
  tahsilat?: number | string;
  aciklama?: string;
  bahce?: string;
  garden?: string;
  isVadeli?: boolean;
  vadeTarihi?: string;
}

export interface ExpenseRecord {
  _id: string;
  tarih?: string;
  kategori?: string;
  aciklama?: string;
  tutar?: number | string;
}

export interface GardenRecord {
  _id: string;
  name?: string;
  adaParsel?: string;
  alan?: number | string;
}

export interface FactoryPriceRecord {
  _id: string;
  firma?: string;
  fiyat?: number | string;
  tarih?: string;
  fiyatTuru?: 'Haftalık' | 'Aylık' | 'Peşin' | 'Vadeli' | string;
  vadeGun?: number | string;
  gecerlilikBaslangic?: string;
}

export interface AdRecord {
  _id: string;
  slot?: string;
  firma?: string;
  kategori?: string;
  baslik?: string;
  aciklama?: string;
  telefon?: string;
  link?: string;
  gorselUrl?: string;
  baslangic?: string;
  bitis?: string;
}
