# Veltron — Proje Devir Belgesi (ESKİ)

> **Bu belge, projeyi sıfırdan bilmeyen birine (veya bir yapay zekâya) devretmek için yazıldı.**
> Koddan çıkarılamayan kararları, iş kurallarını ve çalışırken takıldığımız yerleri içerir.
>
> Son güncelleme: 29 Eylül 2026

> # ⚠️ BU BELGE ARTIK GÜNCEL DEĞİL
>
> Bu belge 29 Eylül 2026'da durmuştur ve **birçok bölümü eskidir**.
> 1 Ekim 2026'dan sonra eklenen müşteri portalı, Excel dışa aktarma, demo modu,
> kurulum paketi, güvenlik denetimi, döviz kurları ve grafik ekseni burada
> **yoktur**.
>
> **Yeni bir işe başlamadan önce → `AI-DEVIR.md` oku (güncel ana belge).**
> Durum özeti için → `PROJE-DURUMU.md`.
> Bu belge sadece "neden böyle yapıldı" hikâyesi için değerlidir.

---

## 0. 60 Saniyede Veltron Nedir?

Veltron, elektrik/montaj alanında çalışan bir firma için geliştirilmiş **iş takip ve
muhasebe sistemi**. Windows masaüstü uygulaması + şirket sunucusu + SQLite veritabanından oluşur.

**İki kullanım biçimi var, ikisi de aynı sunucuyu kullanır:**
- Masaüstü uygulaması (Electron) — ekip için
- Tarayıcı (`http://sunucu:4000`) — hızlı erişim için

**Kod büyüklüğü:** ~14.800 satır (JS 4.300 / React 9.250 / CSS 795 / SQL 409)

---

## 1. TİCARİ KURALLAR — BUNLARI BOZMA

Bu bölüm en önemlisi. Bu kurallar **kullanıcının işinden geldi**, kafadan çıkmadı.
Kod değiştirirken bu kuralları ihlal etme.

### 1.1 İş emri = tek birim (gruplama YOK)

Kullanıcının açıklaması:
> *"3-4 iş emri tek iş için geliyor kankacım ve hızlıça gidiyor... sen o 3-4 iş emri
> olayını unut tamamen tek iş emri üzerinden ilerlememiz gerekiyor"*

**Bir iş emri = bir bağımsız birim.** Alt paket/grup kavramı **bilinçli olarak eklenmedi.**

⚠️ Bu konuda bir kez yanıldık: "İş Paketi" adında bir gruplama katmanı planlamıştık.
Kullanıcı sorularımızı yanıtlayınca bunu tamamen kaldırdık. **Gruplama eklemeden önce
tekrar sor.**

### 1.2 İş emri numarası — iki farklı kaynak

| Kaynak | Davranış |
|---|---|
| VuruşKAN'dan gelen işler | Numarayı **kullanıcı girer**: `VM2026-0017` |
| Veltron'un yaptığı harici işler | **Sistem otomatik üretir**: `WEM-2026-0001` |

İki alan var: `number` (yazılacak numara) ve `number_source` (`customer` | `system`).
Numara boş bırakılırsa sistem `WEM-YYYY-NNNN` üretir.

### 1.3 Tartım (kilogram) formülü

Kullanıcının açıklaması:
> *"Tırın önce boş halini sonrasında ürünü yüklenmiş halini alıp tartıyorum,
> aradaki fark o işin kilogramı oluyor"*

```
BOŞ TARTIM  (tare_weight)     8.240 kg
DOLU TARTIM (gross_weight)   24.510 kg
─────────────────────────────────────
NET         = otomatik fark  16.270 kg
```

**`net_weight` asla elle girilmez.** Boş ve dolu girilir, sistem farkı hesaplar.
`server/src/routes/workOrders.js` → `netOf()`

Dolu tartım boştan küçükse API **400** döner.

### 1.4 Fiyat: ürün eşleştirme YOK

Kullanıcının açıklaması:
> *"İş emrine filan girmiyorum direkt olarak bu işin kilogramı şudur diyip veriyorum"*

- İş emri **Ürün/Stok kartıyla eşleştirilmez**
- `unit_price` iş emrinin **üzerinde** tutulur
- `unit` alanı `Ton` veya `Kg` olabilir; sistem böleni seçer (Ton→1000, Kg→1)

