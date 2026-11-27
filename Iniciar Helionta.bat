@echo off
chcp 65001 >nul
title Helionta - Minha Energia Solar
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar_apresentacao.ps1"
if errorlevel 1 pause
