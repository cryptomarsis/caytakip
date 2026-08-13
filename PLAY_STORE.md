# Çaylık — Google Play Yayın Dosyası

Bu dosya, Google Play Console'a girilecek mağaza metinlerini ve yayın kontrolünü içerir.

## Mağaza metinleri

- Uygulama adı: `Çaylık`
- Kısa açıklama: `Hasat, net alacak, ödeme ve gider takibini kolaylaştırır.`
- Uygulama kategorisi: `Üretkenlik`
- İletişim e-postası: `caylik.destek@gmail.com`
- Gizlilik politikası: `https://cay-ureticisi-takip.onrender.com/privacy`
- Hesap silme bağlantısı: `https://cay-ureticisi-takip.onrender.com/delete-account`

## Uzun açıklama

Çaylık, yaş çay üreticilerinin günlük kayıtlarını kolayca takip etmesi için hazırlanmış sade bir yardımcı uygulamadır.

Hasat miktarını, satış yapılan fabrikayı ve brüt fiyatı kaydedin. Uygulama yüzde 2 kesintiyi otomatik hesaplar; net alacağı, yapılan tahsilatı ve kalan ödemeyi açık biçimde gösterir.

Çaylık ile:

- Hasat kayıtlarını tarih, sürüm ve bahçeye göre takip edin.
- Brüt satış, yüzde 2 kesinti ve net alacağı otomatik görün.
- Fabrikalardan alınan ödemeleri doğru hasat kaydına işleyin.
- Vadeli ve bekleyen alacakları tek ekranda izleyin.
- Bahçe, fabrika ve sürüm bazında raporları inceleyin.
- Giderleri kaydedip sezon özetini görün.
- Raporları Excel veya PDF olarak dışa aktarın.
- İnternet geçici olarak kesildiğinde kayıtları telefonda saklayıp bağlantı geldiğinde otomatik senkronize edin.

Çaylık, karmaşık ekranlar yerine kolay okunur kartlar ve büyük işlem düğmeleriyle çay üreticilerinin günlük kullanımı için tasarlanmıştır.

## Veri güvenliği beyanı için taslak

Play Console'daki Veri Güvenliği formu, uygulamanın gerçek davranışına göre doldurulmalıdır:

- Toplanan veriler: ad soyad, telefon numarası, hasat/satış, ödeme, gider ve bahçe bilgileri.
- Kullanım amacı: hesap oluşturma, uygulama işlevi, alacak takibi, raporlama ve destek.
- Paylaşım/satış: kullanıcı verileri üçüncü taraflara satılmaz veya reklam amacıyla paylaşılmaz.
- Aktarım güvenliği: uygulama ile sunucu arasındaki trafik HTTPS üzerinden şifrelenir.
- Silme: kullanıcı uygulama içinden hesabını ve ilişkili verilerini kalıcı olarak silebilir; web silme bağlantısı da yukarıdadır.

## Grafikler

- Uygulama simgesi: `assets/caylik-icon-v1.png`
- Google Play kapak görseli (1024 × 500, PNG): `assets/play-store-feature-v1.png`
- Henüz hazırlanması gereken tek mağaza görseli: gerçek uygulama ekran görüntüleri. Android emülatörde en az Hasat Ekle, Ödeme Al, Raporlar ve Ayarlar ekranlarının temiz ekran görüntülerini alın.

## Yayın sırası

1. `npx eas build --platform android --profile production` ile Android App Bundle (.aab) oluşturun.
2. Play Console'da yeni uygulama açın; paket adı `com.cryptomarsis.cayureticisi` olmalıdır.
3. Mağaza metinlerini, kapak görselini, ekran görüntülerini, gizlilik politikası ve hesap silme bağlantılarını ekleyin.
4. İç testte giriş, hasat ekleme, tahsilat, PDF/Excel, çevrimdışı kayıt ve hesap silmeyi deneyin.
5. Yeni kişisel Play geliştirici hesabıysa kapalı testte en az 12 kişinin uygulamaya 14 gün kesintisiz katılması gerekir. Ardından üretim erişimine başvurun.
