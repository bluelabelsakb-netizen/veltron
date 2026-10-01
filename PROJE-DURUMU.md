# VELTRON — Proje Devir Belgesi

**Tarih:** 1 Ekim 2026
**Proje:** Veltron İş Takip ve Yönetim Sistemi
**Konum:** `C:\Users\pc-n\Documents\Varsayılan Proje\veltron`
**Durum:** Çalışıyor, **489 test geçiyor**

> ⚠️ **Bu belge 29 Eylül'e ait kısmen eski bilgiler içerebilir.**
> Güncel ve en kapsamlı devir belgesi → **`AI-DEVIR.md`**.
> Yeni bir iş yapmadan önce `AI-DEVIR.md`'yi oku.

> ⛔ **1 Ekim'de iki kritik hata bulundu:**
> 1. Müşteri portalı **hiç çalışmamıştı** (6 dosyada `default export` eksikti
>    → boş ekran). Düzeltildi, VuruşKAN artık 4 iş emri / 3 fatura görüyor.
>    Detay: `MUSTERI-PORTALI.md`.
> 2. `npm test` sunucu kapalıyken **57/57 "fetch failed"** ile düşüyordu ve
>    sadece 4 test dosyası çalıştırıyordu. Koşucu yazıldı.
>
> ✅ **Yeni:** Şifre sıfırlama talebi (giriş ekranı + yönetici onayı + Telegram)
> Detay: `SIFRE-SIFIRLAMA.md`

---

## 1. Bu Proje Ne İşe Yarıyor?

Veltron, ölçüm/tartım bazlı iş emirlerini, taşeron yönetimini, kâr takibini ve
maaş-bordro hesabını tek bir masaüstü programında toplayan bir işletme yönetim
sistemidir.

**Teknik yapı:**
| Katman | Teknoloji |
|---|---|
| Sunucu | Node.js + Express + SQLite (`node:sqlite`) |
| Veritabanı | SQLite (tek dosya, kurulum gerektirmez) |
| Masaüstü istemci | Electron |
| Arayüz | React (Vite) |
| Dil | Türkçe |

**Modüller:** 21 ekran, 20 route dosyası, 28 tablo, ~105 API ucu, **378 test**.

