@echo off
REM ==========================================================================
REM  VELTRON - Baglantiyi Kapat
REM  Aileye verdigin adresi kapatir. Acil dugmeye basman yeterli.
REM ==========================================================================
title Veltron - Baglantiyi Kapat

echo.
echo  Baglanti kapatiliyor...
taskkill /FI "IMAGENAME eq cloudflared.exe" /F >nul 2>&1

REM Kucuk bir gecikme: cloudflared'in cikmasini bekle
timeout /t 2 >nul 2>&1

tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | find /I "cloudflared" >nul
if errorlevel 1 (
    echo.
    echo  [TAMAM] Baglanti kapandi.
    echo.
    echo  Ailenin adresi artik calismiyor. Verilerin sadece
    echo  bu bilgisayarda duruyor - internete yuklenmedi.
    echo.
    echo  Tekrar baglanmak icin: AILE-ERISIMI.bat
    echo.
) else (
    echo.
    echo  [UYARI] cloudflared hala calisiyor gibi gorunuyor.
    echo  Yukari kapat dediysen sunucuyu KAPATMA.
    echo.
)
timeout /t 8 >nul 2>&1