```js
// server/src/routes/workOrders.js
function divisorFor(unit) {
  return String(unit).trim().toLowerCase() === 'kg' ? 1 : 1000;
}
```

### 1.5 Faturalama: tek seferde

Kullanıcının cevabı: *"Tek seferde fatura kesiliyor"*

Bu yüzden `İş Emri → Fatura` ilişkisi **1:1**. Kısmi/avanslı faturalama YAPILMADI ve
şema buna göre basit tutuldu.

### 1.6 Taşeron ilişkisi

Kullanıcının cevabı: *"Taşeron bana fatura kesiyor ben faturasını ödüyorum"*

- Taşeron **müşteri değil**, ayrı bir varlık
- Taşeron bize **fatura keser** → biz **ödeme yaparız** → **açık bakiye** takip edilir
- İş emrine taşeron atanır, maliyeti iş emrine yazılır → **kâr hesabı** çıkar

### 1.7 Erteleme: ayrı tablo, durum alanı değil

Kullanıcının cevabı: *"Vuruşkan talep ediyor - sebep ve onay durumu olucak"*

Erteleme `deferrals` tablosunda **kayıt** olarak tutulur (durum alanı değil), çünkü
"kaç kez ertelendi / ortalama kaç gün / en sık sebep ne" raporları bu tablodan çıkar.
`deferrals.approval_status` ∈ `beklemede | onaylandi | reddedildi`

### 1.8 Proje modülüne DOKUNMA

Kullanıcının cevabı: *"mevcut projede problem yok, her şeyi tek sistemden kontrol etmek
içinde bu şekilde istedim senden"*

**Proje modülü olduğu gibi bırakıldı.** İş Emri modülü onun *yanına* eklendi, üstüne değil.
İş emri ↔ proje ilişkisi kurulmadı.

### 1.9 KÖŞEYE NOT: Silo / malzeme parçalama (YAPILMADI)

Kullanıcının cevabı: *"Ayrı malzemeler toplanıp tek bir nihai ürün elde ediliyor,
biz mesela silo yapıyoruz, parçalanıyor bazen ama sen bu iş emri olayını parçalamak
zorunda değilsin bunu köşeye not alalım"*

**İstenmedi, yapılmadı.** İleride gerekirse: bir iş emrine birden fazla malzeme
(hamur girdi → silo → nihai ürün) ve "parçalanma" durumu eklenebilir. Şu an yok.

---

## 1.10 Excel Sistemi — KAPATILDI ✅

Veltron'da **tek bir sistem vardır: web uygulaması.** Başlangıçta ayrı bir
Excel tabanlı sistem de vardı; kullanıcı kararıyla **aktarılıp silindi.**

**Kullanıcı kararı:** *"Excel projesine ait bu projeden harici olarak ne varsa
yok et, dosyada sadece bu proje olucak."*

### Aktarılan veri (29 Eylül 2026)
Excel'den web veritabanına bir kez aktarıldı:

| Excel sayfası | → Web tablosu | Kayıt |
|---|---|---|
| Personel | `employees` | 4 |
| İşler (müşteri sütunu) | `customers` | 4 |
| İşler | `projects` | 4 |
| Malzeme | `products` | 7 |
| MalzemeHareket | `stock_movements` | 15 |
| İşTakip | `tasks` | 8 |

İlişkiler korundu: görevler projeye ve sorumluya bağlı, stok hareketlerden hesaplanıyor.

### ⚠️ KAYBEDİLEN MODÜLLER — ileride yapılmalı

Excel sisteminde **web'de karşılığı olmayan** 3 modül vardı. Bunlar aktarılmadı:

| Excel modülü | Açıklama | Durum |
|---|---|---|
| **Puanlar / PuanOzeti** | Çalışan performans puanlama sistemi | ❌ Web'de YOK |
| **Maaş / Bordro** | `brüt + puan primi + ek ödeme` hesabı | ❌ Web'de YOK |
| **GenelPerformans** | Dönemsel performans raporu | ❌ Web'de YOK |

