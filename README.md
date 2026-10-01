# Veltron — İş Takip ve Yönetim Sistemi

Veltron firması için geliştirilmiş, masaüstü (Windows) üzerinde çalışan iş takip sistemi.

Ekip, şirket sunucusundaki tek veritabanına bağlanarak çalışır; veri tek yerde toplanır,
herkes aynı projeyi, görevi, teklifi, faturayı ve stok durumunu görür.

---

## 📌 Önce Bunu Oku

| Ne arıyorsan | Dosya |
|---|---|
| **Bu projeyi ilk kez görüyorsan** | [`AI-DEVIR.md`](AI-DEVIR.md) |
| Başka bilgisayara taşıyorsan | [`TASIMA-KILAVUZU.md`](TASIMA-KILAVUZU.md) |
| Müşteri portalı (VuruşKAN) | [`MUSTERI-PORTALI.md`](MUSTERI-PORTALI.md) |
| Excel'e veri çekme | [`EXCEL-EXPORT.md`](EXCEL-EXPORT.md) |
| Aileye / dışarıya açma | [`AILE-ERISIMI.md`](AILE-ERISIMI.md) |
| Güvenlik denetimi | [`GUVENLIK-DENETIMI.md`](GUVENLIK-DENETIMI.md) |
| Demo modu / satış gösterimi | [`DEMO-MODU.md`](DEMO-MODU.md) |
| Müşteriye kurulum paketi | [`KURULUM-KEVUZU.md`](KURULUM-KEVUZU.md) |
| Güncel durum ve iş kuralları | [`PROJE-DURUMU.md`](PROJE-DURUMU.md) |
| Ayrıntılı tarihçe | [`DEV-NOTES.md`](DEV-NOTES.md) |

---

## İçindekiler

