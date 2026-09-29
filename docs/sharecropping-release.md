# Pay Takibi — hasatla bağlantılı teslimatlar

Alt menüde Alacaklar'ın yanındaki Pay Takibi ekranında yarıcı anlaşma adı ve kendi 1/2 veya 1/3 payını belirler. 72 saatlik davet kodunu WhatsApp veya sistem paylaşım ekranından müstahsile gönderir. Kod uzun basarak da kopyalanabilir. Müstahsil adı/pay oranını görüp onaylar; bundan sonra yalnızca bu anlaşmanın teslimatlarını okuyabilir. Telefon numarası, diğer anlaşmalar ve özel hesap kayıtları paylaşılmaz.

KG, fabrika, tarih, isteğe bağlı vade ve birim fiyat girilir. Brüt tutardan mevcut %2 kesinti çıkarılır, kalan tutar kuruş hassasiyetinde bölüşülür. Örneğin 100 kg × 30 TL = 3.000 TL brüt, 60 TL kesinti, 2.940 TL net; yarıcı payı 1/3 ise 980 TL, müstahsil payı 1.960 TL. Bu satış payıdır, tahsil edilmiş para veya gider hesabı değildir.

Yeni teslimatlar Hasat Ekle'de isteğe bağlı anlaşma seçilerek tek seferde kaydedilir. Aynı MongoDB transaction'ı hasadı, bağlı teslimatı ve bildirim olayını yazar; bir hata hepsini geri alır. Fiziksel hasat kaydı tek kalır. `/api/shared-ledger` her katılımcı için kişisel hesap görünümü üretir: iki tarafta da teslimatın tüm KG'si, yalnızca o kişinin net satış payı ve kendi tahsilatı görünür. İstemci kaynak hasadı bu görünümle değiştirir; aynı kaydı tekrar toplamaz. Müstahsilin hesabına ikinci bir fiziksel hasat yazılmaz. ÇAYKUR kota kayıtları kendi mevcut kaynak API'sini kullanmaya devam eder.

Bağlı teslimatlar sadece yarıcının kaynak hasadından düzenlenir/silinir. Kaynak silinince teslimat iptal olarak saklanır ve iki hesabın toplamından çıkar. Tahsilatı olan bir teslimat, ilgili kişi tahsilatını düzeltmeden o payın altına düşürülemez veya silinemez. Eski bağımsız teslimatlar da kişisel hesap görünümüne dahil edilir; kaynak hasada otomatik dönüştürülmez. Pay değişikliği yeni onaylı anlaşma gerektirir. Değişiklik geçmişi korunur. Anlaşmayı kapatma yeni teslimatları durdurur; mevcut alacak tahsil edilebilir.

Ana sayfada ayrı Pay Takibi kartı yoktur. Ortak kayıtlar normal özet, aylık grafik, teslimatlar ve alacaklarda görünür. Pay Takibi ekranında ayrıca anlaşmaya göre kişisel hesap özeti, aylık grafik, alacaklar ve Ödeme Al bağlantıları vardır. Kişisel, ortak ve tahsilat verileri birlikte yenilenemediğinde karışık toplam gösterilmez; önceki hesap korunur. Uygulamaya dönünce ve hesap sekmeleri değişince yeniden yüklenir.

Tahsilatlar teslimatın `collections` listesinde kullanıcıya özel, kuruş hassasiyetinde tutulur. POST işlemleri kalıcı işlem kimliğiyle tekilleştirilir; PUT/DELETE revizyon kontrolü yapar. Herkes yalnız kendi tahsilatını görebilir/değiştirebilir. Diğer tarafın tahsilatı veya özel açıklaması paylaşılmaz. Yarıcının yeni hasat formunda toplam tahsilat girmesine izin verilmez; Ödeme Al'da kendi payı üzerinden girer. Eski uygulamanın ortak kaynak hasada doğrudan tahsilat yazması engellenir.