> **Bu en önemli eksik.** Excel'de maaş, çalışanın performans puanına göre
> prim eklenerek hesaplanıyordu. Web sisteminde `employees.monthly_salary` tek bir
> sayı — puanlama ve prim mekanizması **hiç yok**.
>
> Gerçek personel verisi girilmeden önce bu modül yapılmalı.

### Arşiv
Excel dosyaları proje klasöründen çıkarıldı, proje dışında saklanıyor:
```
C:\Users\pc-n\Documents\Veltron-Excel-arsiv\
```
(Şablon, çalışma dosyası, Python araçları ve aktarım betiği dahil)

---

## 2. TEKNOLOJİ SEÇİMLERİ VE NEDENLERİ

| Seçim | Neden | Alternatif neden seçilmedi |
|---|---|---|
| **Node.js yerleşik `node:sqlite`** | Derleme yok, kurulum yok, Visual Studio gerektirmez | `better-sqlite3` → native derleme gerektiriyordu, riskliydi |
| **Express 4** | Bilinen, stabil | Fastify — gereksiz yenilik |
| **JWT** | Basit, istemci-sunucu ayrımı yok | Oturum (session) — Electron için gerek yok |
| **SQLite WAL** | Tek dosya, yedeklemesi kolay, küçük ekipler için yeterli | PostgreSQL — kurulum/operasyon yükü |
| **Vite + React** | Hızlı, Electron ile iyi çalışır | — |
| **Electron** | Kullanıcı masaüstü programı istedi | PWA — kurulum zorunluluğu yok |
| **`app://` protokolü** | CSP `default-src 'self'` çalışsın diye | `file://` → CSP ve yollar bozuluyor |
| **Yerleşik `fetch`** | Ek bağımlılık yok | axios — gereksiz |

### Çalıştırma ortamı (doğrulandı)
- **Node.js v25.6.1** (22+ gerekir, `node:sqlite` için)
- npm 11.9.0
- Windows 11 (10.0.26200), 8 GB RAM
- Git kurulu **değil** (bu yüzden `.git` yok, repoya gönderilmedi)

---

## 3. MİMARİ

```
┌─────────────────────────────────────────────────────────┐
│  SUNUCU  (ofiste sürekli açık bir bilgisayar)            │
│  veltron/server                                          │
│  ├── Express + SQLite (data/veltron.db)                  │
│  └── app/dist varsa arayüzü de servis eder (:4000)       │
└───────────────┬─────────────────────────────────────────┘
                │ HTTP (REST + JWT)
      ┌─────────┴─────────┐
      │                   │
  ┌───▼────┐        ┌─────▼─────┐
  │Electron│        │  Tarayıcı │
  │  app   │        │  :4000    │
  └────────┘        └───────────┘
```

**Neden ikisi de var:** Electron ekip için, tarayıcı hızlı erişim/uzaktan kontrol için.
Aynı API'yi, aynı veriyi kullanırlar.

### Dizin yapısı

```
veltron/
├── package.json              npm workspaces tanımı
├── package-lock.json         sürüm sabitleme (taşımada ÖNEMLİ)
├── README.md                 kullanım kılavuzu (Türkçe)
├── DEV-NOTES.md              ← BU DOSYA
├── .gitignore
│
├── server/                   SUNUCU
│   ├── .env.example          ayar şablonu
│   ├── src/
│   │   ├── index.js          Express kurulumu, statik servis, başlatma
│   │   ├── config.js         ortam değişkenleri
│   │   ├── db.js             SQLite bağlantısı, sorgu yardımcıları, tx()
│   │   ├── schema.sql        TÜM tablolar (21 tablo) + görünümler + indeksler
│   │   ├── seed.js           yönetici hesabı + --demo
│   │   ├── middleware/       auth.js, error.js
│   │   ├── routes/           17 dosya, ~90 endpoint
│   │   ├── utils/            crud.js, documents.js, fields.js, http.js, activity.js
│   │   └── scripts/          reset-db, seed-company, seed-workorders, clean-demo
│   ├── test/smoke.mjs        57 uçtan uca API testi
│   └── data/veltron.db       veritabanı (KOPYALANMASI GEREKEN)
│
└── app/                      MASAÜSTÜ İSTEMCİSİ
    ├── electron/
    │   ├── main.mjs          ana süreç (.mjs zorunlu)
    │   └── preload.cjs       güvenli köprü (.cjs zorunlu)
    ├── index.html            CSP tanımı
    ├── vite.config.js
    └── src/
        ├── main.jsx          React giriş
        ├── App.jsx           rotalar
        ├── lib/api.js        API istemcisi + biçimlendirme + durum sözlüğü
        ├── context/          Auth, Lookups, Company
        ├── components/       Layout, DataTable, Form, Modal, ResourcePage, DocumentSheet...
        └── pages/            17 sayfa
```

