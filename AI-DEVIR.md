# 🤖 Yapay Zekâya Devir Kılavuzu — VELTRON

> **Bu dosya, projeye ilk kez bakan bir yapay zekâ içindir.**
> Kod yazmaya başlamadan önce tamamını oku. 10 dakikanı kurtarır.

---

## ⚠️ ÇALIŞMA KURALI (ÖNCE BUNU OKU)

**Her işlemden sonra bu klasördeki MD dosyalarını güncelle.**

Özellik ekledin, hata düzelttin, test yazdın, karar verdin — ne olursa olsun
o değişikliği MD'ye yansıt. Kullanıcı açıkça istedi: *"md dosyasını güncelle
her işlemden sonra."*

| Durum | Güncelle |
|---|---|
| Yeni özellik / ekran | `AI-DEVIR.md`, `PROJE-DURUMU.md`, ilgili konu dosyası |
| Hata düzeltildi | `AI-DEVIR.md` → **Tuzaklar** (neden oluyordu, nasıl önlendi) |
| Yeni karar | `AI-DEVIR.md` → **Tuzaklar** (kural + gerekçe) |
| Test eklendi | Test sayılarını güncelle |
| Dosya/komut eklendi | İlgili kılavuzun "Kullanım" bölümüne ekle |
| Bağımlılık eklendi | `package.json` + buraya not |

**Kural: iş yapıldıysa MD'ler eskiyse iş bitmemiş sayılır.**

---

## 0. 30 Saniyede Ne Olduğunu Anla

Veltron = ölçüm/tartım bazlı **iş emri takip sistemi**.
Node.js + SQLite sunucu, Electron + React masaüstü istemci. Türkçe arayüz.
İş kuralları **kullanıcının ağzından geldiği gibi** kodlanmış — bunlara
**dokunma, değiştirme, "daha mantıklı" diye düzeltme.**

Durum: **çalışıyor, 489 test geçiyor.** Son commit bu oturumda atıldı.

**DEMO 1.0 — internete açık:**
```
https://husband-earn-barriers-patio.trycloudflare.com
admin / VeltronDemo2026!
```
> Bu adres **her çalıştırmada değişir** (Cloudflare Quick Tunnel). Bilgisayarın
> kapalıyken adres ölür. Demo modu açık: 30 gün, 500 kayıt sınırı, Excel damgalı.
> Gerçek veri yok — `demo-kur --temiz` ile kuruldu.

**Kısayollar (server klasöründe):**
```bash
npm start                      # sunucuyu başlat (port 4000)
npm test                       # 355 test — SUNUCUYU KENDİSİ BAŞLATIR
npm run demo-kur -- --temiz    # demo verisini yeniden kur
npm run seed-currency          # 12 para birimini tanımla
npm run reset-admin-password   # admin şifresi unuttuysan
npm run purge-test             # test artıklarını temizle
npm run security-audit         # güvenlik denetimi
npm run kurulum-paketi -- --zip # kurulum paketi üret
```

**Arayüz testleri (proje kökünden):**
```bash
node test/chartScale.test.mjs    # 23  grafik ekseni
node test/money.test.mjs         # 32  para biçimi
node test/lazy-export.test.mjs   # 28  ⛔ yeni sayfa ekledikten sonra KOŞ
node test/ikon-import.test.mjs   # 54  ⛔ yeni bileşen ekledikten sonra KOŞ
node test/csp.test.mjs          #  9  ⛔ CSP değiştirirsen KOŞ
```

---

## 1. Önce Bunları Yap

```bash
# 1) Node sürümünü kontrol et — 22.5+ ŞART (node:sqlite kullanılıyor)
node -v

# 2) Bağımlılıkları kur
cd server && npm install
cd ../app && npm install

# 3) Ortam dosyası ZATEN VAR (server/.env) — kalıcı şifreler ve JWT_SECRET içinde
#    Yeni bilgisayarda .env Git'e girmez, elle taşıman gerekir.

# 4) Sunucuyu başlat
cd server && npm start        # port 4000

# 5) Testleri çalıştır
cd server && npm test            # 355/355 — sunucuyu kendisi başlatır
cd .. && node test/chartScale.test.mjs    # 23/23
cd .. && node test/money.test.mjs         # 32/32
cd .. && node test/lazy-export.test.mjs   # 27/27
```

> `npm test` artık `test/tum-testler.mjs` üzerinden çalışır: sunucuyu arka
> planda başlatır, `/api/health` yanıt verene kadar bekler, 7 test dosyasını
> sırayla koşar, sonra sunucuyu kapatır. **Sunucuyu elle başlatmana gerek yok.**
> (Eskiden `npm test` sunucu kapalıyken 57/57 "fetch failed" ile düşüyordu.)

**Testler geçmiyorsa kod yazma. Önce hatayı bul.**

### Şifreler ve yönetici erişimi
| Ne | Değer / Nerede |
|---|---|
| Yönetici şifresi | `server/.env` → `ADMIN_PASSWORD` |
| Müşteri portali şifreleri | `server/.env` → `PORTAL_PASSWORD_PROGRESS`, `PORTAL_PASSWORD_FINANCE` |
| Müşteri hesaplarını (yeniden) oluştur | `npm run seed-portal` |
| Yönetici şifresi unuttuysan | `npm run reset-admin-password` (sunucu kapalıyken) |
| Hesap listesi | `npm run reset-admin-password -- --show` |
| Test artıklarını temizle | `npm run purge-test` (sunucu kapalıyken) |

> ⚠️ `.env` `.gitignore`'da. **Başka bilgisayara taşırken elle kopyala**,
> yoksa şifreler ve JWT_SECRET geri gelmez.

---

