# Veltron Puanlama ve Maaş Kuralları

> Excel arşivindeki formüllerden çıkarılmıştır.
> Arşiv: `C:\Users\pc-n\Documents\Veltron-Excel-arsiv\`
> Bu dosya, web sistemindeki hesapların **referansıdır**. Değiştirirseniz
> `server/src/utils/payroll.js` içindeki hesapları da güncelleyin.

---

## 1. Puan Kriterleri ve Ağırlıkları

| Kod | Kriter | Ağırlık | Açıklama |
|---|---|---|---|
| `TEK` | Teknik Uygulama | %30 | İşi doğru, standartlara uygun ve hızlı yapma |
| `KAL` | Kalite | %20 | Hata oranı, termin sonrası düzeltme |
| `ZAM` | Zamanında Teslim | %20 | Sözleşme tarihine uyum |
| `MUT` | Müşteri Memnuniyeti | %15 | Şikâyet, geri dönüş, referans |
| `EKI` | Ekip Çalışması | %10 | Bilgi paylaşımı, çırak yetiştirme |
| `DIS` | Disiplin / Devam | %5 | Devam, kıyafet, kurallara uyum |
| | **TOPLAM** | **%100** | 100 olmalı, değilse ağırlıklar bozulur |

Ağırlıklar kullanıcı tarafından değiştirilebilir olmalı.

---

## 2. Puan Hesaplama

Her kriter 0–100 arası puan alır.

```
Ağırlıklı Puan = Puan × Ağırlık / 100

Dönem Puanı = ROUND( Σ (tüm kriterlerin ağırlıklı puanı) , 1 )
Kriter Sayısı = o dönemde puanlanan kriter adedi
Ortalama Kriter = Dönem Puanı / Kriter Sayısı
Eksik Kriter = 6 − Kriter Sayısı
```

### Değerlendirme (Dönem Puanına göre)

| Puan | Değerlendirme |
|---|---|
| ≥ 90 | Mükemmel |
| ≥ 80 | Çok İyi |
| ≥ 70 | İyi |
| ≥ 60 | Gelişmeli |
| < 60 | Yetersiz |

**Sıra:** Aynı dönem içinde Dönem Puanı'na göre büyükten küçüğe.

> ⚠️ **Yuvarlama sırası — dokunma, kasıtlıdır.**
> `weightedScore()` **her kriterin ağırlıklı puanını ayrı ayrı** 1 ondalığa
> yuvarlar, sonra toplar (Excel'deki `Puanlar!H` sütununun davranışı).
> Bu yüzden 6 kriterin hepsi 75 verilirse dönem puanı **75 değil 75,1** olur ve
> prim `5,1 × 250 = 1.275 TL` çıkar (1.250 değil).
> "Önce topla, sonra yuvarla" yapılırsa bu değişir. `payroll.test.mjs`
> mevcut davranışı kilitler — **bu bir hata değil, Excel uyumu.**

---

## 3. Prim ve Maaş Hesap Kuralları

| Kural | Varsayılan | Açıklama |
|---|---|---|
| **Puan Eşiği** | 70 | Dönem puanı bu eşiğin **altındaysa prim verilmez** |
| **Prim Çarpanı** | 250 ₺/puan | Eşik üstü her puan için ek ödeme |
| **Prim Üst Limiti** | 5.000 ₺ | Ay içinde bu tutarı geçmez |
| **Vergi Oranı** | %15 | Gelir vergisi (brüt toplam üzerinden) |
| **SGK Oranı** | %14 | İşçi payı (brüt toplam üzerinden) |
| **Mesai Saat Limiti** | 120 saat/ay | Bu saatin üstü **ücretlenmez** |
| **Mesai Saat Çarpanı** | 0,4 | Normal saat ücretinin kaç katı |
| **Avans Tavanı** | %30 | Brüt maaşın bu oranından fazlası avans verilemez |

### Formüller

```
Puan Primi  = Dönem Puanı <= 70        → 0
            = Dönem Puanı >  70        → MIN(5.000, (Dönem Puanı − 70) × 250)

Mesai Ücreti = MIN(Mesai Saati, 120) × Saat Ücreti × 0,4

Brüt Toplam  = Brüt Maaş + Puan Primi + Ek Ödeme + Mesai Ücreti
Vergi        = Brüt Toplam × %15
SGK          = Brüt Toplam × %14
NET          = Brüt Toplam − Vergi − SGK − Avans − Diğer Kesinti
```

### Çalışan tablosunda gerekli alanlar

- **Saat Ücreti** (mesai hesabı için) — web sisteminde **yok, eklenecek**
- **Aylık Brüt** — web sisteminde `employees.monthly_salary` olarak var
- **Sicil No** — web sisteminde yok, `employees.notes` içinde tutuluyordu

---

## 4. Stok Kuralı (Ayrıca eksik)

```
Emniyet Katsayısı = 1,5
Kritik Eşik = Min. Stok × Emniyet Katsayısı
```

Web sisteminde şu an `min_stock` doğrudan kritik eşik olarak kullanılıyor.
Bu kural uygulanmalı: `min_stock × 1,5 <= mevcut stok` ise kritik.

---

## 5. Aktarılan Excel Verisi

| Excel sayfası | Durum |
|---|---|
| Personel (Saat Ücreti, Aylık Brüt) | ✅ Aktarıldı (Saat Ücreti hariç) |
| Puanlar (28 kayıt) | ⏳ Aktarılacak |
| PuanOzeti | Hesaplanan, kayıt değil |
| Maaş (4 kayıt) | ⏳ Aktarılacak |
| GenelPerformans | Rapordan hesaplanır |
| Ayarlar (kural değerleri) | ⏳ `payroll_settings` tablosuna aktarılacak |
