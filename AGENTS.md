# AGENTS.md — VELTRON

> Bu dosya OpenCode tarafından **her oturum başında otomatik okunur.**
> Görevi: yapay zekânın projeyi ilk saniyelerde kavraması, kuralları bilmeden
> kod değiştirmesini engellemek.
>
> **Bu dosyayı güncelle.** Projeyle ilgili her kalıcı bilgi burada veya
> `AI-DEVIR.md`'de yazılıdır. Sadece konuşmada kalan bilgi oturum kapanınca ölür.

---

## 0. Proje Özeti

Veltron = ölçüm/tartım bazlı **iş emri takip sistemi** (ticari faturalı işletme
yönetimi).

| Katman | Teknoloji |
|---|---|
| Sunucu | Node.js + Express + SQLite (`node:sqlite`) |
| Veritabanı | SQLite (tek dosya, kurulum gerektirmez) |
| Masaüstü istemci | Electron |
| Arayüz | React (Vite) |
| Dil | **Türkçe** — arayüz metinleri, hata mesajları, para biçimi dahil |

**Ölçek (1 Ekim 2026 itibarıyla ölçüldü):** 27 route · 35 sayfa · 13 bileşen ·
38 tablo/görünüm · 25 betik · 14 kök doküman · **627 test** (459 sunucu + 168 arayüz)

**Ortam (bu bilgisayar):** Node v24.21.0 · Git 2.56.0 · GitHub CLI 2.102.0

**Çalıştırma:**

```powershell
# EN KOLAY: proje kökündeki Veltron-Ac.bat (sunucuyu başlatır + programı açar)
# elle:
cd server
npm start                  # port 4000, HOST=0.0.0.0
```

**Giriş:** `admin` / `server/.env` içindeki `ADMIN_PASSWORD`
(şu an `VeltronDemo2026!` — veritabanıyla eşleşiyor, dokunma)

---

## 1. EN ÖNEMLİ KURAL

Kullanıcının iş kuralları **kendi ağzından** geldiği gibi kodlanmıştır. Teknik olarak
tartışılabilir görünse bile:

- **`net_weight` asla elle girilmez** — `netOf()` hesaplar
- **Tek iş emri = tek birim** — gruplama/İş Paketi **yok**, bilinçli karar
- **Malzeme opsiyoneldir, boş bırakılması normaldir**
- **Taşeron müşteri değildir**, ayrı varlıktır
- **Müşteri portalında iki rol ayrıdır ve birbirini göremez** — `customer_progress`
  iş emirlerini, `customer_finance` faturaları görür
- **Maaş kuralları Excel'den birebir kopyalandı**, "düzeltme" yapma
- **Proje modülüne dokunulmaz**, bilinçli karar

Bu listedeki bir şeyi "mantıklı görünüyor diye" değiştirme. Değişiklik gerekiyorsa
**önce kullanıcıya sor**.

---

## 2. İş Kuralları

### 2.1 Tartım — EN SIK HATA BURADA

```
net_weight = gross_weight (dolu tır) − tare_weight (boş tır)
```

- `net_weight` **daima kg.**
- `unit` alanı (Ton / Kg) **sadece fiyatlandırma birimi**, ağırlık birimi değil
- Ton fiyatlandırmada: `tutar = (kg / 1000) × ton_fiyatı`
- Arayüzde `weightDisplay(kg, priceUnit)` helper'ını kullan

### 2.2 İş emri

- No müşteriden gelir (`VM2026-0017`) veya sistem üretir (`WEM-2026-0001`, `counters`)
- Fiyat ürün kartıyla eşleşmez, **kg direkt girilir**
- Faturalama tek seferde, İş Emri ↔ Fatura **1:1**
- Erteleme durum alanında değil, ayrı kayıt (`deferrals`)

### 2.3 İş bölünmesi

- Kendi ekip: `work_order_labor` — kişi + kg + saat → `employee.hourly_rate × saat`
- Taşeron: `subcontractor_jobs` — taşeron + kg → `kg × taşeron_kg_birim_fiyat`
- `kendi_ekip_kg + taşeron_kg` neti aşarsa aşım uyarısı çıkar

### 2.4 Taşeron

Bize fatura keserler, biz öderiz, açık bakiye takibi var
(`subcontractor_invoices` + `subcontractor_payments`). Müşteri listesine karıştırma.

### 2.5 Malzeme — OPSİYONEL

Kullanıcının kuralı:
> "VuruşKAN'ın işleri için malzemeyi onlardan alıyoruz, o yüzden malzeme listesi
> girmiyoruz. Sadece dışarıdan alacağımız siparişler için malzemeli olabilir."

- `work_order_materials` **boş olabilir ve normaldir.** Boşsa maliyet `0`
- Müşterinin malzemesi = satış fiyatının içinde, ayrıca girilmez
- Sadece dışarıdan satın alınan malzeme girilir
- `deduct_stock = 1` ise stoktan düşülür, stok yetersizse API hata verir
- **Boş bırakıldığında uyarı verme, "malzeme girilmemiş" mesajı basma**

### 2.6 Kâr

```
kâr = satış − (kendi ekip + taşeron + dışarıdan alınan malzeme)
```

Müşteriden gelen malzeme hesaba katılmaz. "Katkı marjı" uyarısı ayrı bir gerçek
maliyet hesabıdır, kârla karıştırma.

### 2.7 Maaş / Puan — Excel'den Birebir

| Kural | Değer |
|---|---|
| Puan eşiği | 70 |
| Prim | 250 ₺ / puan |
| Prim limiti | 5000 ₺ |
| Vergi | %15 |
| SGK işçi payı | %14 |
| Mesai | 120 saat × 0.4 |
| Avans tavanı | %30 |

Motor: `server/src/utils/payroll.js` · Test: `payroll.test.mjs` (69)
**Bu sayılar Excel formüllerinden geldi. Dokunma, düzeltme.**

