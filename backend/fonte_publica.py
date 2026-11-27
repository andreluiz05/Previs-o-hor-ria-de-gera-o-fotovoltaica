"""Coleta somente leitura de uma fonte solar pública, sem vínculo com a usina local."""
from __future__ import annotations

import json
import logging
import math
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from monitoramento import closing_connection
import sqlite3

UTC = timezone.utc
BASE = 'https://data.solarnetwork.net/solarquery/api/v1/pub/'
NODE_ID = 1000
SOURCE_ID = '/0145/S1/G1/INV/2'
INTERVALO = 60
INTERVALO_HISTORICO = 600
FONTE = {
    'provedor': 'SolarNetwork', 'node_id': NODE_ID, 'source_id': SOURCE_ID,
    'nome': 'Inversor 2 · fonte pública externa', 'fuso_origem': 'America/New_York',
    'localizacao': 'Localização exata não publicada', 'capacidade_kw': None,
    'fabricante': None, 'modelo': None, 'simulado': False,
    'url': 'https://solarnetwork.net/',
    'url_consulta': BASE + 'datum/mostRecent?nodeId=1000&sourceId=%2F0145%2FS1%2FG1%2FINV%2F2',
    'aviso': 'Leituras publicadas por uma instalação externa. Não representam sua casa nem usam os equipamentos ou o clima de Igarassu.',
}
LOG = logging.getLogger(__name__)


