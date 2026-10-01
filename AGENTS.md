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
17. **Hatırlama jetonu API'de KULLANILAMAZ.** `typ: 'remember'` kontrolü
    `authenticate`'de var. Bu kaldırılırsa 30 günlük jeton normal erişim
    jetonuna dönüşür.

---

## 5. Testler

**Sunucu testleri — 10 dosya, 459 test:**

```powershell
cd server
npm test          # koşucu: sunucuyu kendi başlatır, 10 dosyayı sırayla koşar
```

Dosyalar: `smoke` (57) · `payroll` (69) · `portal` (119) · `export` (31) ·
`attachments` (23) · `demo` (24) · `import` (34) · `passwordReset` (32) ·
`taxes` (39) · `remember` (31)

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
- 627 test geçiyor

### ⬜ Bilinen açıklar / sıradakiler

1. **Sunucuyu servis olarak çalıştır** — ofise kurmadan önce (NSSM veya Task
   Scheduler). Sunucu kapalıyken Electron siyah ekran verir.
2. **`.exe` paketleme** — Windows Developer Mode açılmalı, ortam engeli.
3. **Yedekleme butonu** — Ayarlar'a "şimdi yedek al", tarih listesi.
4. **Erteleme raporu** — veri toplanıyor (`deferrals`), rapor ekranı eksik.
5. **Fatura e-postası** — teklif/fatura gönderme.
6. **Genel performans raporu** — Excel'de var, web'de yok.

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