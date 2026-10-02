# VELTRON — BAŞKA BİLGİSAYARA KURULUM

**Bu klasördeki `Veltron-Kurulum.exe` yeterlidir. Node.js kurmana gerek yok.**

---

## 1. Kurulum (tek adım)

`Veltron-Kurulum.exe` dosyasına çift tıkla.

İki şey soracak:

| Soru | Ne yap |
|---|---|
| **Kurulum yeri** | Boş bırakabilirsin. Varsayılan: `C:\Users\<KULLANICI>\AppData\Local\Programs\Veltron` |
| **Masaüstünde Veltron simgesi oluşturulsun mu?** | **Evet** |

Kurulum bittikten sonra:

- Masaüstünde **Veltron** simgesi oluşur
- Başlat menüsünde olur
- Sunucu Windows'a kaydedilir → **bilgisayar her açılışta kendiliğinden başlar**
- Programı kapatmak sunucuyu **durdurmaz** (müşteri portalı çalışmaya devam eder)

**Yönetici izni istenecek** — evet de, görev kaydı için gerekli.

---

## 2. Giriş

Masaüstündeki **Veltron** simgesine çift tıkla.

```
kullanıcı : admin
şifre     : VeltronDemo2026!
```

Sonra sağ üstteki kullanıcı menüsünden **şifreni değiştir**.

---

## 3. Neden Node.js kurmana gerek yok

Veltron'un sunucusu SQLite kullanıyor ve `node:sqlite` modülü **Node 22.5+** ile geldi.
Electron'un içindeki gömülü Node 20.18 — **yetersiz**, denendi ve başarısız oldu.

Bu yüzden kurulum paketinin **içine `node.exe` (v24.21.0, 89 MB) gömülü**.
Windows görevi onu doğrudan çalıştırıyor:

```
"…\Veltron\resources\server-runtime\node.exe" "…\server\src\index.js"
```

Ayrıca kurulum paketi şunları da **içinde** getirir — ayrıca kopyalamana gerek yok:

| İçerik | Yol (kurulumdan sonra) |
|---|---|
| Ayar dosyası (giriş, Telegram, CORS) | `…\resources\server-runtime\server\.env` |
| Veritabanı | `…\resources\server-runtime\server\data\veltron.db` |

---

## 4. Daha yeni veriyle kurmak (isteğe bağlı)

Kurulum paketi içindeki veri, **paketin üretildiği günkü halidir**.
Bu bilgisayardaki veri daha yeniyse:

Kurulumu bitir, programı **kapat**, sonra USB'deki `veri\` klasöründeki
**3 dosyayı birlikte** kurulumun `data` klasörüne kopyala:

```
kaynak : veri\veltron.db
        veri\veltron.db-wal     ← bu da lazım
        veri\veltron.db-shm     ← bu da lazım
hedef  : …\resources\server-runtime\server\data\
```

> ⚠️ **`.db-wal` ve `.db-shm` olmadan kopyalama.** `veltron.db` tek başına
> yaklaşık 600 KB görünür ama son kayıtlar **WAL dosyasındadır**. WAL olmadan
> kopya sessizce **eski veri** gösterir — veri kaybolmuş gibi görünür ama
> aslında kopya eksiktir.

Kopyalamadan önce hedef klasörde aynı adlı dosyalar varsa **sil**.

Böyle bir kopyanın `…\server\` altına `.env` de koyman gerekir — ama zaten
kurulumla geldiği için dokunma.

---

## 5. Doğrulama

Tarayıcıda aç: **http://localhost:4000**

Çalışıyorsa şu çıkar: `{"status":"ok","service":"veltron-server"}`

Olmuyorsa PowerShell'de:

```powershell
schtasks /Query /TN "Veltron Sunucu"
```

"Running" yazmalı. Değilse:

```powershell
schtasks /Run /TN "Veltron Sunucu"
```

---

## 6. Sorun giderme

| Belirti | Sebep / Çözüm |
|---|---|
| "Sunucuya ulaşılamıyor" | Sunucu çalışmıyor → `schtasks /Run /TN "Veltron Sunucu"` |
| Program açılıp hemen kapanıyor | Sunucu görevi kurulmamış. Kurulumu **yönetici olarak** yeniden çalıştır |
| Siyah ekran | Sunucu kapalı. Program çalışmadan önce sunucu başlamalı |
| Veriler eski görünüyor | Bölüm 4 — WAL/SHM birlikte kopyalanmamış |
| Giriş şifresi kabul edilmiyor | `…\resources\server-runtime\server\.env` var mı kontrol et |
| Program "yeni sürüm var" diyor | Sürüm 1.0.0'den büyükse. Kurulumu tekrar çalıştır, veriler yerinde kalır |

---

## 7. Veri kaybı olursa

Kurulum **veritabanını asla silmez** — sadece okur.

Yedek almak için programı aç: **Ayarlar → Uygulama Bilgileri** bölümünde
veritabanı yolu yazar.

---

*Hazırlayan: Veltron · 2 Ekim 2026*
