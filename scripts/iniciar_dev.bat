@echo off
chcp 65001 >nul
title Helionta — Modo Desenvolvimento (8000 + 5173)
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"

echo Iniciando Backend FastAPI na porta 8000...
start "Helionta - Backend FastAPI" cmd /k "cd /d "%RAIZ%\backend" && .venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo Iniciando Frontend Vite React na porta 5173...
start "Helionta - Frontend React" cmd /k "cd /d "%RAIZ%\frontend" && npm run dev"

"%SystemRoot%\System32\timeout.exe" /t 3 /nobreak >nul
start http://localhost:5173
