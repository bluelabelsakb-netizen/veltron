# Başka Bilgisayara Taşıma Kılavuzu — VELTRON

Bu kılavuz, projeyi **başka bir bilgisayara** taşımak ve orada **farklı bir
yapay zekâ ile** devam ettirmek için hazırlandı.

---

## Yöntem Seçimi

| Yöntem | Ne zaman | Zorluk |
|---|---|---|
| **A. GitHub (önerilen)** | Düzenli çalışacaksan, birden fazla bilgisayar | Kolay |
| **B. Klasör kopyalama** | Tek seferlik, hızlı taşıma | Çok kolay |

> ⚠️ **Veritabanı Git'te değildir** (`.gitignore`'da). Veriyi **ayrıca**
> kopyalaman gerekir. Adım 3'te anlatıyorum.

---

## Yöntem A — GitHub ile

### A1. GitHub'da boş depo oluştur
[github.com/new](https://github.com/new) → ad ver (örn. `veltron`) →
**Private** seç → README ekleme → **Create repository**

### A2. Yeni bilgisayarda
```powershell
# 1) Git kurulu değilse: https://git-scm.com/download/win (varsayılan PATH'e eklenir)
git --version

# 2) Node 22.5+ şart (node:sqlite için)
node -v

# 3) Depoyu çek
cd C:\Users\SEN\Documents
git clone https://github.com/KULLANICI/veltron.git
cd veltron
```

### A3. Veritabanısını ve şifreleri geri koy

**`server\data\veltron.db`** Git'te yok. Eski bilgisayardan **elle kopyala**:
```powershell
# ESKİ bilgisayarda:
Copy-Item "C:\...\veltron\server\data\veltron.db" "$env:USERPROFILE\Desktop\"
```
Masaüstündeki dosyayı yeni bilgisayarda `veltron\server\data\` içine koy.
> `.db-wal` ve `.db-shm` varsa onları da kopyala. Yoksa veri son yazma
> kaybolabilir.

**`server\.env`** de Git'te **yok** (güvenlik için `.gitignore`'da).
İçinde **JWT_SECRET ve tüm şifreler** var. Bunu da mutlaka kopyala:
```powershell
Copy-Item "C:\...\veltron\server\.env" "$env:USERPROFILE\Desktop\"
```
> `.env` olmadan sunucu **varsayılan** `JWT_SECRET` ve zayıf şifreyle
> çalışır — üretimde bu güvenlik açığıdır. `.env`'i kopyalamayı unutma.
> Değiştirmek istersen: `npm run reset-admin-password`

### A4. Kurulum
```powershell
cd server
npm install
Copy-Item .env.example .env
notepad .env          # JWT_SECRET'i değiştir!
cd ..\app
npm install
```

### A5. Çalıştır
```powershell
cd server
npm start             # port 4000
```
Sonra `Sunucuyu-Kur.bat` → Electron açılır.

### A6. Ekip erişimi (uzaktan çalışma)
Sunucu `0.0.0.0:4000` dinler. Ekip kendi bilgisayarından:
1. Electron'da sunucu adresini gir: `http://192.168.1.100:4000`
2. Windows Güvenlik Duvarı'nda **4000 portunu** aç
3. Aynı ağda olmalılar

---

## Yöntem B — Klasör Kopyalama

1. **Kopyalanacaklar:**
   - Tüm `veltron` klasörü
   - **AMA** `node_modules`, `app\dist`, `app\release` klasörlerini **sil**
     (büyük, hedefte yeniden üretilir)

2. `.env` dosyasını da kopyala (yoksa `.env.example`'dan oluştur)

3. Yeni bilgisayarda:
```powershell
cd server && npm install
cd ..\app && npm install
node server/test/smoke.mjs      # 57 geçmeli
```

---

## Farklı Yapay Zekâ ile Devam Etme

Yeni bilgisayarda projeyi açtığında, yapay zekâya şunu söyle:

> "Bu projede `AI-DEVIR.md` dosyası var. Önce onu oku, sonra devam et."

**Neden bu dosya var:**
- Tüm iş kuralları tek yerde
- 10 tuzak (en sık hatalar)
- Kod haritası (hangi dosyada ne var)
- Ne yapıldı / ne kaldı

Yapay zekâ ilk iş olarak bu dosyayı okumalı. `PROJE-DURUMU.md` ve
`DEV-NOTES.md` daha ayrıntılıdır, ikincisi gerektiğinde.

---

## Taşıma Sonrası Kontrol Listesi

- [ ] `node -v` → **22.5 veya üzeri**
- [ ] `npm install` (server) bitti
- [ ] `npm install` (app) bitti
- [ ] `server\.env` **kopyalandı** (şifreler + JWT_SECRET içinde)
- [ ] `server\data\veltron.db` **kopyalandı**
- [ ] `npm test` → **158 geçti** (57 + 32 + 69)
- [ ] Sunucu başladı (port 4000)
- [ ] `.env` içindeki `ADMIN_PASSWORD` ile giriş yapılabildi
- [ ] Müşteri hesapları çalışıyor (`vuruskan`, `vuruskan-mali`)
- [ ] Eski veriler görünüyor (müşteri, iş emri, bordro, puanlar)
- [ ] Masaüstü programı açılıyor
- [ ] Excel arşivi gerekiyorsa kopyalandı
      (eskisinde `C:\Users\pc-n\Documents\Veltron-Excel-arsiv\` idi)

---

## Bilinen Engeller (Taşımada da geçerli)

| Sorun | Durum | Not |
|---|---|---|
| `.exe` üretilemiyor | Windows Developer Mode kapalı | Program çalışıyor, sadece paketleme yok |
| C: diski %99 dolu | `C:\Windows\Installer` 52 GB, izin yok | Temizlenemiyor, D: kullanılabilir |
| Puanlama arayüzü | Kullanıcı "şuanlık kalsın" dedi | Backend var, ekran yok |

---

*Hazırlayan: Veltron · 29 Eylül 2026*
