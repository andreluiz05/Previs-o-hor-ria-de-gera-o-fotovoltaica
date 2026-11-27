@echo off
chcp 65001 >nul
title Encerrar Helionta
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$conns = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if ($conns) { $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($id in $pids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; Write-Host ('Servidor Helionta encerrado (PID ' + $id + ').') -ForegroundColor Green } } else { Write-Host 'Nenhum servidor Helionta ativo na porta 8000.' -ForegroundColor Yellow }"
"%SystemRoot%\System32\timeout.exe" /t 2 /nobreak >nul
