# Excel'e Aktarma Kılavuzu

Verilerinizi istediğiniz zaman gerçek Excel dosyası (`.xlsx`) olarak
indirebilirsiniz.

---

## Nasıl Kullanılır?

**Yönetim → Excel'e Aktar** menüsüne girin, kapsamı seçip indirin.

Ekran: `app/src/pages/ExportExcel.jsx`
Sunucu ucu: `server/src/routes/export.js` → `GET /api/export/excel?scope=...`

---

## Kapsamlar (Ne İndirilebilir?)

| Kapsam | Sayfa | İçerik |
|---|---|---|
| **Ay Sonu Raporu** ⭐ | **7** | Özet (KPI) · Müşteri Kırılımı · İşler · Teklifler · Kâr · Puanlama · Bordro |
| **Tüm Veriler** | **15** | Aşağıdaki her şey tek dosyada |
| İş Emirleri | 1 | Tartım, tutar, maliyet kırılımı, kâr |
| **Kâfiyye / Tartım** | 1 | Tartım defteri: boş/dolu/net, taşeron, açıklama |
| **Teklifler** | 1 | Teklif no, müşteri, geçerlilik, tutar, KDV |
| Kâr Raporu | 1 | Satış, maliyet, kâr dökümü |
| Faturalar | 1 | Kalemler, KDV, tahsilat, kalan bakiye |
| Müşteriler | 1 | Kartlar ve toplam hacimler |
| Taşeronlar | 4 | Taşeronlar / İş atamaları / Faturalar / Ödemeler |
| Ürünler ve Stok | 1 | Stok miktarları ve stok değeri |
| Çalışanlar | 1 | Personel, maaş, saat ücreti |
| Puanlama | 1 | Dönem × personel × kriter matrisi |
| Genel Performans | 1 | Tüm dönemlerin sıralaması |
| Bordro | 1 | Brüt, prim, vergi, SGK, net |

**Dönem filtresi** (isteğe bağlı): Tek bir dönem seçip sadece o dönemin
verisini indirebilirsiniz. Kâfiyye, Teklifler, Puanlama ve Bordro bunu
destekler.

---

## ⚖️ Kâfiyye (Tartım Defteri)

Tartım için ayrı bir sayfa. Kolayca bakılır, yazdırılır veya kopyalanır:

| Sütun | Ne |
|---|---|
| İş Emri No · Tarih | referans |
| Müşteri · Taşeron | kimin işi |
| **Boş Tartım (kg)** | tır boş |
| **Dolu Tartım (kg)** | tır dolu |
| **NET (kg)** | fark, her zaman kg |
| **NET (ton)** | kg ÷ 1000 |
| Açıklama | araç / ölçüm notu |

> `NET (kg)` ve `NET (ton)` bu sayfada da **kilitli** — gizlenemez.

---

## ⭐ Ay Sonu Raporu

Her ay kapanışında tek bakışta her şeyi gösteren hazır paket. **6 sayfa:**

### 1. Özet — 15 kalem
| Kalem | Ne gösterir |
|---|---|
| İş emri adedi | Dönem içindeki iş sayısı |
| Toplam satış (TL) | Faturalanmamış dahil |
| Toplam net (kg) | + ton karşılığı |
| Kendi ekip maliyeti (TL) | `work_order_labor` |
| Taşeron maliyeti (TL) | `subcontractor_jobs` |
| Dışarıdan alınan malzeme (TL) | Müşteriden gelen dahil **değil** |
| **TOPLAM MALİYET (TL)** | Üç maliyetin toplamı |
| **DÖNEM KÂRI (TL)** | Satış − toplam maliyet |
| Kâr marjı (%) | Kâr / satış |
| Brüt bordro (TL) | Dönem bordrosu |
| Puan primi (TL) | Puan eşiği 70 üstü |
| Net ödenen bordro (TL) | |
| **Müşterilerden alacak (TL)** | Faturalanmış, tahsil edilmemiş |
| **Taşeronlara borç (TL)** | Onaylanmamamış faturalar dahil |
| Bekleyen tarih talebi | Müşteri portalından gelen |

### 2. Müşteri Kırılımı
Her müşteri için: iş adedi, net (kg **ve** ton), satış, maliyet kırılımı, kâr.
Satışa göre sıralı gelir.

### 3-7. İş Emirleri · Teklifler · Kâr Raporu · Puanlama · Bordro
O döneme filtrelenmiş hâlleri. Teklifler sayfası teklif → fatura
dönüşümünü takip etmek için ayrı durur.

---

## Sütun Gizleme

Her kapsamın **"Sütunlar"** butonu var. Açılan pencereden:

