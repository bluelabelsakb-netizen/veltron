# Şifre Sıfırlama ve Şifre Kurtarma Kılavuzu

Şifresini unutan kullanıcı giriş ekranından talep bırakır, yönetici onaylar.

**Eklenme tarihi:** 1 Ekim 2026

---

## ⚠️ EN ÖNCE GÜVENLİK — BU SİSTEM NEDEN BÖYLE TASARLANDI

En temel soru: *"Giriş ekranına şifre sıfırlama koysak olur mu?"*

**Koymak kolay, ama içinde bir tuzak var:**

> Giriş ekranından herkes şifresini değiştirebiliyorsa, `admin` kullanıcı
> adını bilen **bir yabancı** tüm sistemi ele geçirir. İçinde müşteri faturaları,
> maaş bordrosu, kâr rakamları var.

Bu yüzden tasarım şöyle:

| Aşama | Ne olur | Neden |
|---|---|---|
| 1 | Kullanıcı giriş ekranından **talep bırakır** | Oturumu yok, kendi başına erişemez |
| 2 | Talep **veritabanına** yazılır | Bildirim gitmezse bile kayıt kaybolmaz |
| 3 | Yöneticiye **Telegram mesajı** gider | Telefonunda görür, hemen haberdar olur |
| 4 | Yönetici **onaylar** | Asıl karar yetkili olanın |
| 5 | Sistem **geçici şifre üretir** (12 karakter) | Kullanıcı değil, **sistem** seçiyor |
| 6 | Kullanıcı girer → **şifre değiştirmeye zorlanır** | Geçici şifre kalıcı olmaz |

### Kritik: Geçici şifre neden "geçici"?

Adı boşuna konmamış. Adım 6 olmazsa:

- Geçici şifre Telegram'dan gider → **o kanal ele geçirilebilir**
- Ekran görüntüsü alınabilir
- Yıllarca geçerli kalır

`users.must_change_password = 1` bayrağı **veritabanında** durur. Kullanıcı
oturumu kapansa, bilgisayarı restart olsa bile aynı ekrana düşer.

### Yönetici de unutursa?

Kademe kademe güvence:

1. **Personel unutursa** → giriş ekranından talep + yönetici onayı
2. **Yönetici unutursa** → `SIFRE-SIFIRLA.bat` (sunucudaki dosya erişimi gerekir)

Sunucuya dosya erişimi olan kimse zaten en yetkili kişidir. Bu kabul
edilebilir bir sınır — çünkü o kişi `veltron.db` dosyasını açıp her şeyi
görebilir.

---

## Kullanıcı İçin: Şifremi Unuttum

### Nasıl yapılır

1. Giriş ekranında **"Şifremi unuttum"** bağlantısı
2. Formu doldur:
   - **Kullanıcı adınız** *(zorunlu)*
   - **Telefonunuz** *(isteğe bağlı)* — yöneticinin sizinle nasıl ulaşacağını bilsin
   - **Açıklama** *(isteğe bağlı)* — hangi cihazda çalışıyordunuz
3. **Talep Gönder**
4. "Talebiniz alındı" mesajı çıkar

### Sonra ne olur