1. [Hızlı Başlangıç](#hızlı-başlangıç)
2. [Sistemin Modülleri](#sistemin-modülleri)
3. [Kurulum](#kurulum)
4. [Ekip İçin Dağıtım](#ekip-icin-dağıtım)
5. [Günlük Kullanım](#günlük-kullanım)
6. [Güvenlik](#güvenlik)
7. [Yedekleme](#yedekleme)
8. [Proje Yapısı](#proje-yapısı)
9. [Sorun Giderme](#sorun-giderme)

### Ayrıntılı kılavuzlar

| Dosya | Konu |
|---|---|
| [`AI-DEVIR.md`](AI-DEVIR.md) | **Yapay zekâ için devir kılavuzu** — tuzaklar, kurallar, proje yapısı |
| [`LISANS-PLANI.md`](LISANS-PLANI.md) | Lisans modeli, ⏰ sonra konuşulacaklar, güvenlik uyarısı |
| [`SIFRE-SIFIRLAMA.md`](SIFRE-SIFIRLAMA.md) | Şifresini unutan kullanıcı, yönetici onayı, Telegram bildirimi |
| [`DOVIZ-NASIL.md`](DOVIZ-NASIL.md) | Döviz kurları, TCMB, geçmiş fatura koruması |
| [`EXCEL-EXPORT.md`](EXCEL-EXPORT.md) | Excel dışa aktarma, sayfalar, sütun gizleme |
| [`MUSTERI-PORTALI.md`](MUSTERI-PORTALI.md) | Müşteri portalı, roller, termin talebi |
| [`DEMO-MODU.md`](DEMO-MODU.md) | Demo modu ve lisanslama |
| [`GUVENLIK-DENETIMI.md`](GUVENLIK-DENETIMI.md) | Güvenlik denetimi sonuçları |
| [`AILE-ERISIMI.md`](AILE-ERISIMI.md) | Cloudflare Tunnel ile aile erişimi |
| [`KURULUM-KEVUZU.md`](KURULUM-KEVUZU.md) | Kurulum paketi |
| [`PROJE-DURUMU.md`](PROJE-DURUMU.md) | Yapılanlar / sıradakiler |
| [`server/src/docs/PUAN-MAAS-KURALLARI.md`](server/src/docs/PUAN-MAAS-KURALLARI.md) | Puan ve maaş hesaplama kuralları |

---

## Hızlı Başlangıç

Gereksinimler: **Node.js 20+** (Node 22/25 önerilir). Başka bir şey gerekmez —
veritabanı SQLite'tır, ayrıca kurulmaz.

```bash
# 1. Kurulum (bir kez)
cd veltron
npm install

# 2. Sunucuyu başlat
npm run dev:server

# 3. Masaüstü uygulamasını başlat (ayrı bir terminalde)
npm run dev:app
```

Aynı anda ikisini çalıştırmak için:

```bash
npm run dev
```

**İlk giriş:** `admin` / şifre `.env` içindeki `ADMIN_PASSWORD` değeridir.
Yönetici hesabı mutlaka değiştirilmelidir (`Ayarlar → Şifre Değiştir`).

### Örnek veriyle denemek

Sistemi boş bir veritabanıyla değil, gerçekçi örnek kayıtlarla görmek isterseniz:

```bash
npm run reset-db --workspace server      # mevcut verileri siler (yedek alır)
node server/src/seed.js --demo           # 5 müşteri, 6 proje, 12 görev, teklif/fatura/stok örnekleri
```

---

## Sistemin Modülleri

### 1. Panel (Genel Bakış)
Aktif proje, açık/geciken görev, faturalanan ve tahsilat tutarları, alacak, bekleyen
teklif ve kritik stok sayıları. 12 aylık faturalama/tahsilat grafiği, proje ve görev
durum dağılımları, çalışan yükü, en çok kazandıran müşteriler, yaklaşan terminler ve
son hareketler.

### 2. Görev Takibi
- **Pano görünümü:** Yapılacak → Devam Ediyor → Kontrol → Tamamlandı → İptal sütunları.
  Kartı sürükleyerek durumu değiştirebilirsiniz.
- **Liste görünümü:** Proje, sorumlu, durum, öncelik ve termine göre filtreleme.
- Tahmini/harcanan saat takibi, gecikmeyen otomatik işaretleme.

### 3. Projeler
Proje kodu otomatik üretilir (`PRJ-2026-0001`). Bütçe ve gerçekleşen maliyet
karşılaştırması, görev ilerlemesi, sorumlu ve müşteri bağlantısı. Proje satırına
tıklayınca proje detayı, bütçe durumu ve görev listesi açılır; oradan hızlı görev
eklenebilir ve görevler tamamlanabilir.

### 4. Müşteriler
Bayi/şahıs ayrımı, vergi bilgileri, iletişim kayıtları. Silmek yerine **pasifleştirilir**
— geçmiş fatura ve proje bağlantıları korunur.

### 5. Teklifler
Kalem bazlı fiyatlandırma (ürün seçimi açıklama, birim ve fiyatı otomatik doldurur),
indirim ve KDV oranı, geçerlilik tarihi. Teklif durumu (taslak → gönderildi → kabul/red)
izlenir. Kabul edilen teklif tek tıkla ** faturaya dönüştürülür**; kalemler ve tutarlar
otomatik aktarılır.

### 6. Faturalar ve Tahsilat
- Fatura kesme, kalem, indirim, KDV, vade tarihi
- **Yazdırma / PDF:** Fatura ve teklif ekranlarında **Yazdır** düğmesi. A4 dikey çıktı:
  firma başlığı (logo, unvan, vergi dairesi, adres, iletişim), taraflar, kalem tablosu
  (stok kodu ile), toplamlar, banka/IBAN, imza alanları ve evrak altı notu.
  Tarayıcıda "PDF olarak kaydet" ile de dosya alabilirsiniz.
- **Kısmi tahsilat:** ödeme kaydı girildikçe kalan bakiye ve durum otomatik güncellenir
  (`Kısmi Tahsilat` / `Ödendi` / `Vadesi Geçti`)
- Tahsilatı olan fatura silinemez; ödeme kaydı geri alınabilir
- Vadesi geçenlerin toplamı panelde ve kenar çubuğunda görünür

#### Döviz (yabancı para birimi)

Fatura tutarı **kendi para biriminde** saklanır (USD, EUR, GBP, CHF… 12 seçenek),
TL karşılığı o günkü kurla hesaplanır. Böylece kuru değişse bile **geçmiş fatura
bozulmaz** — her fatura kesildiği günün kurunda kalır.

- Kurlar **TCMB'den** (Türkiye Cumhuriyet Merkez Bankası) otomatik gelir.
  Sunucu açılırken bir kez çekilir, günde bir.
- Elle düzeltmek ve geçmişi görmek için: **Yönetim → Döviz Kurları** (`#/doviz`)
- **Kurları Güncelle** düğmesi anında çeker
- Kur yazılmamışsa sistem uydurma kur kullanmaz — uyarı verir

Detay: [DOVIZ-NASIL.md](DOVIZ-NASIL.md)

### 7. Firma Profili
Sol menüde **Yönetim → Firma Profili**. Teklif ve fatura evraklarında kullanılan
başlık bilgileri buradan yönetilir:

- Ünvan, kısa ad, slogan, **logo** (PNG/JPG/SVG, 700 KB'a kadar)
- Vergi dairesi, VKN
- Adres, il, telefon, e-posta, web sitesi
- Banka adı ve **IBAN** (evrakta banka bilgileri bölümünde çıkar)
- Varsayılan KDV oranı, ödeme vadesi
- Fatura / teklif / iş emri numara ön ekleri
- Evrak altı notu

Sağdaki canlı önizleme, ayarladıkça evrak başlığını anında gösterir.
Bu alanlar doldurulmadan basılı bir evrak alınamaz. Yalnızca yöneticiler düzenleyebilir.

### 8. Çalışanlar
Personel bilgileri, görev yükü (açık/tamamlanan/geciken görev sayısı), harcanan saat,
yönettiği proje sayısı, maaş.

### 9. Ürün ve Malzeme
Stok kartı, minimum stok seviyesi, birim fiyat, stok değeri. Stok miktarı hareket
kayıtlarından hesaplanır; kritik seviyeye düşen ürünler kırmızı işaretlenir.

### 10. Stok Hareketleri
Giriş / çıkış / sayım düzeltme. **Sayım** ekranı, fiziksel sayım sonucunu girip farkı
otomatik düzeltme olarak kaydeder. Negatif stoka düşülmesi engellenir. Her hareketin
kim tarafından, ne zaman ve hangi referansla yapıldığı kayıt altındadır.

### 11. Kullanıcılar (Yönetici)
Hesap oluşturma, yetki atama (Yönetici / Kullanıcı), şifre sıfırlama, hesap devre dışı
bırakma. Sistemde en az bir aktif yönetici kalması zorunludur.

### 12. Aktivite Kaydı
Sistemde yapılan her değişiklik (oluşturma, güncelleme, silme, giriş) kullanıcı ve
zaman bilgisiyle kaydedilir. Varlık ve işlem türüne göre filtrelenebilir.

### 13. Döviz Kurları
**Yönetim → Döviz Kurları** (`#/doviz`). USD ve EUR kartları, elle düzeltme,
tüm para birimleri ve son 30 günlük kur geçmişi. Detay:
[DOVIZ-NASIL.md](DOVIZ-NASIL.md)

### 14. Puanlama (Skor)
Dönem × personel × kriter matrisi. Ağırlıklı puan hesaplanır, prim önizlemesi
gösterilir. Prim kuralı Excel ile birebir: puan eşiği **70**, prim
`(puan − 70) × 250 ₺`, **limit 5000 ₺**. Detay: `server/src/docs/PUAN-MAAS-KURALLARI.md`

### 15. Excel'e Aktar
**Yönetim → Excel'e Aktar**. Gerçek `.xlsx`, 15 sayfa, logo gömülü, sayfa bazlı
sütun gizleme. `NET (kg)` ve `NET (ton)` sütunları kilitlidir.
Detay: [EXCEL-EXPORT.md](EXCEL-EXPORT.md)

### 16. Şifre Talepleri
**Yönetim → Şifre Talepleri**. Giriş ekranından gelen "Şifremi unuttum"
taleplerini görürsünüz. Bekleyen varsa menüde kırmızı rozet çıkar.

- **Onayla** → sistem 12 karakterlik **geçici şifre** üretir
- Kullanıcı o şifreyle girince **kendi şifresini seçmeye zorlanır**
- **Reddet** → hesabın şifresi değişmez

> ⛔ Onaylamadan önce düşünün: bu istek gerçek kullanıcıdan gelmeyebilir.
> Emin değilseniz reddedin ve arayın. Yeni şifreyi **kullanıcı seçmez** —
> onay sizde olduğu için.

Detay: [SIFRE-SIFIRLAMA.md](SIFRE-SIFIRLAMA.md)

---

## Kurulum

### Geliştirme / ofis içi kullanım

```bash
npm install
npm run dev:server      # API + veritabanı (port 4000)
npm run dev:app         # Electron masaüstü arayüzü
```

### Windows kurulum paketi üretme

```bash
npm run build           # arayüzü derler
npm run dist            # .exe kurulum dosyası üretir
```

Çıktı: `app/release/Veltron Takip Setup 1.0.0.exe`

### Sunucu ayarları

`server/.env.example` dosyasını `server/.env` olarak kopyalayıp düzenleyin:

```bash
cp server/.env.example server/.env     # Windows PowerShell: Copy-Item
```

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `HOST` | Dinlenecek adres. `0.0.0.0` = yerel ağdaki herkes erişir | `0.0.0.0` |
| `PORT` | Port | `4000` |
| `JWT_SECRET` | **Mutlaka değiştirin.** Rastgele üretmek için:<br>`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | varsayılan |
| `TOKEN_TTL` | Oturum geçerlilik süresi | `12h` |
| `DB_FILE` | Veritabanı dosya yolu | `server/data/veltron.db` |
| `ADMIN_USERNAME` | İlk yönetici | `admin` |
| `ADMIN_PASSWORD` | İlk yönetici şifresi | `demo1234` (geçici — **değiştir!**) |
| `TELEGRAM_BOT_TOKEN` | Şifre sıfırlama bildirimi (opsiyonel) | — |
| `TELEGRAM_CHAT_ID` | Telegram sohbet numarası (opsiyonel) | — |

> **Önemli:** `JWT_SECRET` değiştirilmezse oturum jetonları tahmin edilebilir olur.
> Uzak erişim kullanacaksanız mutlaka değiştirin. Değiştirdikten sonra
> herkesin tekrar giriş yapması gerekir.

---

## Ekip İçin Dağıtım

Veltron iki parçadan oluşur: **sunucu** (veriyi tutar) ve **istemci** (arayüz).

```
   Şirket Sunucusu (sürekli açık bir bilgisayar)
   └── veltron/server  →  veritabanı + API
        ▲          ▲
        │          │
   Ekip PC 1   Ekip PC 2   ...   (her birinde Veltron Takip.exe)
```

### Adım 1 — Sunucuyu kurun

1. `veltron` klasörünü sürekli açık kalacak bir bilgisayara kopyalayın
   (ofis sunucusu, masaüstü PC veya bir VPS önerilir).
2. `.env` dosyasını oluşturup `JWT_SECRET` değerini değiştirin.
3. `npm install` ve `npm run build` çalıştırın.
4. `npm run start --workspace server` ile sunucuyu başlatın.

Başlangıçta konsol, yerel ağ adresinizi gösterir:

```
   Bu bilgisayarda : http://localhost:4000
   Yerel ag (LAN)   : http://192.168.1.100:4000
```

### Adım 2 — Windows Güvenlik Duvarı

Yalnızca özel (özel/local) ağlardan erişime izin verin:

```powershell
New-NetFirewallRule -DisplayName "Veltron Sunucu 4000" -Direction Inbound -LocalPort 4000 -Protocol TCP -Profile Private
```

### Adım 3 — Kurulum paketini ekibe dağıtın

`app/release/Veltron Takip Setup 1.0.0.exe` dosyasını ekip bilgisayarlarına kurun.

### Adım 4 — Sunucu adresini girin

Her bilgisayarda uygulamayı açtığınızda:

- Sunucu aynı bilgisayardaysa: `http://localhost:4000` (otomatik gelir)
- Başka bir bilgisayardaysa: giriş ekranındaki **"Sunucu adresini değiştir"** bağlantısına
  tıklayıp `http://192.168.1.100:4000` yazın. Uygulama adresi kaydeder ve bağlantıyı test eder.

Adres bir kez girildikten sonra unutulur. Ayar dosyası:
`%APPDATA%\veltron\veltron-config.json`

### Adım 5 — Hesapları oluşturun

Yönetici olarak giriş yapın → **Kullanıcılar** → her ekip üyesi için hesap açın ve
şifreyi güvenli bir kanaldan iletin.

### İnternetten erişim (isteğe bağlı)

Ofis dışından erişmek için en güvenli yol, sunucuyu bir VPS'e taşıyıp **VPN**
(WireGuard/Tailscale) ile korumaktır. Doğrudan port yönlendirme yapacaksanız mutlaka:

- `JWT_SECRET` değiştirilmiş olmalı
- `CORS_ORIGIN` gerçek adresle sınırlandırılmalı
- HTTPS (nginx/Caddy) arkasında çalıştırılmalı

---

## Günlük Kullanım

### Önerilen iş akışı

1. **Müşteri** ekleyin
2. **Proje** açın, müşteri ve sorumluyu atayın, termin ve bütçe girin
3. Proje detayından **görev** oluşturun; görev panosunda durumları ilerletin
4. Fiyatı belirlerseniz **teklif** hazırlayın → müşteri onayı → **faturaya dönüştürün**
5. Fatura kesildikçe **tahsilat** kayıtlarını girin
6. Malzeme ihtiyacı için **stok girişi/çıkışı** veya **sayım** yapın
7. Haftalık periyodik sayım için `Stok Hareketleri → Sayım` ekranını kullanın

### Kısayollar ve küçük incelikler

- Listelerde sütun başlıklarına tıklayarak sıralayabilirsiniz
- Her listenin sağ altında **CSV indir** ile Excel'e aktarabilirsiniz
- Tüm tutarlar Türkçe biçimde gösterilir (₺1.234,56); büyük tutarlar kısaltılır
- Termin yaklaşan görevler "3 gün kaldı", gecikenler "5 gün gecikti" olarak işaretlenir
- Pencere simge durumuna ve boyutuna hatırlar

---

## Güvenlik

| Önlem | Durum |
|---|---|
| Şifreler | bcrypt ile geri döndürülemez biçimde saklanır |
| Oturum | JWT, 12 saat geçerli; süre dolunca yeniden giriş istenir |
| Yetkilendirme | Her istek jeton doğrulamasından geçer; yönetici-only uçlar kontrol edilir |
| Giriş denemesi | Hatalı girişte "kullanıcı yok" ile "şifre yanlış" ayrımı yapılmaz |
| Enjeksiyon | Tüm sorgular parametrelidir; sıralama sütunları beyaz listelidir |
| Doğrulama | Sunucu tarafında zod ile şema doğrulama (istemci doğrulamasına güvenilmez) |
| Pencere | `contextIsolation` açık, `nodeIntegration` kapalı, `sandbox` açık |
| İçerik | Uygulama kendi `app://` protokolünden servis edilir, sıkı CSP uygulanır |
| En az yetki | Sistemde en az bir aktif yönetici kalması zorunlu |

### Yapılması gerekenler

1. `JWT_SECRET` değerini değiştirin
2. `admin` şifresini değiştirin
3. Her kullanıcıya ayrı hesap açın (paylaşılan hesap kullanmayın)
4. Windows Güvenlik Duvarı'nda yalnızca özel ağa izin verin

---

## Yedekleme

Tüm veriler tek dosyada toplanır:

```
veltron/server/data/veltron.db
```

**Yedek almak için sunucuyu durdurmadan bu dosyayı kopyalayın** (SQLite WAL modunda
çalışır, bu yüzden en güvenlisi `veltron.db`, `veltron.db-wal`, `veltron.db-shal` dosyalarının
birlikte alınmasıdır).

Günlük yedek için basit bir zamanlanmış görev:

```powershell
# Yedekle-Hepsi.ps1
$src = "C:\Veltron\server\data"
$dst = "D:\Veltron-Yedek"
$stamp = Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force -Path "$dst\$stamp" | Out-Null
Copy-Item "$src\veltron.db*" "$dst\$stamp\"
Copy-Item "C:\Veltron\server\.env" "$dst\$stamp\"
```

```powershell
# Görev Zamanlayıcı ile her gece 02:00'de çalıştırın
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-File C:\Veltron\Yedekle-Hepsi.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "Veltron Yedek" -Action $action -Trigger $trigger
```

**Geri yükleme:** Sunucuyu durdurun, `veltron.db` dosyalarını geri kopyalayın, sunucuyu başlatın.

---

## Proje Yapısı

```
veltron/
├── package.json              # çalışma alanı (workspace) tanımları
│
├── server/                   # ── SUNUCU ──
│   ├── src/
│   │   ├── index.js          # Express uygulaması, statik servis, başlatma
│   │   ├── config.js         # ortam değişkenleri
│   │   ├── db.js             # SQLite bağlantısı, sorgu yardımcıları, transaction
│   │   ├── schema.sql        # tüm tablolar, görünüm ve indeksler
│   │   ├── seed.js           # yönetici hesabı + --demo örnek veri
│   │   ├── middleware/
│   │   │   ├── auth.js       # JWT doğrulama, yönetici kontrolü
│   │   │   └── error.js      # hata yakalama, doğrulama hataları
│   │   ├── routes/           # her modül için REST uçları
│   │   ├── utils/
│   │   │   ├── crud.js       # tekrarlı CRUD kodunu tek yerde toplar
│   │   │   ├── documents.js  # teklif/fatura kalem ve toplam hesabı
│   │   │   ├── fields.js     # yeniden kullanılan doğrulama şemaları
│   │   │   └── http.js       # hata sınıfları, sayfalama, güvenli sıralama
│   │   └── scripts/
│   │       └── reset-db.js   # yedek alıp veritabanını sıfırlar
│   ├── test/
│   │   ├── tum-testler.mjs     # koşucu: sunucuyu başlatır, 7 dosyayı koşar
│   │   ├── smoke.mjs           # 57 · payroll 32 · portal 69 · export 119
│   │   ├── attachments 31 · demo 23 · import 24
│   │   └── _yardimci.js        # ortak test yardımcısı (API_BASE, TEST_HEADERS)
│   └── data/veltron.db       # veritabanı (depoya girmez)
│
└── app/                      # ── MASAÜSTÜ İSTEMCİSİ ──
    ├── electron/
    │   ├── main.mjs          # ana süreç, app:// protokolü, ayarlar, IPC
    │   └── preload.cjs       # güvenli köprü (sandbox uyumlu)
    └── src/
        ├── main.jsx          # React giriş noktası
        ├── App.jsx           # yönlendirme ve oturum kapısı
        ├── lib/api.js        # API istemcisi, biçimlendirme, durum sözlüğü
        ├── context/          # oturum ve referans veri sağlayıcıları
        ├── components/       # Layout, DataTable, Form, Modal, ResourcePage...
        └── pages/            # her modülün ekranı
```

### Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Sunucu + arayüz birlikte (geliştirme) |
| `npm run dev:server` | Yalnızca sunucu (--watch ile) |
| `npm run dev:app` | Yalnızca Electron arayüzü |
| `npm run build` | Arayüzü üretim için derler |
| `npm run dist` | Windows kurulum paketi (.exe) üretir |
| `npm start` | Sunucuyu çalıştırır |
| `npm test --workspace server` | **Tüm testleri koşar (355)** — sunucuyu kendisi başlatır |
| `npm run reset-db --workspace server` | Yedek alıp veritabanını sıfırlar |
| `npm run demo-kur --workspace server -- --temiz` | Demo verisini kurar |
| `npm run security-audit --workspace server` | Güvenlik denetimi |
| `npm run kurulum-paketi --workspace server -- --zip` | Kurulum paketi (.zip) üretir |
| `node server/src/seed.js --demo` | Örnek veri yükler |
| `node server/src/seed.js --sifre yenisifre` | Yönetici şifresini değiştirir |

### Testler

```bash
npm test --workspace server      # 355 test (7 dosya), ~6 saniye
node test/chartScale.test.mjs    # 23 grafik testi
```

`npm test` **sunucuyu kendisi başlatır** ve bitince kapatır — ayrıca
`npm start` çalıştırmana gerek yok. Tek tek çalıştırmak istersen
(`npm run test:smoke`, `test:payroll`, `test:portal`, `test:export`,
`test:attachments`, `test:demo`, `test:import`) sunucunun **açık**
olması gerekir.

---

### Para Biçimi

Tutarlar Türkçe standardında, **sembol sonda** gösterilir:

```
1.134.180,91 ₺
```

**Büyük rakamlar gözle okunur yazılır** — KPI kartlarında:

```
Toplam satış
1 milyon 24 bin ₺      ← bakışta okunur
1.024.866,87 ₺          ← kesin rakam, altta
```

| Tutar | Gösterim |
|---|---|
| 9.999 altı | tam rakam (`5.430,50 ₺`) |
| 747.217,74 | `747 bin ₺` |
| 1.024.866,87 | `1 milyon 24 bin ₺` |
| 1.320.000 | `1 milyon 320 bin ₺` |
| 2.450.000.000 | `2 milyar 450 milyon ₺` |

En fazla 2 birim yazılır (milyar/milyon/bin). Grafik ekseninde daha kısa
hâli kullanılır: `100 bin ₺`, `1,2 M ₺`. Yüzdeler de Türkçe: `%72,9`.

---

## Sorun Giderme

### "Sunucuya ulaşılamadı"
1. Sunucunun çalıştığını doğrulayın: `curl http://<sunucu-ip>:4000/api/health`
2. Windows Güvenlik Duvarı'nda 4000 portuna izin verin
3. Her iki bilgisayarın **aynı ağda** olduğundan emin olun
4. Sunucu adresinde `localhost` yerine sunucunun **IP adresini** kullanın
5. Kullanıcı adresi doğruysa sunucu bilgisayarında VPN/proxy kullanılıyor olabilir

### "Oturum güncel değil veya sürekli çıkıyor"
- Sunucu yeniden başlatıldıysa `JWT_SECRET` değişmiş olabilir → herkes tekrar giriş yapar
- `JWT_SECRET` değerini değiştirdiyseniz eski jetonlar geçersizdir (normal)

### Görevler listede ama panoda görünmüyor
- Panoda en fazla 500 görev yüklenir. Filtreleri temizleyip proje/sorumlu seçin
- "Liste" ve "Pano" görünümleri aynı kaynaktan beslenir; fark bir hata değildir

### Stok miktarı yanlış görünüyor
- Stok, hareket kayıtlarının toplamıdır; elle girilmez
- `Stok Hareketleri → Sayım` ile fiziksel sayım sonucunu girip farkı düzeltin

### "Sunucu hatası (500)" mesajı alıyorum
- Sunucu terminalindeki `[HATA]` satırına bakın
- Veritabanı dosyası kilitliyse (yedek alırken) kısa süre bekleyip tekrar deneyin

### Veriler bozuldu / yanlışlık silindi
- `npm run reset-db --workspace server` otomatik **zaman damgalı yedek** alır
- `server/data/veltron-yedek-<tarih>.db` dosyasını `veltron.db` olarak geri koyun
