# Kayıt ve kredi güvenliği — 15 Eylül 2026

Bu çalışma yereldir. GitHub push, Render dağıtımı, EAS Build/Update, TestFlight veya Play Store gönderimi yapılmadı.

## Eklenenler

- Çevrimiçi kayıt da gönderilmeden önce telefon kuyruğuna yazılır. Aynı kimlik çevrimdışı tekrar denemede korunur; eşzamanlı kuyruk yazıları serileştirilir. Geç gelen senkronizasyon sonucu yeni kayıtları silemez.
- Sunucu işlem kimliğini iş yazımından önce rezerve eder; sonuç kaydedilmeden başarı yanıtı verilmez. Aynı kimlik farklı içerikle kullanılamaz. Hasat/ilk tahsilat ve tahsilat/toplam yazıları MongoDB transaction içindedir.
- Reklam başvurusu/kredi düşümü/defter kaydı; onay/banner oluşturma; ret/iade/defter kaydı transaction içindedir.
- Bozuk JSON, nesne yerine HTML, bozuk cihaz kuyruğu ve tamamlanamayan sayfalama başarılı boş veri olarak kabul edilmez. Hesap değişiminde önceki hesabın listeleri gizlenir; eski isteklerin sonucu uygulanmaz.
- Yedek geri yüklemede ObjectId'ler korunur, tahsilat-hasat ilişkileri kontrol edilir; önce önizleme gerekir. Dolu iş koleksiyonlarının üzerine yazılmaz. Yeni kullanıcı için PIN doğrulama alanı içermeyen eski yedekler reddedilir; hesap kurtarması ayrıca hazırlanmalıdır. Bu bir canlı veri birleştirme aracı değildir.
- Mağaza fiyatı gelmeyen pakette örnek fiyat veya aktif satın al düğmesi yoktur. Mağaza işlemi cihazda hesap bazında saklanır; backend işlem kaydı en çok altı kez kontrol edilir. Sonuç bekliyorsa sonraki uygulama açılışında tekrar sorgulanır. Sandbox işlemleri gerçek krediye dönüşmez.
- Fiş yüzdesi yerine okunan alan sayısı gösterilir. Son firma/bahçe/cüzdanı getirme güncel tarih kullanır, fiyat ve kiloyu sıfırlar.
- Hasat Geçmişi altında ortak işlem geçmişi; ana sayfada kota, 7 günlük vadeli alacak ve kuyruk özeti; hasattan Asistan'a gönderilmeden önce düzenlenebilir soru taslağı eklendi.

## AdMob için yayın sırasında yapılacaklar

1. Backend dağıtıldığında HTTPS doğrulama adresi:
   `https://cay-ureticisi-takip.onrender.com/api/webhooks/admob`
2. AdMob'da iOS ödüllü birimi `7255812058` ve Android ödüllü birimi `3226384358` için server-side verification adresi olarak bunu tanımlayın. Başka birim/test reklamı gerçek kredi vermez.
3. Panel ayarı tamamlandıktan sonra Render'da `ADMOB_SSV_ENABLED=true` tanımlayın. Kesintisiz geçiş için `ADMOB_LEGACY_REWARDS_ENABLED=true` korunur; SSV kapalıyken yeni oturumlar geçici uyumluluk modundadır. Ayrıntılar: `reward-rollout.md`.
4. Yeni istemci oturum kimliğini `custom_data`, kullanıcı kimliğini `user_id` olarak SDK'ya verir. Google ECDSA imzası ham sorgu üzerinde doğrulanır. Cüzdan, tekil transaction ID ve defter aynı transaction içinde kaydedilir. Ödül sabit 10 kredi, kullanıcı başına UTC gününde en fazla üç kezdir.
5. Eski istemcinin ödül POST'u geçiş sırasında ortak günlük limit ve transaction korumasıyla çalışır. Eski yolun kapatılması ayrıca onaylanır; SSV'yi açmak eski yolu kapatmaz.
6. Gerçek cihazda izin verilmiş reklam akışı ve gerçek Google SSV callback'i henüz test edilmedi. Panelin örnek isteği geçerli kullanıcı oturumu taşımadığı için gerçek hesaba kredi yazmamalıdır. Kendi canlı reklamınıza tıklamayın; AdMob test cihazı/araçlarını kullanın.