Eski kaynak hasattaki toplam tahsilat otomatik bölüştürülmez. Uygulama bu kayıtları uyarıyla gösterir ve yanlış vade bildirimi üretmez. Yarıcı kendisine ait tutarı önerir; kalan tutar müstahsile gösterilir ve müstahsil açıkça onaylar. Tek bir transaction iki kişinin tahsilatını oluşturur. Orijinal hasat/tahsilat tutarları aktarımın kaynağı olarak korunur; kişisel toplamda ikinci kez sayılmaz. Pay tutarı veya kaynak tahsilat değiştiyse onay reddedilir. Onaylı aktarım tekrar uygulanamaz.

Önce backend dağıtılmalıdır: bu istemci `/api/shared-ledger` gerektirir. Paylaşım seçiliyken ilk kayıt öncesi bağlantı ve aktif anlaşma kontrolü gerekir. Kayıt gönderildikten sonra bağlantı koparsa aynı işlem kimliğiyle çevrimdışı kuyrukta korunur. Bu düzenlemeler için push bildirim anahtarı kendiliğinden açılmaz.

## Yayına alma ön koşulları

- Önce backend ve MongoDB replica-set/transaction desteği. Yeni modellerin unique indekslerini kontrol et: davet hash'i, yarıcı+requestId, kaynak harvestId ve olay key'i. Yedekler bağlantı ve teslimatları içerir; push token/oturum hash'i ve davet sırları dışarı çıkarılmaz. Kurtarılan bekleyen davetler kapatılır, yeni davet gerekir. Eski yedekler desteklenir, yeni yedekte bozuk kaynak bağlantısı reddedilir.
- iOS/Android development veya mağaza build'inde Expo projectId ile APNs/FCM v1 credentials gereklidir. Expo Go push testi değildir.
- Sunucuda `SHARECROPPING_PUSH_ENABLED=true` yalnızca iki gerçek hesap ve cihazla doğrulandıktan sonra açılmalı. Expo enhanced security açıksa sunucuya `EXPO_ACCESS_TOKEN` girilmeli; mobil yapılandırmaya konmamalı.
- Uygulama bildirim iznini kullanıcı düğmeye basınca ister. Geçerli oturuma bağlı cihazlara genel kilit ekranı mesajı gönderilir; KG/fabrika/vade ayrıntıları uygulama içindedir. Push teslimi işletim sistemi/ağ nedeniyle garanti değildir. Her olay uygulamada kalır; belirsiz gönderim tekrar yollanarak çift bildirim üretilmez.
- Android/iOS fiziksel cihazda kapalı uygulama, bildirimden açma, izin reddi, çevrimiçi çıkış ve hesap değiştirme test edilmeli. Bu testler otomatik birim testlerinin yerine geçmez.
- Güncellenen gizlilik metnini ve mağazadaki veri paylaşım beyanlarını bu özellikle karşılaştır.

## Kontrol listesi

İki hesapla davet/onay, üçüncü hesabın erişememesi, aynı yarıcının iki müstahsile farklı kayıtları, 1/2 ve 1/3 hesapları, bağlantı kapatma, düzeltme/iptal ve toplamlar, ağ kesilip tekrar gönderme, çıkış sonrası diğer hesabın kayıtlarının görünmemesi. 100 kg × 30 TL, 1/2 örneğinde iki tarafta 100 kg ve 1.470 TL pay olmalı. Yarıcı 100 TL tahsil edince kendi kalan payı 1.370 TL, müstahsilin kalan payı 1.470 TL kalmalı. Eski tahsilat onaysız aktarılmamalı, iki onaydan sonra bir kez aktarılmalı. İlgisiz kişisel hasatlar değişmemeli.

İlk bağımsız sürüm backend'i daha önce gönderildi. Bu hasat bağlantısı/görünüm geliştirmesinde yeni sunucu dağıtımı, mağaza paketi ve gerçek cihaz bildirim testi yapılmadı.
