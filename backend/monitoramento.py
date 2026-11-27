"""Coletor persistente de leituras SIMULADAS. Não acessa hardware nem treina modelos."""
from __future__ import annotations

import json
import logging
import math
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Protocol

TZ = timezone(timedelta(hours=-3))
INTERVALO_COLETA = 2.0
PASSO_ACELERADO = timedelta(minutes=15)
LOG = logging.getLogger(__name__)


def agora_local() -> datetime:
    return datetime.now(TZ)


class FontePotencia(Protocol):
    def potencia_kw(self, instante: datetime, config: dict, cenario: str) -> float: ...


class InversorSimulado:
    """Curva artificial com geometria solar local; sem meteorologia online."""
    def potencia_kw(self, instante: datetime, config: dict, cenario: str) -> float:
        import pandas as pd
        from solar_engine import vector

        indice = pd.DatetimeIndex([instante.astimezone(TZ).replace(tzinfo=None)])
        up, north, east = (float(part[0]) for part in vector(indice, config))
        if up <= 0:
            return 0.0
        tilt = math.radians(config.get('inclinacao_graus', 10))
        azimuth = math.radians(config.get('azimute_graus', 0))
        incidence = max(0.0, up * math.cos(tilt) + math.sin(tilt) * (north * math.cos(azimuth) + east * math.sin(azimuth)))
        phase = instante.hour + instante.minute / 60
        factors = {'sol': .93, 'nublado': .49 + .12 * math.sin(phase * 2.1), 'chuva': .21 + .06 * math.sin(phase * 1.8)}
        kwp = config['quantidade_placas'] * config['potencia_placa_wp'] / 1000
        power = kwp * incidence * factors[cenario] * config.get('eficiencia_inversor', .96) * (1 - config.get('perdas_dc', .08))
        return round(min(max(power, 0.0), config['inversor_kw']), 6)