### 2.8 Müşteri portalı

İki rol, **birbirini göremez**. Güvenlik kritik.

| | `vuruskan` (`customer_progress`) | `vuruskan-mali` (`customer_finance`) |
|---|---|---|
| Ekran | İşlerim + Tarih Taleplerim | Faturalarım |
| İş emirlerini görür | ✓ | ✗ |
| Faturaları görür | ✗ | ✓ |
| Fiyat, tutar, tartım | ✗ | ✗ |
| Maliyet, kâr, taşeron | ✗ | ✗ |

Her sorguya `customer_id` filtresi koy. Liste ucunu açık bırakma.
Ayrıntı: `MUSTERI-PORTALI.md`

---

## 3. Kod Haritası

| Ne arıyorsan | Dosya |
|---|---|
| **Tartım / net kg mantığı** | `server/src/routes/workOrders.js` → `netOf()`, `amountOf()`, `divisorFor()` |
| Tablolar, ilişkiler | `server/src/schema.sql` |
| **Şema göçü (yeni sütun)** | `server/src/db.js` → **`ensureColumn()`** |
| Yapılandırma (port, db yolu, CORS) | `server/src/config.js` |
| Giriş koruması (başarısızlık sayacı) | `server/src/utils/loginGuard.js` |
| Kâr hesabı | `server/src/routes/profit.js` |
| Maaş hesabı | `server/src/utils/payroll.js` |
| CRUD altyapısı | `server/src/utils/crud.js` |
| Müşteri portalı | `server/src/routes/portal.js` + `app/src/pages/portal/` |
| Döviz (TCMB) | `server/src/routes/currency.js` |
| KDV | `server/src/routes/taxes.js` |
| Excel içe/dışa aktarma | `server/src/routes/import.js`, `export.js` |
| Demo modu / lisans | `server/src/routes/license.js` |
| Şifre sıfırlama | `server/src/routes/passwordReset.js` |
| İş emri arayüzü | `app/src/pages/WorkOrders.jsx` |
| Kâr arayüzü | `app/src/pages/Profit.jsx` |
| Generic CRUD ekranı | `app/src/components/ResourcePage.jsx` |
| Para biçimi (`1.134.180,91 ₺`) | `app/src/lib/api.js` → `money()`, `moneyKart()` |
| **Para kartı gösterimi** | `moneyKart()` — < 1.000.000 tam rakam, üstü kısaltma. `money()`'ı **değiştirme** (belgelerde `,00` yazması doğru) |
| Hatırlama jetonu | `middleware/auth.js` + `routes/auth.js` → `/auth/remember` |
| **Hata günlüğü (yaz/maskele/oku)** | `server/src/utils/hataGunlugu.js` → `hataYaz()`, `hatalariOku()`, `temizle()` |
| **Hata yakalayıcı** | `server/src/middleware/error.js` → `errorHandler` (5xx günlüğe yazar, 4xx **yazmaz**) |
| Destek ucu (8 uç) | `server/src/routes/support.js` |
| Destek ekranı | `app/src/pages/Support.jsx` |
| Giriş ekranı destek penceresi | `app/src/components/DestekOzeti.jsx` (jeton gerektirmez) |
| Düz metin indirme | `app/src/lib/api.js` → `api.text()` (`api.get` JSON parse eder, kullanma) |
| Program ikonu | `app/electron/icon.png` (üretici: `_ikon-uret.mjs`) |

---

## 4. 🚨 Tuzaklar

1. **Ağırlık birimi.** `net_weight` daima kg. `unit` fiyatlandırma birimi.
2. **`CREATE TABLE IF NOT EXISTS` çalışan tabloyu DEĞİŞTİRMEZ.** Yeni sütun
   ekliyorsan `db.js`'teki `ensureColumn()` desenini kullan.
3. **Electron preload `.cjs` olmak ZORUNLU.** `sandbox: true` iken ESM preload
   çalışmaz. `main.mjs` + `preload.cjs` ikilisi bozulursa program açılmaz.
4. **`app://` protokolü kullan.** `file://` CSP ve yolları bozuyor.
5. **Sunucu kapalıysa SİYAH EKRAN.** Bu hata değil, beklenen davranış. Kodda
   "düzeltme" yapma, kullanıcıya "sunucuyu başlat" de.
6. **Türkçe karakter + seed isimleri.** Seed betikleri **ASCII** isim kullanır
   (Mehmet Yilmaz, Ayse Demir). `STATUS_LABELS` sözlüğüne yeni durum eklersen
   eklemezsen arayüzde `in_progress` gibi ham anahtarlar görünür. (Bu oldu.)
7. **Malzeme boş bırakmak hata değildir.** Uyarı basma.
8. **Maaş kuralları Excel'den birebir.** Bölüm 2.7 sabit.
9. **Yeni sayfa = `export default` şart.** 1 Ekim'de portal 6 dosyada bu
   eksikliği yüzünden bomboş ekran verdi, 69 API testi geçerken bile. Koruma:
   `test/lazy-export.test.mjs`.
10. **`npm test` ön kontrolü tek şifre dener.** `tum-testler.mjs:100`
    `ADMIN_PASSWORD`'ü tek deniyor, test yardımcısı ise 4 aday dener. `.env`
    veritabanıyla ayrışırsa testler hiç başlamadan "Yonetici girişi başarısız"
    ile durur ve gerçek hata gizlenir.
11. **`.env` ve `*.db` repoya girmiyor** (`.gitignore` doğru ayarlı). Veri sadece
    diskte yaşar, GitHub'da değil.
12. **`.exe` üretilemiyor.** Windows Developer Mode kapalı — ortam engeli, kod
    sorunu değil. Program normal çalışıyor.
