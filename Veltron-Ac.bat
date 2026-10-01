@echo off
REM ============================================================
REM  VELTRON'U AC  -  Tek tikla calistir
REM  Sunucuyu baslatir ve masaustu programini acar.
REM  Sunucu zaten acikse sadece programi acar.
REM ============================================================
title Veltron
cd /d "%~dp0"

set "NODE=node"
set "ELEKTRON=%~dp0node_modules\electron\dist\electron.exe"
set "API=http://localhost:4000/api/health"

echo.
echo   ==========================================
echo    VELTRON - Is Takip ve Yonetim Sistemi
echo   ==========================================
echo.

REM --- 1) Node kurulu mu -------------------------------------------------
where %NODE% >nul 2>&1
if errorlevel 1 (
    echo   [HATA] Node.js bulunamadi.
    echo   https://nodejs.org adresinden Node.js 22 veya ustunu kurun.
    echo.
    pause
    exit /b 1
)

REM --- 2) Electron kurulu mu ---------------------------------------------
if not exist "%ELEKTRON%" (
    echo   [HATA] Electron bulunamadi.
    echo   Proje klasorunde terminal acin ve su komutu calistirin:
    echo.
    echo       npm install
    echo.
    pause
    exit /b 1
)

REM --- 3) Sunucu zaten acik mi -------------------------------------------
curl -s -o nul -w "%%{http_code}" %API% 2>nul | findstr "200" >nul
if not errorlevel 1 goto SUNUCU_HAZIR

REM Sunucu kapali -> baslat
echo   Sunucu baslatiliyor...
cd /d "%~dp0server"
start "Veltron Sunucu" /min %NODE% src\index.js
cd /d "%~dp0"

set /a SAYAC=0
:BEKLE
set /a SAYAC+=1
timeout /t 1 >nul 2>&1
curl -s -o nul -w "%%{http_code}" %API% 2>nul | findstr "200" >nul
if not errorlevel 1 goto SUNUCU_HAZIR
if %SAYAC% lss 25 goto BEKLE

echo.
echo   [HATA] Sunucu baslatilamadi (25 saniye icinde acilmadi).
echo   Node surumunu kontrol edin:  node -v   (22.5 veya usturu olmali)
echo.
pause
exit /b 1

:SUNUCU_HAZIR
echo   Sunucu hazir (port 4000).
echo.
echo   Masaustu programi aciliyor...
cd /d "%~dp0app"
start "" "%ELEKTRON%" "."
cd /d "%~dp0"

echo.
echo   ==========================================
echo    Veltron acildi.
echo.
echo    Program acilmazsa tarayicidan su adresi acin:
echo        http://localhost:4000
echo   ==========================================
echo.
timeout /t 5 >nul
exit /b 0