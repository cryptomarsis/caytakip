# Çaylık 1.0.8 Yayın Kontrol Listesi

Bu liste kod kontrolü tamamlandıktan sonra yapılacak, hesap ve mağaza paneli gerektiren adımları içerir.

## Sunucu ve veri güvenliği

- Render ortamında `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `OTP_SECRET`, `ADMIN_PHONE` ve `SUPPORT_EMAIL` değerlerinin tanımlı olduğunu doğrulayın.
- SMS kullanılmadığı için `AUTH_REQUIRE_OTP=false` kalmalıdır.
- Eski hesap geçişi tamamlandıysa `AUTH_ALLOW_PIN_MIGRATION=false` yapın ve `PIN_MIGRATION_PHONE` değerini kaldırın.
- Web sürümü yayınlanacaksa `ALLOWED_ORIGINS` alanına yalnızca gerçek alan adını yazın; mobil uygulama için bu değer boş kalabilir.
- MongoDB Atlas Network Access alanında yalnızca Render'ın güncel outbound IP/CIDR aralıklarını izinli bırakın. Kalıcı olarak `0.0.0.0/0` kullanmayın.
- Render Health Check yolu olarak `/api/health/live` kullanın. `/api/health` isteğinin `database: "ready"` döndürdüğünü de düzenli kontrol edin.
- Atlas yedeklemesini veya erişimi sadece size ait olan şifreli bir uzak yedek hedefini etkinleştirin. Webhook kullanılacaksa `BACKUP_WEBHOOK_URL` ve en az 32 karakterlik farklı `BACKUP_ENCRYPTION_KEY` birlikte tanımlanmalıdır.
- Geri yükleme senaryosunu boş bir test veritabanında en az bir kez deneyin; yedek alınmış ama geri yüklenemeyen veri gerçek yedek değildir.

## Test akışı

1. Yeni hesap oluşturma, çıkış yapma ve tekrar giriş yapma.
2. Hasat ekleme ve sonradan düzenleme.
3. Bir hasada kısmi tahsilat ekleme, tahsilatı düzenleme ve kalan alacağın doğru güncellendiğini doğrulama.
4. İnterneti kapatıp kayıt ekleme; internet gelince senkronizasyonun tamamlandığını doğrulama.
5. PDF ve Excel dışa aktarmayı Android tablet, iPhone/iPad ve Windows masaüstünde ayrı ayrı deneme.
6. Vadesi gelecekte olan bir kayıtla yerel bildirim iznini ve bildirimi deneme.
7. Uygulama içinden hesap silme işlemini bir test hesabında deneme.

## Android / Google Play

- `npx eas build --platform android --profile production` ile `.aab` üretin. `production` profilindeki EAS sürüm numarasını otomatik artırır.
- Önce Internal testing'e yükleyip gerçek tabletlerde test edin.
- Yeni kişisel Play geliştirici hesaplarında üretim erişimi için kapalı testte en az 12 katılımcının 14 gün aralıksız katılımı gerekir.
- Play Console'da veri güvenliği formunu `PLAY_STORE.md` içindeki gerçek veri kullanımına göre doldurun.
- En az Hasat Ekle, Tahsilat/Alacaklar, Raporlar ve Ayarlar ekranlarından güncel ekran görüntüsü ekleyin.

## iOS / App Store

- Apple Developer Program üyeliği ve App Store Connect uygulama kaydı gerekir.
- İlk iOS derlemesinden önce EAS CLI ile iOS üretim sürüm numarasını başlatın; ardından `npx eas build --platform ios --profile production` ile derleyin.
- TestFlight'ta iPhone ve iPad üzerinde aynı test akışını tamamlayın.
- App Store Connect gizlilik beyanını uygulamanın gerçek topladığı verilerle eşleştirin ve destek/gizlilik bağlantılarını ekleyin.

## Her sürümden önce

```bash
npm run release:check
npx expo-doctor
```

`expo-doctor`, bu projede Android native klasörü de tutulduğu için app.json değişikliklerinde `npm run prebuild:android` çalıştırılmasını hatırlatabilir. Bu beklenen bir uyarıdır; Android kaynakları değiştirilmeden önce bu komutu çalıştırın.