- Her sayfanın sütunlarını ayrı ayrı açıp kapatabilirsiniz
- **Tümü** / **Sadece zorunlu** hızlı butonları
- Sütun arama kutusu
- Seçiminiz **kaydedilir** — bir sonraki indirmeden aynı düzen gelir
- "Sütun tercihlerini sıfırla" ile temizlenir

### 🔒 Kilitli sütunlar

| Sütun | Neden kilitli |
|---|---|
| **NET (kg)** | Net ağırlık her zaman kg yazılır — projenin temel kuralı |
| **NET (ton)** | Excel hesabı için türetilmiş sütun (kg ÷ 1000) |

Bu ikisi gizlenemez. Kilit nedeni arayüzde yazılıdır.

### Neden sayfa bazlı?

Farklı sayfalarda aynı adlı sütunlar var (ör. "Not"). Seçim **sayfa bazlı**
saklanır; bir sayfada "Not"u gizlemek diğer sayfaları etkilemez.

---

## Dosya Hakkında

Gerçek `.xlsx` dosyasıdır — Excel, LibreOffice ve Google Sheets'te doğrudan açılır.

- Her sayfada **üst kısımda filtre çubuğu** var (Excel'in otomatik süzgeci)
- **Para sütunları** `#,##0.00 "₺"` biçiminde — **sembol sonda**, Türkçe standardı
  (Excel'in varsayılan `₺#,##0.00` biçimi **yoktur**, elle yazılır)
- **Ağırlık sütunları** `#,##0.##` biçiminde
- **Sütun genişlikleri** içeriğe göre ayarlanır
- Başlık satırı **dondurulur** (kaydırınca görünür kalır)
- Dosya adı tarih damgalı: `Veltron_all_2026-10-01-14-30-00.xlsx`

### Dövizli faturalar

Fatura sayfalarında para birimi ayrı sütunlarda durur:

| Sütun | Örnek |
|---|---|
| `Para Birimi` | `USD` |
| `Tutar (kayıt birimi)` | `1.250,00` |
| `Kur` | `49,0184` |
| `TL Karşılığı` | `61.273,00` |

Kur **fatura kesildiği günkü** değerle yazılır. Bugün kuru değişse bile
geçmiş fatura satırları **değişmez**. Detay: [DOVIZ-NASIL.md](DOVIZ-NASIL.md)

---

## 🏢 Logo ve Belge Başlığı

Her sayfanın sol üstünde **firma logosu** ve yanında evrak başlığı görünür.

```
┌─────────────┬──────────────────────────────────────────────┐
│             │ Veltron Endüstriyel Hizmetler A.Ş. — İŞ EMİRLERİ│
│   LOGO      ├──────────────────────────────────────────────┤
│             │ Oluşturma: 29.09.2026 · Veltron İş Takip     │
└─────────────┴──────────────────────────────────────────────┘
  Oru OSB 4. Cadde · Kocaeli · Tel: 0262... · info@... · Vergi No: ...
```

| | |
|---|---|
| **Logo nereden gelir?** | `Firma Profili` ekranından yüklenir (zaten orada mevcut) |
| **Nerede görünür?** | Dosyadaki **her sayfanın** sol üstünde |
| **Yanında ne var?** | Firma adı + evrak başlığı |
| **Altında ne var?** | Adres, şehir, telefon, e-posta, vergi numarası |
| **Oran bozulur mu?** | Hayır — logo en fazla 56 px yüksekliğe sığdırılır, en-boy oranı korunur |
| **Dosya boyutu** | Logo 13 KB ise dosya ~13 KB büyür (bir kez gömülür, tüm sayfalar paylaşır) |

### Açma / Kapama

`Belge başlığı` bölümündeki **"Logolu belge başlığı"** anahtarı.
Tercihiniz kaydedilir. Logo yoksa (Firma Profili'nde yüklenmemişse) anahtar
otomatik kapanır ve **"Firma Profili'nden logo yükle"** bağlantısı çıkar.

### Teknik

- Görsel boyutu PNG/JPEG/GIF başlıklarından okunur (harici kütüphane yok)
- `oneCellAnchor` + `noChangeAspect` → Excel'de taşırsan boyut değişmez
- Görsel dosyaya **bir kez** gömülür, sayfalar aynı kopyayı paylaşır
- Desteklenmeyen format veya bozuk veri gelirse **sessizce logolu devam eder**, hata vermez

---

## ⚠️ TARTIM KURALI EXCEL'DE DE KORUNUR

Bu, projedeki en kritik kurallardan biridir. Excel çıktısında da bozulmaz:

```
NET (kg) = Dolu Tartım (kg) − Boş Tartım (kg)
NET (ton) = NET (kg) ÷ 1000
```

| Sütun | Ne içerir |
|---|---|
| `Boş Tartım (kg)` | Tır boş tartımı |
| `Dolu Tartım (kg)` | Tır dolu tartımı |
| **`NET (kg)`** | **Her zaman kg.** Fiyatlandırma biriminden bağımsız |
| **`NET (ton)`** | Sadece Excel'de hesap yapmak için (kg ÷ 1000) |
| `Fiyat Birimi` | Ton / Kg — bu **fiyatlandırma** birimidir |

> **Ton fiyatı kullansanız bile** `NET (kg)` değerini elle değiştirmeyin.
> Excel'de `NET (ton)` sütunu zaten hazır gelir.

Bu kural `server/test/export.test.mjs` ile her test turunda otomatik doğrulanır.
Şu an 6/6 kayıt geçiyor.

---

## Eski CSV Dışa Aktarma

Liste ekranlarındaki **"CSV indir"** butonu duruyor. Farkı:

| | CSV indir | Excel'e Aktar |
|---|---|---|
| Kapsam | O anki sayfa | Tüm kayıtlar / tüm sistem |
| Format | Düz metin | Gerçek `.xlsx` |
| Biçimlendirme | Yok | Para, ağırlık, filtre, sütun genişliği |
| Türkçe karakter | Sorunlu olabilir | Sorunsuz |

**Tüm veri istiyorsanız → Excel'e Aktar ekranını kullanın.**

---

## Testler

```powershell
cd server
npm run test:export
```

**119 test.** Şunları doğrular:
- 15 sayfanın hepsi geliyor
- Ay sonu raporunun 7 sayfası ve 15 özet kalemi
- **Teklifler**: KDV = (ara toplam − indirim) × oran, toplam tutarlı (24 teklif)
- **Kâfiyye**: NET = Dolu − Boş, ton = kg ÷ 1000 (6 kayıt)
- Kâfiyyede de `net-kg` / `net-ton` kilitli
- `.xlsx` MIME tipi ve dosya adı doğru
- **Tartım kuralı** (NET = Dolu − Boş, ton = kg ÷ 1000) — logolu dosyada da
- Kâr = Satış − (Ekip + Taşeron + Malzeme)
- Para/ağırlık sütun biçimleri
- **Sütun gizleme**: seçilen geliyor, seçilmeyen gidiyor
- **Kilitli sütunlar gizlenemiyor**
- **Sayfa bazlı seçim** — bir sayfayı etkilerken diğerleri bozulmuyor
- `cols=none` → anlamlı hata (400), boş dosya üretilmiyor
- **Logo gömülüyor**, `logo=0` ile gömülmüyor
- Logolu dosyada **sütun başlıkları kaymıyor** (4. satırda kalıyor)
- İletişim bilgisi (telefon, vergi no) yazılıyor
- Geçersiz kapsam → 400, geçersiz dönem → 400 (`2026-99` reddediliyor)
- Yetkisiz istek → 401
- **Müşteri rolü Excel indiremiyor → 403** (mali sızıntı koruması)

---

## Sık Karşılaşılan Durumlar

| Durum | Açıklama |
|---|---|
| Dosya açılmıyor | Excel'de "Dene Düzelt" yerine dosyayı indirdiğin klasörden tekrar açın. Sıkışma değildir. |
| Logo görünmüyor | **Firma Profili**'ne logo yükleyip kaydet. Ayrıca indirmeden önce "Logolu belge başlığı" anahtarının açık olduğunu kontrol et. |
| Logo bulanık / bozuk | Çok büyük görsel yüklemeyin. Firma Profili 700 KB sınırı koyar. Şeffaf PNG yerine düz zeminli PNG/JPEG daha iyi görünür. |
| Logolu dosya çok büyük | Logoyu küçültün (yükseklik ~200 px yeterli) veya "Logolu belge başlığı" anahtarını kapatın. |
| Eski Excel açmıyor | `.xlsx` 2007+ gerektirir. Excel 2003 kullanıyorsanız LibreOffice ile açın veya CSV'yi tercih edin. |
| Tarih sütunları sayı görünüyor | Excel'de hücreyi seçip "Metin" biçimine çevirin. |
| "Yetki hatası" | Yönetici olmalısınız. Müşteri hesapları Excel indiremez (bilinçli). |
| Çok büyük dosya | `Tüm Veriler` yerine tek kapsam seçin veya dönem filtresi kullanın. |

---

*29 Eylül 2026 · ExcelJS ile üretilir*