13. **`CORS_ORIGIN` içinde `app://bundle` OLMALI.** Veltron iki yolla açılır:
    - `npm run dev` → arayüz `http://localhost:5173` → listede var → çalışır
    - `npm start` / kurulum paketi → arayüz `app://bundle` → **listede yoksa
      "Sunucuya ulaşılamıyor" ve BOŞ EKRAN**

    Bu satır 1 Ekim 2026'da `.env`'de eksikti; program yalnızca geliştirme
    modunda çalışıyordu, kimse fark etmedi. `server/.env.example` düzeltildi.
    **`server/.env` her bilgisayarda elle güncellenmeli** — bu dosya Git'te
    değil, USB ile taşınırken de kontrol et.
14. **Dosya içeriğini PowerShell ile DÜZENLEME.** Bu tuzak bir kez pahalıya
    mal oldu. Şu komut kalıcı bozulma yarattı:
    ```powershell
    (Get-Content x.jsx -Raw) -replace 'a','b' | Set-Content x.jsx -Encoding UTF8
    ```
    PowerShell 5.1 dosyayı **cp1254 (Türkçe ANSI)** olarak okur, `ü`→`Ã¼`
    yapar, UTF-8 olarak geri yazar → **çift kodlama**. Dashboard.jsx'te 35 satır
    bozuldu; kart yazıları ekranda `Aktif mÃ¼ÅŸteri` göründü.
    - Dosya içeriği değiştirmek için **sadece Edit aracı** kullan.
    - PowerShell'i sadece komut çalıştırmak, git, dosya listeleme için kullan.
    - Şüphede kalırsan: `git diff` ile bak, gerekirse `git checkout <commit> -- <dosya>`.
15. **Mojibake (bozuk Türkçe) kontrolü.** Yeni dosya yazdıysan doğrula:
    - `Ã¼`, `ÅŸ`, `Â°` gibi **iki karakterlik diziler** aranır (tek `â`/`Â`
      GEÇERLİ Türkçe harftir — "Kâr", "Ân" — yanlış alarm verir).
    - Raporu **stdout'a değil dosyaya** yaz. node → PowerShell konsol → dosya
      zinciri karakterleri bozar ve 113 dosya "bozuk" gibi görünür (hiçbiri
      bozuk değildi). Bu hatayı bir kez yaptık.
16. **PNG üretirken parça yapısı:** `[4 bayt uzunluk][4 bayt tip][veri][4 bayt CRC]`
    ve CRC **yalnızca tip+veri** üzerinden hesaplanır (uzunluk dahil değil).
    Uzunluk/tip yazılmadan çıkan PNG sessizce bozuktur.
18. **Sunucu testleri ASLA gerçek veritabanına bağlanmaz.** `tum-testler.mjs`
    kendi kopyasını açar ve `process.env.DB_FILE`'ı zorlar — dışarıdan yanlış
    verilse bile gerçek DB kullanılamaz. (2 Ekim 2026'da DB_FILE ayarlanmadan
    koşucu çalıştırıldı; portal/demo testleri GERÇEK DB'ye kayıt açtı:
    müşteri 28→39, fatura 23→32, kullanıcı 16→28. Yedekten temizlendi.)
19. **`LIKE` ile silme yaparken joker kullanma.** SQL'de `_` tek karakterlik
    jokerdir. `username LIKE '%_mali'` deseni **gerçek** `vuruskan-mali`
    hesabını (müşteri portalı) eşleştirdi ve sildi. Joker kullanacaksan
    yanına koruma listesi koy (`KORUNAN_ADLAR`).
20. **Kopya alırken WAL ve SHM de kopyalanmalı.** `veltron.db` son yazmaları
    içermez; onlar `-wal` dosyasındadır. Atlanırsa kopya eksik veri verir.
21. **Veri temizliği yapmadan önce yedek al ve gerçek hesapları doğrula.**
    Silme sonrası `SELECT username, role FROM users` ile korunması gereken
    hesapların yerinde olduğunu teyit et.
22. **Ekran görüntüsü için `PrintWindow` KULLANMA.** PowerShell'in
    `PrintWindow` yöntemi **eski kareyi** döndürüyor; aynı sayfada JS ile
    ölçüldüğünde değerler doğru çıktı. 2 Ekim'de giriş ekranı ikonu
    "değişmemiş" sanıldı, oysa kod baştan doğruymuş — ölçüm aracı yanlıştı.
    Gerçek yakalama: Electron'un kendi `capturePage()`'ini çağıran küçük bir
    betik (`BrowserWindow` → `loadFile(app/dist/index.html)` → `capturePage`).
    Boyut şüphesinde `executeJavaScript` ile `getBoundingClientRect()` ölç.
    ⛔ 2 Ekim'de bunun yerine **Chrome DevTools Protocol (CDP)** kullanıldı ve
    çok daha güçlü çıktı: Electron'u `--remote-debugging-port=9222` ile
    açmak + `Runtime.evaluate` ile GERÇEK DOM'u okumak. `document.body.innerText`
    ve `.card-head h3` listesi "ekran boş mu, kartlar çıktı mı" sorusunu
    kesin cevaplar. Konsol hataları da `Log.entryAdded` ile toplanır.
    ⚠️ `Log.enable` **sonraki koşulardan gelen eski günlükleri de tekrarlar** —
    "temiz koşu" iddiası için Electron'u yeniden başlatmak gerekir.
23. **Herkese açık uçları global `authenticate`'ten ÖNCE kaydet.**
    `routes/index.js` sırası: `/auth` → `/license` → `/password-reset` →
    **senin açık uçların** → `router.use(authenticate)` → iç rotalar.
    Yanlış yere yazarsan uc sessizce 401 döner ve ekranda hiçbir şey olmaz.
    2 Ekim'de `/support/bilgi` ve `/support/bildir` ikisi de buna takıldı.
    Koruma: `hataGunlugu.test.mjs` içinde **jetonsuz** istek atılıyor.