Bu klasörde **yalnızca web uygulaması** vardır. Bkz. bölüm 1.10 (Excel kararı).

---

## 4. VERİTABANI (21 tablo)

| Tablo | Ne işe yarar |
|---|---|
| `company_profile` | **Kendi firmamızın profili** (tek satır, id=1). Evrak başlığı. |
| `users` | Kullanıcılar (admin / user) |
| `customers` | Müşteriler (Bayi/Şahıs) |
| `employees` | Çalışanlar |
| `projects` | Projeler |
| `tasks` | Görevler |
| `quotes` + `quote_items` | Teklifler ve kalemleri |
| `invoices` + `invoice_items` | Faturalar ve kalemleri |
| `payments` | **Müşteriden** alınan tahsilatlar |
| `products` | Ürün/stok kartları |
| `stock_movements` | Stok giriş/çıkış/sayım |
| `activity_log` | Kim ne yaptı |
| `counters` | Fatura/teklif/iş emri numara sayaçları |
| **`work_orders`** | **İŞ EMRLERİ** (tartım, net kg) |
| **`subcontractors`** | **TAŞERON kartları** |
| **`subcontractor_jobs`** | İş emri ↔ taşeron ataması + maliyet |
| **`subcontractor_invoices`** | Taşeronun bize kestiği faturalar |
| **`subcontractor_payments`** | Taşerona yaptığımız ödemeler |
| **`deferrals`** | Erteleme geçmişi (sebep + onay) |

### Görünümler
- `product_stock` — stok miktarı hareketlerden hesaplanır
- `work_order_summary` — net kg, tutar, taşeron maliyeti, fatura bilgisi

⚠️ `schema.sql` **idempotent** (`IF NOT EXISTS`) ve `migrate()` her açılışta çalışır.
Yeni tablo eklerken: önce `schema.sql`'i düzenle, sonra `SELECT COUNT(*) FROM yeni_tablo`
için boş veritabanında doğrula.

---

## 5. API ÖZETİ

Tüm uçlar `/api` altında. `/api/auth/login` dışında hepsi `Authorization: Bearer <jwt>` ister.

```
POST   /auth/login              { username, password } → { token, user }
GET    /auth/me
POST   /auth/change-password

GET    /company                 firma profili (herkes okur)
PUT    /company                 (sadece admin)
POST   /company/reset

GET    /work-orders             ?search&status&customer_id&uninvoiced&taseronlu&date_from&date_to
GET    /work-orders/summary
GET    /work-orders/:id
POST   /work-orders
PUT    /work-orders/:id
PATCH  /work-orders/:id/status
DELETE /work-orders/:id
POST   /work-orders/:id/invoice      ← iş emrinden fatura kes

GET    /subcontractors          ?search&specialty&is_active
GET    /subcontractors/summary
GET    /subcontractors/:id      (kart + iş geçmişi + faturalar)
POST   /subcontractors
PUT    /subcontractors/:id
DELETE /subcontractors/:id
GET    /subcontractors/jobs/list
POST   /subcontractors/jobs
PATCH  /subcontractors/jobs/:id/status
DELETE /subcontractors/jobs/:id
GET    /subcontractors/invoices/list
POST   /subcontractors/invoices
PUT    /subcontractors/invoices/:id
POST   /subcontractors/invoices/:id/payments
DELETE /subcontractors/invoices/:id/payments/:paymentId
DELETE /subcontractors/invoices/:id
POST   /subcontractors/deferrals
GET    /subcontractors/deferrals/list
PATCH  /subcontractors/deferrals/:id/approval

GET    /dashboard               tüm KPI + grafik verisi
GET    /lookups                 form dropdown'ları (tek istekte hepsi)

# createCrudRouter fabrikası ile üretilenler (her biri tam CRUD):
/customers  /employees  /projects  /tasks  /products  /users  /activity
# elle yazılanlar:
/quotes (7)  /invoices (7)  /stock (5)  /users (6)
```

