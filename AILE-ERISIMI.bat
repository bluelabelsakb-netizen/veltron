@echo off
REM ==========================================================================
REM  VELTRON - Aile / Beta Erisimi (Cloudflare Tunnel)
REM  --------------------------------------------------------
REM  Bu betik:
REM    1) Sunucuyu baslatir (port 4000)
REM    2) Guvenli bir internet baglantisi olusturur
REM    3) Ailenin acabilecegi adresi ekrana yazar
REM
REM  Kullanim:  Betige CIFT TIKLA
REM  Durdurmak: Ekrani kapat (veya Ctrl+C)
REM
REM  HESAP GEREKMEZ. Adres her calistirmada degisir.
REM ==========================================================================

setlocal
cd /d "%~dp0"

title Veltron - Aile Erisimi
color 0B

echo.
echo  ==========================================================
echo    VELTRON - AILE ERISIMI BASLATILIYOR
echo  ==========================================================
echo.

REM --- 1) Sunucu calisiyor mu? ---
curl -s -o nul -w "%%{http_code}" http://localhost:4000/api/health > "%TEMP%\veltron_health.txt" 2>nul
set /p HEALTH=<"%TEMP%\veltron_health.txt"
del "%TEMP%\veltron_health.txt" >nul 2>&1

if "%HEALTH%"=="200" (
    echo  [1/2] Sunucu zaten calisiyor. ^(port 4000^)
) else (
    echo  [1/2] Sunucu baslatiliyor...
    start "" /min cmd /c "cd /d "%~dp0server" && node src\index.js"
    REM sunucunun acilmasini bekle
    set /a WAIT=0
    :bekle
    set /a WAIT+=1
    timeout /t 2 >nul 2>&1
    curl -s -o nul -w "%%{http_code}" http://localhost:4000/api/health 2>nul | findstr "200" >nul
    if not errorlevel 1 goto :sunucu_hazir
    if %WAIT% lss 30 goto :bekle
    echo.
    echo  [HATA] Sunucu acilmadi.
    echo         Node.js kurulu mu?  node -v  yazip dene.
    echo.
    pause
    exit /b 1
)

:sunucu_hazir
echo.
echo  [2/2] Internet baglantisi olusturuluyor...
echo.
echo  ==========================================================
echo    BIRKAZ SANIYE BEKLE - ADRES ASAGIDA YAZACAK
echo  ==========================================================
echo.
echo  Bu pencereyi KAPATMA. Aile baglanirken acik kalmali.
echo  Kapatirsan baglanti kapanir.
echo.
echo  --------------------------------------------------------
echo.

tools\cloudflared.exe tunnel --no-autoupdate --url http://localhost:4000

echo.
echo  ==========================================================
echo    BAGLANTI KAPANDI
echo  ==========================================================
echo.
pause