24. **`isOptionalAuth` = sessiz geçer, reddetmez.** Jeton varsa `req.user` dolar,
    yoksa istek devam eder. Bunu sadece **kimlik isteyen** uçlarda kullan
    (`/support/bildir`); veri okuyan uçlarda ASLA — orada kimliksiz istek
    boş liste döner ve veri sızdırabilir.
25. **Arayüzde göreli `fetch('/api/...')` ÇALIŞMAZ.** Electron'da sayfa
    `app://bundle/index.html` adresinde; göreli adres `app://bundle/api/...`
    olur ve CSP `connect-src` tarafından engellenir. **Her zaman
    `getServerUrl()`** kullan (`lib/api.js`). `api.get/post/...` bunu zaten
    yapıyor — elle `fetch` yazıyorsan tabanı kendin kur.
26. **`text/plain` dönen uçları `api.get()` ile ALMA.** `request()` yanıtı
    `JSON.parse` ediyor; parse başarısız olunca içerik `{ error: "<metin>" }`
    içine sarılır ve indirilen dosyaya yanlış şey yazılır. `api.text(path)`
    eklendi (2 Ekim) — onu kullan.
27. **Korumalı ucu harici tarayıcıda açma.** `openExternal(url)` jeton
    gönderemez → hep 401. Kimlik gereken dosyayı indırmak için: `api.text()`
    ile içeriği al → `window.veltron.app.exportText({ defaultName, content })`
    (Electron "farklı kaydet" penceresi) kullan.
28. **`window.confirm` kullanma.** Proje `ConfirmDialog` bileşenini
    (`components/Modal.jsx`) kullanıyor; Electron'da native uyarı kutusu
    çirkin ve tema dışı görünüyor.
29. **Electron'un `window.location.pathname` işe yaramaz.** Hash yönlendirme
    kullanılıyor; `pathname` her zaman `/index.html`. Gerçek ekran
    `location.hash.replace('#','')` içinde.
30. **`Math.round(bayt / 1024)` küçük dosyalarda "0 KB" yazar.** Baytı
    düzgün göster (`boyutGoster()` gibi).
31. **⛔ SUNUCU, KENDİ KLASÖRÜ DIŞINDAKİ DOSYAYA BAĞLANAMAZ.** Kurulumda
    sunucu şuraya taşınıyor:
    `…\Veltron\resources\server-runtime\server\src\…`
    `require('../../../app/package.json')` geliştirmede **çalışır** ama
    kurulumda o klasör **yoktur** → paketlenmiş sunucu **açılışta çöker**,
    program diğer bilgisayarda hiç açılmaz.
    2 Ekim'de `routes/support.js` bunu yaptı; 585 test geçmişti, günlük
    testleri de yeşildi, hata **yalnızca paketi çalıştırınca** çıktı.
    Koruma: `server/test/paketlenebilirlik.test.mjs` — kaynakları tarar,
    `server/` dışına çıkan import varsa FAIL eder. `npm run dist` ÖNCESİ
    çalıştır.
32. **Kurulum paketi kendi kendine yeterlidir.** `tools-src/kurulum-hazirla.mjs`
    `.env`, `veltron.db` (+WAL/SHM) ve `node.exe`'i paketin **içine** koyar.
    Yeni bilgisayarda sadece `.exe`'yi çalıştırmak yeterlidir — `.env` veya
    veritabanını elle kopyalamak GEREKMEZ. `OKUBENI.md` (kaynak:
    `tools-src/OKUBENI.md`) buna göre yazıldı.
    **Node.js kurulumu da gerekmez** — gömülü `node.exe` (v24.21.0) kullanılır.
33. **Paket üretirken sunucuyu GERÇEKTEN çalıştır.** `npm run dist` bitince
    `app/release/win-unpacked/resources/server-runtime` klasörünü geçici bir
    yere kopyala, orada `node.exe src/index.js` ile başlat, uçlara istek at.
    Dosya yerinde var diye çalıştığını sanma — tuzak 31 tam olarak böyle
    yakalandı.
34. **⛔ TESTLER KURULU SUNUCUYA YAZABİLİR (en pahalı hataydı).**
    Kurulu Veltron sunucusu 4000'i tutuyorken `npm test` çalıştırıldı.
    Koşucunun `spawn` ettiği sunucu portu alamadı ve öldü; ama
    `saglikBekle()` "bir şey cevap veriyor" diye **kurulu sunucuyu
    sağlıklı saydı**. Testler ona gitti ve **gerçek veritabanına**
    5 test müşterisi + 1 test faturası yazdı (customers 16→22).
    10/13 dosya başarısız oldu, sebebini kimse göremedi.
    - **İki koruma var:** (1) sunucu başlatılmadan önce port kontrolü,
      doluysa testler hiç başlamaz; (2) `/api/support/bilgi` artık
      kullandığı veritabanının **mutlak yolunu** dönüyor, koşucu bunu
      kendi kopyasıyla karşılaştırır.
    - **Sonuç çıkarsa önce:** `schtasks /End /TN "Veltron Sunucu"`.
      Programı kapatmana gerek yok.
    - ⛔ Yeni bir sunucu ucu eklerken **mutlak yol döndürme.** Test
      koşucusu bu bilgiye dayanıyor.

---

## 5f. Marka (2 Ekim 2026)

**İsim: Veltron.** "Veltron Takip" olarak kısaltıldı.

| Nerede | Değer |
|---|---|
| Pencere başlığı, sekme başlığı | `Veltron` |
| exe adı | `Veltron.exe` |
| Kurulum dosyası | `Veltron-Kurulum-${version}.exe` |
| Masaüstü kısayolu | `Veltron.lnk` |
| `appId` | `com.veltron.takip` — **değiştirme**: uygulama kimliği |

⛔ **`--primary` rengini değiştirme.** 24 yerde kullanılıyor (buton, link,
aktif menü çubuğu, sayaç rozeti, sekme). Koyulaştırılırsa koyu zeminde
butonlar kaybolur. Marka rengi değişikliği **yalnızca ikon dosyasında**
(`app/electron/icon.png`) yapılır.