class MonitoramentoSolar:
    def __init__(self, arquivo: Path, fonte: FontePotencia | None = None,
                 relogio: Callable[[], datetime] = agora_local):
        self.arquivo = Path(arquivo)
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        self.fonte = fonte or InversorSimulado()
        self.relogio = relogio
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        with self._conexao() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sessoes (
                    id TEXT PRIMARY KEY, criada_em TEXT NOT NULL, config TEXT NOT NULL,
                    modo TEXT NOT NULL, cenario TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS controle (
                    id INTEGER PRIMARY KEY CHECK (id=1), sessao TEXT,
                    ativo INTEGER NOT NULL DEFAULT 0, erro TEXT
                );
                INSERT OR IGNORE INTO controle(id,ativo) VALUES(1,0);
                CREATE TABLE IF NOT EXISTS leituras (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, sessao TEXT NOT NULL,
                    instante TEXT NOT NULL, recebido_em TEXT NOT NULL,
                    potencia_kw REAL NOT NULL, energia_total_kwh REAL NOT NULL,
                    intervalo_valido INTEGER NOT NULL, UNIQUE(sessao,instante)
                );
                CREATE INDEX IF NOT EXISTS idx_leituras_sessao ON leituras(sessao,id);
                CREATE TABLE IF NOT EXISTS horas (
                    sessao TEXT NOT NULL, inicio TEXT NOT NULL,
                    energia_kwh REAL NOT NULL, segundos REAL NOT NULL,
                    PRIMARY KEY(sessao,inicio)
                );
            ''')

    def _conexao(self):
        db = sqlite3.connect(self.arquivo, timeout=10)
        db.row_factory = sqlite3.Row
        return closing_connection(db)

    def iniciar_coletor(self):
        with self.lock:
            if self.thread and self.thread.is_alive():
                return
            self.stop_event.clear()
            self.thread = threading.Thread(target=self._loop, name='helionta-simulador', daemon=True)
            self.thread.start()

    def parar_coletor(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)

    def _loop(self):
        while not self.stop_event.wait(INTERVALO_COLETA):
            try:
                self.coletar()
            except Exception:
                LOG.exception('Falha na coleta simulada')
                with self.lock, self._conexao() as db:
                    db.execute('UPDATE controle SET erro=? WHERE id=1', ('A coleta falhou. Pause e tente iniciar novamente.',))

    def iniciar(self, config: dict, modo: str = 'acelerado', cenario: str = 'sol', nova_sessao: bool = False):
        if modo not in ('acelerado', 'tempo_real') or cenario not in ('sol', 'nublado', 'chuva'):
            raise ValueError('Modo ou cenário de simulação inválido.')
        with self.lock, self._conexao() as db:
            controle = db.execute('SELECT * FROM controle WHERE id=1').fetchone()
            antiga = db.execute('SELECT * FROM sessoes WHERE id=?', (controle['sessao'],)).fetchone()
            encoded = json.dumps(config, sort_keys=True, ensure_ascii=False)
            if nova_sessao or not antiga or antiga['config'] != encoded or antiga['modo'] != modo or antiga['cenario'] != cenario:
                sid = uuid.uuid4().hex
                db.execute('INSERT INTO sessoes VALUES(?,?,?,?,?)', (sid, self.relogio().isoformat(), encoded, modo, cenario))
            else:
                sid = antiga['id']
            db.execute('UPDATE controle SET sessao=?,ativo=1,erro=NULL WHERE id=1', (sid,))
        self.coletar(avancar=False)
        return self.estado()

    def pausar(self):
        with self.lock, self._conexao() as db:
            db.execute('UPDATE controle SET ativo=0 WHERE id=1')
        return self.estado()

    def coletar(self, avancar: bool = True):
        with self.lock, self._conexao() as db:
            controle = db.execute('SELECT * FROM controle WHERE id=1').fetchone()
            if not controle['ativo'] or not controle['sessao']:
                return
            sessao = db.execute('SELECT * FROM sessoes WHERE id=?', (controle['sessao'],)).fetchone()
            anterior = db.execute('SELECT * FROM leituras WHERE sessao=? ORDER BY id DESC LIMIT 1', (sessao['id'],)).fetchone()
            recebido = self.relogio().astimezone(TZ)
            if sessao['modo'] == 'acelerado':
                if anterior:
                    if not avancar:
                        return
                    instante = datetime.fromisoformat(anterior['instante']) + PASSO_ACELERADO
                else:
                    instante = recebido.replace(hour=6, minute=0, second=0, microsecond=0)
            else:
                instante = recebido
            cfg = json.loads(sessao['config'])
            potencia = float(self.fonte.potencia_kw(instante, cfg, sessao['cenario']))
            if not math.isfinite(potencia) or potencia < 0 or potencia > cfg['inversor_kw'] + .000001:
                raise ValueError('Potência fora dos limites do inversor simulado.')
            total = anterior['energia_total_kwh'] if anterior else 0.0
            valido = False
            if anterior:
                antes = datetime.fromisoformat(anterior['instante'])
                seconds = (instante - antes).total_seconds()
                if seconds <= 0:
                    return
                valido = sessao['modo'] == 'acelerado' or seconds <= INTERVALO_COLETA * 3
                if valido:
                    # Integral trapezoidal em kWh, repartida nos limites de cada hora.
                    cursor = antes
                    while cursor < instante:
                        hora = cursor.replace(minute=0, second=0, microsecond=0)
                        fim = min(hora + timedelta(hours=1), instante)
                        inicio_frac = (cursor - antes).total_seconds() / seconds
                        fim_frac = (fim - antes).total_seconds() / seconds
                        p0 = anterior['potencia_kw'] + (potencia - anterior['potencia_kw']) * inicio_frac
                        p1 = anterior['potencia_kw'] + (potencia - anterior['potencia_kw']) * fim_frac
                        duracao = (fim - cursor).total_seconds()
                        energia = (p0 + p1) / 2 * duracao / 3600
                        total += energia
                        db.execute('''INSERT INTO horas VALUES(?,?,?,?)
                            ON CONFLICT(sessao,inicio) DO UPDATE SET
                            energia_kwh=energia_kwh+excluded.energia_kwh,
                            segundos=segundos+excluded.segundos''', (sessao['id'], hora.isoformat(), energia, duracao))
                        cursor = fim
            db.execute('INSERT INTO leituras(sessao,instante,recebido_em,potencia_kw,energia_total_kwh,intervalo_valido) VALUES(?,?,?,?,?,?)',
                       (sessao['id'], instante.isoformat(), recebido.isoformat(), potencia, total, int(valido)))
            db.execute('UPDATE controle SET erro=NULL WHERE id=1')

    def estado(self, sessao_id: str | None = None):
        with self.lock, self._conexao() as db:
            controle = db.execute('SELECT * FROM controle WHERE id=1').fetchone()
            sid = sessao_id or controle['sessao']
            sessao = db.execute('SELECT * FROM sessoes WHERE id=?', (sid,)).fetchone()
            if sessao_id and not sessao:
                raise ValueError('Simulação não encontrada.')
            sessoes = db.execute('SELECT id,criada_em,modo,cenario FROM sessoes ORDER BY criada_em DESC, rowid DESC LIMIT 30').fetchall()
            base = {'fonte': 'simulador', 'simulado': True, 'conexao_hardware': False,
                    'intervalo_coleta_segundos': INTERVALO_COLETA, 'passo_simulado_minutos': 15,
                    'sessoes': [dict(row) for row in sessoes], 'sessao_ativa_id': controle['sessao'], 'servidor_agora': self.relogio().isoformat()}
            if not sessao:
                return {**base, 'estado': 'aguardando', 'ativo': False, 'sessao': None,
                        'ultima_leitura': None, 'serie_horaria': [], 'total_leituras': 0,
                        'energia_total_kwh': 0.0, 'energia_dia_kwh': 0.0, 'erro': None}
            atual = sid == controle['sessao']
            ativo = bool(atual and controle['ativo'])
            ultima = db.execute('SELECT * FROM leituras WHERE sessao=? ORDER BY id DESC LIMIT 1', (sid,)).fetchone()
            primeira = db.execute('SELECT instante FROM leituras WHERE sessao=? ORDER BY id LIMIT 1', (sid,)).fetchone()
            count = db.execute('SELECT COUNT(*) FROM leituras WHERE sessao=?', (sid,)).fetchone()[0]
            serie = []
            energia_dia = 0.0
            if ultima:
                ultimo_tempo = datetime.fromisoformat(ultima['instante'])
                inicio_dia = ultimo_tempo.replace(hour=0, minute=0, second=0, microsecond=0)
                energia_dia = db.execute('SELECT COALESCE(SUM(energia_kwh),0) FROM horas WHERE sessao=? AND inicio>=?', (sid, inicio_dia.isoformat())).fetchone()[0]
                inicio = max(datetime.fromisoformat(primeira['instante']).replace(minute=0, second=0, microsecond=0),
                             ultimo_tempo.replace(minute=0, second=0, microsecond=0) - timedelta(hours=47))
                horas = {row['inicio']: row for row in db.execute('SELECT * FROM horas WHERE sessao=? AND inicio>=? ORDER BY inicio', (sid, inicio.isoformat()))}
                cursor = inicio
                while cursor <= ultimo_tempo.replace(minute=0, second=0, microsecond=0):
                    row = horas.get(cursor.isoformat())
                    fim = cursor + timedelta(hours=1)
                    segundos = row['segundos'] if row else 0
                    situacao = 'completa' if segundos >= 3599.99 else 'parcial' if row else 'sem_leitura'
                    serie.append({'data_hora': fim.isoformat(), 'inicio': cursor.isoformat(), 'rotulo': fim.strftime('%d/%m %Hh'),
                                  'energia_kwh': round(row['energia_kwh'], 6) if row else None,
                                  'cobertura_minutos': round(segundos / 60, 2), 'situacao': situacao,
                                  'em_andamento': cursor <= ultimo_tempo < fim, 'fonte': 'simulador'})
                    cursor = fim
            erro = controle['erro'] if atual else None
            atraso = (self.relogio() - datetime.fromisoformat(ultima['recebido_em'])).total_seconds() if ultima else None
            estado = 'erro' if erro else 'atrasado' if ativo and (atraso is None or atraso > 10) else 'simulando' if ativo else 'pausado'
            return {**base, 'estado': estado, 'ativo': ativo, 'sessao': {'id': sid, 'modo': sessao['modo'],
                    'cenario': sessao['cenario'], 'criada_em': sessao['criada_em'], 'config': json.loads(sessao['config'])},
                    'ultima_leitura': dict(ultima) if ultima else None, 'serie_horaria': serie,
                    'total_leituras': count, 'energia_total_kwh': round(ultima['energia_total_kwh'], 6) if ultima else 0.0,
                    'energia_dia_kwh': round(energia_dia, 6), 'erro': erro}


class closing_connection:
    """Transação e fechamento também em caso de falha; sqlite3.__exit__ não fecha."""
    def __init__(self, db):
        self.db = db
    def __enter__(self):
        return self.db
    def __exit__(self, *args):
        try:
            return self.db.__exit__(*args)
        finally:
            self.db.close()
