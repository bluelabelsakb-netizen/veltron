# Veltron Kullanım Kılavuzu

İş takip, tartım ve maliyet sisteminin kullanımı.

---

## Günlük Kullanım — 3 Adım

### 1. Programı aç
Masaüstündeki **Veltron - Tarayıcı** kısayoluna çift tıklayın.

> Sunucu kapalıysa önce **Veltron - Sunucuyu Başlat** kısayolunu çalıştırın.
> Bilgisayarınız açıkken **her zaman** açık olmalıdır.

### 2. İş emri aç
**İş Emirleri** → yeni iş emri → **Boş tartım** ve **Dolu tartım** değerlerini girin.

**Net otomatik hesaplanır.** Boş: `7.200` · Dolu: `21.450` → Net: `14.250 kg` = `14,25 ton`

> ⚠️ **Net ağır hiçbir zaman elle girilmez.** Kazara girilirse tutar yanlış çıkar.
> Program kendi hesaplar.

### 3. Faturayı kes
İş **"Teslim Edildi"** yapıldığında fatura **taslağı** otomatik oluşur.
**Faturalar** ekranından kontrol edip **Kes** butonuna basın.

---

## Temel Kavram: Tartım

İş emri iki tartımdan oluşur:

| | Ne zaman |
|---|---|
| **Boş tartım** | Tır yüklemeden önce (tır boş) |
| **Dolu tartım** | Malzeme yüklendikten sonra |

```
NET = Dolu − Boş     (her zaman kilogram cinsinden)
```

Tartım cihazından okuduğunuz değeri **kg** olarak girin. Program ton
dönüşümünü kendisi yapar.

---

## Fiyatlandırma

Fiyat birimi **Ton** veya **Kg** olabilir — ikisi de çalışır.

| Seçenek | Fiyat | Örnek (14.250 kg) |
|---|---|---|
| Ton | 5.000 ₺/ton | 14,25 × 5.000 = **71.250 ₺** |
| Kg | 5,00 ₺/kg | 14.250 × 5,00 = **71.250 ₺** |

Aynı sonuç, iki farklı yol.

---

## İş Kimse Bölündüyse

Bir işin bir kısmı **kendi ekibinize**, kalanı **taşerona** verilebilir.
İki durumda da miktar **kg** olarak girilir.

**İş Emri** detayında:
- **Alınan Malzeme** — dışarıdan aldığınız malzemeler (müşteriden gelen malzeme
  için **boş bırakın**, maliyeti zaten satış fiyatının içindedir)
- **İşi Kim Yaptı** — kendi personeliniz (saat × saat ücreti)
- **Taşeron** — dışarıdan yaptırdığınız iş (miktar × birim fiyat)

Program **Kâr**'ı otomatik hesaplar:
```
Kâr = Satış − (kendi ekip + taşeron + dışarıdan alınan malzeme)
```

---

## Tır Fotoğrafı

İş emri detayında **Tır Fotoğrafları** bölümünden fotoğraf yükleyin.
Tartım anında çekilen fotoğraf, sonradan çıkacak tartışmalarda kanıt olur.

Müşterileriniz kendi fotoğraflarını müşteri portalında görebilir.

---

## Müşteri Portalı

Müşterileriniz sisteme **girer**, kendi işlerinin durumunu görür ve
termin değişikliği talebi açabilir.

Talebi **siz onaylarsınız** (İş Emirleri ekranının üstündeki kutu). Onayladığınızda
termin otomatik güncellenir.

| Müşteri gösterir | Müşteri görmez |
|---|---|
| İş durumu, tarihler | Fiyat, tutar |
| Termin değişikliği talebi | Kâr, maliyet |
| Tır fotoğrafları | Maaş, bordro, taşeron |

---

## Maaş ve Puanlama

**Puanlama** ekranında dönem × personel × kriter matrisi doldurulur.
6 kriter, ağırlıklı puan otomatik hesaplanır.

**Maaş / Bordro** ekranında prim, mesai, vergi ve SGK hesaplanır.

Kurallar Excel'den birebir geldiği **değiştirilmemelidir**:

| Kural | Değer |
|---|---|
| Puan eşiği | 70 |
| Prim | (puan − 70) × 250 ₺ |
| Prim limiti | 5.000 ₺ |
| Vergi | %15 |
| SGK | %14 |
| Mesai | en fazla 120 saat × 0,4 |

---

## Şifremi Unuttum

Giriş ekranının altında **"Şifremi unuttum"** bağlantısı var.

1. Tıklayın, formu doldurun:
   - **Kullanıcı adınız** (zorunlu)
   - **Telefonunuz** (isteğe bağlı) — yöneticinin size nasıl ulaşacağını bilsin
   - **Açıklama** (isteğe bağlı)
2. **Talep Gönder**
3. Yönetici onaylarsa size bir **geçici şifre** verir
4. O şifreyle girersiniz, sistem sizi **kendi şifrenizi seçmeye zorlar**