**Logo: antrasit atom**

```
Zemin     #1e293b → #475569 (antrasit gradyan)
Atom      3 elips yörünge (0°/60°/120°), her birinde 1 elektron
Çekirdek  beyaz "V"
Üretici   tools-src/ikon-uret.mjs  ·  ton karşılaştırma: ikon-tonlari.mjs
```

- ⛔ **Electron'un logosunun kopyası değil.** Electron da 3 yörüngeli atom
  kullanır; bu yüzden çekirdeğe "V" kondu — hem atom hissi hem marka.
  Boş elektron logosu görününce "bu uygulama mı?" karışıklığı olur.
- **Program ikonu** (`icon.png`): görev çubuğu, masaüstü simgesi, exe gömülü
- **Giriş ekranı** (`Login.jsx` + `app/public/`): 60×60 px
  - ⛔ 46px denendi, **vazgeçildi**: yörüngeler iç içe geçiyor, "V" okunmuyordu
  - ⛔ **Sol menüdeki 30px kutu HARF "V" OLARAK KALDI**: 30px'te atom
    kesinlikle bulanıklaşıyor. PNG denendi, vazgeçildi.

---

## 5. Testler

**Sunucu testleri — 11 dosya, 490 kontrol:**

```powershell
cd server
npm test          # koşucu: test KOPYASINI kendisi açar, 11 dosyayı koşar
```

Dosyalar: `smoke` (57) · `payroll` (69) · `portal` (119) · `export` (31) ·
`attachments` (23) · `demo` (24) · `import` (34) · `passwordReset` (32) ·
`taxes` (39) · `remember` (31) · `faturaPosta` (62)

⛔ **Gerçek veritabanı koruması:** koşucu `veltron-test.db` kopyasını kendisi
açar (WAL + SHM dahil) ve `process.env.DB_FILE`'ı zorlar. Dışarıdan yanlış
verilse bile gerçek DB'ye bağlanamaz. Bkz. Tuzak 18-21.

**Arayüz testleri — proje kökünden, 5 dosya, 168 test:**

```powershell
node test/chartScale.test.mjs      # 23
node test/money.test.mjs           # 53
node test/lazy-export.test.mjs     # 29
node test/ikon-import.test.mjs     # 55
node test/csp.test.mjs             # 9
```

**Şifre değiştiren testler `finally` ile geri almalı.** `remember.test.mjs`
[F] bölümü bunu yapıyor. Aksi halde admin şifresi test değerinde kalır,
sonraki koşular 400/429 alır ve 30+ test yanlış "kaldı" görünür.

**Testleri GERÇEK VERİTABANI KARŞI KOŞTURMA.** Testler veri yazar. Kopyayla:

```powershell
cd server
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Copy-Item data\veltron.db        data\veltron-test.db -Force
Copy-Item data\veltron.db-wal    data\veltron-test.db-wal -Force
Copy-Item data\veltron.db-shm    data\veltron-test.db-shm -Force   # WAL'i atlama!
$env:DB_FILE = (Resolve-Path data\veltron-test.db).Path
npm test
Remove-Item data\veltron-test.db* -Force
```

- `DB_FILE` ortam değişkeni `config.js` tarafından okunur.
- **WAL dosyasını mutlaka kopyala.** `veltron.db` 548 KB ama `-wal` 4 MB — son
  yazmalar ana dosyada değil, WAL'da. WAL olmadan kopya eksik veri verir.
- Koşucu `ADMIN_PASSWORD` ile ön kontrol yapar. Test kopyasında şifreyi
  eşitlemek gerekiyorsa **sunucu kapalıyken**:
  `node src/scripts/reset-admin-password.js admin <sifre>`

**Disiplinin:** değişiklikten sonra önce testler, sonra commit.

---

## 5b. "Beni Hatırla" (remember me)

Giriş ekranındaki kutu → program her açılışta otomatik girer. **Kullanıcı C seçeneğini istedi: hatırla ama süreli.**

**Ne saklanıyor, ne saklanmıyor**

| Saklanır | Saklanmaz |
|---|---|
| 30 günlük hatırlama jetonu | **ŞİRE HİÇBİR YERDE** |
| Kullanıcı adı, cihaz adı, bitiş tarihi | Şifre hash'i bile |
| `veltron-config.json` (Electron) | — |

Jetonsuz otomatik giriş **mümkün değildir**. Şifre girilmeden hiçbir şey
kazanılamaz.

**Akış**

```
Giriş (kutu işaretli) → POST /auth/login {remember:true}  → {token, remember_token}
   → Electron remember.set()  → veltron-config.json
Program açılışı          → POST /auth/remember {token}      → {token, user}
   → 12 saatlik normal jeton, panele girer
```

**Dosyalar**

| Ne | Dosya |
|---|---|
| Tablo | `server/src/schema.sql` → `remember_tokens` |
| Jeton üretme/doğrulama | `server/src/middleware/auth.js` → `signRememberToken`, `verifyRememberToken`, `REMEMBER_TTL_DAYS = 30` |
| Uçlar | `server/src/routes/auth.js` → `POST /login` (remember), `POST /remember`, `POST /remember/revoke` |
| Disk yazımı | `app/electron/main.mjs` → `remember:get/set/clear`, `remember:device` |
| Köprü | `app/electron/preload.cjs` → `remember.*` |
| Otomatik giriş | `app/src/context/AuthContext.jsx` → `autoLogin()` |
| Kutu | `app/src/pages/Login.jsx` |
| Durum + "Bu cihazı unut" | `app/src/pages/Settings.jsx` |
| Testler | `server/test/remember.test.mjs` (31 kontrol) |

**Güvenlik kuralları — hepsi testli**

1. Hatırlama jetonu **API uçlarında kullanılamaz** (`typ: 'remember'` → 401).
   `authenticate` bunu reddeder. Bu olmadan 30 günlük jeton normal erişim
   jetonuna dönüşür.
