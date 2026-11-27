"""Integração real com o servidor local e a API pública. Deixa a coleta online ativa."""
import csv
import hashlib
import io
import json
import sqlite3
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8000'
checks = []


def check(ok, label):
    checks.append({'label':label,'passed':bool(ok)})
    if not ok:
        raise AssertionError(label)


def get():
    r = requests.get(BASE+'/api/fonte-publica/status',timeout=10)
    r.raise_for_status()
    return r.json()


def post(acao):
    r = requests.post(BASE+'/api/fonte-publica/'+acao,timeout=35)
    r.raise_for_status()
    return r.json()


files = [*ROOT.glob('resultados_v3_notebook/lstm_*.pt'), *ROOT.glob('resultados_v3_notebook/escalas_*.joblib'),
         ROOT/'resultados_v3_notebook/config_usuario_ativa.json', ROOT/'resultados_v3_notebook/metadados.json']
fingerprint = lambda:{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
protected = fingerprint()
simulador = requests.get(BASE+'/api/monitoramento/status',timeout=10).json()
error = None
try:
    initial = post('iniciar')
    check(initial['ativo'] and initial['erro'] is None and initial['ultima_consulta_sucesso_em'], 'Servidor consultou a API pública com sucesso')
    check(not initial['simulado'] and not initial['conexao_hardware_local'] and initial['fonte']['node_id']==1000, 'Fonte externa identificada sem representar hardware local')
    check(initial['fonte']['source_id']=='/0145/S1/G1/INV/2', 'Fonte publicada como inversor, sem usar streams de consumo')
    check(initial['fonte']['capacidade_kw'] is None and initial['fonte']['fuso_origem']=='America/New_York', 'Metadados desconhecidos não são inventados; fuso preservado')
    check(initial['total_leituras']>=1 and initial['ultima_leitura']['contador_kwh']>0, 'Leituras e contador de energia recebidos')
    with sqlite3.connect(ROOT/'monitoramento/fonte_publica.sqlite3') as db:
        raw = json.loads(db.execute('SELECT payload FROM leituras_publicas ORDER BY instante DESC LIMIT 1').fetchone()[0])
    check(abs(raw['watts']/1000-initial['ultima_leitura']['potencia_kw'])<1e-9, 'Potência arquivada corresponde à resposta original em W')
    check(abs(raw['wattHours']/1000-initial['ultima_leitura']['contador_kwh'])<1e-9, 'Contador em Wh convertido corretamente para kWh')
    check(initial['horas_com_dados']>0 and len(initial['serie_horaria'])==48 and initial['energia_periodo_kwh']>0, 'Histórico horário externo carregado')
    check(abs(sum(h['energia_kwh'] for h in initial['serie_horaria'] if h['energia_kwh'] is not None)-initial['energia_periodo_kwh'])<.00001, 'Energia do período soma apenas valores publicados')
    export = requests.get(BASE+'/api/fonte-publica/exportar',timeout=10)
    export.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(export.text),delimiter=';'))
    check(len(rows)==48 and all(r['fonte']=='SOLARNETWORK_PUBLICO_EXTERNO' for r in rows), 'CSV conserva a origem externa e os 48 intervalos')
    check(all(r['energia_kwh']=='' for r in rows if r['qualidade']=='sem_leitura'), 'Lacunas permanecem em branco no CSV')
    paused = post('pausar')
    time.sleep(2.5)
    check(not get()['ativo'] and get()['total_leituras']==paused['total_leituras'], 'Pausa preserva histórico e interrompe coleta')
    resumed = post('iniciar')
    check(resumed['ativo'] and resumed['total_leituras']>=paused['total_leituras'], 'Retomada conserva as leituras anteriores')
    started = time.monotonic()
    check(requests.get(BASE+'/api/health',timeout=5).status_code==200 and time.monotonic()-started<2, 'Servidor segue respondendo durante o monitoramento')
    # Aguarda uma consulta do coletor, sem acionar manualmente a API externa.
    before = resumed['ultima_consulta_sucesso_em']
    deadline = time.monotonic()+75
    while time.monotonic()<deadline:
        time.sleep(2)
        updated = get()
        if updated['ultima_consulta_sucesso_em']!=before:
            break
    check(updated['ultima_consulta_sucesso_em']!=before and updated['erro'] is None, 'Nova consulta automática ocorre com o navegador fechado')
    check(updated['total_leituras']>=resumed['total_leituras'], 'Reconsultas não apagam dados nem fabricam amostras')
    check(fingerprint()==protected, 'Cadastro, modelos e metadados da IA preservados')
    after_sim = requests.get(BASE+'/api/monitoramento/status',timeout=10).json()
    check(after_sim['sessao_ativa_id']==simulador['sessao_ativa_id'] and after_sim['fonte']=='simulador', 'Histórico e fonte do simulador mantidos separados')
except Exception as exc:
    error = str(exc)
    raise
finally:
    report = {'checks':checks,'error':error,'fonte':get()['fonte'],'ultima_leitura':get()['ultima_leitura']}
    (ROOT.parent/'frontend/artifacts/fonte-publica-http.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'passed':sum(c['passed'] for c in checks),'total':len(checks),'error':error}))
