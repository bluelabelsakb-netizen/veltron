#Requires -Version 5.1
<#
.SYNOPSIS
    Veltron Kurulum Sihirbazi - karsi tarafi Windows bilgisayara kurar.

.DESCRIPTION
    Yapar:
      1. Node.js kontrolu (22.5+ gerekli, node:sqlite icin)
      2. Disk alani kontrolu
      3. Bagimliliklari kurar (npm install)
      4. Masaustu arayuzunu derler
      5. .env olusturur (rastgele guvenli anahtarlarla)
      6. Masaustu kisayollari olusturur
      7. Sunucuyu baslatir ve erisim adresini yazar

.NOT
    Internet gerekir (npm paketleri icin). Kurulumdan once dosyalari
    MUTLAKA C: diskinin DEGIL, bos bir diske kopyalayin.
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# --------------------------------------------------------------- ayarlar
$Kok          = Split-Path -Parent $PSScriptRoot          # veltron/
$SunucuDizini = Join-Path $Kok 'server'
$Dizin        = $PSScriptRoot

# Turkce karakterler icin duzgun kodlama
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Renk = @{
  Basari = 'Green'
  Hata   = 'Red'
  Uyari  = 'Yellow'
  Bilgi  = 'Cyan'
  Normal = 'Gray'
}

function Yaz ($Metin, $RenkAdi = 'Normal') {
  Write-Host $Metin -ForegroundColor $Renk[$RenkAdi]
}
function satir { Write-Host '' }
function baslik ($Metin) {
  satir
  Write-Host "  ============================================================" -ForegroundColor Cyan
  Write-Host "   $Metin" -ForegroundColor Cyan
  Write-Host "  ============================================================" -ForegroundColor Cyan
  satir
}
function adim ($No, $Metin) {
  Write-Host "  [$No] " -ForegroundColor Cyan -NoNewline
  Write-Host $Metin
}

function HataDur ($Mesaj) {
  satir
  Yaz "  HATA: $Mesaj" 'Hata'
  satir
  Write-Host "  Kurulum iptal edildi." -ForegroundColor Red
  satir
  Read-Host "  Cikis icin Enter'a basin"
  exit 1
}

# --------------------------------------------------------------- Node.js
function NodeKontrol {
  adim 1 'Node.js kontrol ediliyor...'
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) {
    satir
    Yaz '  Node.js BULUNAMADI.' 'Uyari'
    Yaz '  Veltron Node.js 22.5 veya uzeri gerektirir.' 'Uyari'
    satir
    $cevap = Read-Host '  Simdi indirip kurmak ister misiniz? (e/h)'
    if ($cevap -eq 'e') {
      Start-Process 'https://nodejs.org/en/download'
      Yaz '  Tarayici acildi. Node.js 22.5+ (LTS) indirip kurun, sonra bu sihirbazi tekrar calistirin.' 'Bilgi'
    }
    HataDur 'Node.js kurulu degil.'
  }

  $surumHam = (& node -v) -replace '^v',''
  $parca = $surumHam.Split('.')
  $ana   = [int]$parca[0]
  $minor = [int]$parca[1]
  if ($ana -lt 22 -or ($ana -eq 22 -and $minor -lt 5)) {
    HataDur "Node.js $surumHam bulundu, 22.5 veya uzeri gerekli (node:sqlite)."
  }
  Yaz "    Node.js $surumHam bulundu ✓" 'Basari'
}

# --------------------------------------------------------------- disk
function DiskKontrol {
  adim 2 'Disk alani kontrol ediliyor...'
  $surucu = (Get-Item $Kok).PSDrive.Name
  $bos = (Get-PSDrive $surucu).Free / 1GB
  $gerekli = 1.5   # GB (bagimliliklar ~700 MB + arayuz ~200 MB)
  if ($bos -lt $gerekli) {
    satir
    Yaz "  UYARI: $surucu diskinde sadece $([math]::Round($bos,1)) GB bos." 'Uyari'
    Yaz "  Kurulum icin en az $gerekli GB gerekli." 'Uyari'
    satir
    $kur = Read-Host '  Yine de devam edilsin mi? (e/h)'
    if ($kur -ne 'e') { HataDur 'Disk alani yetersiz.' }
  } else {
    Yaz "    $surucu diskinde $([math]::Round($bos,1)) GB bos ✓" 'Basari'
  }
}