**Güncel özellikler (30 Eylül):**
- Müşteri portalı (2 rol, termin talebi + onay)
- Excel dışa aktarma (15 sayfa, logo gömülü, formül enjeksiyonu korumalı)
- Demo modu / lisans, kurulum paketi, güvenlik denetimi
- **Döviz** (TCMB'den otomatik kur, geçmiş fatura koruması)
- Türkçe para biçimi (`1.134.180,91 ₺`), reaktif grafik ekseni

---

## 2. Kurallar (Bunlar Değişmedi, Hepsi Böyle)

Bu kurallar kullanıcıdan geldiği gibi birebir uygulandı. **Kodda değişiklik
yaparken bunlara dikkat et.**

### 2.1 İş emri
- **Tek iş emri = tek birim.** Gruplama / İş Paketi katmanı **yok** (bilinçli
  karar, kullanıcı "unut tamamen" dedi).
- **İş emri numarası müşteriden gelir** (`VM2026-0017` gibi elle girilir) veya
  sistem üretir (`WEM-2026-0001`). Otomatik üretim `counters` tablosundan.
- Fiyat **ürün kartıyla eşleştirilmez**. kg direkt girilir.
- **Faturalama tek seferde**, İş Emri ↔ Fatura birebir (1:1).

### 2.2 Tartım — DİKKAT, EN SIK HATA BURADA
```
net_weight = gross_weight (dolu) - tare_weight (boş tır)
```
- **Net asla elle girilmez.** Sistem otomatik hesaplar.
- **`net_weight` her zaman kg cinsindendir.**
- `unit` alanı (Ton / Kg) **sadece fiyatlandırma birimidir**, ağırlık birimi
  değildir.
- Ton fiyatlandırmada: `tutar = (kg / 1000) × ton_fiyatı`

### 2.3 İş bölünmesi
Bir işin bir kısmı **kendi işçileriyle**, kalanı **taşeronla** yapılabilir.
- Kendi ekip: `work_order_labor` — kişi + kg + saat
  - maliyet = `employee.hourly_rate × saat`
- Taşeron: `subcontractor_jobs` — taşeron + kg
  - maliyet = kg × taşeron kg birim fiyatı
- `kendi_ekip_kg + taşeron_kg` neti aşarsa **aşım uyarısı** çıkar.

### 2.4 Taşeron
- Taşeron **müşteri değildir** — ayrı varlık (`subcontractors` tablosu).
- Onlara iş atarsın, **bize fatura keserler**, biz öderiz.
- Açık bakiye takibi var (`subcontractor_invoices` + `subcontractor_payments`).

### 2.5 Malzeme (En Son Eklenen — Opsiyonel)
Bu modül **bilinçli olarak opsiyoneldir.** Kullanıcının kuralı:

> "VuruşKAN'ın işleri için malzemeyi onlardan alıyoruz, o yüzden malzeme
> listesi girmiyoruz. Sadece dışarıdan alacağımız siparişler için malzemeli
> olabilir."

- `work_order_materials` tablosu **boş bırakılabilir**. Boşsa maliyet `0`.
- Malzeme müşterinin tedarikçisinden geliyorsa **hiçbir şey girilmez** —
  maliyet zaten satış fiyatının içindedir.
- Sadece **dışarıdan satın alınan** malzemeler girilir.
- Ürün seçilirse ad/birim/fiyat otomatik dolar. `deduct_stock = 1` ise stoktan
  otomatik düşülür (stok yetersizse API hata verir).
- Arayüzde bu kural açıkça yazılıdır. **Boş bırakmak normaldir, hata değildir.**

### 2.6 Erteleme
- Durum alanı **değil**, ayrı kayıt (`deferrals` tablosu).
- Sebep + talep eden + onay durumu tutulur.

### 2.7 Kâr
```
kâr = satış − (kendi ekip maliyeti + taşeron maliyeti + dışarıdan alınan malzeme)
```
- Müşteriden gelen malzeme hesaba katılmaz (satış fiyatının içinde).
- Gerçek maliyetten farklı olarak **"katkı marjı"** uyarısı arayüzde durur.

### 2.8 Yapılmayanlar (bilinçli kararlar)
| Karar | Neden |
|---|---|
| Proje modülüne dokunulmadı | Kullanıcı istemedi (modül mevcut, olduğu gibi duruyor) |
| Silo / malzeme parçalama | "Köşeye not edildi", yapılmayacak |
| İş Paketi / gruplama | "Unut tamamen" |
| Haremaltın'dan kur çekme | Sunucu tarafından kullanılabilir uç vermiyor (JS + WebSocket). TCMB kullanılıyor, kullanıcı onayladı |
| Netlify / Vercel dağıtımı | Statik hosting SQLite'ı barındıramaz. Aile erişimi için Cloudflare Tunnel kullanılıyor |

---

## 3. Veritabanı

**28 tablo:**

```
activity_log        company_profile      counters
currencies          customers            deferrals
employees           exchange_rates       invoice_items
invoices            payments             payroll
payroll_settings    products             projects
quote_items         quotes               score_criteria
scores              stock_movements      subcontractor_invoices
subcontractor_jobs  subcontractor_payments  subcontractors
tasks               users                work_order_labor
work_order_materials                   work_orders
```

**Görünüm:** `work_order_summary` (iş emri + müşteri + fatura + maliyet
toplamları), `product_stock` (ürün + anlık stok).

**Yeni para birimi tabloları:**
- `currencies` — 12 para birimi (TRY, USD, EUR, GBP, CHF, JPY, RUB, AED, SAR,
  CNY, CAD, AUD)
- `exchange_rates` — tarihli kur geçmişi (`currency_code`, `rate_to_try`,
  `rate_date`, `note`); `(currency_code, rate_date)` benzersiz

### Kritik teknik not
`CREATE TABLE IF NOT EXISTS` **çalışan tabloyu değiştirmez**. Bu yüzden
`db.js` içinde **`ensureColumn()`** fonksiyonu var. Yeni sütun eklediğinde
eski veritabanı dosyasına da otomatik eklenir. **Yeni sütun eklerken bunu
kullan.**

> `CREATE INDEX` ekleme — sütun henüz yoksa sunucu "no such column" ile açılmaz.
> Index'i `db.js → migrate()` içindeki `lateIndexes` listesine ekle.

---

## 4. Dosya Haritası

```
veltron/
├── server/
│   ├── src/
│   │   ├── index.js          Sunucu girişi, port 4000, demo kısıtı
│   │   ├── db.js             SQLite + ensureColumn() + migrate() (lateIndexes)
│   │   ├── schema.sql        28 tablo + 2 görünüm
│   │   ├── routes/           20 route dosyası
│   │   │   ├── workOrders.js    İş emri + tartım + /labor + /materials
│   │   │   ├── profit.js        Kâr raporu
│   │   │   ├── payroll.js       Bordro API
│   │   │   ├── currency.js      Döviz: /currencies /rates /rates/:kod /convert
│   │   │   ├── export.js        Excel dışa aktarma (15 sayfa)
│   │   │   ├── attachments.js   Fotoğraf/ek
│   │   │   ├── portal.js        Müşteri portalı (beyaz liste)
│   │   │   ├── license.js       Demo modu / lisans
│   │   │   ├── subcontractors.js
│   │   │   ├── stock.js, products.js, invoices.js, quotes.js,
│   │   │   ├── customers.js, employees.js, projects.js, tasks.js,
│   │   │   ├── users.js, auth.js, activity.js, company.js,
│   │   │   ├── dashboard.js, lookups.js, index.js
│   │   ├── utils/
│   │   │   ├── payroll.js     Puan/maaş hesap motoru (Excel ile 1:1)
│   │   │   ├── currency.js    kur(), kurKaydet(), tlKarsiligi()
│   │   │   ├── fxFetch.js     TCMB otomatik çekim + isoTarih()
│   │   │   ├── auth.js, crud.js, loginGuard.js, license.js
│   │   ├── scripts/           demo-kur.js, seed-*.js, purge-test-users.mjs
│   │   └── docs/
│   │       └── PUAN-MAAS-KURALLARI.md
│   ├── test/                  7 test dosyası, 355 test
│   └── package.json
├── app/
│   ├── main.mjs              Electron ana süreç
│   ├── preload.cjs           Electron preload (.cjs ZORUNLU)
│   └── src/
│       ├── lib/chartScale.js Reaktif grafik ekseni (23 test)
│       ├── lib/api.js        money(), moneyShort(), useCurrency
│       ├── components/       Toast, Primitives, Attachments, QuickWeigh, ...
│       └── pages/            21 React ekranı
├── test/chartScale.test.mjs  23 test
├── AI-DEVIR.md               ⭐ Güncel devir kılavuzu (önce bunu oku)
├── DOVIZ-NASIL.md            Döviz rehberi
├── EXCEL-EXPORT.md           Excel kılavuzu
├── MUSTERI-PORTALI.md        Müşteri portalı kılavuzu
├── DEMO-MODU.md              Demo modu kılavuzu
├── GUVENLIK-DENETIMI.md      Güvenlik denetimi
├── AILE-ERISIMI.md           Cloudflare Tunnel
├── KURULUM-KEVUZU.md         Kurulum paketi
├── PROJE-DURUMU.md           Bu belge
├── DEV-NOTES.md              Eski devir belgesi
└── README.md                 Kurulum ve kullanım
```

### Mevcut ekranlar (21)
`Login` · `Dashboard` · `Tasks` · `Projects` · `Customers` · `Quotes` ·
`Invoices` · `InvoiceImport` · `Employees` · `Payroll` · `Scores` ·
`Subcontractors` · `Products` · `StockMovements` · `Users` · `ActivityLog` ·
`CompanyProfile` · `WorkOrders` · `Profit` · `ExchangeRates` · `Settings`
(+ `ExcelExport`, `Portal`)

---

## 5. Maaş / Puan Hesabı (Excel'den Birebir)

Bu hesap **kesinlikle değiştirilmemeli**, Excel formülleriyle 1:1 uygulandı:

| Kural | Değer |
|---|---|
| Puan eşiği | **70** |
| Prim | **250 ₺ / puan** |
| Prim limiti | **5000 ₺** |
| Vergi | **%15** |
| SGK işçi payı | **%14** |
| Mesai | **120 saat × 0.4** |
| Avans tavanı | **%30** |

Motor: `server/src/utils/payroll.js`
Açıklama: `server/src/docs/PUAN-MAAS-KURALLARI.md`
Test: `server/test/payroll.test.mjs` (32 test)
Arayüz: `app/src/pages/Scores.jsx`

> Puanlama ekranı sonradan yapıldı (`Scores.jsx`). Ağırlıklar düzenlenebilir,
> prim önizlemesi gösterilir. Hesaplama kuralı **değişmedi**.

---

## 6. Çalıştırma

**Sunucuyu başlat:**
```powershell
cd "C:\Users\pc-n\Documents\Varsayılan Proje\veltron\server"
Start-Process -FilePath "node" -ArgumentList "src/index.js" `
  -WorkingDirectory (Get-Location).Path -WindowStyle Hidden
```
Port **4000**. Ekip dışından erişim için bu port açık olmalı.

**Masaüstü programı:** `Sunucuyu-Kur.bat` dosyasını çalıştır, sonra Electron'u aç.
> Arayüz `app://` protokolü ile servis edilir (file:// CSP ve yolları bozduğu
> için). **Sunucu kapalıyken siyah ekran olur** — bu yüzden `Sunucuyu-Kur.bat`
> var. Siyah ekran görürsen sunucu çalışmıyordur.

