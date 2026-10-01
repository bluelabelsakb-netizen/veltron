@echo off
REM ============================================================
REM  Veltron Sunucusunu BASLATIR
REM  Masaustundeki kisayol budur. Cift tiklayin.
REM  Sunucu arka planda calisir, pencere kapanir.
REM ============================================================
title Veltron - Sunucuyu Baslat
cd /d "%~dp0"

echo.
echo   Veltron baslatiliyor...
echo   ----------------------------------------

REM Sunucu zaten acik mi?
curl -s -o nul -w "%%{http_code}" http://localhost:4000/api/health 2>nul | findstr "200" >nul
if not errorlevel 1 (
    echo.
    echo   [TAMAM] Sunucu zaten calisiyor.
    echo   Adres: http://localhost:4000
    echo.
    start "" http://localhost:4000
    timeout /t 3 >nul
    exit /b 0
)

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [HATA] Node.js bulunamadi.
    echo   Lutfen Kurulum\Kurulum.bat dosyasini calistirin.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0..\server"
start "Veltron Sunucu" /min node src\index.js

REM Aya kadar bekle
set /a SAYAC=0
:AWAIT
set /a SAYAC+=1
timeout /t 1 >nul 2>&1
curl -s -o nul -w "%%{http_code}" http://localhost:4000/api/health 2>nul | findstr "200" >nul
if not errorlevel 1 goto HAZIR
if %SAYAC% lss 25 goto AWAIT

echo.
echo   [HATA] Sunucu baslatilamadi (25 saniye icinde acilmadi).
echo   Node.js surumunu kontrol edin:  node -v   (22.5 veya uzeri olmali)
echo.
pause
exit /b 1

:HAZIR
cd /d "%~dp0"
echo.
echo   [TAMAM] Sunucu baslatildi.
echo.
echo   Bu bilgisayar  : http://localhost:4000
echo.
echo   Ekip arkadaslariniz bu adresi kullanir.
echo   Bilgisayar kapandiginda adres calismaz.
echo.
start "" http://localhost:4000
timeout /t 2 >nul
exit /b 0
