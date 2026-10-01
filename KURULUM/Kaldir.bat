@echo off
REM ============================================================
REM  Veltron Kaldirma
REM  Verilerinizi silmez once yedek alir.
REM ============================================================
title Veltron Kaldirma
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Kaldir.ps1"
exit /b 0