---

## 6. KURULUM VE ÇALIŞTIRMA

```bash
cd veltron
npm install                 # ~460 paket, ilk seferde ~2 dk
npm run dev:server          # API + veritabanı (:4000)
npm run dev:app             # Electron arayüzü
npm run dev                 # ikisi birden
```

**Sadece tarayıcıda:** sunucuyu başlat → `http://localhost:4000`
**Giriş:** `admin` / `server/.env` içindeki `ADMIN_PASSWORD`

### Diğer komutlar
```bash
npm run build               # arayüzü derle
npm run dist                # .exe kurulum paketi (aşağıdaki sorun var)
npm run reset-db --workspace server    # yedek alıp veritabanını sıfırla

node server/test/smoke.mjs             # 57 API testi (sunucu açıkken)
node server/src/seed.js --demo         # örnek veri (müşteri/proje/görev/teklif/fatura)
node server/src/seed-company.js        # örnek firma profili
node server/src/seed-workorders.js     # örnek iş emri + taşeron
node server/src/scripts/clean-demo.js  # test verisini temizle
```

### .env (üretimde ZORUNLU)
```bash
cp server/.env.example server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # JWT_SECRET
```

---

## 6.1 BAŞKA BİLGİSAYARA TAŞIMA

Bu proje **klasörle birlikte taşınabilir** — kodda sabit yol yok, tüm yollar
`__dirname` üzerinden çözülüyor. (Doğrulandı: kodda `C:\...` gibi sabit yol sıfır.)

### Adım adım

**1. Kopyalanacaklar (gerekli):**
```
veltron klasörünün tamamı
├── package.json, package-lock.json   ← sürüm sabitleme (ÖNEMLİ)
├── server/src/, schema.sql
├── app/src/, app/electron/, app/index.html, app/vite.config.js, app/package.json
└── README.md, DEV-NOTES.md
```

**2. Kopyalanmayacaklar (yeniden üretilir):**
```
node_modules/    → npm install ile gelir  (~460 paket, 2 dk)
app/dist/        → npm run build ile gelir
app/release/     → npm run dist ile gelir
```

**3. Veri — ayrıca elle kopyalayın:**
```
server/data/veltron.db          ← tüm kayıtlar burada
server/data/veltron.db-wal
server/data/veltron.db-shm
```
> Sunucu **kapalıyken** kopyalayın. Çalışırken kopyalarsanız veritabanı bozulabilir.

**4. Hedef bilgisayarda:**

```bash
# Node.js 22+ kurulu olmalı (node --version)
cd veltron
npm install
npm run build            # tarayıcı modu için gerekli
npm run dev:server
# -> http://localhost:4000
```

**5. `.env` dosyasını yeniden oluşturun** (yeni bilgisayarda):

```bash
copy server\.env.example server\.env
```
`JWT_SECRET` değerini değiştirin. **Değiştirirseniz mevcut oturumlar düşer**
(kullanıcılar tekrar giriş yapar) — bu normal.

### Taşırken sık yapılan hatalar

| Hata | Sonuç | Çözüm |
|---|---|---|
| `node_modules` kopyalandı | "Cannot find module" / sürüm uyuşmazlığı | Silin, `npm install` çalıştırın |
| `.env` kopyalandı ama içindeki yol eski | Veritabanı bulunamaz | `.env` içindeki `DB_FILE` yolunu güncelleyin veya satırı silin |
| Sunucu çalışırken `.db` kopyalandı | Bozuk veritabanı | Sunucuyu kapatıp kopyalayın |
| `app/dist` kopyalanmadı | Tarayıcıda boş sayfa | `npm run build` |
| Node 20 veya eski | `node:sqlite` çalışmaz | Node 22+ gerekli |

### Doğrulama listesi (yeni bilgisayarda)

```bash
node --version              # 22+ olmalı
npm install                 # hatasız bitmeli
npm run build               # "built in Xs" olmalı
node server/test/smoke.mjs # "57 gecti, 0 kaldi" olmalı  ← sunucu AÇIKKEN
```