Kaynak: https://developers.google.com/admob/android/ssv

## Yayın kapıları

- Render MongoDB bağlantısında transaction destekli replica set/Atlas gerekli; transaction çalışmazsa kredi işlemi başarısız kalır, işlemler ayrı ayrı kaydedilmez.
- `IdempotencyRecord` üzerindeki kullanıcı/anahtar/yöntem/yol unique index'i ve yeni `AdRewardSession` nonce/transaction unique index'leri hazır olmalı.
- Eski sunucudaki `/quota/records/:id` eksikliği ancak toplu backend dağıtımından sonra cihazda çözülür.
- `REQUEST_IN_PROGRESS` uzun süre kalırsa ilgili kimlik ile iş kaydı ve defter incelenmelidir. Sonuç bilinmeden idempotency kaydını silmeyin; yeniden farklı kimlikle finansal işlem oluşturmayın.
- Satın alma durum sorgusunu hem iOS hem Google Play işlem kimliğiyle gerçek cihazda doğrulayın. Aynı işlem yeniden satın alınarak test edilmemelidir.
- Yerel kontroller, gerçek MongoDB çoklu işlem davranışını ve mağaza/AdMob canlı uçtan uca doğrulamasını kapsamaz; bunlar yayından önce kontrollü ortamda yapılmalıdır.

## Yerel kontroller

`npm test`, `npx tsc --noEmit`, `npm run lint`, `node --check server.js`,
`npx expo export --platform all --output-dir .expo/reliability-check`.
Çıktı klasörü `.expo` altındadır; commit edilmemelidir.

Son sonuç (15 Eylül, ATT ve kesintisiz geçiş düzeltmeleri dahil): 202 test geçti; TypeScript ve lint hatasız; sunucu sözdizimi kontrolü ve üç platformun yerel export'u başarılı. Finansal transaction testlerinde izole bellek içi veritabanı benzetimi kullanıldı, canlı MongoDB'ye kayıt yazılmadı. ATT gerçek cihaz doğrulaması ve iOS mağaza görselleri için `apple-review-2026-09-15.md` geçerlidir.

## 15 Eylül ilk yayın kontrolü (geçiş düzeltmesinden önceki durum)

- 186 test, TypeScript, lint, sunucu sözdizimi ve diff kontrolü tekrar geçti.
- Mevcut MongoDB bağlantısında salt okunur `hello` sorgusu replica set ve session desteğini doğruladı. IdempotencyRecord birleşik unique index mevcut; yeni AdRewardSession koleksiyonu henüz dağıtılmadığı için mevcut değil. Gerçek finansal transaction testi yapılmadı.
- Render canlı sürümü `34b79d0`; GitHub main push otomatik dağıtım tetikliyor.
- AdMob Android ödüllü biriminde sunucu doğrulama geri çağırma adresi boş. iOS uygulamasında "İnceleme gerekli / Sınırlı reklam sunumu" durumu var. Panelde değişiklik kaydedilmedi.
- EAS'ta son tamamlanan paketler iOS 1.0.16 (53), Android 1.0.16 (25); mevcut yerel değişiklikleri içermiyor.
- Reklam başvurusunun tekrar deneme kimliği yalnızca ekran belleğinde tutuluyor; belirsiz ağ sonucu sonrası ekran kapatılıp yeniden başvuru yapılması için kalıcı tekrar deneme koruması ayrıca tamamlanmalı.
- Canlı geçiş bekletildi: yeni backend eski istemcilerin doğrulamasız ödül yolunu 426 ile kapatıyor. SSV yapılandırması, yeni test paketlerinde satın alma/ödül doğrulaması ve eski sürümlerin geçiş planı netleşmeden main push, Render dağıtımı veya mağaza gönderimi yapılmadı.