**Aynı kullanıcı adı için 15 dakikada bir talep gönderebilirsiniz.**

> **Güvenlik:** Yeni şifreyi **siz seçmezsiniz**. Yönetici onaylamadan
> kimsenin şifresi değişmez. Bu, başkasının sizin adınıza talep atıp hesabı
> ele geçirmesini engeller.

---

## Dövizle Fatura Kesme

Fatura ekranında **Para birimi** seçeneği var: TL, USD, EUR, GBP, CHF ve
diğerleri.

- Tutarı **kendi para biriminizde** girin** (örn. `1.250,00 USD`)
- **Kur** alanını doldurmanıza gerek yok — sistem o günkü kuru kendisi
  bulur (TCMB'den otomatik gelir)
- Yanlışlıkla doldurmak isterseniz güncel kuru gösterir, değiştirebilirsiniz

**Önemli:** Geçen ay kesilen bir fatura, bugün kuru değişse bile **değişmez**.
Her fatura kendi kesildiği günün kurunda saklanır. Bu hesapta doğrudur.

Kurları görmek / düzeltmek için: **Yönetim → Döviz Kurları**.

---

## Excel'e Aktarma

**Yönetim → Excel'e Aktar**

Gerçek Excel dosyası indirilir — 15 sayfa, filtre çubuklu, para/ağırlık
biçimli, firmanızın logosu gömülü. Muhasebeye gönderebilirsiniz.

Ay sonunda **Ay Sonu Raporu** kapsamını seçin: özet, müşteri kırılımı,
işler, teklifler, kâr, puanlama ve bordro tek dosyada gelir.

> ⚠️ `NET (kg)` ve `NET (ton)` sütunları **kilitlidir**, gizlenemez.
> Bunlar tartımdan otomatik gelir, elle değiştirilmemelidir.

---

## Para Biçimi

Tutarlar Türkçe standardında, **sembol sonda** gösterilir:

```
1.134.180,91 ₺
```

**Büyük tutarlar gözle okunur yazılır.** Üstteki kutularda:

```
Toplam satış
1 milyon 24 bin ₺      ← bakışta okunur
1.024.866,87 ₺          ← kesin rakam, altında
```

| Tutar | Ekranda |
|---|---|
| 9.999 altı | tam rakam (`5.430,50 ₺`) |
| 747.217,74 | `747 bin ₺` |
| 1.024.866,87 | `1 milyon 24 bin ₺` |
| 1.320.000 | `1 milyon 320 bin ₺` |

Yüzdeler de Türkçe yazılır: `%72,9` (virgül).

> **Excel ve yazdırmada hep tam rakam çıkar.** Kısaltma sadece ekranda kullanılır,
> belgenin değeri değişmez.

---

## Sık Karşılaşılan Durumlar

| Durum | Çözüm |
|---|---|
| Sayfa açılmıyor | **Veltron - Sunucuyu Başlat**'a çift tıklayın |
| "Sunucuya ulaşılamıyor" | Sunucu kapalı. Yukarıdaki kısayolu çalıştırın |
| **Müşteri portalı boş ekran** | 1 Ekim 2026'da düzeltildi. Güncel sürümü kullandığınızdan emin olun |
| Şifre değiştirme ekranı çıkmıyor | Yönetici size geçici şifre vermiş — değiştirmeden sisteme giremezsiniz |
| Şifremi unuttum | Giriş ekranındaki **"Şifremi unuttum"** bağlantısını kullanın |
| Geçici şifre çalışmıyor | Büyük/küçük harfe dikkat. Yöneticinize tekrar ulaşın |
| Başka bilgisayardan açılmıyor | Aynı WiFi'da mı? Sunucu açık mı? `.env` içindeki `CORS_ORIGIN` satırına o bilgisayarın adresini ekleyin |
| Excel'de rakamlar saat gibi görünüyor | Hücreyi seçip "Metin" biçimine çevirin |
| Program yavaş | Binlerce kayıt varsa Excel'e aktarıp oradan çalışın |
| Faturaya dolar yazdım, tutar şaşırtıcı | Sekmede para birimini kontrol edin, **Kur** alanını boş bırakın |
| Döviz kuru yanlış görünüyor | **Yönetim → Döviz Kurları** → **Kurları Güncelle** |

---

## Günlük Rutin

| Ne zaman | Ne |
|---|---|
| Sabah | **Veltron - Sunucuyu Başlat** |
| Tır tartımı | İş emri aç → tartımları gir → fotoğraf çek |
| İş bitince | Durumu **Teslim Edildi** yap |
| Gün sonu | Fatura taslağını kontrol et, kes |
| Ay sonu | **Ay Sonu Raporu**'nu Excel'e aktar |

---

## Yedekleme

Veriler `server\data` klasöründe. Bu klasörü **periyodik olarak
masaüstüne kopyalayın** — bir klasör kopyası tüm sistemin yedeğidir.

Kaldırırken sihirbaz yedek almayı sorar.

---

*29 Eylül 2026*