Sonra tarayıcıda `http://localhost:4000` → giriş ekranı gelmeli.

### Bu projeye özel taşıma notu

- `server/data/veltron.db` → **tüm veri burada**: iş emirleri, taşeronlar, faturalar,
  personel, malzeme. Bu dosya taşınmazsa veri gider.
- Windows yol adları **Türkçe karakter** içerebilir ("Varsayılan Proje").
  Bu çalışıyor (test edildi) ama bazı araçlar sorabilir; gerekirse
  hedefte `C:\Veltron` gibi **İngilizce** bir klasöre koyun.

---

## 7. EKRANLAR (15 sayfa)

| Rota | Ekran |
|---|---|
| `/` | Panel — KPI'lar, 12 aylık grafik, dağılımlar |
| `/is-emirleri` | **İş Emirleri** — tartım, net kg, kâr, fatura |
| `/taseronlar` | **Taşeronlar** — kartlar + fatura/ödeme sekmesi |
| `/gorevler` | Görev Panosu (sürükle-bırak) + liste görünümü |
| `/projeler` | Projeler (detay modalı ile) |
| `/musteriler` | Müşteriler |
| `/teklifler` | Teklifler (yazdırılabilir) |
| `/faturalar` | Faturalar + tahsilat (yazdırılabilir) |
| `/calisanlar` | Çalışanlar |
| `/urunler` | Ürün & Malzeme |
| `/stok-hareketleri` | Stok Hareketleri + sayım |
| `/kullanicilar` | Kullanıcılar (admin) |
| `/aktivite` | Aktivite Kaydı |
| `/firma` | **Firma Profili** (evrak başlığı, logo, banka) |
| `/ayarlar` | Sunucu bağlantısı, hesap |

---

## 8. TUZAKLAR — BUNLARA DOKUNMA

Bu noktalarda **gerçekten saatler kaybettik**. Yeni biri (veya bir AI) aynı hatayı
yapmasın diye yazıldı.

### 8.1 Electron dosya uzantıları

```
electron/main.mjs     ← .mjs ZORUNLU (ESM import kullanıyor)
electron/preload.cjs  ← .cjs ZORUNLU (sandbox:true iken ESM preload ÇALIŞMAZ)
```

`sandbox: true` kullandığımız için preload CommonJS olmak zorunda. Değiştirme.

### 8.2 `app://` protokolü şart

`file://` ile yüklemek **bozuk**:
- Vite mutlak yol üretir (`/assets/x.js` → `C:\assets\x.js` olur)
- CSP'de `'self'` çalışmaz

Çözüm `main.mjs` içinde `protocol.registerSchemesAsPrivileged` + `protocol.handle('app', ...)`.
Ayrıca `vite.config.js` içinde `base: './'` gerekli.

### 8.3 NOT NULL alanlara null gönderme

Bu hata **4 kez** oldu. Sebep: zod şeması alanı `undefined` bırakıyor, INSERT'te
`?? null` ile null gidiyor, SQLite reddediyor.

```js
// YANLIŞ
cols.map((c) => body[c] ?? null)

// DOĞRU — varsayılanı açıkça ver
cols.map((c) => {
  if (c === 'is_active') return body.is_active ?? 1;
  if (c === 'status') return body.status || 'gonderildi';
  if (c === 'rate_unit') return body.rate_unit || 'Ton';
  return body[c] ?? null;
})
```

Etkilenen alanlar: `is_active`, `rate_unit`, `status`, `cost`, `unit`, `unit_price`,
`quantity_done`, `invoice_date`, `amount`

### 8.4 `useFormState` — kullanıcı girdisini EZME

`app/src/components/Form.jsx` içindeki `initial` senkronizasyonu **dikkatli** yazıldı.

Üst bileşen her render'da yeni nesne üretirse (`{ amount: remaining }`), eski kod her
render'da `initial`'i yeniden uyguluyor ve **kullanıcının yazdığı değeri siliyordu**.
Kısmi tahsilat arayüzden girilemiyordu.

Çözüm: `lastInitial` ref'i ile **sadece gerçekten değişen** alanlar uygulanıyor.
Bu deseni bozma.

### 8.5 DataTable sıralama — `undefined === undefined`