- Yönetici **onaylarsa** → size bir **geçici şifre** verir (telefonla ya da
  Telegram'dan)
- O şifreyle girersiniz
- Sistem sizi **kendi şifrenizi seçmeye zorlar** — başka hiçbir ekrana
  geçemezsiniz

### Sık karşılaşılan durumlar

| Durum | Sebep / Çözüm |
|---|---|
| "Talebiniz alındı" ama kimse gelmiyor | Yönetici henüz görmemiştir. Yöneticinizi arayın. |
| Aynı kullanıcı adı için ikinci kez gönderilmiyor | 15 dakika beklemeniz gerekir (çift talep engeli) |
| "Çok fazla talep gönderildi" | 1 saatte 10 sınırı aşıldı. 1 saat sonra tekrar deneyin |
| Geçici şifreyi girdim, "Şifremi unuttum" diyor | Geçici şifreyi **büyük/küçük harfe dikkat** ederek yazın |

> **Kullanıcı adınız yanlış yazdıysanız** sistem bunu söylemez (güvenlik için).
> Talep yine oluşur ama karşılığı bulunamaz. Yöneticiniz arayın.

---

## Yönetici İçin: Talepleri Değerlendirme

**Yönetim → Şifre Talepleri** (menüde kırmızı rozetle bekleyen sayısı görünür)

### ⛔ En önemli uyarı

> **Bu listedeki istekler gerçek kullanıcılardan gelmeyebilir.**
> Onaylarsanız o kişi hesaba girer. Emin değilseniz **Reddet** deyin ve
> kullanıcıyı telefonla arayın.

Ekranın üstünde bu uyarı her zaman durur. Bile bile de.

### Onaylama

1. Talebi okuyun — kullanıcı adı, telefon, açıklama
2. Kullanıcıyı tanıyorsanız **Onayla**
3. Sistem **12 karakterlik geçici şifre** üretir
4. Şifre ekranda gösterilir (**bir kez**) — kullanıcıya iletin
5. Kullanıcı o şifreyle girip kendi şifresini belirler

Şifreyi kopyalayabilirsiniz (metinde kopyala düğmesi var).

> **Geçici şifre ikinci kez gösterilmez.** Kopyalayıp kaydedin veya hemen
> kullanıcıya iletin.

### Reddetme

1. **Reddet** → gerekçe yazın (isteğe bağlı)
2. Hesabın şifresi **değişmez**
3. Kullanıcı tekrar talep bırakabilir

### İşlem geçmişi

Alt kısımda kim ne zaman sıfırladı listelenir. Geçici şifre **gösterilmez**
(denetim ekranında gerekmez, sızıntı riski olur).

---

## Yöneticiye Bildirim (Telegram)

### Neden Telegram?

| | |
|---|---|
| Ücret | **Ücretsiz** |
| Hesap | **Açmana gerek yok** |
| Kütüphane | **Yok** — Node'un yerleşik `fetch`'i yeterli |
| Hız | Anında (e-posta gibi dakikalar sürmez) |
| SMS | Neredeyse bedava |
| İnternet | Sunucu tünelle internete açıksa da çalışır |

E-posta (SMTP) alternatifi mümkün ama `nodemailer` kütüphanesi + Gmail
uygulama şifresi gibi ek ayarlar gerektirir, uzun ve kırılgan. **Sonra
eklenebilir** — `utils/bildirim.js` bu yüzden ayrı bir katman.

### Kurulum (2 dakika)

1. **Telegram'da `@BotFather`**'a yaz, `/newbot` komutu, **token** al
2. **Botu aç** ve `/start` yaz ← **bu adım şart**, yoksa sana mesaj atamaz
3. Tarayıcıda aç:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   `"chat":{"id": 123456789}` → bu sayı **CHAT_ID**
4. `server/.env` dosyasına yaz:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   TELEGRAM_CHAT_ID=987654321
   ```
5. Sunucuyu yeniden başlat

### Ayarlanmamışsa?

**Sistem normal çalışır.** Bildirim gider görünmez, ama:

- Talep veritabanına yazılır
- Yönetici **Yönetim → Şifre Talepleri** ekranını açtığında görür
- Menüde kırmızı rozet belirir

Yani **Telegram olmasa da** yönetici talebi kaçırmaz, sadece telefonunda
haber verilmez.

### Kurulum yapıldı mı? Test et

```powershell
cd veltron/server
npm run telegram-dene
```

"✅ MESAJ GÖNDERİLDİ" yazıyorsa telefonuna mesaj düşmüş demektir.

### Test sorunu çözülemezse

| Belirti | Sebep |
|---|---|
| `Aktif: HAYIR` | `.env` boş veya sunucu yeniden başlatılmamış |
| `Mesaj sayısı: 0` | Botu açıp **elle `merhaba` yazıp gönder**. "Başlat" düğmesi bazen düşmez |
| 400 hatası | Token yanlış kopyalanmış (başında/sonunda boşluk olmasın) |

> **"Başlat" düğmesi neden bazen çalışmıyor?**
> Telegram bazen sohbeti açıp `/start`'ı arka planda yollar ama uygulamaya
> düşmez. **Elle bir yazı yazıp gönder** her zaman çalışır.
>
> **Boş bir bot ekranı hata değildir** — botun arkasında kod yoksa cevap
> vermez. Bu normal.

### Bu projede kuruldu ✅

| | |
|---|---|
| Bot | `@VeltronTakip_Bot` |
| Token | `.env` → `TELEGRAM_BOT_TOKEN` (git'e girmez) |
| Chat ID | `.env` → `TELEGRAM_CHAT_ID` (git'e girmez) |

**Test sonucu (1 Ekim 2026):** talep oluşturma, onaylama ve geçici şifre
mesajları başarıyla ulaştı. Doğrulandı.

---

## Teknik Bilgi (geliştirici için)

### Tablolar

**`password_reset_requests`**
| Sütun | Anlamı |
|---|---|
| `username` | Talep edilen hesap |
| `user_id` | Kullanıcıya bağlantı (silinirse NULL) |
| `contact`, `note` | Kullanıcının bıraktığı bilgi |
| `ip_address` | Denetim izi |
| `status` | `pending` / `approved` / `rejected` / `fulfilled` |
| `temp_password` | Sadece onayda yazılır, **API'de hiç dönmez** |
| `handled_by`, `handled_at` | Kim ne zaman işledi |

**`users.must_change_password`** — `0`/`1`. Oturumda değil, **veritabanında**.

### API uçları

| Uç | Kim | Ne |
|---|---|---|
| `POST /api/password-reset/request` | **herkes** | Talep oluştur |
| `GET /api/password-reset/pending` | yönetici | Bekleyenler |
| `POST /api/password-reset/:id/approve` | yönetici | Onayla + geçici şifre üret |
| `POST /api/password-reset/:id/reject` | yönetici | Reddet |
| `GET /api/password-reset/history` | yönetici | İşlem geçmişi (geçici şifre **yok**) |

`/request` dışındaki tüm uçlar rota içinde `authenticate` + `requireAdmin`
kontrolü yapar. **Ekranda gizlemek güvenlik değildir** — sunucu kontrol eder.

### Güvenlik önlemleri

| Önlem | Değer |
|---|---|
| IP başına talep | 10 / saat |
| Kullanıcı başına tekrar | 15 dakikada 1 |
| Bilgi sızdırma | Yok — var/yok aynı mesaj |
| Geçici şifre | `crypto.randomInt`, 12 karakter, karışması zor karakterlerle |
| Eski oturumlar | `token_version++` → anında kapanır |
| Denetim | `activity_log` + `handled_by` |

### Geçici şifre karakterleri

Karışması zor olanlar **yok**: `0 O`, `1 l I`

Telefonda okuyan personel hata yapmasın diye. Güvenlik `crypto.randomInt`
tarafından sağlanır, insan-okunabilirlik bunu bozmaz.

### Dosyalar

```
server/src/routes/passwordReset.js    Uçlar + güvenlik
server/src/utils/bildirim.js          Telegram (opsiyonel)
server/src/scripts/telegram-dene.js   Bağlantı testi
server/src/utils/loginGuard.js        Giriş sayacı (ayrı)
app/src/pages/PasswordResetModal.jsx  Giriş ekranı formu
app/src/pages/PasswordRequests.jsx    Yönetici ekranı
app/src/pages/MustChangePassword.jsx  Zorunlu değiştirme ekranı
server/test/passwordReset.test.mjs    34 güvenlik testi
```

### CLI (son çare)

```powershell
# YÖNETİCİ UNUTURSA
npm run reset-admin-password -- --show                    # hesapları listele
npm run reset-admin-password --                          # admin için şifre üret
npm run reset-admin-password -- muhasebe                 # belirli kullanıcı
npm run reset-admin-password -- muhasebe yeniSifre123    # şifreyi sen belirle
```

> **Argüman sırası önemli.** İlk sırasız argüman **kullanıcı adı**, ikincisi
> **şifre**. Sadece şifre yazmak istersen kullanıcı adını da yaz.
>
> Bu betik sunucu **kapalıyken** çalışır (veritabanı kilidi olmasın).

### ⚠️ Bu işlem testleri bozar

`.env` içindeki `ADMIN_PASSWORD` ile veritabanındaki şifre **eşleşmezse**
`npm test` tamamen kırmızı olur (gerçek sebep görünmez). Bu yüzden koşucu
baştan bir ön kontrol yapar ve şifre tutmuyorsa net mesajla durur:

```
[HATA] Yonetici girisi basarisiz. Testler calismaz.
       .env  ADMIN_PASSWORD  ile veritabanindaki sifre UYUSMUYOR.
       DUZELTME  ->  sunucuyu DURDUR, sonra su komutu calistir:
         npm run reset-admin-password -- admin demo1234
```

**Sonrası:** sunucuyu durdur → komutu çalıştır → tekrar `npm test`.

---

## Test

```powershell
cd veltron/server
npm test                      # 389 test, bu dahil
npm run test:password-reset   # sadece şifre sıfırlama (34 test)
```

Testin sınavladığı 10 kural:

1. Talep gönderen yeni şifre **seçemez**
2. Bilgi sızıntısı **yok**
3. Onaylamadan şifre **değişmez**
4. Onaylayan **yönetici olmak zorunda** (401/403)
5. Geçici şifre **geçicidir** — ilk girişte değişir
6. Eski oturumlar **kapanır**
7. Spam **korunur** (429)
8. Denetim izi **var**
9. Geçici şifre denetimde **gönderilmez**
10. Bayrak **kalıcıdır**

---

*1 Ekim 2026*