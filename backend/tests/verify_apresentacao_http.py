"""Verificação real do roteiro acadêmico, preservando cadastro e modelos."""
import hashlib
import json
from pathlib import Path
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests

BASE = 'http://127.0.0.1:8000'
ROOT = Path(__file__).resolve().parents[1]
checks = []


def check(ok, label):
    checks.append({'label': label, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(label)


def forecast(**params):
    r = requests.post(BASE + '/api/forecast/live', data=params, timeout=35)
    r.raise_for_status()
    return r.json()


def hashes():
    files = [*ROOT.glob('resultados_v3_notebook/lstm_*.pt'), *ROOT.glob('resultados_v3_notebook/escalas_*.joblib'), ROOT/'resultados_v3_notebook/metadados.json']
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


original = requests.get(BASE + '/api/status', timeout=10).json()['config']
protected = hashes()
error = None
try:
    health = requests.get(BASE + '/api/health', timeout=5).json()
    check(health['aplicacao'] == 'Helionta' and health['artifacts_ready'], 'Servidor e modelo carregados')
    cities = requests.get(BASE + '/api/geocoding', params={'busca': 'Igarassu'}, timeout=15).json()['resultados']
    check(any('Igarassu' in c['nome'] for c in cities), 'Busca da cidade disponível')
    live = forecast(horas=24)
    check(live['meteorologia']['api_disponivel'] is True and not live['meteorologia']['dados_simulados'], 'Open-Meteo responde ao próprio servidor com todas as variáveis')
    now = pd.Timestamp.now(tz='America/Recife').floor('h')
    first = pd.Timestamp(live['meteorologia']['periodo_inicio'])
    check(first > now and len(live['serie']) == 24, 'Previsão cobre as próximas 24 horas atuais')
    check(all(0 <= p['previsao_lstm_kwh'] <= original['inversor_kw'] and (p['diurno'] or p['previsao_lstm_kwh'] == 0) for p in live['serie']), 'Geração respeita a noite e a capacidade do inversor')
    demo = forecast(horas=12, forcar_offline='true')
    check(demo['meteorologia']['dados_simulados'] and demo['meteorologia']['atualizado_em'] is None and len(demo['serie']) == 12, 'Demonstração identificada sem fingir consulta atualizada')

    # Gravação real pelo mesmo endpoint usado no formulário e restauração ao final.
    changed = {**original, 'quantidade_placas': 8, 'tarifa_energia_rs': 1.10}
    r = requests.post(BASE + '/api/config', json=changed, timeout=10)
    r.raise_for_status()
    reloaded = requests.get(BASE + '/api/status', timeout=10).json()['config']
    check(reloaded['quantidade_placas'] == 8 and reloaded['tarifa_energia_rs'] == 1.1, 'Dados digitados são salvos e recuperados')
    updated = forecast(horas=12, forcar_offline='true')
    check(updated['kwp_instalado'] == 4.4 and updated['energia_total_lstm_kwh'] < demo['energia_total_lstm_kwh'] and abs(updated['economia_estimada_rs'] - updated['energia_total_lstm_kwh'] * 1.1) < 0.02, 'Previsão e economia respondem ao cadastro alterado')

    example = requests.get(BASE + '/api/modelo-inversor-simples', timeout=10)
    check('FICTICIO' in example.headers['Content-Disposition'] and len(example.text.strip().splitlines()) == 25, 'Exemplo CSV recente com 24 horas disponível')
    imported = requests.post(BASE + '/api/importar-inversor', data={'dados_exemplo': 'true'}, files={'arquivo': ('exemplo.csv', example.content, 'text/csv')}, timeout=30)
    imported.raise_for_status()
    body = imported.json()
    check(body['dados_exemplo'] and body['horas_analisadas'] == 24 and not body['pronto_para_retreino_completo'], 'Importação calcula comparação e conserva origem fictícia')
    check(body['metodo_estimativa'] == 'referencia_fisica', 'Exemplo de um dia explica a referência física sem atribuir resultado à IA')
    check('Open-Meteo' in body['fonte_meteorologia'], 'Clima do CSV também é consultado na API')
    manual = '\n'.join(line.split(';')[0] + ';' + ('1,50' if i == 10 else '0,00') if i else line for i, line in enumerate(example.text.strip().splitlines()))
    imported_manual = requests.post(BASE + '/api/importar-inversor', data={'dados_exemplo': 'true'}, files={'arquivo': ('manual.csv', manual.encode(), 'text/csv')}, timeout=30)
    imported_manual.raise_for_status()
    check(imported_manual.json()['energia_real_total_kwh'] == 1.5, 'CSV manual aceita vírgula decimal e soma exatamente os valores digitados')
    recent_index = pd.date_range(now.tz_localize(None) - pd.Timedelta(hours=23), periods=24, freq='h')
    recent_csv = 'data_hora;energia_kwh\n' + '\n'.join(f'{ts};0,00' for ts in recent_index)
    recent = requests.post(BASE + '/api/forecast/live', data={'forcar_offline': 'true'}, files={'csv_geracao': ('recente.csv', recent_csv.encode(), 'text/csv')}, timeout=30)
    check(recent.status_code == 200 and 'CSV' in recent.json()['origem_historico'], 'CSV opcional de 24h na previsão também aceita vírgula decimal')
    empty = requests.post(BASE + '/api/forecast/live', data={'forcar_offline': 'true'}, files={'csv_geracao': ('vazio.csv', b'', 'text/csv')}, timeout=10)
    check(empty.status_code == 400 and 'vazio' in empty.json()['detail'], 'Arquivo vazio recebe orientação para corrigir o CSV')
    bad = requests.post(BASE + '/api/importar-inversor', files={'arquivo': ('invalido.csv', b'data_hora;energia_kwh\n2026-11-26 10:00:00;inf\n', 'text/csv')}, timeout=10)
    check(bad.status_code == 400 and 'finitos' in bad.json()['detail'], 'CSV inválido recebe uma explicação antes de calcular')
    invalid = requests.post(BASE + '/api/config', json={**original, 'inversor_kw': 0}, timeout=10)
    check(invalid.status_code == 400, 'Equipamento inválido é recusado')
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(forecast, horas=24)
        time.sleep(0.05)
        started = time.monotonic()
        healthy = requests.get(BASE + '/api/health', timeout=5)
        elapsed = time.monotonic() - started
        pending.result()
    check(healthy.status_code == 200 and elapsed < 2, 'Consulta de clima não bloqueia as outras telas')
    for path in ['/', '/#usina', '/brand/helionta-logo.png', '/exemplos/COMO_TESTAR_IGARASSU.md']:
        check(requests.get(BASE + path, timeout=10).status_code == 200, 'Arquivo acessível: ' + path)
except Exception as exc:
    error = str(exc)
    raise
finally:
    restored = requests.post(BASE + '/api/config', json=original, timeout=10)
    restored.raise_for_status()
    check(requests.get(BASE + '/api/status', timeout=10).json()['config'] == original, 'Cadastro original de Igarassu restaurado')
    check(hashes() == protected, 'Modelos e base de treinamento preservados')
    report = {'checks': checks, 'error': error}
    target = ROOT.parent / 'frontend/artifacts/apresentacao-http.json'
    target.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'passed': sum(c['passed'] for c in checks), 'total': len(checks), 'error': error}, ensure_ascii=True))
