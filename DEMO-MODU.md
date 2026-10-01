# Demo Modu ve Lisanslama

Başka firmalara Veltron'u **göstermek** ve satmak için kullanılan mod.

---

## Tek Komutla Demo Hazırlığı

```powershell
cd veltron\server
npm run demo-kur -- --temiz
```

Bu ne yapar:

1. **Veritabanını tamamen boşaltır** (geri alınamaz — sadece demo kopyasında çalıştır)
2. **DEMO modunu başlatır** — 30 gün, 500 iş emri sınırı
3. **Gerçekçi ama uydurma verilerle doldurur**
4. Admin şifresini **`.env` → `ADMIN_PASSWORD`** yapar (yoksa `demo1234`)

Sonuç:

```
Yönetici   :  admin      /  <.env ADMIN_PASSWORD>
Muhasebeci :  muhasebe   /  <.env ADMIN_PASSWORD>
```

> **Neden `.env`?** `demo-kur --temiz` admin şifresini sıfırlar. Sabit
> `demo1234` yazsaydı `.env` ile veritabanı ayrışır ve `npm test` ön
> kontrolünde *"Yönetici girişi başarısız"* diye dururdu. Artık tutarlı kalır —
> `demo-kur` sonrası `reset-admin-password` **çalıştırmana gerek yok**.

### Veri içeriği (hepsi uydurma)

| | Adet | Örnek |
|---|---|---|
| Müşteri | 6 | Deniz Demir Çelik, Ege Maden, Marmara Yapı… |
| Taşeron | 4 | Hızlı Nakliyat, Metin Vinç… |
| Çalışan | 5 | Hasan Yıldırım (Tartım Operasyon Sorumlusu)… |
| Ürün | 6 | Çimento 40 kg (dökme), Sıva Kumu, Asfalt… |
| **İş emri** | **24** | **tartım dolu** (boş + dolu + net), ekip/taşeron ataması |
| Fatura | 14 | kısmi tahsilatlı |
| Teklif | 6 | gönderilmiş / kabul / red |
| **Proje** | **4** | Gerçekçi proje adları, bütçe, durum |
| **Görev** | **15** | **5 durumun hepsi dolu** — panoda dolu görünür |
| **Tır fotoğrafı / evrak** | **38** | fotoğraf + irsaliye, sözleşme, fiş, imza |
| **Alınan malzeme** | **16** | kayıtlı ürün + serbest satır karışık |
| **Taşeron faturası** | **12** | taşeron bize fatura kesiyor |
| **Taşeron ödemesi** | **8** | tam + kısmi ödemeler |
| **Erteleme** | **6** | müşteri talebi, kapasite, hava, malzeme yok |
| **Müşteri tarih talebi** | **3** | VuruşKAN portalında görünür |
| **Puan** | **90** | 3 dönem × 5 kişi × 6 kriter |
| **Bordro** | **15** | 3 dönem × 5 kişi (Excel kurallarıyla) |
| **Aktivite izi** | **20** | gerçekçi işlem geçmişi |

> ⚠️ **Gerçek müşteri adları kullanılmaz.** "VuruşKAN" gibi mevcut kayıtlar
> demo verisine karışmasın diye — **ama VuruşKAN'ın portalda iş emri görmesi
> için** havuza bilerek eklenir.

---

## ⛔ 1 Ekim 2026: Demo'da 10 modül BOŞTU (düzeltildi)

Müşteri denetiminde 10 tablonun **tamamen boş** olduğu görüldü:

| Ekran | Müşteri ne görüyordu |
|---|---|
| Görevler | Pano **tamamen boş** — 5 sütunun hepsi 0 |
| Projeler | "Kayıt bulunamadı" |
| Maaş | "0/7 ödendi" |
| Taşeronlar | Faturalanan **0,00 ₺**, Ödenen **0,00 ₺** |
| Aktivite | **1 kayıt** |

**Sonuç:** Potansiyel müşteri *"bu program çalışmıyor"* diye düşünürdü.

**Düzeltme:** `scripts/demo-eklenti.js` yazıldı, `demo-kur.js`'e bağlandı.
Şimdi: **34 tablonun 34'ü dolu, boş tablo 0.**

### Doldururken uyulan kurallar

