# Müşteri Portalı — Kullanım Kılavuzu

VuruşKAN ve benzeri müşteriler için sisteme giriş ve yetki modeli.

**Eklenme tarihi:** 29 Eylül 2026
**Düzeltme:** 1 Ekim 2026

> ## ⛔ 1 Ekim'de bulunan kritik hata
>
> Portal "bitti" denmişti ama **hiç açılmıyordu.** Müşteri giriş yapınca
> ekran tamamen boş kalıyordu — hiçbir işi, hiçbir faturayı göremiyordu.
>
> | | |
> |---|---|
> | Neden | `pages/portal/` altındaki **6 dosyanın hiçbirinde `default export` yoktu** |
> | Belirti | Giriş sonrası bomboş ekran, konsolda anlamsız hata (`Cannot convert object to primitive value`) |
> | Neden fark edilmedi | 69 API testi geçiyordu — API sağlamdı, sadece arayüz yüklenmiyordu |
> | Düzeltme | 6 dosyaya `export default` eklendi |
> | Koruma | `node test/lazy-export.test.mjs` — yeni ekran eklerken koş |
>
> **Demo verisi de eksikti:** VuruşKAN'ın 0 iş emri vardı, portala girince
> "Henüz iş emri yok" görüyordu. `demo-kur.js` artık VuruşKAN'ı iş emeri
> havuzunun başına ekliyor → **4 iş emri, 3 fatura** görünüyor.

---

## 1. İki ayrı hesap, iki ayrı görünüm

Bu iki hesap **birbirini göremez**. Arayüz tamamen farklıdır.

| | **vuruskan** | **vuruskan-mali** |
|---|---|---|
| Rol | `customer_progress` | `customer_finance` |
| Ekran | İşlerim + Tarih Taleplerim | Faturalarım |
| İş emirlerini görür | ✅ | ❌ |
| İş tarihi/durumu | ✅ | ❌ |
| **Faturaları görür** | **❌** | ✅ |
| Fatura tutarı / bakiye | ❌ | ✅ |
| Fiyat, tutar, tartım | ❌ | ❌ |
| Maliyet, kâr, taşeron | ❌ | ❌ |
| Maaş/bordro, personel | ❌ | ❌ |

> **Fatura görememe kuralı:** `vuruskan` hesabı sunucu tarafında 403 alır,
> sadece arayüzde gizlenmekle kalmaz. Ekranı zorlansa bile veri gelmez.
> `server/test/portal.test.mjs` bunu test eder.

---

## 2. Hesaplar nasıl açılır

### Yöntem A — Seed betiği (önerilen)

```powershell
cd server
node src/scripts/seed-portal.js
```

İşlem:
1. `VuruşKAN` adlı müşteri kaydını bulur, yoksa oluşturur
2. `vuruskan` (iş takip) hesabını açar/günceller
3. `vuruskan-mali` (mali) hesabını açar/günceller
4. Ekrana **geçici şifreler** yazar

**Şifreleri kalıcı yapmak için** `server/.env` içine ekleyin, betiği tekrar
çalıştırın:
```
PORTAL_PASSWORD_PROGRESS=IstediğinizSifre1
PORTAL_PASSWORD_FINANCE=IstediğinizSifre2
```
Sonra: `node src/scripts/seed-portal.js`

**Şifre değiştirmek için:** `node src/scripts/seed-portal.js --reset-password`

### Yöntem B — Kullanıcılar ekranından

1. **Kullanıcılar** → **Yeni Kullanıcı**
2. **Yetki** → `Müşteri - İş Takip` veya `Müşteri - Mali`
3. **Müşteri** → VuruşKAN'ı seçin *(müşteri rolünde zorunludur)*
4. Şifre belirleyin

---

## 3. Müşteri ne yapabilir?

### İş takip hesabı

**İşlerim ekranı**
- İş emri numarası, konu, durum, iş tarihi, termin
- Termin v临近 olduğunda ve geçtiğinde uyarı
- Toplam / devam eden / geciken / teslim edilen sayaçları
- **Tarih talebi** butonu (kapalı işlerde görünmez)

**Tarih talebi (termin değişikliği)**
1. İş emrindeki **Tarih talebi** butonuna bas
2. Yeni termin seç → yön otomatik belirlenir (önce/sonra)
3. **Sebep yaz** (en az 10 karakter) — nedenini açıkla
4. Gönder

