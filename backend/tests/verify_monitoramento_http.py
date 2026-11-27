"""Teste de integração local; modifica apenas sessões de simulação."""
import csv
import hashlib
import io
import json
import time
from pathlib import Path
import requests

BASE = 'http://127.0.0.1:8000'
checks = []
def check(ok, label):
    checks.append({'label': label, 'passed': bool(ok)})
    if not ok: raise AssertionError(label)
def get():
    response = requests.get(BASE + '/api/monitoramento/status', timeout=10)
    response.raise_for_status()
    return response.json()
def post(path, body=None):
    response = requests.post(BASE + '/api/monitoramento/' + path, json=body, timeout=10)
    response.raise_for_status()
    return response.json()
root = Path(__file__).resolve().parents[1]
protected = [*root.glob('resultados_v3_notebook/lstm_*.pt'), *root.glob('resultados_v3_notebook/escalas_*.joblib'), root/'resultados_v3_notebook/config_usuario_ativa.json', root/'resultados_v3_notebook/metadados.json']
before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
try:
    initial = post('iniciar', {'modo': 'acelerado', 'cenario': 'sol', 'nova_sessao': True})
    check(initial['fonte'] == 'simulador' and initial['simulado'] and not initial['conexao_hardware'], 'Fonte fictícia explicitamente identificada')
    check(initial['sessao']['config']['cidade'] == 'Igarassu, Pernambuco', 'Configuração da casa usada na sessão')
    time.sleep(5)
    live = get()
    check(live['total_leituras'] > initial['total_leituras'], 'Coleta automática sem navegador')
    check(live['energia_total_kwh'] >= 0 and live['ultima_leitura']['potencia_kw'] <= live['sessao']['config']['inversor_kw'], 'Energia e potência dentro dos limites')
    paused = post('pausar')
    time.sleep(2.5)
    check(get()['total_leituras'] == paused['total_leituras'], 'Pausa interrompe novas leituras')
    resumed = post('iniciar', {'modo':'acelerado', 'cenario':'sol'})
    check(resumed['sessao']['id'] == initial['sessao']['id'], 'Retomada preserva a sessão e o histórico')
    new = post('iniciar', {'modo':'acelerado', 'cenario':'nublado', 'nova_sessao':True})
    old = requests.get(BASE+'/api/monitoramento/status',params={'sessao_id':initial['sessao']['id']},timeout=10).json()
    check(new['sessao']['id'] != old['sessao']['id'] and old['total_leituras'] >= live['total_leituras'], 'Nova simulação preserva histórico anterior')
    export = requests.get(BASE+'/api/monitoramento/exportar',params={'sessao_id':initial['sessao']['id']},timeout=10)
    export.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(export.text),delimiter=';'))
    check(bool(rows) and all(row['fonte'] == 'SIMULADOR_FICTICIO' for row in rows), 'CSV com origem simulada e qualidade da hora')
    check(requests.post(BASE+'/api/monitoramento/iniciar',json={'modo':'invalido'},timeout=10).status_code == 422, 'Modo inválido rejeitado pela API')
    check(requests.get(BASE+'/api/monitoramento/status',params={'sessao_id':'inexistente'},timeout=10).status_code == 404, 'Histórico inexistente retorna erro explícito')
    after = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
    check(before == after, 'Modelos, dados de treino e configuração preservados')
    post('iniciar', {'modo':'acelerado', 'cenario':'sol', 'nova_sessao':True})
finally:
    (root.parent/'frontend/artifacts/monitoramento-api-validation.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
