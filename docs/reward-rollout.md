# Ödüllü reklam — kesintisiz geçiş

15 Eylül 2026: Yalnızca yerel kod/test değişikliği. Bu dosya bir dağıtım veya mağaza onayı kanıtı değildir.

## Sıralama

1. Backend'i önce `ADMOB_SSV_ENABLED=false`, `ADMOB_LEGACY_REWARDS_ENABLED=true` ile yayınla. Yeni koleksiyonun nonce ve sparse transactionId unique indekslerinin oluştuğunu doğrula. Eski istemciye 426 verilmez; yeni istemciler kalıcı sunucu oturumuna bağlı uyumluluk yolunu kullanır.
2. Yeni iOS/Android paketlerini test kanallarında doğrula. Ödül/kredi/cüzdan ve reklam başvurusu tekrarı test edilmeden herkese yayınlama.
3. Google SSV callback adresini her iki ödüllü reklam biriminde doğrula. Panel testi ve Google imzalı gerçek oturum doğrulaması ayrı kontrollerdir. Test callback'inin gerçek bir kullanıcının cüzdanına yazmasına izin verme.
4. SSV hazır olduğunda `ADMOB_SSV_ENABLED=true` yap. Yeni açılan oturumlar SSV kullanır. Zaten oynayan reklam, oluşturulduğu oturum modu ile tamamlanır. Eski istemciler bundan etkilenmez.
5. Mağaza dağılımı ve hata kayıtları incelendikten sonra ayrıca onay alarak `ADMOB_LEGACY_REWARDS_ENABLED=false` yap. Bu son adım eski istemcilerde reklam ödülünü güncelleme gerektirir hale getirir; kesintisiz geçişin ilk aşamasında YAPILMAZ. Önceden verilmiş legacy nonce 24 saatlik ömrü içinde tamamlanabilir.

## Güvenlik ve sınırlar

- Eski binary Google imzası veya oturum kimliği göndermez. Onu uzaktan SSV'li hale getirmek mümkün değildir; geçici yol istemci bildirimine güvenir, Google doğrulaması olarak gösterilmez.
- İki yol toplamda aynı kullanıcı/gün için en fazla üç ödül verir. Cüzdan, defter ve yeni oturumun durumu tek MongoDB transaction'ındadır.
- Eski kimliksiz isteklerde 60 saniye içindeki tekrar son ödülü yeniden verir gibi gösterilmez; güncel bakiye ve `creditsGranted:0` döner. Süresiz, kesin işlem eşleştirmesi eski istemcide mümkün değildir.
- Yeni uyumluluk oturumunda nonce tekrarları ek kredi vermez. SSV nonce'u legacy endpoint ile tamamlanamaz. Google hatasında istemci sessizce legacy yola düşmez.
- Geliştirme (`__DEV__`) test reklamları yeni istemcide gerçek kredi vermez. Kendi canlı reklamına tıklama.
- Yeni uyumluluk istemcisi kazanım olayında nonce'u telefonda hesap bazında saklar. Yanıt kaybolursa veya ekran kapanırsa bir sonraki reklam düğmesine basışta önce aynı ödül tamamlanır; yeni reklam açılmaz. Onaylanmış eski nonce tekrarında kredi eklenmez; sunucunun açık süre dolumu yanıtında bekleyen nonce kaldırılır. SSV ödülü istemciden bağımsız olarak Google callback'iyle kaydedilir.
- SSV öncesi başlatılmış uyumluluk reklamı için gelen Google callback'i ikinci kredi oluşturmaz.
- Finansal sonucu belirsiz reklam başvurusu telefonda hesap bazında tutulur. Açılışta otomatik yeni reklam başvurusu oluşturulmaz; kullanıcı “Bekleyen başvuruyu kontrol et” ile aynı kimlik ve içerikle sonucu sorgular/yeniden gönderir. İşlem işleniyor durumunda kalırsa destek incelemesi gerekir; yeni kimlik oluşturup tekrar kredi düşürülmez.

## Doğrulama

195 yerel test geçti. Testler eski/yeni yolun ortak günlük limitini, nonce tekrarını, mod değişimini, transaction geri alımını ve ekran/uygulama yeniden açılışında kalıcı başvuru/ödül kimliğini kapsar. Veritabanı transaction testleri izole benzetimdir; gerçek cihazdaki Google callback'i veya satın alma testi yerine geçmez. TypeScript ve lint ayrıca kontrol edilir. Yeni bağımlılık eklenmedi.