# --------------------------------------------------------------- npm install
function BagimliliklariKur {
  adim 3 'Bagimliliklar kuruluyor (birkac dakika surebilir)...'
  Push-Location $Kok
  try {
    & npm install --no-audit --no-fund 2>&1 | Out-String | ForEach-Object {
      if ($_ -match 'added|up to date|audited') { Yaz "    $_" 'Normal' }
    }
    if ($LASTEXITCODE -ne 0) {
      Pop-Location
      HataDur 'npm install basarisiz. Internet baglantinizi kontrol edin.'
    }
  } finally {
    Pop-Location
  }
  $electronVarMi = Test-Path (Join-Path $Kok 'node_modules\electron')
  if (-not $electronVarMi) {
    HataDur 'Electron kurulamadi. npm install ciktisini kontrol edin.'
  }
  Yaz '    Bagimliliklar hazir ✓' 'Basari'
}

# --------------------------------------------------------------- arayuz derle
function ArayuzuDerle {
  adim 4 'Masaustu arayuzu derleniyor...'
  Push-Location $Kok
  try {
    & npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Pop-Location; HataDur 'Arayuz derlenemedi (npm run build).' }
  } finally { Pop-Location }
  $dist = Join-Path $Kok 'app\dist\index.html'
  if (-not (Test-Path $dist)) { HataDur 'Arayuz derlenmedi (app/dist/index.html bulunamadi).' }
  Yaz '    Arayuz hazir ✓' 'Basari'
}

# --------------------------------------------------------------- .env
function EnvOlustur {
  adim 5 'Guvenli ayarlar olusturuluyor...'
  $envDosya = Join-Path $SunucuDizini '.env'
  if (Test-Path $envDosya) {
    Yaz '    .env zaten var, dokunulmadi.' 'Uyari'
    return
  }
  function rastgele ($Bayt) {
    $b = New-Object byte[] $Bayt
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    -join ($b | ForEach-Object { $_.ToString('x2') })
  }
  $adminSifre = 'Ve' + (rastgele 5) + '!' -replace '[^A-Za-z0-9!@#$%]',''
  $jwt = rastgele 48

  $icerik = @"
# --- Veltron ayarlari (KURULUM SIHRIRBAZI OLUSTURDU) ---
# Bu dosyayi SAKLAMAYIN / paylasmayin. Icerigi gizlidir.

HOST=0.0.0.0
PORT=4000

# Oturum imzalama anahtari (rastgele uretildi)
JWT_SECRET=$jwt

# Oturum suresi
TOKEN_TTL=12h

# Ilk yonetici hesabi
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$adminSifre
ADMIN_NAME=Yonetici

# Tarayici tabanli erisim icin izin listesi
# Diger bilgisayarlardan baglanacaksaniz kendi IP adresinizi ekleyin.
CORS_ORIGIN=http://localhost:4000,http://127.0.0.1:4000
"@

  Set-Content -Path $envDosya -Value $icerik -Encoding UTF8
  Yaz '    .env olusturuldu (rastgele anahtarlarla) ✓' 'Basari'
  return $adminSifre
}

# --------------------------------------------------------------- kisayollar
function KisayolOlustur {
  adim 6 'Masaustu kisayollari olusturuluyor...'
  $masaustu = [Environment]::GetFolderPath('Desktop')
  $baslatDizini = Join-Path $Dizin 'Sunucuyu-Baslat.bat'

  $yol1 = Join-Path $masaustu 'Veltron - Sunucuyu Baslat.lnk'
  $yol2 = Join-Path $masaustu 'Veltron - Tarayici.lnk'
  $yol3 = Join-Path $masaustu 'Veltron - Durdur.lnk'

  $sh = New-Object -ComObject WScript.Shell
  function Lnk ($Hedef, $Arguman, $Ikon, $Aciklama) {
    $l = $sh.CreateShortcut($Hedef)
    $l.TargetPath       = $Arguman
    $l.WorkingDirectory = $Dizin
    $l.Description      = $Aciklama
    $l.Save()
  }
  Lnk $yol1 $baslatDizini '' 'Veltron sunucusunu baslatir'
  Lnk $yol2 'http://localhost:4000' '' 'Veltronu tarayicida acar'
  Lnk $yol3 (Join-Path $Dizin 'Sunucuyu-Durdur.bat') '' 'Veltron sunucusunu durdurur'
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sh) | Out-Null

  Yaz "    Masaustune 3 kisayol eklendi ✓" 'Basari'
}

