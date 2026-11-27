@echo off
REM ============================================================================
REM PROJETO SOLAR V3 — INICIALIZADOR DE DESENVOLVIMENTO (PORTAS 8000 E 5173)
REM ============================================================================
REM BLOCO 1: Ajuste de codificacao e posicionamento na pasta raiz
chcp 65001 >nul
title Projeto Solar V3 — Modo Desenvolvimento (8000 + 5173)
cd /d "%~dp0"

REM BLOCO 2: Inicializacao do Backend FastAPI com recarregamento automatico
echo Iniciando Backend FastAPI na porta 8000...
start "Solar V3 - Backend FastAPI" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

REM BLOCO 3: Inicializacao do Frontend React (Vite HMR) na porta 5173
echo Iniciando Frontend Vite React na porta 5173...
start "Solar V3 - Frontend React" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173
