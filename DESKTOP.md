# Çaylık Windows Masaüstü Sürümü

Çaylık, aynı kullanıcı hesabı ve aynı sunucu verileriyle Windows 10/11 (64 bit) bilgisayarlarda da çalışır.

## Kullanıma hazır kurulum dosyası

`release/Caylik-Setup-1.0.0.exe`

Kurulumdan sonra Çaylık, masaüstü ve Başlat menüsünden açılabilir. Excel, CSV ve PDF raporları Windows'un dosya kaydetme penceresiyle bilgisayara kaydedilir.

## Yeni paket oluşturma

```bash
npm run desktop:package
```

Geliştirirken masaüstü uygulamasını açmak için:

```bash
npm run desktop
```

Herkese açık dağıtımdan önce Windows'un "bilinmeyen yayıncı" uyarısını kaldırmak için bir Windows kod imzalama sertifikası alınmalı ve paket imzalanmalıdır.
