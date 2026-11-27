$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$py = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
$dist = Join-Path $PSScriptRoot 'frontend\dist\index.html'
$url = 'http://127.0.0.1:8000'

if (-not (Test-Path -LiteralPath $py)) { throw 'Ambiente Python nao encontrado em backend\.venv.' }
if (-not (Test-Path -LiteralPath $dist)) { throw 'Interface ausente. Execute npm run build na pasta frontend.' }

function Abrir-Helionta {
    try { Start-Process $url }
    catch {
        $chrome = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
        if (-not (Test-Path -LiteralPath $chrome)) { throw "Abra o navegador em $url" }
        Start-Process -FilePath $chrome -ArgumentList $url
    }
}

$saude = $null
try { $saude = Invoke-RestMethod "$url/api/health" -TimeoutSec 2 } catch { }
if ($saude) {
    if ($saude.aplicacao -ne 'Helionta') { throw 'A porta 8000 esta sendo usada por outro servidor. Feche esse servidor antes de iniciar.' }
    Write-Host "Helionta ja esta funcionando em $url" -ForegroundColor Green
    Abrir-Helionta
    exit 0
}

Write-Host 'Helionta - preparando sua apresentacao...' -ForegroundColor Yellow
$backend = Join-Path $PSScriptRoot 'backend'
$servidor = Start-Process -FilePath $py -WorkingDirectory $backend -ArgumentList '-m','uvicorn','main:app','--host','127.0.0.1','--port','8000' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $backend 'servidor.log') -RedirectStandardError (Join-Path $backend 'servidor-erros.log')
for ($tentativa = 0; $tentativa -lt 30; $tentativa++) {
    Start-Sleep -Seconds 1
    try { $saude = Invoke-RestMethod "$url/api/health" -TimeoutSec 2 } catch { $saude = $null }
    if ($saude -and $saude.aplicacao -eq 'Helionta') {
        Write-Host "Pronto! Acesse $url" -ForegroundColor Green
        Abrir-Helionta
        exit 0
    }
    if ($servidor.HasExited) { break }
}
throw 'Nao foi possivel iniciar. Consulte backend\servidor-erros.log.'
