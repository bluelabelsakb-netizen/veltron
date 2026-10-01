# Döviz (Çoklu Para Birimi) Rehberi

Yurt dışı işlerde USD / EUR ile fatura kesme.

---

## Temel Kural: Kayıt Birimi + Kur

Tutar **kendi para biriminde** saklanır, TL karşılığı kurdan hesaplanır.

```
Fatura: 1.250,00 USD   ·   Kur: 49,0184   ·   TL karşılığı: 61.273,00 ₺
```

**Neden bu sıra?** Çünkü muhasebe açısından zorunlu:

- Bugün kuru 49,00
- Yarın kuru 52,00 olsun
- **Geçen ay kesilen fatura DEĞİŞMEZ** — kendi gününün kurunda kalır

Yani "geçen ay ne kadar kazandık" sorusunun cevabı hep doğru kalır. Eğer tutarı
TL'de tutup kuru değişince güncellesen, geçmiş rakamlar sessizce bozulurdu.

---

## Kur Nereden Geliyor?

**TCMB (Türkiye Cumhuriyet Merkez Bankası)** — resmî kaynak.

- `https://www.tcmb.gov.tr/kurlar/today.xml`
- Sunucu **açılırken otomatik** bir kez çekilir
- Aynı güne ait kayıt varsa **güncellenir** (üstüne yeni kayıt açılmaz)
- Sistemde her gün birden fazla çalışsa bile tablo şişmez

### Neden haremaltın değil?

Haremaltın'ın kurları yalnızca tarayıcıda JavaScript çalışınca oluşuyor:
- Sayfa HTML'inde değerler boş (`-`) geliyor
- WebSocket (`wss://hrmsocketonly.haremaltin.com:443`) ile dolduruluyor
- Node'dan bu WebSocket reddediliyor
- `/api/*`, `/ajax/*` yollarının hepsi 404

Yani sunucu tarafından kullanılabilir bir uç vermiyor. Kullanıcı isteğiyle
başka kaynağa geçilmedi.

### TCMB saatleri

TCMB her **iş günü 15:30'da** yayımlar. Hafta sonu ve resmi tatillerde
dosya bir önceki iş gününün tarihini taşır — **bu normaldir**, sistem o tarihe
kaydı yazar.

---

## Elle Kur Girmek

**Yönetim → Döviz Kurları** ekranından:
- USD ve EUR kartları
- Tek tek elle yazıp **Kaydet**
- Tüm para birimleri listelenir
- Son 30 günlük geçmiş görülür

İşlem yapmadan önce kura **ihtiyacın yok** — kur yazılmamışsa sistem uyarı
verir, uydurma kur kullanmaz.

---

## Faturada Kullanım

**Faturalar → Yeni Fatura** ekranında:

| Alan | Ne |
|---|---|
| **Para birimi** | TRY / USD / EUR / GBP / CHF / JPY / RUB / AED / SAR / CNY / CAD / AUD |
| **Kur (1 birim = ? TL)** | Boş bırakılırsa o tarihe ait son kayıtlı kur kullanılır |

12 para birimi tanımlı (`npm run seed-currency` ile eklenir).

---

## Teknik Notlar (geliştirici için)

| Konu | Yer |
|---|---|
| Tablolar | `currencies`, `exchange_rates` (`schema.sql`) |
| Yardımcılar | `server/src/utils/currency.js` |
| Çekme | `server/src/utils/fxFetch.js` |
| API | `server/src/routes/currency.js` |
| Tarih ayrıştırma | `isoTarih()` — TCMB `30.09.2026` **ve** `09/30/2026` gönderebiliyor |

### Kritik tuzak: tarih biçimi

TCMB'nin `<Tarih Date="...">` alanı **biçime göre değişiyor**:

| Gelen | Saklanmalı |
|---|---|
| `30.09.2026` | `2026-09-30` |
| `09/30/2026` | `2026-09-30` |

Ham değeri yazarsan tabloda iki farklı biçim oluşur ve
`WHERE rate_date <= ?` karşılaştırması bozulur (string karşılaştırması).
**Bu hata yapıldı, düzeltildi.** `isoTarih()` her iki biçimi de çevirir.

### Kur bulunamazsa

`kur()` **1 döndürmez, 0 döner.** Böylece sessizce yanlış tutar üretilmez;
arayüz "kur girilmemiş" uyarısı gösterir.

### NOT NULL tuzağı

`invoices.currency` ve `invoices.exchange_rate` NOT NULL'dur. INSERT'te
`null` yazılırsa 500 verir — `routes/invoices.js` içinde `kur()` ile güvenli
varsayılan atanır. **Bu hata yapıldı, düzeltildi.**

---

*29 Eylül 2026*