**Giriş:** `admin` / şifre `server/.env` → `ADMIN_PASSWORD` (geçici: `demo1234`).
**Değiştirilmesi zorunlu.**

**Testler (hepsi geçiyor — 489 toplam):**
```powershell
# Sunucuyu kendisi başlatır/kapatan koşucu — tek komut
cd veltron/server && npm test                 # 389

# arayüz testleri (proje kökünden)
cd .. && node test/chartScale.test.mjs        # 23
cd .. && node test/money.test.mjs             # 32
cd .. && node test/lazy-export.test.mjs       # 28  ⛔ yeni ekran sonrası
cd .. && node test/ikon-import.test.mjs       # 54  ⛔ yeni bileşen sonrası
```

| Test dosyası | Adet |
|---|---|
| `smoke.mjs` | 57 |
| `payroll.test.mjs` | 32 |
| `portal.test.mjs` | 69 |
| `export.test.mjs` | 119 |
| `attachments.test.mjs` | 31 |
| `demo.test.mjs` | 23 |
| `import.test.mjs` | 24 |
| `passwordReset.test.mjs` | 34 |
| `test/chartScale.test.mjs` | 23 |
| `test/money.test.mjs` | 32 |
| `test/lazy-export.test.mjs` | 28 |
| `test/ikon-import.test.mjs` | 54 |

