# Lisans Planı — Kararlar ve Açık Sorular

**Tarih:** 1 Ekim 2026
**Durum:** Demo 1.0. Nihai sürümde tekrar konuşulacak.

---

## ✅ Alınan Kararlar (1 Ekim 2026)

### 1. Model: Üçü birden

Kullanıcının cevabı: *"Yıllık, süresiz ve kullanıcı sayısına göre olucak zaten,
bunlar olması gereken."*

| Özellik | Değer |
|---|---|
| **Lisans türü** | Yıllık **veya** süresiz |
| **Kullanıcı sınırı** | `max_users` — 3 / 5 / 10 / sınırsız |
| **Kullanıcı artışı** | Şişirilebilir → yeniden lisans = **yeni ödeme** demek |

> Neden üçü birden mantıklı:
> - Küçük firma → **süresiz + 3 kullanıcı** (bir kere öder, rahat)
> - Orta firma → **yıllık + 5 kullanıcı** (her yıl öder, sen tazeleme geliri kazanırsın)
> - Artan kullanıcı → **yeni ödeme fırsatı**

### 2. Müşteri sayısı: **en fazla ~5 firma**

Şimdilik. Ölçek büyürse tekrar konuşulur.

**5 firma için şu an fazlasıyla yeterli.** Gerçek bir lisans yönetim paneli
(subscription ödemesi, otomatik yenileme) 5 müşteriye **gereksiz**.

---

## ⏰ Sonra Konuşulacaklar (not alındı, şimdi dokunulmuyor)

### A. Anahtar müşteriye nasıl gidecek? — **AÇIK**

Kullanıcının fikri:
> *"Anahtarı sistemi satın aldıktan sonra yine bana Telegram'dan bir token
> üretebilir veya üretilen token müşteriye mail yoluyla gidebilir."*

İki seçenek:

| | Telegram ile | E-posta ile |
|---|---|---|
| **Nasıl** | Satış sonrası sana mesaj atılır: "Şu anahtarı üret" → sana düşer → müşteriye iletirsin | Müşteriye mail atılır |
| **Hız** | Anında | Birkaç dakika |
| **Kurulum** | ✅ **Zaten var** (`@VeltronTakip_Bot`) | SMTP kurulumu gerekir |
| **Risk** | Token Telegram'da kalıcı yazılı | Mail kaybolabilir |
| **Otomatik mi** | Hayır, sen tetiklersin | Evet, müşteriye otomatik gider |

> ⏰ **Nihai sürümde konuşulacak.** O zamana kadar **elle** verilir:
> anahtarı üret → telefonda müşteriye oku veya yaz.

### B. Sanal makine (VPS) — ⏰ **SONRA**

> *"Bu VPS sistemini her şey bittikten sonra alalım."*
> **Hetzner** not edildi — köşede unutmayacağız.

| | |
|---|---|
| **Ne zaman** | Her şey bittikten sonra |
| **Neden** | Demo adresi her seferinde değişiyor, bilgisayarın açıkken çalışıyor |
| **Ne kazanırız** | Sabit adres (`demo.veltron.com.tr`), bilgisayarın kapalıyken de çalışır, profesyonel görünür |
| **Ne kadar** | ~₺230/ay (Hetzner CX23, €5,99) |
| **Alternatif** | Oracle Cloud ücretsiz (12 GB) — kart ister, "kapasite yok" sıkıntısı olabilir |

> ⏰ Şimdi **Cloudflare Tunnel** ile idare ediyoruz: **0 ₺**, yeterli.

### C. Nihai sürümde tekrar konuşulacak
- Anahtar teslim yöntemi
- Ödeme alma (kredi kartı / havale)
- Otomatik yenileme
- Fiyatlandırma

---

## ⛔ GÜVENLİK UYARISI — Satışa başlamadan önce şart

Mevcut `activate()` fonksiyonu şunu yapıyor:

```js
if (k.length < 8) return { ok: false, error: '...' };   // ← sadece uzunluk!
```

Yani **`AAAAAAAA` bile geçerli lisans.** 8 karakter yazan herkes lisanslı olur.

**Bu düzeltilmeden lisans satma.** Çünkü:
- Müşteri lisans almadan `AAAAAAAA` yazıp kullanmaya başlar
- Sen lisans satamazsın (kimse ödemez, herkes bedavaya geçer)
- Destek talebi çöker

### Yapılacak (3 aşama, sırayla)

**1. Anahtar üretici**
- Kuralı belli anahtarlar: `VELTRON-2026-A7K9-M2X4`
- Manuel tahmin edilemez format

**2. Gerçek doğrulama + bilgisayar bağı**
- Anahtar, **bilgisayara** bağlanır (aynı anahtar 2. bilgisayarda çalışmaz)
- Veritabanında geçerli anahtar mı diye **imza doğrulaması**

**3. Satış veritabanı (senin bilgisayarında)**
- Kim aldı, ne zaman, ne kadar ödedi, bitiş tarihi

> **Sıralama önemli:** 1 ve 2 olmadan 3 boşa para — kayıt tutarsın ama
> doğrulama yoksa lisans bedava.

---

## Önerilen Veritabanı Şeması (onay bekliyor)

Onaylarsan bu şemayı kurarım. **Henüz kod yazılmadı.**

### `lisanslar` (senin bilgisayarında — tüm müşteriler)

| Sütun | Örnek | Açıklama |
|---|---|---|
| `id` | 1 | |
| `anahtar` | `VELTRON-2026-A7K9-M2X4` | |
| `firma` | `Deniz Demir Çelik A.Ş.` | |
| `kisi` | `Kemal Arslan` | satış sorumlusu/k contact |
| `tip` | `yillik` \| `suresiz` | |
| `baslangic` | `2026-10-01` | |
| `bitis` | `2027-10-01` | süresizse NULL |
| `max_kullanici` | `5` | 0 = sınırsız |
| `kullanilan` | `3` | kaç kullanıcı var |
| `ucret` | `25000` | TL |
| `odeme_durumu` | `odendi` \| `bekliyor` \| `kismi` | |
| `odeme_tarihi` | `2026-10-01` | |
| `notlar` | | |
| `olusturma` | `2026-10-01` | |

### Müşterinin sistemindeki `license` tablosu

Mevcut tablo **zaten var** (1 satır). Sadece 4 sütun eklenmesi gerekir:

| Yeni sütun | Neden |
|---|---|
| `lisans_tipi` | `yillik` / `suresiz` |
| `bitis_tarihi` | Süre sonunda uyarı |
| `max_kullanici` | Kullanıcı sınırı |
| `bilgisayar_kodu` | Anahtarın kopyalanmasını engeller |

---

## Şimdilik Yapılacak

Demo 1.0'da **lisans sistemine dokunmuyoruz.** Çünkü:

- Demo modu zaten çalışıyor (30 gün, 500 kayıt, damgalı Excel)
- İlk gerçek müşteri gelene kadar vakit
- Yanlış bir şema kurup sonra değiştirmekten kötü

**Önce:** demo verisini tamamla + fazlalık modülleri kaldır (programı sade-leştir)
**Sonra:** lisans sistemini kur
**En son:** VPS + kalıcı adres

---

*1 Ekim 2026 — bu belge güncellenecek*