| Kural | Neden |
|---|---|
| **Puan ağırlıkları `utils/payroll.js → DEFAULT_CRITERIA`'dan alınır** | Ağırlıklar **asla burada uydurulmaz**. (Bir kez kendi ağırlıklarımı yazdım — TEK 20 yaptım, kanonik 30; payroll testi kırıldı.) **Tek kaynak: `payroll.js`** |
| Taşeron maliyeti **ton** bazlı | Miktar kg'de → önce `/1000`. Yoksa **1000 kat** çıkar |
| Malzeme **kısmi** doldurulur | Her 3 iş emrinin 1'inde malzeme yok — kullanıcı kuralı: malzeme opsiyoneldir |
| Fotoğraf/evrak **kaydı** var, **dosyası yok** | Sahte resim üretmek yerine kayıt oluşturulur. `Uploads` klasörüne gerçek jpg atılırsa açılır |
| **Proje ↔ iş emri bağı kurulmaz** | `work_orders.project_id` **yok**. Bilinçli — Projeler modülünün kaldırılması önerildi |

---

## ⛔ Demo Görselleri (1 Ekim 2026)

Fotograf/evrak **kaydı** olmak yetmiyor — dosya da olmalı. Yoksa müşteri
tıklayınca 404 görür.

### Üretici: `scripts/demo-gorseller.js`

**Harici kütüphane yok.** Saf Node ile üretir:

| Tür | Nasıl |
|---|---|
| **PNG** (32 adet) | `zlib` (yerleşik) + elle CRC32. 640×400 |
| **PDF** (6 adet) | Elle yazılan minimum geçerli PDF, kendi xref tablosuyla |

Çizilenler: **kanter sahnesi** (gökyüzü, asfalt, kantar terazisi, tır) ve
**kantar göstergesi** (yeşil LCD, rakamlar, bord).

```powershell
node src/scripts/demo-gorseller.js           # eksikleri üretir
node src/scripts/demo-gorseller.js --temiz   # demo klasörünü siler
```

> Görseller gerçek fotoğraf değil, **çizimdir**. Ama müşteri "kırık resim"
> görmez, "kanter görüntüsü" görür.

### ⛎ MIME doğruluğu

`demo-gorseller.js` **PNG** üretir; bu yüzden `mime_type` de `image/png` olmalı.
`image/jpeg` yazılırsa tarayıcı blob'u çözemez ve resim **0×0** görünür.
(Bu hata oldu, düzeltildi.)

---

## ⛔⛔ EN KRİTİK HATA: Fotoğraflar hiç görünmüyordu

Demo verisinde 38 kayıt vardı, dosyalar da üretildi — ama resimler
**yine de boş** çıkıyordu. Nedeni:

```
İKİ AYRI CSP VARDı VE ÇAKIŞIYORDU

server/src/index.js (helmet)  →  img-src 'self' data: blob:   ✅ blob VAR
app/index.html  (<meta>)      →  img-src 'self' data:         ❌ blob YOK
```

İki CSP **birlikte uygulanır** ve **en kısıtlayıcı kazanır**.

`AuthImage` (Attachments.jsx) `<img src>` ile `Authorization` başlığı
gönderemediği için görseli önce `fetch` edip **`blob:` URL**'ye çeviriyor.
CSP `blob:`'ı yasakladığı için tarayıcı reddediyor:

```
Loading the image 'blob:https://…' violates Content Security Policy
  directive: "img-src 'self' data:". The action has been blocked.
```

> **Yani tır fotoğrafı özelliği baştan beri hiç çalışmamıştı.**
> Konsol uyarısına gömülü kaldığı için kimse fark etmedi.

**Düzeltme:** `index.html`'deki meta CSP'ye `blob:` eklendi.
**Koruma:** `test/csp.test.mjs` (9 kontrol) — iki politika ayrışırsa kırılır.

```powershell
node test/csp.test.mjs
```

> ⛔ **Bu tuzak geneldir:** HTML'de `<meta>` CSP varsa sunucudaki politika
> **geçersiz sayılabilir**. Yeni bir `img-src`/`connect-src` kuralı eklerken
> **iki yeri de** güncelle.

---

## Demo Modunda Ne Olur?