**Tarih Taleplerim ekranı**
- Açtığı tüm talepler ve sonuçları
- Bekleyen taleplerde onay durumu
- Personelin yazdığı not görünür

> Müşteri **kendi talebini onaylayamaz.** Onay yetkisi sadece personeldedir.

### Mali hesap

- Fatura listesi: numara, tarih, vade, durum, toplam, ödenen, kalan
- Fatura detayı: kalemler, KDV, indirim, ödemeler
- Üstte üç sayaç: toplam fatura, faturalanan, ödenmemiş

---

## 4. Personel: talebi nasıl onaylarım?

**İş Emirleri** ekranının üstünde **Müşteri Tarih Talepleri** kutusu var.

- Bekleyen talepler turuncu rozetle listelenir
- **Onayla** → iş emrinin termini otomatik güncellenir
  **ve** erteleme kayıtlarına (mevcut izleme sistemine) bir satır düşer
- **Reddet** → müşteri gerekçeyi ve notunuzu görür
- Notunuz müşteriye iletilir (isteğe bağlı ama önerilir)
- İşlenmiş talepler altta gri listelenir

---

## 5. Güvenlik modeli

Tasarım **beyaz liste (whitelist)** mantığındadır:

```
/api/portal/*   ← SADECE müşteri rolleri erişebilir (her uç kendi rolünü kontrol eder)
/api/*           ← SADECE personel erişebilir (müşteri rolü 403 alır)
```

Mevcut modüllerin her birine filtre eklemek yerine **ayrı bir alan** açıldı.
Böylece ileride yeni bir iç modül eklendiğinde müşterinin onu görmesi
**teknik olarak imkânsız.** Yanlışlıkla açılma riski yok.

Ek güvenlik önlemleri:
- Portal sorguları **elle yazılmıştır**; `work_order_summary` gibi mali sütun
  içeren genel görünümler **kullanılmaz**
- Her sorgu `WHERE customer_id = ?` ile başlar
- Başka müşterinin kaydına erişim **404** döner (403 değil → varlık sızdırmaz)
- `customer_id` JWT'ye gömülmez; her istekte veritabanından okunur.
  Kullanıcı müşteriden çıkarıldığında eski oturumla bile veri sızmaz
- Müşteri hesabı **yazma yetkisi yoktur** (POST/PUT/DELETE → 403)

### Testler

```powershell
cd server
node test/portal.test.mjs
```

**68 test**, 10 bölüm: oturum, iç modül engeli, mali sızıntı kontrolü, fatura
görüntüsü, satır seviyesi yalıtım, tarih talebi akışı, durum geçmişi, devre
dışı hesap, hesap doğrulama, temizlik.

---

## 6. Sık karşılaşılan durumlar

| Durum | Açıklama |
|---|---|
| Portal boş liste gösteriyor | Kullanıcıya müşteri seçilmemiştir. Kullanıcılar ekranından `Müşteri` alanını doldurun. |
| "Bu bölüme erişim yetkiniz yok" | Hesap müşteri rolünde ama `/api` üzerinden erişmeye çalışıldı. Beklenen davranış; arayüz zaten portalı açmalı. |
| "Müşteri rolündeki kullanıcıya müşteri seçilmeli" | Müşteri rolü seçilmiş ama müşteri kaydı seçilmemiş. |
| Bekleyen talep varken yeni talep açılamıyor | Önce mevcut talep sonuçlanmalı. Beklenen davranış. |
| "Bu iş emrinin henüz termini yok" | Termini olmayan iş için tarih talebi açılamaz. |
| Termin değişikliği uygulanmadı | Onaylanmadı. Müşteri kendi talebini onaylayamaz. |
| Siyah ekran | Sunucu kapalı. `Sunucuyu-Kur.bat` çalıştırın. Müşteri hesabında da aynı geçerlidir. |

---

## 7. Ekip erişimi (uzaktan)

Müşteri de aynı sunucuya bağlanır:

- Electron açılışında sunucu adresi sorulur: `http://192.168.1.100:4000`
- Sunucu `0.0.0.0:4000` dinlemeli
- Windows Güvenlik Duvarı'nda **4000 portu** açık olmalı
- VuruşKAN kendi bilgisayarına kurulum yapmadan **tarayıcıyla** da
  girebilir (sunucu arayüzü de sunar) — adres: `http://SUNUCU-IP:4000`

---

*Detaylı güvenlik notları: `AI-DEVIR.md` · Sunucu uçları: `server/src/routes/portal.js`*
