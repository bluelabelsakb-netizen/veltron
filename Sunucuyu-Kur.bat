@echo off
REM ============================================================
REM  Veltron Sunucu Kurulumu
REM  Sunucuyu Windows'ta otomatik baslatir.
REM  Cift tiklayin, "Evet" deyin, bitti.
REM ============================================================

title Veltron Sunucu Kurulumu

REM Yonetici degilsek kendimizi yukselt
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Yonetici yetkisi isteniyor...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo.
echo   Veltron Sunucusu kuruluyor...
echo   ----------------------------------------
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi.
    echo   https://nodejs.org adresinden Node.js 22 veya ustunu kurun.
    echo.
    pause
    exit /b 1
)

node server\src\scripts\install-service.mjs
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Kurulum basarisiz oldu.
    pause
    exit /b 1
)

echo.
echo   ----------------------------------------
echo   Tamamlandi. Artik Veltron her acilista kendiliginden calisir.
echo.
echo   Sunucu adresi : http://localhost:4000
echo   Kapatmak icin : Sunucu Kurulumu.vbs (masaustunde)
echo   ----------------------------------------
echo.
pause