## 2. Kullanıcının İş Kuralları (EN ÖNEMLİ BÖLÜM)

Bu kurallar **sabit**. Kullanıcı bunları söyledi, kod birebir uyguluyor.

### 2.1 Tartım — EN SIK HATA BURADA
```
net_weight = gross_weight (dolu tır) − tare_weight (boş tır)
```
- **Net ASLA elle girilmez.** `netOf()` fonksiyonu kullanılır.
- **`net_weight` daima kg.** `unit` (Ton/Kg) sadece **fiyatlandırma** birimi.
- Ton fiyatı: `tutar = (kg / 1000) × ton_fiyatı`

### 2.2 İş emri
- **Tek iş emri = tek birim.** Gruplama/İş Paketi **yok** (bilinçli karar).
- No müşteriden gelir (`VM2026-0017`) veya sistem üretir (`WEM-2026-0001`).
- Fiyat ürün kartıyla eşleşmez, **kg direkt girilir**.
- Fatura tek seferde, İş Emri ↔ Fatura **1:1**.

### 2.3 Malzeme — OPSİYONEL, BOŞ BIRAKILIR
Kullanıcı dedi ki:
> "VuruşKAN'ın işleri için malzemeyi onlardan alıyoruz, o yüzden malzeme
> listesi girmiyoruz. Sadece dışarıdan alacağımız siparişler için malzemeli
> olabilir."

- `work_order_materials` **boş olabilir ve normaldir.** Boşsa maliyet `0`.
- Sadece **dışarıdan satın alınan** malzeme girilir.
- Müşterinin malzemesi = satış fiyatının içinde, ayrıca giremez.

### 2.4 Taşeron
- Taşeron **müşteri değil**, ayrı varlık.
- Bize fatura keser, biz öderiz, **açık bakiye** takibi var.

### 2.5 Kâr
```
kâr = satış − (kendi ekip + taşeron + dışarıdan alınan malzeme)
```

### 2.6 YAPILMAYANLAR — öneri getirme, yapma
| Konu | Neden |
|---|---|
| İş Paketi / gruplama | Kullanıcı "unut tamamen" dedi |
| Proje modülü | Kullanıcı dokunulmasını istemedi |
| Silo / malzeme parçalama | "Köşeye not edildi" |
| Puanlama arayüzü | Backend var, ekran yok. Kullanıcı "şuanlık kalsın" dedi |

---

## 3. Kod Haritası — Nereden Bakacaksın?

| Ne arıyorsan | Dosya |
|---|---|
| **Tartım / net kg mantığı** | `server/src/routes/workOrders.js` → `netOf()`, `amountOf()`, `divisorFor()` |
| Tablolar, ilişkiler | `server/src/schema.sql` (28 tablo + 2 görünüm) |
| Şema göçü (yeni sütun) | `server/src/db.js` → **`ensureColumn()`** |
| Müşteri portalı API | `server/src/routes/portal.js` (beyaz liste, `/api/portal`) |
| Müşteri portalı arayüz | `app/src/pages/portal/` (PortalLayout, PortalJobs, PortalInvoices) |
| Excel dışa aktarma | `server/src/routes/export.js` (`/api/export/excel`, ExcelJS) |
| Kâr hesabı | `server/src/routes/profit.js` |
| Maaş hesabı | `server/src/utils/payroll.js` + `src/docs/PUAN-MAAS-KURALLARI.md` |
| CRUD altyapısı | `server/src/utils/crud.js` |
| İş emri arayüzü | `app/src/pages/WorkOrders.jsx` |
| Kâr arayüzü | `app/src/pages/Profit.jsx` |
| Generic CRUD ekranı | `app/src/components/ResourcePage.jsx` |

**20 route:** workOrders, profit, payroll, subcontractors, stock, products,
invoices, quotes, customers, employees, projects, tasks, users, auth, activity,
company, dashboard, lookups, index, **portal**, **export**

**21 ekran:** Login, Dashboard, Tasks, Projects, Customers, Quotes, Invoices,
Employees, **Scores (Puanlama)**, Payroll, Subcontractors, Products,
StockMovements, Users, ActivityLog, CompanyProfile, WorkOrders, Profit,
**ExportExcel**, Settings
(+ `app/src/pages/ExportExcel/ColumnPicker.jsx` sütun seçici)

**Müşteri portalı ekranları** (`app/src/pages/portal/`): PortalLayout,
PortalJobs, PortalDateRequests, PortalInvoices, DateRequestModal,
ChangePasswordModal

---

## 4. 🚨 Tuzaklar (Bunlara Düşersen Projeyi Kırarsın)

1. **Ağırlık birimi.** `net_weight` daima kg. `unit` fiyatlandırma birimi.
   Ekranda `weightDisplay(kg, priceUnit)` helper'ını kullan.
2. **`CREATE TABLE IF NOT EXISTS` çalışan tabloyu DEĞİŞTİRMEZ.** Yeni sütun
   ekliyorsan `db.js`'teki `ensureColumn()` desenini kullan, yoksa eski
   veritabanında sütun oluşmaz.
3. **Electron preload `.cjs` olmak ZORUNDA.** `sandbox: true` iken ESM preload
   çalışmaz. `main.mjs` + `preload.cjs` ikilisi bozulursa program açılmaz.
4. **`app://` protokolü kullan.** `file://` CSP ve yolları bozuyor.
5. **Sunucu kapalıysa SİYAH EKRAN.** Bu bir hata değil, beklenen davranış.
   Kullanıcıya "sunucuyu başlat" de, kodda "düzeltme" yapma.
