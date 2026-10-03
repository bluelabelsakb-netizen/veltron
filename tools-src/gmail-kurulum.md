# GMAIL KURULUMU — Fatura E-postası Gönderimi

**Ne zaman gerekiyor:** Veltron'dan fatura müşteriye PDF ekiyle e-posta
göndermek istediğinde.

**Süre:** Yaklaşık 15-20 dakika. Bir kere yapılır.

**Ne öğrenmen gerekiyor:** Sadece düğmelere basmak. Kod bilmene gerek yok.

---

## Neden SMTP kullanmıyoruz?

Bilinmesi gereken bir karar: Gmail'den programla e-posta göndermenin iki yolu var.

| Yöntem | Sorun |
|---|---|
| **SMTP** (eski yöntem) | Sunucudan 465 portuna bağlanmak gerekir. Hosting'de bu port genelde **kapatılır**. Bir de Google artık "güvensiz uygulama" kabul etmiyor. |
| **Gmail API** (bizim tercihimiz) | İnternet üzerinden normal bir web isteği. Port engeli yok, daha kalıcı. |

Bu yüzden Gmail API'yi kuruyoruz. Sıkıcı tarafı ilk seferde 15 dakika sürüyor, sonrası
bir daha gerekmiyor.

---

## ⛔ ÖNEMLİ — 7 gün kuralı

Google'da uygulama yayınlandığında **"Testte"** modundaysa verilen jeton **sadece
7 gün** çalışır ve sonra ölür. Faturalar bir hafta sonra gönderilemez olur.

**Bu yüzden aşağıdaki 5. adımda mutlaka "Yayına al" seçeneğini seç.** Kırmızı
yazıyla belirttim, atlamama.

---

## ADIM 1 — Google Cloud projesi oluştur

1. Tarayıcıda aç: **https://console.cloud.google.com**
2. Sağ üstte **"Proje seçin"** yazısına tıkla
3. **"Yeni proje oluştur"** tıkla
4. Şunları doldur:
   - **Proje adı:** `Veltron Fatura`
   - **Kuruluş:** Boş bırakabilirsin
5. **"Oluştur"** tıkla
6. Sayfa açılınca sağ üstte proje adının yazdığından emin ol — yanlış proje
   seçmemen lazım.

> Ekranda zaten bir Google hesabınla giriş yapman istenecek. Fatura göndermek
> istediğin Gmail hesabıyla gir.

---

## ADIM 2 — Gmail API'yi aç

1. Üstteki arama kutusuna **`Gmail API`** yaz
2. Çıkan listede **"Gmail API"** tıkla
3. Mavi **"Etkinleştir"** düğmesine bas
4. Sayfa açılır. Bu adım tamam.

---

## ADIM 3 — Giriş izni ekranı (consent screen)

Sol menüde (☰ ikonu) **"API ve Hizmetler"** → **"OAuth izni ekranı"** yolunu izle.

1. Üstte **"Uygulama türü"** seç: **"Harici"** → **"Devam Et"**

   > ⚠️ Google Workspace hesabı kullanıyorsan "İç" seçeneği çıkar. O zaman
   > "İç" seç.

2. **Uygulama bilgileri:**
   - Uygulama adı: `Veltron Fatura`
   - **Kullanıcı destek e-postası:** kendi Gmail adresin
   - Geliştirici iletişim e-postası: kendi Gmail adresin
   - Logo: boş bırakabilirsin

3. **"Kaydet ve devam et"**

4. **İzinler (Scopes)** bölümünde: **"Kapsamları Ekle veya Kaldır"** tıkla

5. Üstteki arama kutusuna şunu **yapıştır**:
   ```
   https://www.googleapis.com/auth/gmail.send
   ```

6. Açılan listede o satıra tıkla → **"Güncelle"** → **"Mükerrer kaydet"**

   > Bu izin sadece **e-posta göndermeye** izin verir. Gelen kutunun okunmasına,
   > e-postanın silinmesine izin vermez.

7. **"Test kullanıcılarına ekle"** bölümüne kendi Gmail adresini ekle → **"Kaydet ve devam et"**

### 🔴 BURADA KRİTİK ADIM

Sol menüden **"Yayınlama durumu"** sayfasına git.

Üstte büyük bir mavi **"Yayına al"** düğmesi olacak → **TIKLA**.