> ⛔ Yeni ekran/bileşen eklerken **iki testi de koş**: `lazy-export.test.mjs`
> ve `ikon-import.test.mjs`. İkisi de derleme zamanında yakalanmayan hataları
> yakalıyor (portalın 6 dosyasında default export eksiktiği için portal hiç
> açılmamıştı).
>
> `npm test` → `test/tum-testler.mjs`: sunucuyu arka planda başlatır,
> `/api/health` cevap verene kadar bekler, 8 dosyayı sırayla koşar, özet
> tablo yazar, sunucuyu kapatır. Tek tek `npm run test:*` komutları
> **çalışan sunucu ister**.

**Demo verisi sıfırlama:**
```
cd veltron/server
npm run demo-kur -- --temiz
```
> Bu komut VuruşKAN'a da iş emri atar (portalda veri görünsün diye).

---

## 7. Git

Git `D:\Git\cmd` altında kurulu, PATH'e ekli.

```powershell
& "D:\Git\cmd\git.exe" add -A
& "D:\Git\cmd\git.exe" commit -m "mesaj"
```

**Commit geçmişi (son 5):**
```
827410a TCMB kuru otomatik, doviz ekrani, demo maliyet hatasi, dashboard ekseni
48c6c05 Turkce para bicimi, reaktif grafik ekseni, doviz tabani
ec11847 Eksik kalan butun dosyalar
... (önceki commitler)
```

**Çalışma ağacı temiz.** Yeni commit atmadan önce:
```powershell
& "D:\Git\cmd\git.exe" status --short
```
> ⚠️ `.env` ve `tools/cloudflared.exe` `.gitignore`'da olmalı. Kontrol et.

---

## 8. Tuzaklar (Bunlara Düşme)

1. **Ağırlık birimi.** `net_weight` daima kg. `unit` sadece fiyatlandırma.
   `weightDisplay(kg, priceUnit)` helper'ını kullan.
2. **Net asla elle girilmez.** `netOf()` fonksiyonu her yerde kullanılıyor.
3. **`ensureColumn()`.** Yeni sütun eklerken `CREATE TABLE IF NOT EXISTS`
   çalışan tabloyu değiştirmez.
4. **Electron preload `.cjs` olmalı.** `sandbox: true` iken ESM preload çalışmaz.
   `main.mjs` + `preload.cjs` zorunlu.
