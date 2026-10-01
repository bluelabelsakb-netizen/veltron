# Güvenlik Denetimi — 29 Eylül 2026

Bu belge, Veltron'da yapılan güvenlik denetiminin sonuçlarını ve alınan
önlemleri içerir.

**Tekrar çalıştırmak için:**
```powershell
cd server
node src/scripts/security-audit.mjs
```

---

## Özet

| | Önce | Sonra |
|---|---|---|
| **KRİTİK** | 1 | **0** ✅ |
| **YÜKSEK** | 3 | **0** ✅ |
| **ORTA** | 6 | **1** |
| **DÜŞÜK** | 2 | 1 |
| **GEÇTİ** | 30 | **53** ✅ |

---

## Bulunan ve Düzeltilen Açıklar

### 🔴 KRİTİK — Girişte hız sınırı yoktu

**Sorun:** 25 hatalı parola denemesi 2 saniyede geçiyordu. Bot parola
deneyebilirdi. Aile erişimi tüneli açıkken bu **gerçek bir riskti**.

**Çözüm:** `express-rate-limit` eklendi.
- 5 dakikada **10 hatalı** giriş (başarılı girişler sayılmaz)
- Genel API limiti: dakikada 600 istek

**Anahtar "IP + kullanıcı adı":** Tünelden gelen herkes tek IP'den göründüğü
için sadece IP'ye bakılsaydı bir kişinin hataları herkesi kilitlerdi. Artık
her hesap kendi kovasında sayılıyor.

### 🟠 YÜKSEK — Excel formül enjeksiyonu (CSV injection)

**Sorun:** Müşteri adına `=cmd|'/C calc'!A0` gibi bir metin yazılırsa, Excel
indirilen dosyada hücreyi **formül olarak çalıştırıyor**. Dosyayı açan kişinin
bilgisayarında komut çalıştırabilir.

**Çözüm:** `guvenliHucre()` — `= + - @` ile başlayan metinlere kesme işareti
(`'`) ekleniyor. Sayısal hücreler etkilenmiyor.

**Doğrulama:** Denetim dosyayı indirip içeriğini okuyor — `HAM FORMÜL: 0,
KAÇIRILMIŞ: 2`.

### 🟠 YÜKSEK — Çıkış yapınca jeton iptal edilmiyordu

**Sorun:** JWT sunucuda saklanmıyor. Birinin çalınmış jetonu, parolası
değiştirilse bile **12 saat boyunca** geçerli kalıyordu.

**Çözüm:** `users.token_version` sütunu eklendi.
- Jeton imzasına `tv` (token version) konur
- Parola değişince / yönetici sıfırlayınca `tv` artar
- `authenticate` eski `tv`'yi görünce jetonu reddeder
- **Çalınmış cihazdaki oturum anında düşer**

### 🟠 YÜKSEK — CORS tüm kaynaklara açıktı

**Sorun:** `CORS_ORIGIN=*` — internete açıkken kotu bir sayfa kendi
sunucusuna istek atıp veri toplayabilirdi.

**Çözüm:** İzin listesi. `.env`'de artık yalnızca kendi adresleriniz var.
Electron `Origin` göndermediği için masaüstü modu etkilenmez.

---

## Diğer İyileştirmeler

| Ne | Durum |
|---|---|
| **Güvenlik başlıkları** (helmet) | CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy` eklendi |
| **Parola politikası** | 6 → **8 karakter**, rakam zorunlu, yaygın parola listesi |
| **Aşırı büyük gövde** | Kontrollü `413` dönüyor (eskiden `500`) |
| **Bozuk JSON** | Kontrollü `400` dönüyor |

---

## Kalan Konu (ORTA — 1)

**Sınır doluyken doğru şifreyle giriş de engelleniyor (429).**

Bu **bilinçli bir trade-off**: kaba kuvvet saldırısında bot doğru parolayı
tutsa bile 10 denemeden sonra durdurulur. 5 dakika beklenir.

İstedinizde yumuşatılabilir (ör. 15 deneme / 10 dakika), ama güvenlik
azalır. **Şu anki ayar güvenli tarafta.**

---

## Doğrulanan Güvenli Olanlar ✅

Bunlar **gerçekten test edildi** — sadece koda bakılarak değil:

| Konu | Sonuç |
|---|---|
| **SQL enjeksiyonu** | 10 payload denendi (UNION, DROP, ATTACH, boolean, template literal) — **hiçbiri sızdırmadı** |
| **Kütle atama** | `id` alanı gönderilerek ezilemiyor |
| **Parola özeti sızıntısı** | `password_hash` hiçbir yanıtta dönmüyor |
| **Hata mesajları** | Stack trace / SQL bilgisi sızmıyor |
| **Jeton imzası** | Bozuk imza ve `alg:none` saldırısı reddediliyor |
| **Kullanıcı sayımı** | Var olmayan kullanıcı ile yanlış şifre **aynı mesajı** veriyor |
| **Müşteri izolasyonu** | 10 iç modülün hepsi 403; başka müşterinin verisi 404 |
| **Yetki yükseltme** | Müşteri hesabı yönetici olamıyor |
| **Aşırı istek** | `limit=999999999` → 500'e kırpılıyor |

---

## Tünel Açıkken Dikkat

`AILE-ERISIMI.bat` çalışırken `*.trycloudflare.com` adresi internete açıktır.
Yapılan önlemler:

- Hız sınırı (bot parola deneyemez)
- Güvenlik başlıkları (tıklamayla hırsızlık yok)
- CORS kısıtı (kotu sayfa veri çekemez)
- Müşteri hesapları zaten izole (iç modüllere 403)
- Giriş **şifresiz** mümkün değil

**Bitince mutlaka:** `BAGLANTIYI-KAPAT.bat`

---

## Eklemlen Paketler

| Paket | Ne için |
|---|---|
| `helmet` | Güvenlik başlıkları |
| `express-rate-limit` | Kaba kuvvet koruması |
| `exceljs` | Excel dışa aktarma (önceki oturum) |

---

*Denetim: 53 kontrol, 12 kategori · 29 Eylül 2026*