Bir uyarı çıkabilir:
> *"Uygulamanız doğrulanmamış. Devam ederseniz uyarı ekranı gösterilir."*

→ **"Devam et"** de.

Bu uyarıyı görmen normal. Sadece kendi hesabınla gireceksin, sorun olmaz.

> **Bu adımı atlama.** Atlarsan jeton 7 gün sonra ölür.

---

## ADIM 4 — Kimlik bilgileri (Client ID) oluştur

Sol menü → **"API ve Hizmetler"** → **"Kimlik Bilgileri"**

1. Üstte **"Kimlik bilgileri oluştur"** tıkla
2. Uygulama türü: **"Masaüstü uygulaması"** seç
3. Ad: `Veltron Fatura`
4. **"Oluştur"** tıkla

Açılan pencerede iki bilgi göreceksin:

```
Uygulama (Client) ID:  1234567890-abcdefghijklmnop.apps.googleusercontent.com
Uygulama (Client) Secret:  GOCSPX-xxxxxxxxxxxxx
```

**Bu ikisini bir yere not al.** Sonraki adımda lazım.

---

## ADIM 5 — Refresh token al

Bu adım "sisteminin benim adıma giriş yapmasını" sağlıyor. Bir kere onay
veriyorsun, sonrası otomatik.

1. Tarayıcıda aç: **https://developers.google.com/oauthplayground**

2. Sağ üstteki **⚙️ ayar simgesine** tıkla

3. **"OAuth 2.0 Client ID"** kutusuna ADIM 4'te aldığın Client ID'yi yapıştır
4. **"OAuth Client Secret"** kutusuna Client Secret'ı yapıştır
5. Altta **"OAuth scopes"** bölümünde **"☐ Use your own OAuth credentials"**
   işaretini **kaldır** (varsayılan açıksa kapat)
6. Yanındaki kutucuğa yapıştır:
   ```
   https://www.googleapis.com/auth/gmail.send
   ```
   → **"Add"** tıkla
7. Sağ altta **"Authorize APIs"** düğmesine bas
8. **Kendi Gmail hesabınla** giriş yap (fatura gönderdiğin hesap)
9. *"Veltron Fatura uygulaması sizin e-posta adresinize erişmek istiyor"* onayı
   çıkacak → **"İzin ver" / "Allow"** tıkla

10. Ortadaki büyük **"Exchange authorization code for tokens"** düğmesine bas

11. Sağ tarafta üç bilgi çıkacak:

```
Access token:      ya...
Refresh token:     ya...       ← BU LAZIM
Client ID:         123...      ← ADIM 4'teki
Client secret:     GOCSPX-...  ← ADIM 4'teki
```

> ⚠️ **Refresh token çok uzundur (~100 karakter).** Tamamını kopyala, kesme.
> Kopyalarken satır sonu boşluk almamaya dikkat et.

---

## ADIM 6 — `.env` dosyasına yaz

Proje klasöründe `server\.env` dosyasını Not Defteri ile aç. En altına şu 5 satırı
ekle (kendi bilgilerinle):

```
MAIL_FROM=fatura@sirketin.com
MAIL_FROM_NAME=Veltron
MAIL_CLIENT_ID=1.234567890-abcdefg.apps.googleusercontent.com
MAIL_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
MAIL_REFRESH_TOKEN=1//0eXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Kaydet.** Dosyayı kapat.

> ⛔ Bu bilgiler sır. Dosyayı **kimseyle paylaşma**, GitHub'a yükleme
> (otomatik olarak engelleniyor), ekran görüntüsü alma.

---

## ADIM 7 — Gönderici adresini Veltron'a tanıt

1. Veltron'u aç
2. **Ayarlar** → **Firma Profili**
3. **E-posta** alanına `MAIL_FROM` ile **aynı** adresi yaz
   (orn. `fatura@sirketin.com`)
4. Kaydet

> Bu adres fatura kâğıdında da görünür, e-postalar da buradan gider.

---

## ADIM 8 — Test et

1. **Ayarlar** → **Fatura Görünümü ve E-posta Gönderimi**
2. Kırmızı "Kapalı" yazısı yerine yeşil **"Hazır"** yazmalı
3. **Test E-postası** kutusuna kendi adresini yaz → **"Test Et"**
4. Gelen kutunu kontrol et

Test e-postası gelirse her şey çalışıyor. Gelen kutunda yoksa aşağıdaki
sorun giderme bölümüne bak.

---

## Sorun Giderme

### "Hazır" yerine hâlâ "Kapalı" yazıyor

`server/.env` dosyasını kontrol et. Üç bilgi de yazılmış mı?
`MAIL_FROM`, `MAIL_CLIENT_ID`, `MAIL_REFRESH_TOKEN`.

Dosyayı kaydettin mi? Program yeniden başlatıldı mı?

### "Gmail jeton alınamadı" hatası

`MAIL_CLIENT_ID` veya `MAIL_REFRESH_TOKEN` yanlış kopyalanmış. İkisini de
tekrar kontrol et. `Refresh token` kopyalarken başında/sonunda boşluk olmamalı.

### Test e-postası gelmiyor

1. **Gmail'in spam klasörüne bak** — bazen düşüyor.
2. Google'da şu adrese bak: `https://myaccount.google.com/security` →
   **"Üçüncü taraf uygulamalar"** bölümünde Veltron listede mi?