def instante(valor: str) -> datetime:
    dt = datetime.fromisoformat(valor.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise ValueError('A fonte não informou o fuso da leitura.')
    return dt.astimezone(UTC)


def numero(valor):
    if valor is None:
        return None
    if isinstance(valor, bool):
        raise ValueError('Valor numérico inválido na fonte.')
    n = float(valor)
    if not math.isfinite(n):
        raise ValueError('Valor não finito na fonte.')
    return n


def conferir_fonte(row: dict):
    if row.get('nodeId') != NODE_ID or row.get('sourceId') != SOURCE_ID:
        raise ValueError('A resposta pertence a outra fonte; leitura recusada.')


class SolarNetworkClient:
    """Host e fonte fixos: não aceita URLs arbitrárias nem dados de consumo."""
    def _get(self, endpoint, params):
        r = requests.get(BASE + endpoint, params=params, timeout=(4, 10))
        r.raise_for_status()
        obj = r.json()
        if obj.get('success') is not True:
            raise ValueError('SolarNetwork não confirmou a consulta.')
        data = obj.get('data') or {}
        if not isinstance(data, dict) or not isinstance(data.get('results'), list):
            raise ValueError('Resposta inesperada da SolarNetwork.')
        if data.get('totalResults', len(data['results'])) > 100:
            raise ValueError('Histórico excedeu o limite da consulta.')
        return data['results']

    def ultima(self):
        rows = self._get('datum/mostRecent', {'nodeId': NODE_ID, 'sourceId': SOURCE_ID})
        if not rows:
            raise ValueError('A fonte pública não disponibilizou uma leitura.')
        for row in rows:
            conferir_fonte(row)
        return max(rows, key=lambda r: instante(r['created']))

    def historico(self, agora):
        fim = agora.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
        return self._get('datum/list', {
            'nodeId': NODE_ID, 'sourceId': SOURCE_ID, 'aggregation': 'Hour', 'max': 100,
            'startDate': (fim - timedelta(hours=48)).strftime('%Y-%m-%dT%H:%M'),
            'endDate': fim.strftime('%Y-%m-%dT%H:%M'),
        })


class MonitorPublico:
    def __init__(self, arquivo: Path, cliente=None, relogio=None):
        self.arquivo = Path(arquivo)
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        self.cliente = cliente or SolarNetworkClient()
        self.relogio = relogio or (lambda: datetime.now(UTC))
        self.coleta_lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None
        with self._db() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS controle_publico (
                    id INTEGER PRIMARY KEY CHECK(id=1), ativo INTEGER DEFAULT 0,
                    tentativa TEXT, sucesso TEXT, historico TEXT, erro TEXT, erro_historico TEXT
                );
                INSERT OR IGNORE INTO controle_publico(id,ativo) VALUES(1,0);
                CREATE TABLE IF NOT EXISTS leituras_publicas (
                    instante TEXT PRIMARY KEY, recebido_em TEXT NOT NULL,
                    potencia_kw REAL, contador_kwh REAL, payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS horas_publicas (
                    inicio TEXT PRIMARY KEY, energia_kwh REAL, qualidade TEXT NOT NULL,
                    consultado_em TEXT NOT NULL, payload TEXT NOT NULL
                );
            ''')

    def _db(self):
        db = sqlite3.connect(self.arquivo, timeout=10)
        db.row_factory = sqlite3.Row
        return closing_connection(db)

    def iniciar_coletor(self):
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._loop, name='helionta-fonte-publica', daemon=True)
        self.thread.start()

    def parar_coletor(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=15)

    def _loop(self):
        while not self.stop_event.wait(2):
            try:
                self.coletar()
            except Exception:
                LOG.exception('Falha interna no coletor público')

    def iniciar(self):
        with self._db() as db:
            db.execute('UPDATE controle_publico SET ativo=1 WHERE id=1')
        self.coletar()
        return self.estado()

    def pausar(self):
        with self._db() as db:
            db.execute('UPDATE controle_publico SET ativo=0 WHERE id=1')
        return self.estado()

    def coletar(self):
        if not self.coleta_lock.acquire(blocking=False):
            return
        try:
            agora = self.relogio().astimezone(UTC)
            with self._db() as db:
                ctl = db.execute('SELECT * FROM controle_publico WHERE id=1').fetchone()
                if not ctl['ativo'] or (ctl['tentativa'] and (agora - instante(ctl['tentativa'])).total_seconds() < INTERVALO):
                    return
                db.execute('UPDATE controle_publico SET tentativa=? WHERE id=1', (agora.isoformat(),))
            row = self.cliente.ultima()
            conferir_fonte(row)
            ts = instante(row['created'])
            if ts > agora + timedelta(minutes=5):
                raise ValueError('A fonte retornou uma leitura no futuro.')
            power = numero(row.get('watts'))
            counter = numero(row.get('wattHours'))
            if power is None and counter is None:
                raise ValueError('A fonte não informou potência nem energia acumulada.')
            if counter is not None and counter < 0:
                raise ValueError('Contador de energia negativo na fonte.')
            with self._db() as db:
                if not db.execute('SELECT ativo FROM controle_publico WHERE id=1').fetchone()[0]:
                    return
                db.execute('''INSERT INTO leituras_publicas VALUES(?,?,?,?,?)
                    ON CONFLICT(instante) DO UPDATE SET recebido_em=excluded.recebido_em,
                    potencia_kw=excluded.potencia_kw,contador_kwh=excluded.contador_kwh,payload=excluded.payload''',
                    (ts.isoformat(), agora.isoformat(), power / 1000 if power is not None else None,
                     counter / 1000 if counter is not None else None, json.dumps(row)))
                db.execute('UPDATE controle_publico SET sucesso=?,erro=NULL WHERE id=1', (agora.isoformat(),))
            if not ctl['historico'] or (agora - instante(ctl['historico'])).total_seconds() >= INTERVALO_HISTORICO:
                try:
                    self._salvar_historico(self.cliente.historico(agora), agora)
                except (requests.RequestException, ValueError, KeyError, TypeError, OverflowError):
                    with self._db() as db:
                        db.execute('UPDATE controle_publico SET erro_historico=? WHERE id=1',
                                   ('O histórico por hora não pôde ser atualizado. As leituras anteriores foram preservadas.',))
        except (requests.RequestException, ValueError, KeyError, TypeError, OverflowError) as exc:
            with self._db() as db:
                db.execute('UPDATE controle_publico SET erro=? WHERE id=1',
                           (f'Consulta online indisponível ({type(exc).__name__}). O coletor tentará novamente em um minuto; nenhum dado será simulado.',))
        finally:
            self.coleta_lock.release()

    def _salvar_historico(self, rows, agora):
        fim = agora.replace(minute=0, second=0, microsecond=0)
        inicio = fim - timedelta(hours=48)
        parsed = []
        vistos = set()
        for row in rows:
            conferir_fonte(row)
            ts = instante(row['created'])
            if not inicio <= ts < fim or ts.minute or ts.second or ts.microsecond or ts in vistos:
                raise ValueError('Horário inválido ou repetido no histórico público.')
            vistos.add(ts)
            wh = numero(row.get('wattHours'))
            start, end = numero(row.get('wattHours_start')), numero(row.get('wattHours_end'))
            qualidade = 'informada_provedor'
            if wh is None:
                qualidade = 'sem_energia'
            elif wh < 0 or (start is not None and end is not None and end < start):
                qualidade, wh = 'contador_inconsistente', None
            parsed.append((ts.isoformat(), wh / 1000 if wh is not None else None,
                           qualidade, agora.isoformat(), json.dumps(row)))
        with self._db() as db:
            if not db.execute('SELECT ativo FROM controle_publico WHERE id=1').fetchone()[0]:
                return
            # Substitui apenas a janela consultada; horas omitidas deixam de parecer disponíveis.
            db.execute('DELETE FROM horas_publicas WHERE inicio>=? AND inicio<?', (inicio.isoformat(), fim.isoformat()))
            db.executemany('INSERT OR REPLACE INTO horas_publicas VALUES(?,?,?,?,?)', parsed)
            db.execute('UPDATE controle_publico SET historico=?,erro_historico=NULL WHERE id=1', (agora.isoformat(),))

    def estado(self):
        agora = self.relogio().astimezone(UTC)
        fim = agora.replace(minute=0, second=0, microsecond=0)
        inicio = fim - timedelta(hours=48)
        with self._db() as db:
            ctl = dict(db.execute('SELECT * FROM controle_publico WHERE id=1').fetchone())
            ultimas = [dict(row) for row in db.execute(
                'SELECT instante, recebido_em, potencia_kw, contador_kwh FROM leituras_publicas ORDER BY instante DESC LIMIT 5'
            )]
            count = db.execute('SELECT COUNT(*) FROM leituras_publicas').fetchone()[0]
            hours = {r['inicio']: dict(r) for r in db.execute('SELECT * FROM horas_publicas WHERE inicio>=? AND inicio<?', (inicio.isoformat(), fim.isoformat()))}
        ultima = ultimas[0] if ultimas else None
        age = max(0, (agora - instante(ultima['instante'])).total_seconds()) if ultima else None
        estado = ('pausado' if not ctl['ativo'] else 'erro' if ctl['erro'] else 'aguardando' if not ultima
                  else 'atrasado' if age > 1200 else 'online')
        serie = []
        for i in range(48):
            ts = inicio + timedelta(hours=i)
            item = hours.get(ts.isoformat())
            serie.append({'inicio': ts.isoformat(), 'fim': (ts + timedelta(hours=1)).isoformat(),
                          'energia_kwh': item['energia_kwh'] if item else None,
                          'qualidade': item['qualidade'] if item else 'sem_leitura',
                          'consultado_em': item['consultado_em'] if item else None})
        return {'fonte': FONTE, 'simulado': False, 'ativo': bool(ctl['ativo']), 'estado': estado,
                'conexao_hardware_local': False, 'em_consulta': self.coleta_lock.locked(),
                'ultima_leitura': ultima, 'leituras_recentes': ultimas,
                'idade_leitura_segundos': round(age) if age is not None else None,
                'ultima_tentativa_em': ctl['tentativa'], 'ultima_consulta_sucesso_em': ctl['sucesso'],
                'historico_consultado_em': ctl['historico'], 'intervalo_consulta_segundos': INTERVALO,
                'erro': ctl['erro'], 'erro_historico': ctl['erro_historico'],
                'serie_horaria': serie, 'total_leituras': count,
                'energia_periodo_kwh': round(sum(r['energia_kwh'] for r in serie if r['energia_kwh'] is not None), 6),
                'horas_com_dados': sum(r['energia_kwh'] is not None for r in serie),
                'periodo_inicio': inicio.isoformat(), 'periodo_fim': fim.isoformat()}