6. **Türkçe karakter + seed isimleri.** Seed betikleri **ASCII** isim kullanır
   (Mehmet Yilmaz, Ayse Demir). `STATUS_LABELS` sözlüğüne yeni durum
   eklmezsen arayüzde ham anahtarlar görünür. (Bu oldu, tekrar etmeyin.)
7. **Malzeme boş bırakmak hata değildir.** Boş bırakılan iş emrisinde uyarı
   verme, "malzeme girilmemiş" diye de uyarma.
8. **Müşteri portalı güvenliği.** `/api/portal/*` yalnızca müşteri rolüne,
   `/api/*` yalnızca personele açık. Yeni iç modül eklerken `/api/portal`
   DIŞINDA tut. Portal sorgularında `work_order_summary` gibi mali sütunlu
   görünümleri **kullanma** — elle sütun seç ve `WHERE customer_id = ?` koy.
9. **Maaş kuralları Excel'den birebir.** Puan eşiği 70, prim 250₺/puan,
   limit 5000₺, vergi %15, SGK %14, mesai 120sa×0.4, avans tavanı %30.
   **Bunları "düzeltme", Excel'den kopyalandı.**
10. **`JWT_SECRET` varsayılan kalıyor.** Canlıya almadan değiştir.
11. **Tünel açıkken veri internete açıktır.** `AILE-ERISIMI.bat` çalışıyorsa
    `*.trycloudflare.com` adresinden dünyaya açıktır. İş bitince
    `BAGLANTIYI-KAPAT.bat` çalıştır. Bağlantı **kalıcı adres değildir**,
    her açılışta değişir.
