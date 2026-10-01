# Aile Erişimi / Beta Paylaşımı

Veltron'u **kurulum yaptırmadan** aileye göstermek için internetten erişilebilir
hâle getirme.

---

## Tek Tıkla Ne Oluyor?

`AILE-ERISIMI.bat` dosyasına çift tıkladığında:

1. Sunucu başlar (port 4000)
2. Cloudflare üzerinden güvenli bir internet bağlantısı açılır
3. Ekrana `https://....trycloudflare.com` şeklinde bir adres yazılır

Bu adresi aileye gönderirsin. Onlar **telefonunda veya bilgisayarında
tarayıcıyı açıp** adresi yapıştırır, şifreyi girer, uygulamayı kullanır.

**Kurulum yok. Program yok. Dosya yok. Sadece bir adres.**

---

## Nasıl Kullanılır?

### 1. Bağlantıyı aç
```
veltron\AILE-ERISIMI.bat          →  çift tıkla
```

Sunucu açıksa otomatik bulunur, kapalıysa kendisi başlatır. Sonra
"birkaç saniye bekle" der ve adresi yazar:

```
https://metal-ports-finances-tractor.trycloudflare.com
```

### 2. Adresi aileye gönder
WhatsApp, Telegram, e-posta — nasıl istersen. Aşağıdaki bilgileri de yolla:

```
Adres : https://....trycloudflare.com
Kullanıcı adı : admin
Şifre : <şifren>
```

> Aileye **müşteri hesabı** da verebilirsin (`vuruskan` / `vuruskan-mali`) —
> onlar sadece kendi işlerini/faturalarını görür, sistemin geri kalanına
> dokunamaz.

### 3. Bitince kapat
```
veltron\BAGLANTIYI-KAPAT.bat        →  çift tıkla
```

**Bu önemli.** Bağlantı açıkken internetten erişilebilir durumdadır. Bitince
kapat.

---

## Dikkat Edilecekler

| | |
|---|---|
| **Adres her seferinde değişir** | Cloudflare rastgele verir. Her açtığında yeni adres alırsın. Kalıcı adres istersen ek ücretli hesap gerekir. |
| **Bilgisayarın açık olmalı** | Bu bir "bulut" değil; bağlantı senin bilgisayarın üzerinden geçiyor. Programı kapatırsan adres çalışmaz. |
| **Veri internete yüklenmez** | Her şey senin bilgisayarında durur. Sadece ekran görüntüsü gibi akıyor. Bu en güvenli tarafı. |
| **Şifre olmadan kimse giremez** | Adresi bilmek yetmez, giriş şart. |
| **Adresi herkese açık paylaşma** | Sadece ailene gönder. Sosyal medyaya atma. |

### Güvenlik kontrolü

Bağlantı açıldıktan sonra dışarıdan kontrol edebilirsin:

```powershell
cd veltron\server
$env:TUNNEL_URL="https://....trycloudflare.com"
node src/scripts/check-tunnel.mjs
```

**20 test** çalışır:
- Üç hesap da dışarıdan giriş yapabiliyor
- Müşteri hesabı 10 iç modülün **hepsine** 403 alıyor
- Mali hesap iş emirlerini göremiyor
- Müşteri Excel indiremiyor
- Yönetici her şeyi görebiliyor

---

## Neden Netlify / Vercel Kullanmadık?

Çünkü **çalışmazdı.** Onlar sadece statik dosya (HTML/CSS/JS) barındırır.
Veltron'ın çalışması için gerekenler:

| Parça | Netlify'de |
|---|---|
| React arayüz | ✅ çalışır |
| Node.js sunucusu (105 API ucu) | ❌ yok |
| SQLite veritabanı (diskte dosya) | ❌ yok — disk her seferinde silinir |

Netlify'e yüklersen aile login ekranını görür ve **"Sunucuya ulaşılamıyor"**
der. Hiçbir ekran açılmaz.

Bu yöntemin avantajı: **gerçek uygulama, gerçek veri, sıfır taşıma riski.**

---

## Teknik Bilgiler

- `cloudflared.exe` (Cloudflare, sürüm 2026.9.3) → `veltron\tools\`
- **Hesap gerekmez**, ücretsiz, süresiz
- Tünel `localhost:4000` üzerinden açılır
- Uygulama normalde de `http://192.168.1.100:4000` adresinden **aynı WiFi'a**
  bağlı her cihazda açılabilir (kurulum yine gerekmez, firewall izni gerekir)

### Dosyalar

| Dosya | Ne |
|---|---|
| `AILE-ERISIMI.bat` | Bağlantıyı açar, adresi yazar |
| `BAGLANTIYI-KAPAT.bat` | Bağlantıyı kapatır |
| `tools/cloudflared.exe` | Cloudflare istemcisi (52,8 MB) |
| `server/src/scripts/check-tunnel.mjs` | Dışarıdan güvenlik testi |

---

*29 Eylül 2026*
