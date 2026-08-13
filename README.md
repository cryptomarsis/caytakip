# Çay Üreticisi

Çay üreticilerinin hasat, ödeme, alacak, gider, bahçe ve fabrika fiyatlarını sade biçimde takip etmesini sağlayan Expo mobil uygulaması ve Express/MongoDB API'si.

## Yerelde çalıştırma

1. `.env.example` dosyasını `.env` olarak kopyalayın ve MongoDB bağlantı adresini girin.
2. Paketleri kurun: `npm install`
3. API'yi başlatın: `node server.js`
4. Başka bir terminalde uygulamayı başlatın: `npx expo start`

`src/services/api.ts` içindeki `API_ORIGIN`, mobil uygulamanın bağlanacağı API adresidir. Yerel testte telefondan erişilebilen bilgisayar IP'si kullanılmalıdır.

## Yayına hazırlık

Render (veya benzeri) ortam değişkenlerinde aşağıdakiler zorunludur:

- `NODE_ENV=production`
- En az 32 karakterlik ve birbirinden farklı `JWT_SECRET` ile `OTP_SECRET`
- `ADMIN_PHONE` ve gerçek bir `SUPPORT_EMAIL`
- `MONGODB_URI`
- Web sürümü açıksa yalnızca kendi alan adınızı içeren `ALLOWED_ORIGINS`

SMS ile güvenli giriş, NetGSM hesabı tamamlanana kadar kapalı kalır. NetGSM API alt kullanıcısı, OTP paketi ve onaylı gönderici adı hazır olduğunda `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_HEADER` değerlerini girip `AUTH_REQUIRE_OTP=true` yapın. Bu adım herkese açık yayından önce zorunlu kabul edilmelidir.

Render'ın geçici diskine yedek alınmaz. Uzak yedekleme için kendi güvenli webhook adresinizi `BACKUP_WEBHOOK_URL` olarak, farklı ve en az 32 karakterlik anahtarınızı `BACKUP_ENCRYPTION_KEY` olarak tanımlayın. Yedek gövdesi AES-256-GCM ile şifrelenerek gönderilir.

## Mağaza sürümü

- Uygulama kimliği: `com.cryptomarsis.cayureticisi`
- Sürüm: `1.0.0` / Android `versionCode: 1`
- Üretim paketi: `npx eas build --platform android --profile production`
- `SUPPORT_EMAIL` girildikten ve API yeniden yayımlandıktan sonra gizlilik sayfası `https://<api-adresiniz>/privacy`, hesap silme sayfası `https://<api-adresiniz>/delete-account` olur. Bu iki adresi Play Console'da kullanın.

Uygulama yalnızca hasat hatırlatmaları için bildirim kullanır. Expo Go'da Android bildirimleri atlanır; gerçek cihaz bildirimi için development veya production build gerekir.

## Kontroller

Yayın öncesinde şunları her sürümde çalıştırın:

```bash
npx tsc --noEmit
node --check server.js
npx expo config --type public
```

Özellikle hesap oluşturma/giriş, hasat ekleme, çevrimdışı kayıt ve senkronizasyon, PDF/Excel paylaşımı, hesap silme ve gizlilik bağlantılarını gerçek bir Android build üzerinde deneyin.

Android Studio veya yerel Android build öncesinde, uygulama yapılandırmasını Android kaynaklarıyla eşitlemek için `npm run prebuild:android` komutunu çalıştırın. Ardından emülatör veya bağlı cihaz için `npx expo run:android` kullanın.

Tek komutla yayın öncesi JavaScript ve yapılandırma denetimi için `npm run release:check` kullanın.