5. **`app://` protokolü.** `file://` kullanma.
6. **Sunucu kapalıysa siyah ekran.** Normal davranış, hata değil.
7. **Türkçe karakterler.** Seed betikleri **ASCII isim** kullanır
   (Mehmet Yilmaz, Ayse Demir). `STATUS_LABELS` sözlüğüne yeni durum
   eklenmezse arayüzde ham anahtarlar görünür. (Bu oldu, tekrar etmeyin.)
8. **Müşteri portalı güvenliği.** Satır seviyesi filtre şart, henüz
   yapılmadı.
9. **`JWT_SECRET` hâlâ varsayılan.** Canlıya almadan değiştir.
10. **`.exe` paketleme yapılamıyor.** Windows Developer Mode kapalı, sembolik
    bağ oluşturulamıyor. **Program çalışıyor**, sadece paketleme etkileniyor.

---

## 9. Sıradaki İşler

- [x] ~~Müşteri portalı~~ — yapıldı (`routes/portal.js`, 69 test)
- [x] ~~Puanlama ekranı~~ — yapıldı (`pages/Scores.jsx`)
- [x] ~~Excel dışa aktarma~~ — yapıldı (15 sayfa, 119 test)
- [x] ~~Demo modu / lisans~~ — yapıldı
- [x] ~~Kurulum paketi~~ — yapıldı (`npm run kurulum-paketi -- --zip`)
- [x] ~~Güvenlik denetimi~~ — yapıldı (KRİTİK 0, YÜKSEK 0, ORTA 0)
- [x] ~~Döviz kurları~~ — yapıldı (TCMB otomatik, `DOVIZ-NASIL.md`)
- [x] ~~Şifre sıfırlama talebi~~ — yapıldı (`SIFRE-SIFIRLAMA.md`)
- [ ] **GenelPerformans raporu** — Excel'den aktarılacak
- [ ] **Gerçek bulut dağıtım** — SQLite → Turso/libSQL. Ailenin bilgisayarı
      kapalıyken de erişmesi için gerekir
- [ ] **`.exe` paketleme** — Windows Developer Mode açılmalı
- [ ] `admin` şifresini değiştir (şu an `demo1234`)
- [ ] C: diski %99 dolu (2.4 GB boş). `C:\Windows\Installer` 52 GB ama
      temizlenemiyor (izin yok). D: diskine taşımayı düşün.

---

## 10. Bilinen Engeller

| Sorun | Durum |
|---|---|
| `.exe` üretimi | Windows Developer Mode kapalı → **çözülemedi** |
| C: disk dolu | `C:\Windows\Installer` 52 GB, izin yok → **çözülemedi** |
| Haremaltın kur çekme | Sunucu tarafından kullanılabilir uç yok → **TCMB'ye geçildi** (onaylı) |
| Netlify / Vercel | Statik hosting SQLite barındıramaz → **Cloudflare Tunnel** kullanılıyor |
| Proje modülü | Dokunulmadı (bilinçli) |

---

## 11. Hızlı Başlangıç (Yeni Bakan Birine)

1. **`AI-DEVIR.md`'yi oku** (güncel, en kapsamlı). Sonra bu belgeyi oku.
2. `AI-DEVIR.md → Tuzaklar` bölümünü oku. Değişiklik yapmadan ÖNCE.
3. `server/src/schema.sql` → tabloları anla.
4. `server/src/routes/workOrders.js` → iş emri mantığını anla. **Tartım
   mantığı burada.**
5. `server/src/utils/payroll.js` → maaş hesabını anla. **Excel formülleriyle
   birebir, dokunma.**
6. `server/src/utils/currency.js` + `fxFetch.js` → döviz mantığı.
7. `app/src/lib/chartScale.js` → grafik ekseni hesabı.
8. `cd server && npm test` → her şeyin çalıştığını doğrula (355).
9. `node test/chartScale.test.mjs` → grafik testleri (23).

### Çalışma kuralı
> **Her işlemden sonra MD dosyalarını güncelle.**
> Özellik ekledin, hata düzelttin, karar verdin → `AI-DEVIR.md` + ilgili konu
> dosyası güncellenir. Hata düzeltmeleri `AI-DEVIR.md → Tuzaklar`'a girer.
> Bu kural `AI-DEVIR.md` başında da yazılı.

---

*Bu belge 1 Ekim 2026 itibarıyla güncellendi. Güncel kaynak: `AI-DEVIR.md`.*