### "invalid_grant" hatası

Jeton iptal edilmiş. **ADIM 5'i baştan yap.** Google bir jetonu iptal ederse
(şifre değişikliği, "erişimi kaldır") yeniden almak gerekir.

### "Bu uygulama doğrulanmamış" uyarısı çıkıyor

Normal. **"Gelişmiş"** → **"Veltron Fatura'ya git (güvenli değil)"** tıkla.
Sadece senin hesabınla giriyorsun, sorun değil.

---

## Özet

| Adım | Ne yapıyorsun | Süre |
|---|---|---|
| 1 | Google Cloud projesi oluştur | 2 dk |
| 2 | Gmail API'yi etkinleştir | 1 dk |
| 3 | İzin ekranı + **"Yayına al"** | 5 dk |
| 4 | Client ID ve Secret oluştur | 2 dk |
| 5 | OAuth Playground'dan Refresh Token al | 5 dk |
| 6 | `.env` dosyasına 5 satır yaz | 2 dk |
| 7 | Gönderici adresini Firma Profili'ne yaz | 1 dk |
| 8 | Test gönderimi | 1 dk |

**Toplam: ~20 dakika, bir kere.**

---

## Günlük kullanımda sınırlar

| Konu | Değer |
|---|---|
| Günlük gönderim limiti | **450 e-posta** (Gmail'in normal limiti 500) |
| Ek sınır | Maliye kurumu olmadıkça yok |
| Gönderilen her fatura | `invoice_emails` tablosuna kaydedilir |
| Fatura silinse bile geçmiş | Kayıt kalır (denetim izi) |

---

## Güvenlik notları

- **Şifre hiçbir yere yazılmıyor.** Sadece e-posta adresi ve Google jetonu tutulur.
- Google jetonu **yalnızca e-posta gönderme** iznine sahip. Gelen kutunun
  okunmasına veya e-postanın silinmesine izin vermez.
- Jetona başkası erişirse o kişi sadece **gönderme** yapabilir, postalarını
  okuyamaz. Yine de gizli tut.
- Token'ı `git add` etme. `.gitignore` zaten engelliyor ama göz kulak olsun.

---

*Hazırlayan: Veltron · 1 Ekim 2026*
*Bu dosyayı değiştirdiysen `AGENTS.md` Bölüm 5d'ye kısaca ekle.*
---

## GERCEK KURULUMDA TAKILAN YERLER (3 Ekim 2026)

Bu liste, kurulumu ilk kez yapan birinin **gercekten nerede durdugunu**
kaydeder. Yukaridaki "8 adim" genel; asagidakiler somut.

### 1. "Kullanici destegi e-postasi" serbest yazilamaz

Google bu alanda **sadece o Cloud hesabina bagli mail hesaplarini**
listeler. Firmanin kendi adresini (info@firma.com) yazamazsin.
→ Listeden kendi hesabini sec. **Benim "firma adresini secebilirsin"
tanim yanlisti.**

### 2. Chrome otomatik cevirisi ekrani bozuyor

Ceviri acikken "OAuth Istemci Kimligi", "Yonlendirme URI'leri" gibi
terimler kayboluyor ve **"farkli mail giremiyorum" gibi baska hatalara
yol aciyor** (alan aslinda zaten kilitli).
→ Adres cubugundaki ceviri simgesine bas → "Never translate this site".

### 3. Gmail API'yi ETKINLESTIRME adimi atlama

Yapilmazsa Credentials ekraninda "No API keys to display" cikar ve
jeton alinamaz.
→ APIs & Services → Library → Gmail API → **Enable**

### 4. Redirect URI tam olarak bu olmali

    https://developers.google.com/oauthplayground

Satir atlarsa **jeton alinamaz ve HICBIR hata mesaji cikmaz** — sessiz
kalan tek adim budur.

### 5. "Publish app" düğmesi Branding tamamlanmadan canlanmiyor

Test kullanıcısını ekledin ama Publish app **soluk** kalıyor. Sebep:
Branding sayfasında 5 alan zorunlu.

| Alan | Zorunlu |
|---|---|
| App name | evet |
| User support email | evet |
| Developer contact email | evet |
| Application home page | **evet** |
| Application privacy policy link | **evet** |

### 6. ⛔ .local ADRESI KABUL EDILMIYOR

Ilk verdiğim https://veltron.local **hataliydi**. .local yerel ag
icindir, Google erisemez ve su uyariyi verir:

    Missing domain: veltronmakine.com

→ **Gercek bir alan adi** kullan. Site yayinda olmak zorunda degil;
Google o adreslere ziyaretci gondermiyor, sadece bicim kontrol ediyor.
Alan adin yoksa test icin ayrilmis https://veltron-ornek.example.com
yazilir.

### 7. Refresh token'i sohbete YAZMA

Token = tam Gmail erisimi, sohbet gecmise kalir.
→ Bir dosyaya yapistir, ben okuyup .env'ye yazayim, sonra dosyayi sil.

### 8. "Your app requires verification" HARi DEGIL

Publish sonrasi bu uyari cikar. Dogrulama **istege baglidir**; tek
kullanici icin gerekmez. Panik yapma, gec.

---

## KISA OZET — 6 adimda

    1. console.cloud.google.com → Yeni proje: Veltron
    2. APIs & Services → Library → Gmail API → ENABLE
    3. APIs & Services → Credentials → + CREATE CREDENTIALS
       → OAuth client ID → Web application
       → Name: Veltron Mail
       → Authorized redirect URIs: https://developers.google.com/oauthplayground
       → (JavaScript origins BOS birak)
       → CREATE   → Client ID + Client secret cikar
    4. APIs & Services → Audience → BRANDING sekmesi
       → App name, support email, developer email,
         home page : https://<GERCEK ALAN ADIN>
         privacy   : https://<GERCEK ALAN ADIN>/gizlilik
       → SAVE
    5. Audience → Test users → kendi mailini ekle
       → PUBLISH APP → In production → Publish
       ⛔ 2-3 dakika bekle (yayin gecikmesi)
    6. developers.google.com/oauthplayground
       → ⚙ → Use your own OAuth credentials (isaretli)
              + Client ID + Client secret
       → Input your own scopes : https://mail.google.com/
       → Authorize APIs → hesabini sec → Allow
         (kirmizi uyari: Advanced → "Go to Veltron Mail (unsafe)")
       → Step 2 → "Exchange authorization code for tokens"
       → refresh_token degerini kopyala

---

## .env'e yazilacaklar

    MAIL_FROM=veltronyedek@gmail.com
    MAIL_FROM_NAME=Veltron
    MAIL_CLIENT_ID=...
    MAIL_CLIENT_SECRET=...
    MAIL_REFRESH_TOKEN=...

⛔ MAIL_APP_PASSWORD **gerekmiyor.** O alan eski SMTP kavramindan
kalma; gonderimDurumu() onu ariyordu ve uc deger de doluyken program
"kapali" diyordu. 3 Ekim'de duzeltildi: artik clientId + clientSecret +
refreshToken aranir.

## Dogrulama

**Ayarlar → Fatura gonderimi** → "Test Et".
Gelen kutusuna Veltron — e-posta gonderim testi baslikli mail duserse
hazir.

⛔ Client secret ekrana yapistirilmis olabilir. Yerel masaustu
uygulamasi icin kritik degil (zaten kendi bilgisayarinda duruyor), ama
bilerek not dusuldu.
