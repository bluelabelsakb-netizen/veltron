@echo off
REM ============================================================
REM  Veltron KURULUMU (tek tik)
REM  Asil is Kurulum.ps1 dosyasinda. Cift tiklayin.
REM ============================================================
title Veltron Kurulum
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Kurulum.ps1"
if errorlevel 1 (
    echo.
    echo Kurulum bir sorunla kapandi.
    pause
)
exit /b 0