2. Jetondaki `tv` = `token_version`. **Şifre değişince hatırlama ölür.**
   `change-password` ayrıca `remember_tokens` kayıtlarını da iptal eder.
3. Pasif kullanıcı hatırlama ile giremez.
4. `revoke` → "Bu cihazı unut". Jeton hem yerelde hem sunucuda silinir.
5. Uydurma/bozuk jeton reddedilir.

**Tasarım kararları (kullanıcı onaylı)**

- **Tek cihaz kuralı.** Yeni "hatırla" girişi öncekini iptal eder. Kullanıcı
  3 bilgisayarda çalıştığı için kasıtlı: hangi cihazın hatırlandığı belli olsun.
  (Değiştirilmesi istenirse `/auth/login` içindeki `UPDATE ... revoked_at` bloğunu kaldır.)
- **`logout()` hatırlamayı da siler.** Paylaşılan bilgisayarda "Çıkış yap" deyip
  cihazı devretmek isteyenin program yeniden açılınca otomatik girmemesi için.
  Sadece cihazı unutmak isteyen → Ayarlar → "Bu cihazı unut".
- Tarayıcıda (bridge yok) hatırlama **çalışmaz**; sadece Electron'ta.

---

## 5c. Uygulama İkonu

`app/electron/icon.png` — 1024×1024 PNG. `main.mjs` pencere ikonu olarak
kullanır (bu dosya uzun süre **yoktu**, Electron varsayılanını gösteriyordu).

Görünüm arayüzdeki `.brand-mark` ile birebir aynı:
`linear-gradient(135deg, #3b82f6 → #a855f7)`, köşe yarıçapı 7/30, beyaz kalın "V",
köşeler saydam.

Masaüstü sürümleri: `veltron-ikon-1024/512/256/128.png`.
Yeni boyut üretmek gerekirse `tools-src/ikon-uret.mjs` betiğini çalıştır
(`node tools-src/ikon-uret.mjs`), PNG parça yapısına dikkat et (Tuzak 16).

> Not: `tools-src/` sadece kaynak betikler içindir, `tools/` klasörü
> (cloudflared binary) `.gitignore`'da dışarıda — karıştırma.

---

## 5d. Fatura Kâğıdı ve E-posta (1 Ekim 2026)

**Tasarım koda gömülü değil.** Görünüm `server/templates/fatura.html`
dosyasındadır — düz metin, kod bilmeden düzenlenir. Dosyanın üstünde
değiştirilebilecek her şey listelenmiş.

| Ne | Dosya |
|---|---|
| **Şablon (TASARIM BURADA)** | `server/templates/fatura.html` |
| Yer tutucu doldurucu | `server/src/utils/faturaSablon.js` |
| HTML → PDF | `server/src/scripts/html-pdf.mjs` (Electron/Chromium) |
| API uçları | `server/src/routes/faturaPosta.js` |
| E-posta gönderimi | `server/src/utils/eposta.js` |
| Gönderim penceresi | `app/src/components/InvoiceSendModal.jsx` |
| Ayarlar bölümü | `app/src/pages/Settings.jsx` → "Fatura Görünümü" |
| Testler | `server/test/faturaPosta.test.mjs` (62 kontrol) |
| **Gmail kurulum (kullanıcı için)** | `tools-src/gmail-kurulum.md` |

**Yer tutucular:** `{{FIRMA_ADI}}`, `{{FATURA_NO}}`, `{{KALEMLER}}`,
`{{GENEL_TOPLAM}}`, `{{MARKA_RENK}}`, `{{LOGO_HTML}}`… Liste şablonun
içinde. Yeni yer tutucu eklerken `faturaSablon.js`'teki `yer` nesnesine de ekle.

**Otomatik gelenler:** logo ve marka rengi (Ayarlar → Firma Profili).
`marka_color` yalnızca `#rrggbb` kabul edilir, `invoice_layout` yalnızca dosya
adı (yol kaçışı engelli).

