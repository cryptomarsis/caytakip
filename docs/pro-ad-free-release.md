# Çaylık Pro ve reklam alanları

- iOS `caylik_pro_monthly` ve Android aynı ürünün `:temel-plan` biçimi RevenueCat CustomerInfo üzerinden kontrol edilir. Kredi bakiyesi veya yerel bir Pro anahtarı kullanılmaz.
- Aktif Pro: AdMob banner, doğal reklam, ödüllü reklam ve ana sayfanın sponsor banner'ları gizlenir. Reklam başvurusu oluşturma özelliği kullanılabilir.
- Abonelik durumu belirsizken (başlangıç, hesap değişimi, bağlantı hatası) reklam gösterilmez. Yenileme iptali, ücretli dönem bitene kadar reklamsız kullanımı kaldırmaz.
- Satın alma, geri yükleme, uygulamaya dönüş ve öndeyken dakikalık kontrol abonelik durumunu yeniler. Yeni oturum eski hesabın sonucunu kullanmaz.
- Doğal reklam alanları: ana sayfa, fabrika fiyatları, raporlar; ek olarak Hasat Geçmişi, Alacaklar ve Diğer bölümlerinin sonunda birer alan. Alt banner mevcut sekmelerde devam eder. Asistan düğmesi banner yüksekliği kadar yukarı taşınır.
- Hasat/tahsilat kaydetme, giriş, ödeme veya veri eşitleme reklam izleme şartına bağlanmaz. Ödüllü reklam isteğe bağlıdır; mevcut sunucu doğrulaması ve günlük sınırı değişmez.
- Geçiş (interstitial) reklamı, veri girilmeden önce Hasat Ekle ekranına kullanıcı tarafından geçilirken çalışır. Android birimi `/6113892832`, iOS birimi `/2363273527`; geliştirmede SDK test kimliği kullanılır. İlk 60 saniyede gösterilmez, her iki uygun girişten daha sık gösterilmez, gösterimler arasında en az 2 dakika ve uygulama oturumu başına en fazla 3 gösterim vardır. Pro, doğrulaması belirsiz kullanıcılar, izin/SDK hazır değilken ve arka planda reklam istenmez. Önceden yüklenmediyse ekran hemen açılır; sonradan gelen reklam formun üzerine açılmaz. Kayıt/ödeme sunucu çağrılarına bağlanmamıştır.

## Yayından önce cihaz testi

1. Android/iOS mağaza test build'inde ücretsiz hesap: doğal reklam ve alt banner yüklenmesini, Asistan düğmesinin reklamı örtmemesini kontrol et. Geliştirmede sadece test reklamları kullanılır.
2. Pro satın al: aynı oturumda reklam alanlarının ve ödül düğmelerinin kaybolduğunu kontrol et. Tüketilebilir kredi paketi tek başına reklamsız kullanım açmamalı.
3. Yeniden aç ve satın alımları geri yükle: aktif Pro korunmalı. Başka ücretsiz hesaba geçildiğinde Pro bilgisi taşınmamalı (RevenueCat satın alma transfer kuralları ayrıca dikkate alınır).
4. Sandbox aboneliği yenileme/sona erme ve çevrimdışı açılışı dene. Belirsiz doğrulamada uygulama çalışmalı, reklam gösterilmemeli.
   Geçiş reklamı için test build'inde ilk 60 saniyeyi bekleyip iki kez Hasat Ekle'ye gir. Reklamı kapatınca form açılmalı; peş peşe girişte, Pro'da, arka planda ve dolum olmadığında reklam çıkmamalı. Reklam gösterilirken uygulamanın pasif/aktif yaşam döngüsü ve iOS ATT/UMP tercihi değişimi ayrıca denenmeli.
5. Yeni uygulama build'iyle birlikte Pro mağaza açıklamalarına “Aktif abonelik boyunca reklamsız kullanım ve her başarılı aylık yenilemede 1.500 kredi” bilgisini ekle. Henüz eski uygulama sürümleri reklamsız özelliği desteklemez.

Bu değişiklik için kredi verme/webhook sözleşmesi değiştirilmedi. Gerçek cihaz testi, build, Git push ve mağaza yayını bu kod düzenlemesinin parçası olarak yapılmadı.
