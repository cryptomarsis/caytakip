# Pay Takibi — hasatla bağlantılı teslimatlar

Alt menüde Alacaklar'ın yanındaki Pay Takibi ekranında yarıcı anlaşma adı ve kendi 1/2 veya 1/3 payını belirler. 72 saatlik davet kodunu WhatsApp veya sistem paylaşım ekranından müstahsile gönderir. Kod uzun basarak da kopyalanabilir. Müstahsil adı/pay oranını görüp onaylar; bundan sonra yalnızca bu anlaşmanın teslimatlarını okuyabilir. Telefon numarası, diğer anlaşmalar ve özel hesap kayıtları paylaşılmaz.

KG, fabrika, tarih, isteğe bağlı vade ve birim fiyat girilir. Brüt tutardan mevcut %2 kesinti çıkarılır, kalan tutar kuruş hassasiyetinde bölüşülür. Örneğin 100 kg × 30 TL = 3.000 TL brüt, 60 TL kesinti, 2.940 TL net; yarıcı payı 1/3 ise 980 TL, müstahsil payı 1.960 TL. Bu satış payıdır, tahsil edilmiş para veya gider hesabı değildir.

Yeni teslimatlar Hasat Ekle'de isteğe bağlı anlaşma seçilerek tek seferde kaydedilir. Aynı MongoDB transaction'ı hasadı, bağlı teslimatı ve bildirim olayını yazar; bir hata hepsini geri alır. Hasat yalnızca yarıcının normal defterinde bir kez sayılır; seçili ÇAYKUR cüzdanına mevcut kota kuralları uygulanır. Müstahsilin özel hasat/alacak defterine kopyalanmaz. Normal hasat net alacağı tam satış tutarıdır; kişisel satış payı ayrı ve açık etiketlenir, tahsilat değildir.

Bağlı teslimatlar sadece kaynak hasattan düzenlenir/silinir. Kaynak silinince teslimat iptal olarak saklanır ve ortak toplamdan çıkar. Eski bağımsız teslimatlar otomatik taşınmaz; eski toplamlar değişmez. Pay değişikliği yeni onaylı anlaşma gerektirir. Önce/sonra değişiklikleri iki tarafın da görebileceği açılır geçmişte gösterilir. Anlaşmayı kapatma yeni kayıtları durdurur, mevcut kaynak kaydın düzeltme/iptalini engellemez. Hesap silinmesi ortak kayıtları iki taraftan kaldırır; diğer tarafın kendi hasadı korunup paylaşım bağlantısı temizlenir.

Ana sayfada ve Pay Takibi'nde KG / satıştan kişisel pay özeti bulunur. İptal edilenler toplama girmez. Yeni mobil akış `/api/sharecropping` yanıtında `harvestSharing: true` arar: önce backend dağıtılmalıdır. Paylaşım seçiliyken ilk kayıt öncesi bağlantı ve aktif anlaşma kontrolü gerekir; kontrol sırasında çevrimdışıyken kayıt gönderilmez. Kontrolden sonra bağlantı koparsa mevcut güvenli çevrimdışı kuyruğa aynı istek kimliğiyle alınır.

## Yayına alma ön koşulları

- Önce backend ve MongoDB replica-set/transaction desteği. Yeni modellerin unique indekslerini kontrol et: davet hash'i, yarıcı+requestId, kaynak harvestId ve olay key'i. Yedekler bağlantı ve teslimatları içerir; push token/oturum hash'i ve davet sırları dışarı çıkarılmaz. Kurtarılan bekleyen davetler kapatılır, yeni davet gerekir. Eski yedekler desteklenir, yeni yedekte bozuk kaynak bağlantısı reddedilir.
- iOS/Android development veya mağaza build'inde Expo projectId ile APNs/FCM v1 credentials gereklidir. Expo Go push testi değildir.
- Sunucuda `SHARECROPPING_PUSH_ENABLED=true` yalnızca iki gerçek hesap ve cihazla doğrulandıktan sonra açılmalı. Expo enhanced security açıksa sunucuya `EXPO_ACCESS_TOKEN` girilmeli; mobil yapılandırmaya konmamalı.
- Uygulama bildirim iznini kullanıcı düğmeye basınca ister. Geçerli oturuma bağlı cihazlara genel kilit ekranı mesajı gönderilir; KG/fabrika/vade ayrıntıları uygulama içindedir. Push teslimi işletim sistemi/ağ nedeniyle garanti değildir. Her olay uygulamada kalır; belirsiz gönderim tekrar yollanarak çift bildirim üretilmez.
- Android/iOS fiziksel cihazda kapalı uygulama, bildirimden açma, izin reddi, çevrimiçi çıkış ve hesap değiştirme test edilmeli. Bu testler otomatik birim testlerinin yerine geçmez.
- Güncellenen gizlilik metnini ve mağazadaki veri paylaşım beyanlarını bu özellikle karşılaştır.

## Kontrol listesi

İki hesapla davet/onay, üçüncü hesabın erişememesi, aynı yarıcının iki müstahsile farklı kayıtları, 1/2 ve 1/3 hesapları, bağlantı kapatma, düzeltme/iptal ve toplamlar, ağ kesilip tekrar gönderme, çıkış sonrası diğer hesabın kayıtlarının görünmemesi. Yeni teslimat kaynak hesapta bir kez sayılmalı; müstahsilin özel defterine eklenmemeli. Eski bağımsız teslimatlar ve ilgisiz hasatlar değişmemeli.

İlk bağımsız sürüm backend'i daha önce gönderildi. Bu hasat bağlantısı/görünüm geliştirmesinde yeni sunucu dağıtımı, mağaza paketi ve gerçek cihaz bildirim testi yapılmadı.