```js
// YANLIŞ — sortKey'i olmayan sütunda isSorted true oluyor, sort null ise PATLAR
const isSorted = sort?.key === col.sortKey;

// DOĞRU
const sortable = Boolean(col.sortKey) && Boolean(sort?.key);
const isSorted = sortable && sort.key === col.sortKey;
```

### 8.6 SPA fallback dosyaları yutmamalı

Sunucu `app.get(/^(?!\/api).*/, ...)` ile SPA fallback yapıyor. Uzantısı olan istekler
(`.js`, `.css`) HTML döndürürse tarayıcı "MIME type text/html" hatası verir:

```js
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (path.extname(req.path)) return next();  // ← bu satır şart
  res.sendFile(path.join(webDist, 'index.html'));
});
```

Ayrıca `setHeaders` ile: `assets/` → `immutable`, `index.html` → `no-cache`.

### 8.7 PowerShell Türkçe karakterleri bozar

`Invoke-RestMethod` + `ConvertTo-Json` ile gönderilen veride `Ş` → `Sti.` oluyor.
**Veri yazan her script Node.js olmalı** (bkz. `seed-company.js`).

### 8.8 `app/package.json` — electron-builder tuzağı

`electron-builder` çalışırken `npm install --production` yapıp **devDependencies'i siler**
(`vite` ve `app-builder-bin` kaybolur). Çözüm: `"npmRebuild": false` eklendi.
Sorun devam ederse: `npm install` sonra tekrar dene.

### 8.9 `.exe` paketleme Windows'ta çalışmıyor

```
ERROR: Cannot create symbolic link : Gereken ayrıcalık istemci tarafından sağlanmıyor
  .../electron-builder/Cache/winCodeSign/.../darwin/.../libcrypto.dylib
```

Windows sembolik bağ oluşturamıyor (Developer Mode kapalı). **Çözümler:**
- Ayarlar → Sistem → Geliştiriciler için → **Developer Mode** aç (yönetici şifresi ister)
- `app/release/win-unpacked` klasörü **oluşuyor** — kurulum dosyası üretilmeden de
  çalıştırılabilir
- Alternatif: `chrome.exe --app=http://sunucu:4000` (kurulum gerektirmez)

### 8.10 `node:sqlite` deneysel uyarısı

Başlangıçta `[ExperimentalWarning] SQLite is an experimental feature` çıkar.
**Sorun değil.** Node 22+ gerektirir; API kararlı.

---

## 9. TAMAMLANAN İŞLER