**E-posta:** SMTP **kullanılmaz** — Gmail'in HTTPS API'si kullanılır (sunucudan
465 portuna çıkmaz, hosting'de engellenmez). Şifre hiçbir yere yazılmaz;
`.env`'den OAuth bilgileri okunur. Günlük kota 450, geçmiş `invoice_emails`
tablosuna yazılır. Kurulum adım adım: **`tools-src/gmail-kurulum.md`**.

**⛔ Route sırası tuzağı:** `faturaPostaRoutes`, `routes/index.js`'te
`invoiceRoutes`'ten **önce** kaydedilmeli. `invoices.js`'teki `GET /:id`
rotası `/gonderim-durumu` gibi sabit yolları da yakalar, `"id=NaN"` arar ve
"Fatura bulunamadi" hatası verir. Bu oldu, düzeltildi — sırayı bozma.

**Kullanılmayan dosyalar:** `pdfAltyapi.js` ve `faturaPdf.js` (elle kodlanmış
PDF denemesi). Tasarım koda gömüldüğü ve xref ofsetleri bozuk çıktığı için
bırakıldı. Referans için duruyor, **kullanma**.

---

## 5e. Excel'den İçe Aktarma (2 Ekim 2026)

Ortak altyapı: `server/src/utils/excelAktarma.js` — dosya okuma, başlık
normalleştirme, sütun eşleştirme, tarih/sayı çevirme, şablon üretimi,
önizleme→commit akışı.

| Aktarım | Sunucu ucu | Durum |
|---|---|---|
| **Çalışan** | `routes/importEmployee.js` · `/import/employee/*` | ✅ + ekran |
| **Müşteri** | `routes/importMusteri.js` · `/import/customer/*` | ✅ uç hazır, ekran yok |
| **Ürün** | `routes/importUrun.js` · `/import/product/*` | ✅ uç hazır, ekran yok |
| Fatura | `routes/import.js` · `/import/invoice/*` | ✅ mevcut |

Üç uç da aynı deseni kullanır: `{preview, commit, template}`.
`preview` **hiçbir kayıt yazmaz**.

**Tekilleştirme (mükerrer önleme)**

| Varlık | Birincil | Yedek |
|---|---|---|
| Çalışan | TC Kimlik No | Ad + Telefon |
| Müşteri | Vergi No (VKN 10 / TC 11 hane) | Ünvan |
| Ürün | Stok Kodu (SKU) | Ad + Birim |

**Doğrulama:** Hatalı satır **kaydedilmez**, önizlemede işaretlenir.
Çalışan/Müşteri/Ürün için: ad/ünvan boş, geçersiz TC, geçersiz e-posta,
negatif stok/fiyat.

**⛔ Ürün fiyat/stok ezilmez.** Güncellemede `min_stock` ve `unit_price`
`COALESCE` ile korunur — firma listesindeki fiyat bayinin kendi fiyatı
olabilir, sessizce ezmek kâr marjını bozar. Boşsa mevcut değer kalır.

---

## 5g. Hata Günlüğü ve Destek (2 Ekim 2026)

**Amaç:** Kullanıcı "program bozuk" dediğinde elimizde somut kayıt olsun.

**Günlük dosyası:** `server/data/hata-gunlugu.log` (`.gitignore`'da).
5 MB'yi aşınca eski yarısı atılır, 30 günden eskisi okunmaz.

| Uç | Kim erişir |
|---|---|
| `GET /api/support/bilgi` | **herkes** (oturum yok) |
| `POST /api/support/bildir` | **herkes** (oturum yok; varsa kullanıcıya bağlanır) |
| `GET /api/support/hata-ozet` · `/hatalar` · `/hata-indir` | yönetici |
| `DELETE /api/support/hatalar` | yönetici |
| `GET /api/support/bildirimler` · `PATCH .../:id` | yönetici |

**İki kural, bozulursa proje bozulur:**

1. **4xx günlüğe YAZILMAZ.** 400/401/404/409 kullanıcının normal yaptığı
   şeylerdir; yazılırsa günlük şişer, asıl hatalar kaybolur. Sadece 5xx
   ve beklenmeyen durumlar yazılır.
2. **Gizli veri maskelenir — İKİ KATMAN.**
   - `temizle()` alan adına bakar (`sifre`, `token`, `JWT_SECRET`, …)
   - `metinMaskele()` metnin içine gömülü değeri bulur (`Sifre: abc123` —
     burada alan adı yok)
   Sadece biri yetmez. Kullanıcı bildirimleri de aynı süzgeçten geçer.

**Bildirim tablosu** (`support_reports`) şemada **yok**, ilk kullanımda
`CREATE TABLE IF NOT EXISTS` ile açılır. Opsiyonel özellik — her kurulumda
gereksiz tablo demek.

**Ekranlar:** `Ayarlar → Destek` (`/destek`) ve giriş ekranındaki
"Giriş yapamıyorum — destek" penceresi (`DestekOzeti.jsx`).

---

## 6. Çalışma Disiplini

- **Her değişiklikten sonra `npm test` + arayüz testleri.**
- **Testler geçmiyorsa kod yazma.** Önce hatayı bul.
- **Kapsamı genişletme.** İstenen ekranı ekle, bitir, teslim et. Yanında refactor
  veya "bunu da düzelteyim" deme.
- **Emin değilsen sor, tahmin etme.** Bu projede kurallar net, belirsizlik
  genelde bir kural eksikliğidir ve kullanıcı cevabı verir.
- **Kullanıcıya ne yaptığını net söyle.** "X ekledim, Y'ye etkisi Z oldu."
- **Deneyi ana hattan ayrı dalda yap.** Kırılırsa dal silinir.

---

## 7. Git Akışı

Kullanıcı **3 bilgisayarda** çalışıyor. GitHub tek doğru kaynak.

```
   GitHub (veltron — private)
    ↙            ↘
bu PC        diğer 2 PC
```

**Zorunlu sıra:**

```powershell
git pull        # BAŞLAMADAN ÖNCE — her zaman
# ... çalış ...
git add -A
git commit -m "ne yaptığını söyle"
git push        # BİTMEDEN ÖNCE — her zaman
```

- Aynı anda iki bilgisayarda çalışma. `pull` yapmadan başlama.
- `.env`, `server/data/`, `tools/`, `node_modules/`, `app/dist/`, `app/release/`
  repoya girmez. `tools/` (52 MB cloudflared) `AILE-ERISIMI.md`'deki adımlarla
  yeniden indirilir.
- **Veritabanı GitHub'da yaşamaz.** Her bilgisayar kendi `veltron.db`'sini tutar.
  Gerçek veriyle çalışmak istediğinde `.db` + `.db-wal` + `.db-shm` dosyalarını
  elle taşı.

---

## 8. Ne Yapıldı / Ne Kaldı

### ✅ Yapılmış

- Müşteri portalı (2 rol, tarih talebi + onay)
- İş emri: tartım, net kg, tutar, fatura 1:1, erteleme, ek dosyalar
- İş bölünmesi: kendi ekip + taşeron · malzeme opsiyonel
- Kâr raporu, maaş/bordro (Excel ile 1:1), puanlama ekranı
- Döviz (TCMB, geçmiş fatura korumalı), KDV
- Excel dışa aktarma (15 sayfa, logo gömülü, formül enjeksiyonu korumalı)
- Excel içe aktarma, demo modu + lisans, kurulum paketi
- Şifre sıfırlama talebi (giriş ekranı + yönetici onayı + Telegram bildirimi)
- **"Beni hatırla"** — 30 günlük hatırlama jetonu, şifre saklanmaz (bkz. 5b)
- Aile erişimi (Cloudflare Tunnel), güvenlik denetimi
- **`Veltron-Ac.bat`** — tek tıkla açma (sunucu + program birlikte)
- Program ikonu (`app/electron/icon.png`)
- **Hata günlüğü + destek sayfası** (bkz. 5g) — 585 test geçiyor
  (13 dosya: 57 + 32 + 69 + 119 + 31 + 23 + 24 + 34 + 39 + 31 + 62 + 52 + 12)
- **Kurulum paketi** — USB-Yedek, Node.js'siz tek tıkla kurulum (bkz. 5g)

### ⬜ Bilinen açıklar / sıradakiler

1. **Sunucuyu servis olarak çalıştır** — ofise kurmadan önce (NSSM veya Task
   Scheduler). Sunucu kapalıyken Electron siyah ekran verir.
2. **`.exe` paketleme** — Windows Developer Mode açılmalı, ortam engeli.
3. **Yedekleme butonu** — Ayarlar'a "şimdi yedek al", tarih listesi.
4. **Erteleme raporu** — veri toplanıyor (`deferrals`), rapor ekranı eksik.
5. **Fatura e-postası** — Gmail kurulumu (`tools-src/gmail-kurulum.md`) ile
   yapılacak. PDF indirme her zaman çalışıyor, e-posta ek özellik.
6. **Genel performans raporu** — Excel'de var, web'de yok.
7. **Müşteri/Ürün Excel aktarım ekranları** — sunucu uçları hazır
   (`/import/{customer,product}/*`), arayüz yok. `EmployeeImport.jsx`
   kopyalanıp uyarlanabilir.

### 🚫 Yapılmayacaklar (bilinçli karar)

- İş Paketi / gruplama → "unut tamamen"
- Silo / malzeme parçalama → "köşeye not edildi"
- Proje modülüne dokunma → kullanıcı istemedi
- Netlify / Vercel dağıtımı → SQLite'ı barındıramaz
- Haremaltın'dan kur çekme → JS + WebSocket, kullanıcı TCMB'yi onayladı

---

## 9. İlgili Belgeler

| Dosya | İçerik |
|---|---|
| `AGENTS.md` | **Bu dosya** — otomatik okunur, kurallar |
| `AI-DEVIR.md` | Devir kılavuzu |
| `PROJE-DURUMU.md` | Güncel durum (bazı sayıları eski) |
| `MUSTERI-PORTALI.md` | Portal kullanımı + 1 Ekim hatası |
| `SIFRE-SIFIRLAMA.md` | Şifre sıfırlama + Telegram kurulumu |
| `DOVIZ-NASIL.md` | Döviz modülü |
| `EXCEL-EXPORT.md` | Excel dışa aktarma |
| `DEMO-MODU.md` | Demo modu / lisans |
| `LISANS-PLANI.md` | Lisanslama planı |
| `GUVENLIK-DENETIMI.md` | Güvenlik denetimi |
| `AILE-ERISIMI.md` | Cloudflare Tunnel ile dış erişim |
| `DEV-NOTES.md` | Ayrıntılı tarihçe, seçim gerekçeleri |
| `README.md` | Kurulum ve kullanım |
| `TASIMA-KILAVUZU.md` | Taşıma (GitHub bölümü güncel değil) |
| `server/src/docs/PUAN-MAAS-KURALLARI.md` | Maaş formülleri |

---

## 10. Bu Dosyayı Ne Zaman Güncelle

**Her adımdan sonra DEĞİL.** Sadece kalıcı bir şey değiştiğinde:

| Güncelle | Güncelleme |
|---|---|
| Yeni iş kuralı öğrendin | Bölüm 2 |
| Yeni tuzakla karşılaştın | Bölüm 4 |
| "Bunu yapma" dedin | Bölüm 8 |
| İş tamamlandı / sıraya girdi | Bölüm 8 |
| Test sayısı değişti | Bölüm 5 |
| Yeni modül eklendi | Bölüm 3 |

Kod yazıp commit atmak bu dosyanın güncellenmesini **gerektirmez.**

- **Kural değişikliklerinde tek satırlık düzenleme yap, dosyayı baştan yazma.**
  Kullanıcının token'ı sınırlı, her turda tam yeniden yazım pahalıya gelir.
- `AGENTS.md` = değişmez kurallar. `PROJE-DURUMU.md` = ne oldu, ne kaldı.
  Oturum sonunda durumu `PROJE-DURUMU.md`'ye bir satır olarak ekle.

---

## 11. Çalışma Düzeni: 3 Bilgisayar + USB

Kullanıcı 3 bilgisayar arasında **USB bellekle** taşıyor. Kod için asıl kaynak
GitHub; USB ikinci yol.

**Kritik kural — veritabanını USB ÜZERİNDE ÇALIŞTIRMA.**

SQLite `journal_mode=WAL` kullanıyor. WAL bellek eşleme (mmap) ve dosya kilidi
gerektiriyor; USB belleklerde bu kilit kararsız kalabilir ve **veritabanı bozulur**.
Doğru sıra:

```
1. Sunucuyu DURDUR     (Get-Process node | Stop-Process -Force)
2. 3 dosyayı kopyala   veltron.db + veltron.db-wal + veltron.db-shm
3. Sunucuyu BAŞLAT
```

- `.db-wal` **mutlaka** kopyalanmalı. `veltron.db` 548 KB ama `-wal` 4 MB; son
  yazmalar ana dosyada değil WAL'da. WAL olmadan kopya sessizce eksik veri verir.
- Kopyalama sonrası boyutları karşılaştır, `-wal` dosyası **4 MB** civarında olmalı.
- `node_modules` her bilgisayarda ayrı `npm install` ile kurulur, taşınmaz.
- `.env` her bilgisayarda kendi `JWT_SECRET`'iyle olmalıdır.

**Her oturumun başında ve sonunda `git pull` / `git push`.** Aynı anda iki
bilgisayarda çalışma.

---

*Veltron · bu bilgisayarda yeniden kuruldu ve ölçüldü · 1 Ekim 2026*