12. **Güvenlik önlemleri `server/src/index.js` içinde:** `helmet` (başlıklar),
    `express-rate-limit` (giriş 5dk/10 hata — **anahtar IP + kullanıcı adı**,
    çünkü tünelde herkes aynı IP'den gelir), CORS izin listesi.
    **`CORS_ORIGIN` değerine `*` yazma.**
13. **Jeton iptali:** `users.token_version` sütunu var. Parola değişince artar,
    `middleware/auth.js` eski jetonu reddeder. Yeni uç yazarken `authenticate`
    kullan — `token_version` kontrolünü atlamak eski oturumları açık bırakır.
14. **Excel çıktısında her hücre `guvenliHucre()`'den geçmeli.** `= + - @`
    ile başlayan metinler Excel'de formül olarak çalışır. Bu korumayı atlamak
    formül enjeksiyonu açığıdır.
15. **Parola politikası:** `parolaGuclu()` (auth.js) — en az 8 karakter, rakam
    şart, yaygın parolar reddedilir. Yeni parola alanı eklerken kullan.
16. **`.exe` üretilemiyor.** Windows Developer Mode kapalı. Bu ortam engeli,
    kod sorunu değil. Program normal çalışıyor.
17. **Şema sırası tuzağı.** Yeni sütun eklersen `schema.sql` içine
    `CREATE INDEX` yazma — sütun henüz yoksa sunucu "no such column" ile
    açılmaz. Index'i `db.js → migrate()` içindeki `lateIndexes` listesine ekle.
18. **Excel çıktısı da tartım kuralına uyar.** `routes/export.js` içindeki
    `NET (kg)` sütunu **kg** yazmalı, `NET (ton)` ayrıca kg÷1000 olmalı.
    `test/export.test.mjs` bunu her turda doğrular. Sütun adlarını değiştirirsen
    test kırılır — testi de güncelle.
19. **Sütun adları şemadan gelir.** `subcontractor_jobs.cost` (birim fiyat
    sütunu YOK), `subcontractor_payments.invoice_id` (subcontractor_id YOK),
    `work_order_labor.weight` (quantity değil), `payroll.net` (net_total değil).
    Export yazarken önce `schema.sql`'e bak.
20. **TCMB tarihi biçime göre değişiyor.** `fxFetch.js → isoTarih()` şart.
    TCMB `30.09.2026` da `09/30/2026` da gönderebiliyor. Ham değeri yazarsan
    tabloda iki biçim birden oluşur, `WHERE rate_date <= ?` string karşılaştırması
    bozulur ve otomatik kur sessizce GÖLGEde kalır. Bu hata yapıldı, düzeltildi.
21. **Kur bulunamazsa `1` dönme.** `utils/currency.js → kur()` bulamazsa **0**
    döner, böylece sessizce yanlış tutar üretilmez. Arayüz uyarı gösterir.
    `1` dönen kod yazma.
22. **`invoices.currency` / `exchange_rate` NOT NULL.** INSERT'te `null` yazarsan
    500 alırsın. `routes/invoices.js` içinde `kur()` ile güvenli varsayılan ata.
    Bu hata yapıldı, düzeltildi.
23. **`lazy()` ile yeni uç yazarken default export zorunlu.**
    `const X = lazy(() => import('./pages/X.jsx'))` → dosyada `export default`
    olmalı. Named export (`export function X`) yazarsan **siyah ekran** çıkar,
    konsolda da net hata görünmez. Bu tuzak iki kez yaşandı.
24. **PowerShell ile dosya yazma.** `[System.IO.File]::WriteAllLines` dizi
    üretirken PowerShell backtick'leri (`\``) bozar ve JS template literal'ları
    parçalar — dosya sessizce bozulur, `node --check` yakalar. Yeni dosya
    yazarken `write` aracını kullan, sonra `node --check` çalıştır.
25. **Kur kaynağı = TCMB, haremaltın DEĞİL.** Haremaltın kurları sadece
    tarayıcıda JS ile oluşuyor (HTML'de `-`, WebSocket dolduruyor, Node reddediliyor).
    Başka kaynağa geçme — kullanıcı kararı. Detay: `DOVIZ-NASIL.md`.
26. **Testler çalışan sunucuya bağlanır.** `npm test` artık sunucuyu kendisi
    başlatır (`test/tum-testler.mjs`). Test dosyasına `npm run test:smoke`
    gibi ayrı komutlarla gidersen **sunucunun açık olması şart** — kapalıysa
    hepsi "fetch failed" verir.
27. **`package.json` script'i eklerken `node --check` çalıştır.** Yazım hatası
    `npm test`'i sessizce bozar. Ayrıca `npm run seed-currency` gibi bir script
    yazdıysan `package.json`'a da eklemeyi UNUTMA — AI-DEVIR.md'de listeliyor.
28. ⛔ **`lazy()` dosyasında `export default` olmadan o ekran HİÇ açılmaz.**
    Bu tuzak **müşteri portalının 6 dosyasında** vardı ve portal hiç çalışmamıştı
    — 69 API testi geçtiği için kimse fark etmedi. Ekran tamamen boş kalır,
    konsoldaki hata da anlamsızdır:
    ```
    TypeError: Cannot convert object to primitive value
      at printWarning ... at lazyInitializer
    ```
    Named export (`export function X`) yazma. `export default X;` ekle.
    **Kontrol:** `node test/lazy-export.test.mjs` — yeni sayfa eklerken koş.
29. ⛔ **`ErrorBoundary` `main.jsx` içinde EN DIŞTA olmalı.** Bir zamanlar
    `App.jsx`'in personel dalının içindeydi; müşteri portalında hata olunca
    sınır yakalamıyor ve ekran yine boş kalıyordu. Hata sınırını bir dalın
    içine sarmalama — her ekranı kapsasın.
30. **Demo verisi müşterileri eşit dağıtmıyordu.** VuruşKAN'ın 0 iş emri
    vardı, portala girince "Henüz iş emri yok" görüyordu — demo satışta
    kullanılamaz durumdaydı. `demo-kur.js` artık portal hesapları tanımlıysa
    `isHavuzu`'na VuruşKAN'ı başa ekler. Değiştirirken bunu koru.
31. ⛔ **`get()` TEK SATIR döndürür, `query()` dizi.** `passwordReset.js`'te
    `[...get(SELECT ...)]` yazmıştım → liste her seferinde boş döndü, iki test
    kırmızıyken bile "dizi mi değil mi" kontrolü geçiyordu. Çok satır
    beklediğin HER yerde `query()` kullan. Test bu hatayı yakaladı.
32. ⛔ **SELECT'e kullanılan sütunu UNUTMA.** `SELECT id, full_name, role`
    yazıp sonra `row.is_active` kontrolü yaptım → `undefined` geldi, `!undefined`
    = true → talep hiç oluşmuyordu, üstelik 200 dönüyordu. Kullandığın sütunu
    SELECT'e ekle, yoksa sessizce yanlış dallanır.
33. **Şifre sıfırlama talebi gönderen şifreyi SEÇMEZ.** Bu olmazsa `admin`
    adını bilen yabancı tüm sistemi ele geçer. Akış: talep → yönetici onayı
    → sistem geçici şifre üretir → kullanıcı ilk girişte değiştirmeye ZORLANIR
    (`users.must_change_password`). Değiştirirken **5. adımı silme** — geçici
    şifre ancak onunla "geçici" kalır. Detay: `SIFRE-SIFIRLAMA.md`.
34. **`change-password` rotasındaki `currentPassword` istisnası dar olmalı.**
    Yalnızca `must_change_password = 1` iken atlanır (kullanıcı zaten geçici
    şifreyle giriş yaptı, jeton kanıtlıyor). Normal kullanıcıda eski şifre
    ZORUNLU — yoksa çalınan jetonla hesap ele geçirilirdi.
35. **Büyük harf/küçük harf hataları JS'te derlenmez.** `GUC_KURLARI` yazıp
    `GUC_KURALLARI` tanımlamıştım → ekran açılırken patladı. Vite sadece
    uyarı verir. `node test/ikon-import.test.mjs` yakalıyor.
36. ⛔ **Testler `.env` → veritabanı şifre eşleşmesine bağlı.** Şifre sıfırlama
    özelliğini kullanıp admin şifresini değiştirirsen `.env`'deki
    `ADMIN_PASSWORD` ile DB'deki ayrışır ve **testlerin tamamı** "Yetkilendirme
    başlığı eksik" ile kırmızı olur — gerçek sebep görünmez. Bu yüzden
    `tum-testler.mjs` baştan bir **ön kontrol** yapar ve şifre tutmuyorsa
    net bir mesajla durur:
    ```
    npm run reset-admin-password -- admin <env'deki şifre>
    ```
    Sunucu **kapalı** olmalı o anda. Bu hatayı bir kez yaşadım.
37. ⛔ **Test dosyasında şifre SABİT YAZMA.** `passwordReset.test.mjs`
    içine `demo1234` yazmıştım; demo şifresi değişince 34 test kırıldı.
    `_yardimci.js → yoneticiGirisi()` adayları sırayla dener — **onu kullan**.
    Değişken adını yeniden adlandırırken **kullanıldığı yerleri de kontrol et**
    (`giris` → `giris2` yapınca bir assert sessizce `undefined` oldu).
38. ⛔ **Arayüz demo adresinden açılınca `localhost`'a bağlanıyordu.**
    `AuthContext` varsayılanı `http://localhost:4000` idi. Cloudflare Tunnel
    veya VPS adresinden giren kişi "Sunucuya ulaşılamıyor" görüyordu —
    **demo1.0 dışarıdan hiç kullanılamaz durumdaydı.** Artık HTTP(S) ile
    açıldıysa `location.origin` kullanılıyor. Tünel/VPS eklerken bunu bozma.
39. ⛔ **Demo tohumlayıcı kural/ayar UYDURMAZ.** `demo-eklenti.js` başta
    kendi puan kriter ağırlıklarını yazdım (TEK 20, KAL 25...) → `payroll`
    testi kırıldı, çünkü kanonik ağırlıklar `utils/payroll.js →
    DEFAULT_CRITERIA`'da (TEK 30, KAL 20...). Ağırlık, prim, mesai, tüm
    borda kuralları **tek kaynaktan** gelir. Yeni demo verisi yazarken
    önce `utils/` altına bak.
40. **`demo-kur` admin şifresini `.env`'den okumalı.** `--temiz` şifreyi
    sıfırlar; sabit `demo1234` yazmak `.env` ile veritabanını ayırır ve
    `npm test`'i durdurur. Artık `process.env.ADMIN_PASSWORD` kullanıyor.
41. ⛔⛔ **İKİ CSP ÇAKIŞIR — HTML `<meta>` + sunucu başlığı.** `index.html`'deki
    `<meta http-equiv="Content-Security-Policy">` `img-src 'self' data:` diyordu,
    sunucudaki helmet ise `img-src 'self' data: blob:` diyor. **İkisi birlikte
    uygulanır ve EN KISITLAYICI kazanır** → `blob:` yasaklanır.
    `AuthImage` görseli `blob:` URL ile yüklediği için **tır fotoğrafları
    baştan beri HİÇ görünmüyordu.** Konsol uyarısına gömülü kalıyordu, kimse
    fark etmedi. **Koruma: `node test/csp.test.mjs`** (9 kontrol, ayrışmayı
    yakalar). HTML'de `<meta>` CSP varsa sunucu politikası **geçersiz
    sayılabilir** — yeni kural eklerken iki yeri de güncelle.
42. ⛔ **Ürettiğin dosyanın MIME tipi gerçek olmalı.** `demo-gorseller.js` PNG
    üretiyor, veritabanında `image/jpeg` yazılınca tarayıcı blob'u çözemedi
    (0×0). `mime_type = image/png`. Dosya uzantısı da aynı olmalı.
43. **Demo ek dosya adı için `SELECT` sütunlarını kontrol et.** `number`
    sütunu seçilmediği için ad `irsaliye-undefined.pdf` oldu. Türkçe karakter
    için `asciiAd()` kullan (birleşik nokta sorunu).

---

## 5. Şu An Ne Yapılmış / Ne Kalmış

### ✅ Yapılmış
- 28 tablo, 20 route, 21 ekran, ~105 API ucu
- İş emri: tartım, otomatik net kg, otomatik tutar, fatura bağlantısı, erteleme
- İş bölünmesi: kendi ekip (work_order_labor) + taşeron (subcontractor_jobs)
- Malzeme: opsiyonel, stoktan düşebilen (work_order_materials)
- Müşteri portalı: 2 rol, ayrı API alanı, tarih talebi + onay akışı
- Puanlama matrisi: dönem x personel x kriter, ağırlık düzenlenebilir
- Kâr raporu: aylık grafik, müşteri/taşeron kırılımı, CSV
- **Excel dışa aktarma: 15 sayfalık gerçek .xlsx** (formül enjeksiyonu korumalı)
- **Döviz (çoklu para birimi):** TCMB'den otomatik kur, geçmiş fatura bozulmaz
- Maaş/bordro: Excel formülleriyle 1:1
- **Para: okunur büyük rakam** ("1 milyon 320 bin") + tam rakam altta
- **Şifre sıfırlama talebi** (giriş ekranı + yönetici onayı + Telegram)
- **Demo verisi + görselleri tam** (34 tablo dolu, 38 görsel, hepsi çalışıyor)
- **498 test geçiyor** (389 sunucu + 23 chartScale + 32 money + 28 lazy-export + 18 ikon-import + 8 csp)

| Test dosyası | Adet | Komut |
|---|---|---|
| `smoke.mjs` | 57 | `cd server && npm test` |
| `payroll.test.mjs` | 32 | ↑ |
| `portal.test.mjs` | 69 | ↑ |
| `export.test.mjs` | 119 | ↑ |
| `attachments.test.mjs` | 31 | ↑ |
| `demo.test.mjs` | 23 | ↑ |
| `import.test.mjs` | 24 | ↑ |
| `passwordReset.test.mjs` | 34 | ↑ (yeni) |
| `test/chartScale.test.mjs` | 23 | `node test/chartScale.test.mjs` |
| `test/money.test.mjs` | 32 | `node test/money.test.mjs` |
| `test/lazy-export.test.mjs` | 28 | `node test/lazy-export.test.mjs` |
| `test/ikon-import.test.mjs` | 54 | `node test/ikon-import.test.mjs` |

> ⛔ Yeni ekran/bileşen eklerken **iki testi de koş:**
> `lazy-export.test.mjs` ve `ikon-import.test.mjs`. Portaldaki 6 dosyada
> default export eksikliği yüzünden portal hiç açılmamıştı.

### ⬜ Sırada
1. **GenelPerformans raporu** (Excel'den aktarılacak)
2. **Gerçek bulut dağıtım** — SQLite → Turso/libSQL, sunucuyu serverless'a
   taşıma. Ailenin bilgisayarın kapalıyken de erişmesi için gerekir.
3. `.exe` paketleme (Developer Mode açılmalı)
4. Disk temizliği (**C: %1,4 boş** — acil)

### ⏰ SONRA KONUŞULACAKLAR (1 Ekim 2026'da not alındı)

> Bu üçü **bilinçli olarak ertelendi**. Detay: `LISANS-PLANI.md`

| # | Konu | Not |
|---|---|---|
| 1 | **VPS / Hetzner** | *"Her şey bittikten sonra alalım."* Hetzner CX23 ~₺230/ay → sabit `demo.veltron.com.tr` adresi, bilgisayar kapalıyken de çalışır. Şimdilik Cloudflare Tunnel (**0 ₺**) yeterli |
| 2 | **Lisans anahtarı teslimi** | Satış sonrası **Telegram'dan mı** üretilsin, **mail ile mi** gitsin? Şimdilik **elle** verilir |
| 3 | **Nihai sürüm lisans** | Ödeme alma, otomatik yenileme, fiyatlandırma |

> ⛔ **Satışa başlamadan önce şart:** `activate()` şu an **8 karakterlik her şeyi
> lisans kabul ediyor** (`AAAAAAAA` bile geçer). Anahtar üretici + bilgisayar
> bağı + gerçek doğrulama yapılmadan lisans satma.
> 3 aşama şeması `LISANS-PLANI.md`'de.

**Lisans modeli (onaylandı):** yıllık **veya** süresiz + kullanıcı sayısı sınırı.
Hedef: **en fazla ~5 firma**.

### ✅ Aile erişimi (Cloudflare Tunnel)
- `AILE-ERISIMI.bat` → sunucuyu başlatır + `*.trycloudflare.com` adresi üretir
- `BAGLANTIYI-KAPAT.bat` → bağlantıyı kapatır
- `tools/cloudflared.exe` (52 MB, **git'e girmemeli** — `.gitignore`'da)
- **Hesap gerekmez**, ücretsiz. Veri buluta çıkmaz, kendi bilgisayarında kalır.
- Dışarıdan güvenlik testi: `npm run check-tunnel` (20 test)
- Detay: `AILE-ERISIMI.md`

### ✅ 29 Eylül 2026'da eklenenler
**Müşteri portalı**
- 2 rol: `customer_progress` (iş takip) / `customer_finance` (mali)
- VuruşKAN işleri görür, **fatura göremez**; mali hesap işleri göremez
- Müşteri **termin (due_date) değişikliği talebi** açabilir → personel onaylar
- Onaylayınca termin otomatik güncellenir + erteleme kaydı düşer
- Ayrı API alanı: `/api/portal/*` (beyaz liste modeli)
- Detay: `MUSTERI-PORTALI.md`

**Puanlama ekranı** (`app/src/pages/Scores.jsx`)
- Dönem × personel × kriter matrisi, ağırlıklı puan + prim önizlemesi
- Ağırlıklar düzenlenebilir (toplam %100 uyarısı)
- Prim (puan−70)×250, limit 5000₺ — bordroya otomatik yansır

**Hesap yönetimi**
- `server/.env` kalıcı: JWT_SECRET + 3 şifre (güçlü, rastgele)
- `npm run seed-portal` · `npm run reset-admin-password` · `npm run purge-test`
- Müşteri portalında **şifre değiştirme** eklendi
- **Giriş koruması art arda başarısızlık sayacı** (`utils/loginGuard.js`):
  5 hata → 3 dk kilit, başarılı girişte sıfırlanır.
  `express-rate-limit` login'e **KULLANILMAZ** — sınır aşılınca doğru şifre de
  reddediliyor, kullanıcı kilitleniyordu. `test:smoke` vs. `_yardimci.js`
  kullanır (şifre ortama göre değişebilir).

**Demo modu / lisans (satış gösterimi)**
- `npm run demo-kur -- --temiz` → 30 gün, 500 kayıt, gerçekçi uydurma veri
- `utils/license.js` + `routes/license.js` (`/license`, `/license/full`,
  `/license/activate`, `/license/demo`)
- Demo kısıtı `index.js` içinde: **sınıra kadar yazma serbest**;
  sınır/süre dolunca salt okunur (402)
- **İSTİSNA:** `/auth`, `/license`, `/portal`, `/health` kilitlenmez —
  kapatılırsa döngüsel kilit olur (testte yakalandı, düzeltildi)
- Excel alt başlığı + fatura/teklif damgası: `DEMO - SATIN ALINMADI`
- Detay: `DEMO-MODU.md`

**Tır fotoğrafları / ekler**
- `routes/attachments.js` + `app/src/components/Attachments.jsx`
- Dosyalar **kameriye açık değil** (oturum şart), diskte UUID adı
- Müşteri **kendi** işinin fotoğraflarını görür, başkasınınkini göremez
- Otomatik **fatura taslağı**: iş "teslim_edildi" olunca `invoices.work_order_id`
  ile bağlı TASLAK oluşur (ikinci taslak oluşmaz)

**Hızlı tartım girişi** (`app/src/components/QuickWeigh.jsx`)
- Kantar göstergesi **elle** okunuyor; büyük rakam tuşları + son tartım
  kopyalama. Gösterge entegrasyonu bilinçli olarak YAPILMADI.

**Excel dışa aktarma (ExcelJS)**
- `Yönetim → Excel'e Aktar` — gerçek `.xlsx` (içinde `exceljs` bağımlılığı)
- 14 kapsam, `all` = 15 sayfa, `monthly` = 7 sayfa
- **Kâfiyye** (`weighbridge`) sayfası: tartım defteri, kg/ton kilitli
- **Teklifler** (`quotes`) sayfası: KDV + toplam hesabı testli
- `GET /api/export/excel?scope=all&period=YYYY-AA&cols=<JSON>`
- **Ay Sonu Raporu** kapsamı: Özet + Müşteri Kırılımı + 4 detay sayfası
- **Sütun gizleme**: sayfa bazlı, tarayıcıda saklanır, `net-kg`/`net-ton` kilitli
- `GET /api/export/excel/columns?scope=...` → sütun listesi (seçiciyi doldurur)
- **Logo**: `company_profile.logo` (base64) okunur, her sayfaya `oneCellAnchor`
  ile gömülür; `?logo=0` kapatır. Boyut PNG/JPEG/GIF başlığından okunur
  (`imageSize()`), harici kütüphane yok
- Başlıkta logo varsa evrak adı **3. sütundan** başlar, iletişim 3. satıra yazılır
- **Tartım kuralı Excel'de de korunur**: `NET (kg)` = kg, ayrı `NET (ton)` sütunu
- Müşteri rolü indiremez (403)
- Detay: `EXCEL-EXPORT.md`

### ✅ 30 Eylül 2026'da eklenenler

**Döviz (çoklu para birimi)**
- Tablolar: `currencies` (12 para birimi), `exchange_rates` (tarihli kur geçmişi)
- `utils/currency.js` → `kur()`, `kurKaydet()`, `kurlariOtomatikGuncelle()`, `tlKarsiligi()`
- `routes/currency.js` → `/currencies`, `/rates`, `/rates/:kod`, `/convert`
- `fxFetch.js` → **TCMB**'den otomatik çekim (günde en fazla 1 kez)
- `app/src/pages/ExchangeRates.jsx` → **Döviz Kurları ekranı** (`#/doviz`)
- Fatura formunda **Para birimi + Kur** alanları
- **Kural:** tutar kayıt para biriminde + kur saklanır. Kur değişse bile geçmiş
  fatura bozulmaz. `kur()` bulamazsa 0 döner (sessizce 1 dönme).
- Detay: `server/src/docs/DOVIZ-NASIL.md`

**Türkçe para biçimi**
- `money(value, withSymbol, sembol)` → `1.134.180,91 ₺` (**sembol sonda**)
- `moneyShort()` → `100 bin ₺` / `1,2 M ₺` (grafik ekseni için)

**Reaktif grafik ekseni**
- `app/src/lib/chartScale.js` → `guzelEksen()`, `guzelAdim()`, `eksenTickleri()`
- Veriden hesaplanır, hard-coded değil. Negatif kâr varsa alt sınır 0'ın altına iner
- `ReferenceLine y={0}` ile sıfır çizgisi gösterilir
- Uygulandığı yerler: `pages/Profit.jsx`, `pages/Dashboard.jsx`
- Test: `test/chartScale.test.mjs` (23 test)

**Demo verisi düzeltmesi**
- `scripts/demo-kur.js`: taşeron maliyeti **kg üzerinden ton fiyatıyla** çarpılıyordu
  (1000 kat fazla). `Math.round((net / 2) * tonFiyat)` → `Math.round((net / 2 / 1000) * tonFiyat)`
- Marj `%-25687,2` → `%72,9`, kâr `−291.339.579 ₺` → `747.217,74 ₺`

**Diğer**
- `ErrorBoundary` bileşeni (bekelenmeyen hata → siyah ekran yerine bilgilendirme)
- Sunucu `kurlariOtomatikGuncelle()` ile açılışta bir kez kur çeker
- **Tek komutla test:** `server/test/tum-testler.mjs` → `npm test`.
  Sunucuyu kendisi başlatır/kapatan, 7 dosyayı sırayla koşan, özet tablo
  yazan koşucu. `npm test` 6 saniyede 355/355.
- `package.json`'a `seed-currency` script'i eklendi

**Para biçimi — "1 milyon 320 bin"**
- `moneyOkunur()` (api.js) → büyük rakamları gözle okunur yazar
  - `1.320.000` → **"1 milyon 320 bin ₺"** (kullanıcı isteği)
  - `1.024.866,87` → "1 milyon 24 bin ₺" · `747.217,74` → "747 bin ₺"
  - `9.999` altı → tam rakam (`money()`), kısaltma yok
  - **En fazla 2 parça** (milyar/milyon/bin). Artan değer alt satırda.
- `KpiMoney` (Primitives.jsx) → büyük okunur + altta tam rakam:
  ```
  Toplam satış
  1 milyon 24 bin ₺      ← okunur
  1.024.866,87 ₺          ← kesin
  ```
  Tam rakam zaten aynıysa alt satır tekrarlanmaz.
- 9 ekranda uygulandı: Kâr, İş Emirleri, Faturalar, Taşeronlar, Bordro,
  Stok, Teklifler, Panel, Müşteri Portalı
- `percent()` eklendi — API marjı `72.9` döndürüyordu, ekranda `%72.9`
  çıkıyordu. Artık `%72,9` (Türkçe ondalık ayracı)
- Test: `test/money.test.mjs` (32)

### ⛔ 1 Ekim 2026: Müşteri portalı hiç çalışmamıştı

Portal 29 Eylül'de "bitti" denmişti. **Aslında hiç açılmıyordu.**

| | |
|---|---|
| Neden | `pages/portal/` altındaki **6 dosyanın hiçbirinde `default export` yoktu** |
| Etki | Müşteri giriş yapınca **tamamen boş ekran**. Faturaları, işleri hiç göremiyordu |
| Neden fark edilmedi | 69 API testi geçiyordu — API çalışıyor, sadece arayüz yüklenmiyordu |
| Teşhis | Konsol hatası anlamsızdı: `Cannot convert object to primitive value ... at lazyInitializer` |

`App.jsx`'te `lazy(() => import('./pages/portal/PortalLayout.jsx'))` yazıyordu
ama dosyalar `export function PortalLayout()` ile dışa aktarıyordu.
**Düzeltme:** 6 dosyaya `export default` eklendi (named export'lar da duruyor).
**Koruma:** `test/lazy-export.test.mjs` — her lazy hedefinde default export arar.

**İkinci hata:** `ErrorBoundary` yalnızca personel dalının içindeydi; müşteri
portalında hata olunca yakalanmıyordu. `main.jsx` içine, en dışa taşındı.

**Üçüncü hata (demo):** VuruşKAN'ın 0 iş emri vardı → portala girince
"Henüz iş emri yok". `demo-kur.js` artık portal hesapları tanımlıysa VuruşKAN'ı
iş emeri havuzunun başına ekliyor. Doğrulandı: **4 iş emri, 3 fatura**.

**Şifre sıfırlama talebi (giriş ekranı)**
- Giriş ekranı → **"Şifremi unuttum"** → form → talep veritabanına
- Yöneticiye **Telegram** bildirimi (opsiyonel, ücretsiz, yeni kütüphane yok)
  - ✅ **1 Ekim 2026'da kuruldu:** `@VeltronTakip_Bot`, `.env` → token + chat id
  - Test: `npm run telegram-dene`
- **Yönetim → Şifre Talepleri**: onayla / reddet, menüde kırmızı rozet
- Onaylayınca sistem **12 karakterlik geçici şifre** üretir
- Kullanıcı ilk girişte **şifre değiştirmeye zorlanır** (`must_change_password`)
- Spam koruması: IP başına 10/saat, kullanıcı başına 15 dakikada 1
- Bilgi sızıntısı yok — kullanıcı var/yok aynı mesaj
- ⛔ **Güvenlik kuralı:** talep gönderen yeni şifreyi **seçmez**
- Test: `server/test/passwordReset.test.mjs` (34)
- Detay: `SIFRE-SIFIRLAMA.md`

**Demo verisi tamamlandı (1 Ekim)**
- `scripts/demo-eklenti.js` → 10 boş tabloyu doldurur
- **34 tablonun 34'ü dolu, boş tablo 0**
- Görev panosu 5 durumda dolu, taşeron faturalı/ödemeli, bordro 3 dönem
- Detay: `DEMO-MODU.md`

**Arayüz hata avı testleri**
- `test/lazy-export.test.mjs` (28) — lazy dosyasında `default export` var mı
- `test/ikon-import.test.mjs` (54) — JSX bileşeni tanımlı mı
- `test/csp.test.mjs` (9) — ⛔ HTML + sunucu CSP uyuşuyor mu (fotoğrafı kırar)
- İkisi de derleme zamanında **yakalanmayan** hataları yakalıyor

**Demo görselleri**
- `scripts/demo-gorseller.js` → 32 PNG + 6 PDF **harici kütüphane olmadan** üretir
  (PNG: `zlib` + elle CRC32; PDF: elle xref tablosu)
- ⛎ Bu iş **CSP hatasını ortaya çıkardı** — fotoğraflar hiç görünmüyordu

---

## 6. Çalışma Disciplini

- **Her değişiklikten sonra test çalıştır:**
  ```bash
  cd server && npm test                  # 355 test (7 dosya)
  cd .. && node test/chartScale.test.mjs # 23 test
  ```
- **Her değişiklikten sonra commit at.** Ortada bırakma.
- **Her değişiklikten sonra MD'leri güncelle.** (Kural sayfa başında)
- **Kullanıcıya ne yaptığını net söyle.** "X ekledim, Y'ye etkisi Z oldu."
- Emin değilsen **sor**, tahmin etme. Bu projede kurallar net; belirsizlik
  genelde bir kural eksikliğidir ve kullanıcı cevabı verir.
- **Sayıyı doğrula, tahmin etme.** Test sayısı, tablo sayısı, ekran sayısı
  gibi rakamları yazmadan önce `npm test` çalıştır veya dosyaları say. Yanlış
  sayı dokümana sızar ve sonraki oturumları yanıltır.

---

## 7. Detaylı Belgeler

| Dosya | İçerik |
|---|---|
| **`SIFRE-SIFIRLAMA.md`** | Şifre unutan kullanıcı, yönetici onayı, Telegram kurulumu |
| **`LISANS-PLANI.md`** | ⏰ Lisans modeli kararları, **sonra konuşulacaklar**, şema taslağı |
| **`DOVIZ-NASIL.md`** | Döviz kurları, TCMB, geçmiş fatura koruması, tuzaklar |
| **`EXCEL-EXPORT.md`** | Excel dışa aktarma, 15 sayfa, sütun gizleme, logo |
| **`MUSTERI-PORTALI.md`** | Müşteri portalı, roller, termin talebi, güvenlik |
| **`DEMO-MODU.md`** | Demo modu, lisans, 402 davranışı |
| **`GUVENLIK-DENETIMI.md`** | Güvenlik denetimi sonuçları |
| **`AILE-ERISIMI.md`** | Cloudflare Tunnel (aile erişimi) |
| **`KURULUM-KEVUZU.md`** | Kurulum paketi üretimi |
| `PROJE-DURUMU.md` | Güncel durum (bu dosyanın uzun hâli) |
| `DEV-NOTES.md` | ⚠️ **ESKİ** — 29 Eylül'ün tarihçesi, seçim gerekçeleri |
| `README.md` | Kurulum ve kullanım |
| `TASIMA-KILAVUZU.md` | Başka bilgisayara taşıma |
| `server/src/docs/PUAN-MAAS-KURALLARI.md` | Maaş hesabı formülleri |

---

*Son güncelleme: 1 Ekim 2026 · Şifre sıfırlama talebi (giriş ekranı + yönetici onayı + Telegram), TCMB kuru otomatik, Döviz Kurları ekranı, Türkçe para biçimi, müşteri portalı düzeltildi*