# --------------------------------------------------------------- baslat
function SunucuyuBaslat {
  adim 7 'Sunucu baslatiliyor...'
  $pidDosya = Join-Path $SunucuDizini 'data\sunucu.pid'

  # Zaten calisiyor mu?
  try {
    $h = Invoke-RestMethod -Uri 'http://localhost:4000/api/health' -TimeoutSec 3
    Yaz '    Sunucu zaten calisiyor ✓' 'Basari'
    return
  } catch {}

  Start-Process -FilePath 'node' -ArgumentList 'src/index.js' -WorkingDirectory $SunucuDizini -WindowStyle Hidden

  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 800
    try {
      Invoke-RestMethod -Uri 'http://localhost:4000/api/health' -TimeoutSec 2 | Out-Null
      Set-Content -Path $pidDosya -Value 'calisiyor' -Encoding ASCII
      Yaz '    Sunucu ayakta ✓' 'Basari'
      return
    } catch {}
  }
  HataDur 'Sunucu baslatilamadi. Konsol penceresini kontrol edin.'
}

# --------------------------------------------------------------- ag adresi
function AgAdresi {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(127|169\.254)' } |
        Select-Object -First 1 -ExpandProperty IPAddress
  if ($ip) { return $ip } else { return 'bulunamadi' }
}

# =============================================================== ANA
Clear-Host
baslik 'VELTRON KURULUM SIHRIRBAZI'
Yaz '  Is takip, tartim ve maliyet sisteminin kurulumu' 'Bilgi'
Yaz "  Klasor: $Kok" 'Bilgi'
satir

Write-Host '  Bu kurulum su isleri yapar:' -ForegroundColor Gray
Write-Host '    - Node.js kontrolu'
Write-Host '    - Bagimlilik kurulumu (internet gerekir)'
Write-Host '    - Masaustu arayuzu derleme'
Write-Host '    - Guvenli ayar dosyasi olusturma'
Write-Host '    - Masaustu kisayollari'
Write-Host '    - Sunucu baslatma'
satir
$devam = Read-Host '  Baslayalim mi? (Enter)'
if ($devam -ne '') { HataDur 'Iptal edildi.' }

satir
NodeKontrol
DiskKontrol
BagimliliklariKur
ArayuzuDerle
$sifre = EnvOlustur
KisayolOlustur
SunucuyuBaslat

$ip = AgAdresi

# ------------------------------------------------------------------ ozet
baslik 'KURULUM TAMAMLANDI'
Yaz '  Yonetici bilgileri:' 'Basari'
satir
Write-Host "    Kullanici adi :  admin" -ForegroundColor White
Write-Host "    Sifre         :  $sifre" -ForegroundColor White
satir

Yaz '  Erisim adresleri:' 'Basari'
satir
Write-Host "    Bu bilgisayar :  http://localhost:4000" -ForegroundColor White
Write-Host "    Yerel ag      :  http://${ip}:4000" -ForegroundColor White
satir

Yaz '  ONEMLI:' 'Uyari'
satir
Write-Host '    1. Sifreyi bir yere yazin. Bu ekrandan sonra gorunmeyecek.' -ForegroundColor Yellow
Write-Host '    2. Ekip arkadaslariniz ag adresiyle baglanir.' -ForegroundColor Yellow
Write-Host "       ($ip) - ayni WiFi/aginda olmalilar." -ForegroundColor Yellow
Write-Host '    3. Baska bilgisayardan baglanilacaksa .env icindeki' -ForegroundColor Yellow
Write-Host "       CORS_ORIGIN satirina http://${ip}:4000 ekleyin." -ForegroundColor Yellow
satir
Write-Host '    4. Sunucu bu bilgisayarda ACIK olmalidir.' -ForegroundColor Yellow
Write-Host '       Bilgisayar kapandinca adres calismaz.' -ForegroundColor Yellow
satir

Yaz '  Masaustundeki kisayollar:' 'Basari'
satir
Write-Host '    Veltron - Sunucuyu Baslat  (acikken calistirin)' -ForegroundColor White
Write-Host '    Veltron - Tarayici         (uygulamayi acar)' -ForegroundColor White
Write-Host '    Veltron - Durdur           (sunucuyu kapatir)' -ForegroundColor White
satir

Yaz '  Ilk yapmaniz gereken: Firma Profili ekranindan' 'Bilgi'
Yaz '  kendi firmanizin adini, logosunu ve adresini girin.' 'Bilgi'
satir
Yaz '  Kaldirmak icin: Kurulum klasorundeki Kaldir.bat' 'Bilgi'
satir

$ac = Read-Host '  Simdi tarayicida acilsin mi? (e/h)'
if ($ac -eq 'e') { Start-Process 'http://localhost:4000' }

satir
Read-Host '  Cikis icin Enter'
exit 0
