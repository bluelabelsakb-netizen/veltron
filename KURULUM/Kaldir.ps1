<#
.SYNOPSIS
    Veltron Kaldirma Sihirbazi
.DESCRIPTION
    Sunucuyu durdurur, masaustu kisayollarini siler.
    VERI SILMEZ - once yedek almayi sorar.
#>
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Kok   = Split-Path -Parent $PSScriptRoot
$Veri  = Join-Path $Kok 'server\data'
$Dizin = $PSScriptRoot

Clear-Host
Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host '   VELTRON KALDIRMA' -ForegroundColor Cyan
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host ''

# --- 1. Sunucuyu durdur
Write-Host '  [1] Sunucu durduruluyor...' -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri 'http://localhost:4000/api/health' -TimeoutSec 2 | Out-Null
  $p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
       Where-Object { $_.CommandLine -like '*src\index.js*' }
  foreach ($x in $p) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host '      Sunucu durduruldu.' -ForegroundColor Green
} catch {
  Write-Host '      Sunucu zaten calismiyor.' -ForegroundColor Gray
}
Write-Host ''

# --- 2. Yedek
Write-Host '  [2] Veri yedegi' -ForegroundColor Cyan
if (Test-Path $Veri) {
  $tarih = Get-Date -Format 'yyyyMMdd-HHmm'
  $hedef = Join-Path ([Environment]::GetFolderPath('Desktop')) "Veltron-Yedek-$tarih"
  Write-Host "      Verileriniz masaustune kopyalansin mi?" -ForegroundColor Yellow
  Write-Host "      (Silmeden once yedek almak ONERILIR)" -ForegroundColor Yellow
  $h = Read-Host '      Yedek alinsin mi? (e/h)'
  if ($h -eq 'e') {
    Copy-Item -Path $Veri -Destination $hedef -Recurse -Force
    $mb = [math]::Round(((Get-ChildItem $hedef -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 2)
    Write-Host "      Yedek alindi: $hedef ($mb MB)" -ForegroundColor Green
  }
}
Write-Host ''

# --- 3. Kisayollar
Write-Host '  [3] Masaustu kisayollari siliniyor...' -ForegroundColor Cyan
$masaustu = [Environment]::GetFolderPath('Desktop')
foreach ($ad in @('Veltron - Sunucuyu Baslat.lnk','Veltron - Tarayici.lnk','Veltron - Durdur.lnk')) {
  $y = Join-Path $masaustu $ad
  if (Test-Path $y) { Remove-Item $y -Force; Write-Host "      $ad silindi" -ForegroundColor Gray }
}
Write-Host ''

# --- 4. Dogrulama
Write-Host '  [4/4] Diger ayarlar' -ForegroundColor Cyan
$c = Read-Host '      .env dosyasi (sifreler) silinsin mi? (e/h)'
if ($c -eq 'e') {
  $envY = Join-Path $Kok 'server\.env'
  if (Test-Path $envY) { Remove-Item $envY -Force; Write-Host '      .env silindi' -ForegroundColor Gray }
}
Write-Host ''

Write-Host '  ============================================================' -ForegroundColor Green
Write-Host '   ISLEM TAMAMLANDI' -ForegroundColor Green
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host ''
Write-Host '  Silmek icin bu klasoru ve node_modules klasorunu' -ForegroundColor Gray
Write-Host '  elle silebilirsiniz. Diger hicbir sey degistirilmedi.' -ForegroundColor Gray
Write-Host ''
Read-Host '  Cikis icin Enter'
exit 0
