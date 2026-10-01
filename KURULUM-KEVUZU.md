# Kurulum Paketi

Müşteriye göndereceğin tek klasör. **Kendi bilgisayarında kurulum yapmadan**
başka bir firmaya Veltron'u kurarsın.

---

## Paketi Oluştur

```powershell
cd veltron\server
npm run kurulum-paketi
```

Çıktı: `veltron/KurulumPaketi/` klasörü

ZIP'le göndermek istersen:
```powershell
npm run kurulum-paketi -- --zip
```
→ `KurulumPaketi.zip` (WhatsApp'tan gönderilebilir boyutta)

---

## Müşteri Ne Yapıyor?

1. ZIP'i açar (**C: doluysa D: kullanmalı** — kurulum uyarı verir)
2. `KURULUM\Kurulum.bat` dosyasına çift tıklar
3. Sihirbaz 7 adımda her şeyi yapar
4. Ekranda **adres ve şifre** yazar
5. Tarayıcıda açılır, girer

**Süre:** 5–15 dakika (internet hızına bağlı)

---

## Sihirbazın Yaptığı 7 Adım

| # | Adım | Ne yapar |
|---|---|---|
| 1 | Node.js kontrolü | 22.5+ gerekiyor. Yoksa indirme sayfasını açar |
| 2 | Disk kontrolü | 1.5 GB boş olmalı. Azsa uyarır, onay ister |
| 3 | Bağımlılıklar | `npm install` (653 paket) |
| 4 | Arayüz derleme | `npm run build` |
| 5 | `.env` | **Rastgele** JWT anahtarı + rastgele admin şifresi üretir |
| 6 | Masaüstü | 3 kısayol: Başlat · Tarayıcı · Durdur |
| 7 | Sunucu | Arka planda başlatır, hazır olunca adresi yazar |

### Masaüstü Kısayolları

| Kısayol | Ne yapar |
|---|---|
| **Veltron - Sunucuyu Başlat** | Sunucuyu açar (her gün bunu çalıştıracak) |
| **Veltron - Tarayıcı** | Uygulamayı açar |
| **Veltron - Durdur** | Sunucuyu kapatır |

---

## Kurulumdan Sonra Müşterinin Yapması Gereken

**Firma Profili** ekranından:
- Kendi firma adını yaz
- **Logosunu yükle** (fatura/teklif/Excel'e basılır)
- Adres, telefon, e-posta
- Vergi dairesi ve vergi numarası

Bu yapılmazsa evraklarda "Veltron" yazar.

---

## Paket İçeriği

| | |
|---|---|
| `KURULUM/` | Kurulum sihirbazı, başlat/durdur/kaldır, müşteri kılavuzu |
| `app/` | Masaüstü arayüz kaynak kodu |
| `server/` | Sunucu kaynak kodu |
| `package.json` + `package-lock.json` | Bağımlılık tanımları |
| `OKUBENI.md` | Müşteri kullanım kılavuzu |

**Boyut:** ~1,4 MB (bağımlılıklar hariç)

### Pakete Girmeyenler (bilerek)

| | Neden |
|---|---|
| `node_modules` (663 MB) | Alıcıda kurulur, paket küçük kalır |
| `.env` | **Şifreler sızmasın** |
| `server/data` | Veritabanı — müşterinin kendi verisi olacak |
| `tools/cloudflared` | 52 MB, sadece aile erişimi için |
| İç geliştirme notları | `AI-DEVIR.md`, güvenlik raporu vb. müşterinin işi değil |

---

## Kaldırma

`KURULUM\Kaldir.bat`:
1. Sunucuyu durdurur
2. **Verileri masaüstüne yedeklemeyi sorar**
3. Masaüstü kısayollarını siler
4. `.env` silinmesini sorar

Klasörü elle de silebilirsin.

---

## Yedekleme

Veriler `server\data` klasöründe. **Bu klasör tüm sistemin yedekidir.**

Müşteriye söyle: haftada bir masaüstüne kopyalasın.

---

## Bilmen Gerekenler

| | |
|---|---|
| **İnternet gerekli** | Kurulumda (`npm install`). Sonrasında gerekmez. |
| **Node.js gerekli** | Sihirbaz kontrol eder, yoksa indirme sayfasını açar. |
| **Sunucu = bu bilgisayar** | Kapanınca sistem durur. Ekip erişimi bu bilgisayarın açık olmasına bağlı. |
| **Erişim adresi** | `http://<bilgisayar-IP>:4000` — aynı ağda olmalılar |
| **CORS** | Başka bilgisayardan bağlanmıyorsa `.env` içindeki `CORS_ORIGIN` satırına o adresi eklemek gerekir |

---

## Denetleme

```powershell
cd veltron\server
node src/scripts/paket-kontrol.js
```

**37 kontrol:** paket içeriği, eksik dosya, sızdırabilecek dosya
(`.env`, veritabanı, iç notlar), PowerShell sözdizimi, sihirbazın beklediği
yollar, toplam boyut.

---

## Satış Senaryosu

1. Müşteriyle tanışma → **demo** kur (`npm run demo-kur`)
2. Programı birlikte kullanın, ihtiyacı anlayın
3. Teklif verin
4. Kazanırsa: `npm run kurulum-paketi` → ZIP'i gönderin
5. Müşteri kendi bilgisayarında 15 dakikada kurar
6. Firma Profili'ni doldurur, işe başlar

---

*29 Eylül 2026*