| | Davranış |
|---|---|
| **Okuma** | Tamamen serbest — her şey gezilebilir |
| **Yazma** | **Sınıra kadar serbest** (gösterimde deneyebilmeli) |
| **Sınır dolunca** | Salt okunur moda düşer (HTTP 402) |
| **Süre dolunca** | Salt okunur moda düşer |
| **Ekran** | Üstte turuncu **DEMO** şeridi |
| **Excel** | Alt başlıkta `*** DEMO - SATIN ALINMADIR ***` |
| **Fatura / Teklif** | Baskıda çapraz **DEMO — SATIN ALINMADI** damgası |
| **Müşteri portalı** | Demo hesaplarında açılmaz (satış gösteriminde gerekmez) |

### Neden yazma hemen engellenmiyor?

Gösterimde kullanıcı bir şey denemek ister. Yazma tamamen kapalıysa program
"bozuk" gibi görünür ve satış zarar görür. Bu yüzden **önce serbest**, sınır
dolunca salt okunur.

---

## Müşteri Lisansladığında

Gösterim biter, müşteri lisansı alır:

1. Yönetici şeritteki **Lisans** butonuna basar
2. Anahtarı girer (örn. `VELTRON-ABC1-DEF2-GHI3`)
3. Sistem demo kısıtlamalarından çıkar, **tam kullanıma açılır**

Arayüzden: `Lisans` butonu → **Lisansı Aktive Et**

Komutla da olur:
```powershell
# Uygulama içinden yapılması önerilir (aktivite kaydı düşer)
```

### Anahtar üretme

Anahtarı **sen** üretirsin. Örnek biçim:
```
VELTRON-<4 HANE>-<4 HANE>-<4 HANE>
```

> ⚠️ **Bu offline bir üründür.** Anahtar veritabanına yazılır, internete
> bağlanmaz. Aynı anahtarı iki bilgisayarda kullanmak **teknik olarak
> mümkündür**. Kurumsal kullanıcıysan ileride çevrimiçi aktivasyon
> düşünmeli.

---

## Yeniden Demo Modu (yeni müşteriye göstermek için)

Arayüzden: `Lisans` → **Yeniden Demo Modu** (süre ve kayıt sınırı ayarlanabilir)

Veya:
```powershell
cd veltron\server
node src/scripts/demo-kur.js
```
`--temiz` eklemezsen mevcut verinin üstüne demo verisi ekler.

---

## Lisans Anahtarı Nerede Saklanır?

`server/data/veltron.db` → `license` tablosu, tek satır.

| Alan | Ne |
|---|---|
| `is_demo` | 1 = demo, 0 = lisanslı |
| `license_key` | Anahtar |
| `customer_name` | Lisans alan firma |
| `demo_expires_at` | Demo bitiş |
| `demo_max_records` | Kayıt sınırı |

---

## Önemli Tasarım Kararı: Kilitlenme Yok

Demo sınırı dolduğunda **giriş ve lisans aktivasyonu çalışmaya devam eder.**

Aksi halde döngüsel kilit olurdu: "sınır doldu → giriş yok → lisans
girilemez → sınır dolmaya devam". 29 Eylül'de testte yakalandı, düzeltildi.

İstisna tutulan uçlar: `/auth`, `/license`, `/portal`, `/health`

---

## Testler

```powershell
cd server
npm run test:demo
```

**23 test.** Şunları doğrular:
- Demo kısıtlamaları çalışıyor
- **Sınırdayken giriş ve aktivasyon çalışıyor** (kilitlenme yok)
- Lisans aktif edince yazma serbest oluyor
- Anahtar uçtan uca geliyor
- Müşteri lisans aktive edemiyor (403)
- Excel'de DEMO damgası var
- Lisans anahtarı **herkese açık uçta sızmıyor**

---

## Sonraki Müşteriye Geçerken Kontrol Listesi

- [ ] `npm run demo-kur -- --temiz`
- [ ] `Sunucuyu-Kur.bat` ile başlat
- [ ] Tarayıcı/Electron'da aç
- [ ] **Firma Profili**'ne kendi adını, logonu, adresini gir
- [ ] Göster: İş Emri → tartım gir → net otomatik hesaplanır
- [ ] Göster: Müşteri portalı (kendi müşterin için)
- [ ] Göster: Excel'e aktar (damga görünsün)
- [ ] Göster: Ay Sonu Raporu

---

*29 Eylül 2026*
