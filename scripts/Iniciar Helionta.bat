@echo off
chcp 65001 >nul
title Helionta - Previsao e Energia Solar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar_apresentacao.ps1"
if errorlevel 1 pause
