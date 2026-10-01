@echo off
REM ============================================================
REM  Veltron Sunucusunu DURDURUR
REM  Veri kaybolmaz. Isterseniz tekrar Baslat ile aynilir.
REM ============================================================
title Veltron - Sunucuyu Durdur
cd /d "%~dp0"

echo.
echo   Sunucu durduruluyor...
echo   ----------------------------------------

REM Sadece veltronun node surecini oldur.
REM Tum node sureclerini oldurmek baska programlari (VS Code vb.) kapatir.
for /f "tokens=2 delims=," %%p in ('wmic process where "name='node.exe'" get ProcessId,CommandLine /format:csv 2^>nul ^| find "src\\index.js"') do (
    echo   PID %%p durduruluyor...
    taskkill /PID %%p /F >nul 2>&1
)

timeout /t 2 >nul 2>&1

curl -s -o nul -w "%%{http_code}" http://localhost:4000/api/health 2>nul | findstr "200" >nul
if not errorlevel 1 (
    echo.
    echo   [UYARI] Sunucu hala yanit veriyor. Gorev Yoneticisi'nden
    echo   "node.exe" sureclerini kontrol edin.
    echo.
    pause
    exit /b 1
)

echo.
echo   [TAMAM] Sunucu durduruldu. Verileriniz kayitli.
echo.
pause
exit /b 0