### Temel sistem
- [x] Sunucu + veritabanı + JWT kimlik doğrulama
- [x] 15 ekran, koyu tema, duyarlı (1100px altı sidebar ikon moduna geçer)
- [x] Elektronik masaüstü uygulaması (çerçevesiz pencere, kendi başlık çubuğu)
- [x] 57 uçtan uca API testi
- [x] CSV dışa aktarma (Excel uyumlu, UTF-8 BOM'lu)
- [x] Görev panosu — sürükle-bırak durum değiştirme (doğrulandı)
- [x] Aktivite logu (kullanıcı bazlı)
- [x] Firma Profili + logo yükleme + canlı önizleme
- [x] **Yazdırma şablonu** — fatura/teklif için A4 dikey, banka/IBAN, imza alanları
- [x] **İş Emirleri** — tartım, net kg, kâr, fatura bağlantısı, erteleme
- [x] **Taşeronlar** — kart, atama, maliyet, fatura/ödeme, açık bakiye

### Bilinen kusurlar
- [ ] `.exe` kurulum paketi üretilemiyor (8.9)
- [ ] **Sunucu Windows servisi olarak çalışmıyor** → PC açılışında elle
      `node src/index.js` gerekiyor. *Ofise kurmadan önce çözülmeli (NSSM/Task Scheduler).*
- [ ] Türkçe karakter sıralaması (Ç, Ğ, İ, Ö, Ş, Ü) için `COLLATE` yok
- [ ] Görev panosunda CSV butonu yok (sadece liste görünümünde)
- [ ] 1000+ kayıtta sayfalama test edilmedi
- [ ] Çok kullanıcılı eşzamanlı düzenleme test edilmedi

---

## 10. SIRA KALDIRILACAK İŞLER

Sıralama önerisi:

| # | İş | Not |
|---|---|---|
| 0 | ⭐ **Puanlama + primli maaş modülü** | **Excel'den gelen en büyük eksiği.** Bkz. 1.10. Çalışan performans puanı → prim → maaş hesabı. **Gerçek personel verisi girmeden önce şart.** Excel arşivinde referans var. |
| 1 | **Sunucuyu servis olarak çalıştır** | Ofise kurmadan önce şart. NSSM veya Task Scheduler. |
| 2 | **Kâr raporu** | İş emri + taşeron birleşik: aylık/müşteri/taşeron bazında satış−maliyet=kâr |
| 3 | **Erteleme raporu** | Zaten veri toplanıyor (`deferrals`), sadece rapor ekranı eksik. "Kaç kez, ortalama kaç gün, en sık sebep" |
| 4 | **Müşteri portalı** | Kullanıcı isteği: VuruşKAN kendi iş durumlarını görsün. ⚠️ **Güvenlik kritik** — müşteri başka müşterinin verisini görmemeli. Yeni rol (`customer`) + satır seviyesi filtre. |
| 5 | **Fatura e-postası** | Teklif/faturayı müşteriye gönderme |
| 6 | **Yedekleme butonu** | Şu an sadece README'deki PowerShell betiği var. Ayarlar sayfasına "Şimdi yedek al" + tarih listesi. |
| 7 | **Silo / malzeme parçalama** | 1.9'a bak — kullanıcı "köşeye nota" dedi, şimdi gerekli değil |
| 8 | **Kurumsal logo** | Firma Profili'nde evraklarda kullanılıyor, uygulama başlığında yok |
| 9 | **GenelPerformans raporu** | Excel'de vardı, web'de yok. Dönemsel personel performans raporu. |

---

## 11. YAPAY ZEKÂ İÇİN NOTLAR

Bu projeyi devralacak bir modele verilecekse:

**Yapılacaklar:**
1. `schema.sql`'i oku — tüm veri modeli orada
2. `server/src/routes/workOrders.js` → `netOf()` ve `divisorFor()` iş kuralları
3. `server/src/utils/crud.js` → CRUD fabrikası (6 sayfa bundan üretiliyor)
4. **1. bölümdeki ticari kuralları** oku ve ihlal etme
5. Değişiklikten sonra `node server/test/smoke.mjs` çalıştır (57 test)

**Yapılmayacaklar:**
- "Daha iyi olur" diye 1.1'deki tek-iş-emri kuralını değiştirme
- Proje modülünü İş Emri'ne bağlama
- `node:sqlite` yerine başka bir kütüphane geçirme
- `app://` protokolünü `file://` yapma

**Yeni sayfa eklerken:**
`ResourcePage` (app/src/components/ResourcePage.jsx) yapılandırma tabanlı CRUD sağlar.
Basit liste ekranları için tek dosyada `columns` + `fields` tanımı yeterlidir — 5 CRUD
sayfası (Müşteriler, Çalışanlar, Projeler, Ürünler, Kullanıcılar) tamamen config ile yazıldı.
Hesaplamalı/özel ekranlar (İş Emirleri, Taşeronlar, Faturalar) elle yazıldı.

**Yeni tablo eklerken:**
1. `schema.sql` (idempotent yaz)
2. Sunucu restart (migrate çalışır)
3. `node:sqlite` ile kolonları doğrula — `NOT NULL` alanlara dikkat (8.3)
4. `test/smoke.mjs`'e test ekle
5. `app/src/lib/api.js` → `STATUS_LABELS` / `STATUS_TONES` sözlüklerine yeni durumları ekle
   (aksi halde arayüzde `in_progress` gibi ham anahtarlar görünür — bu oldu)

---

## 12. HATIRLATMA

- `JWT_SECRET` hâlâ **varsayılan** değerde. Üretime almadan önce değiştir.
- `server/data/veltron.db` dosyası tüm veriyi içerir — **yedekle**, kaybetme.
- `admin` şifresi değiştirilmeli (geçici: `demo1234`, `server/.env` → `ADMIN_PASSWORD`)
- Git kurulu değil, proje bir depoda değil. Devam etmeden önce
  `git init && git add . && git commit` ile başlayın (`.gitignore` hazır).
