"""
Central de APIs Ativas e Personalizadas + Conector Universal de Inversor (Helionta).
Permite:
1. Visualizar e testar todas as APIs nativas do projeto (Open-Meteo Forecast, Geocoding, Archive,
   Conector do Inversor Principal e Webhook Local).
2. Cadastrar, testar, ativar/desativar e remover APIs personalizadas em SQLite.
3. Extrair potência (kW / W) de APIs REST JSON de inversores (SolarNetwork, Fronius Solar API,
   Shelly, Tasmota, gateways Growatt/Solarman/Huawei ou qualquer endpoint JSON customizado).
"""

from __future__ import annotations

import sqlite3
import time
import uuid
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import math
import requests

from solar_engine import carregar_config_ativa, salvar_config_ativa

TZ_BR = timezone(timedelta(hours=-3))

URL_SOLARNETWORK_EXEMPLO = (
    "https://data.solarnetwork.net/solarquery/api/v1/pub/datum/mostRecent"
    "?nodeId=1000&sourceId=%2F0145%2FS1%2FG1%2FINV%2F2"
)

MODELOS_CONECTOR_INVERSOR: list[dict[str, str]] = [
    {
        "id": "solarnetwork_teste",
        "nome": "SolarNetwork · API Real Online (pronta para testar)",
        "url": URL_SOLARNETWORK_EXEMPLO,
        "campo_potencia": "data.results.0.watts",
        "unidade": "W",
        "descricao": "API pública real já integrada no código (nó 1000 · inversor 2).",
    },
    {
        "id": "fronius_local",
        "nome": "Fronius Solar API (Rede Local Wi-Fi)",
        "url": "http://192.168.1.100/solar_api/v1/GetInverterRealtimeData.cgi?Scope=Device&DeviceId=1&DataCollection=CommonInverterData",
        "campo_potencia": "Body.Data.PAC.Value",
        "unidade": "W",
        "descricao": "Consulta direta ao IP local do inversor Fronius na sua rede.",
    },
    {
        "id": "shelly_esp32",
        "nome": "Medidor Wi-Fi Shelly EM / Tasmota / ESP32",
        "url": "http://192.168.1.120/emeter/0",
        "campo_potencia": "power",
        "unidade": "W",
        "descricao": "Leitura instantânea de medidor inteligente conectado ao quadro solar.",
    },
    {
        "id": "cloud_custom",
        "nome": "API Nuvem / Gateway (Growatt, Solarman, Huawei, WEG ou própria)",
        "url": "",
        "campo_potencia": "potencia_kw",
        "unidade": "kW",
        "descricao": "Informe o endpoint REST/JSON e o token de acesso da sua integradora ou portal.",
    },
]


def _validar_url_http(url: str) -> str:
    limpa = (url or "").strip()
    parsed = urlparse(limpa)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Informe uma URL válida começando com http:// ou https://.")
    return limpa


def _mascarar_token(token: str) -> str:
    t = (token or "").strip()
    if not t:
        return ""
    if len(t) <= 6:
        return "••••"
    return f"••••{t[-4:]}"


def extrair_valor_json(dados: Any, caminho: str = "") -> float | None:
    """
    Navega por um caminho separado por pontos (ex.: 'data.results.0.watts' ou 'Body.Data.PAC.Value')
    ou tenta chaves solares comuns automaticamente se o caminho estiver vazio.
    """
    if caminho and caminho.strip():
        atual = dados
        for parte in caminho.strip().split("."):
            if isinstance(atual, list):
                if not parte.isdigit():
                    return None
                idx = int(parte)
                if idx < 0 or idx >= len(atual):
                    return None
                atual = atual[idx]
            elif isinstance(atual, dict):
                if parte not in atual:
                    return None
                atual = atual[parte]
            else:
                return None
        return _converter_float(atual)

    # Busca automática em chaves comuns de inversores caso nenhum caminho seja especificado
    chaves_comuns = ("potencia_kw", "power_kw", "pac_kw", "kw", "watts", "power", "pac", "active_power")
    if isinstance(dados, dict):
        for ch in chaves_comuns:
            if ch in dados:
                val = _converter_float(dados[ch])
                if val is not None:
                    return val
        # Verifica também data.results[0] (padrão SolarNetwork) ou Body.Data.PAC.Value (Fronius)
        for sub_path in ("data.results.0.watts", "Body.Data.PAC.Value", "data.power_kw", "data.watts"):
            val = extrair_valor_json(dados, sub_path)
            if val is not None:
                return val
    return None


def _converter_float(valor: Any) -> float | None:
    if valor is None or isinstance(valor, bool):
        return None
    try:
        f = float(valor)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def testar_endpoint_externo(
    url: str,
    token: str = "",
    campo_potencia: str = "",
    unidade: str = "kW",
) -> dict[str, Any]:
    """Faz uma requisição GET controlada a um endpoint HTTP/JSON, medindo latência e extraindo potência."""
    url_valida = _validar_url_http(url)
    headers = {"Accept": "application/json", "User-Agent": "Helionta-Solar/3.1"}
    if token and token.strip() and not token.startswith("••••"):
        headers["Authorization"] = f"Bearer {token.strip()}"

    inicio = time.perf_counter()
    try:
        resp = requests.get(url_valida, headers=headers, timeout=(4, 8))
        latencia_ms = round((time.perf_counter() - inicio) * 1000)
        resp.raise_for_status()
        corpo = resp.json()
    except requests.RequestException as exc:
        latencia_ms = round((time.perf_counter() - inicio) * 1000)
        return {
            "ok": False,
            "status_code": getattr(getattr(exc, "response", None), "status_code", None),
            "latencia_ms": latencia_ms,
            "potencia_kw": None,
            "mensagem": f"Falha na conexão com a API ({exc.__class__.__name__}). Verifique a URL ou a rede.",
            "testado_em": datetime.now(TZ_BR).strftime("%H:%M:%S"),
        }
    except ValueError:
        latencia_ms = round((time.perf_counter() - inicio) * 1000)
        return {
            "ok": False,
            "status_code": 200,
            "latencia_ms": latencia_ms,
            "potencia_kw": None,
            "mensagem": "A URL respondeu, mas não retornou um formato JSON válido.",
            "testado_em": datetime.now(TZ_BR).strftime("%H:%M:%S"),
        }

    bruto = extrair_valor_json(corpo, campo_potencia)
    potencia_kw: float | None = None
    if bruto is not None:
        potencia_kw = round(max(0.0, bruto / 1000.0 if unidade.upper() == "W" else bruto), 3)

    detalhe_leitura = (
        f" · Leitura extraída: {potencia_kw:.3f} kW"
        if potencia_kw is not None
        else " · JSON recebido com sucesso"
    )
    return {
        "ok": True,
        "status_code": resp.status_code,
        "latencia_ms": latencia_ms,
        "potencia_kw": potencia_kw,
        "valor_bruto": bruto,
        "unidade": unidade,
        "mensagem": f"API online (HTTP {resp.status_code} em {latencia_ms} ms){detalhe_leitura}",
        "testado_em": datetime.now(TZ_BR).strftime("%H:%M:%S"),
    }


class CentralApisProjeto:
    def __init__(self, arquivo_sqlite: Path) -> None:
        self.arquivo = Path(arquivo_sqlite)
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        with self._conectar() as db, db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS apis_personalizadas (
                    id TEXT PRIMARY KEY,
                    nome TEXT NOT NULL,
                    categoria TEXT NOT NULL,
                    url TEXT NOT NULL,
                    token TEXT NOT NULL DEFAULT '',
                    campo_potencia TEXT NOT NULL DEFAULT '',
                    unidade TEXT NOT NULL DEFAULT 'kW',
                    ativa INTEGER NOT NULL DEFAULT 1,
                    ultimo_status TEXT,
                    ultima_latencia_ms INTEGER,
                    ultima_potencia_kw REAL,
                    ultimo_teste_em TEXT,
                    criada_em TEXT NOT NULL
                );
                """
            )
            # Pré-cadastra a API real de inversor da SolarNetwork caso o banco esteja vazio
            qtd = db.execute("SELECT COUNT(*) FROM apis_personalizadas").fetchone()[0]
            if qtd == 0:
                db.execute(
                    """
                    INSERT INTO apis_personalizadas (
                        id, nome, categoria, url, token, campo_potencia, unidade, ativa, criada_em
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "solarnetwork-demo-1000",
                        "Inversor SolarNetwork · Nó 1000 (API Real de Teste)",
                        "inversor",
                        URL_SOLARNETWORK_EXEMPLO,
                        "",
                        "data.results.0.watts",
                        "W",
                        1,
                        datetime.now(TZ_BR).isoformat(timespec="seconds"),
                    ),
                )

    def _conectar(self):
        conn = sqlite3.connect(self.arquivo, timeout=10)
        conn.row_factory = sqlite3.Row
        return closing(conn)

    def listar_tudo(self, pasta_saida: Path) -> dict[str, Any]:
        cfg = carregar_config_ativa(pasta_saida)
        modo_inv = cfg.get("modo_conexao_inversor", "api_inversor")
        url_inv = cfg.get("url_api_inversor") or URL_SOLARNETWORK_EXEMPLO

        apis_nativas = [
            {
                "id": "open_meteo_forecast",
                "nome": "Open-Meteo Forecast API",
                "papel": "Clima em tempo real e previsão horária de 24h",
                "categoria": "clima",
                "url": f"https://api.open-meteo.com/v1/forecast?latitude={cfg['latitude']}&longitude={cfg['longitude']}&hourly=shortwave_radiation,temperature_2m&forecast_days=1",
                "ativa": True,
                "editavel": False,
            },
            {
                "id": "open_meteo_geocoding",
                "nome": "Open-Meteo Geocoding API",
                "papel": "Busca de cidades e coordenadas para o mapa",
                "categoria": "geolocalizacao",
                "url": "https://geocoding-api.open-meteo.com/v1/search?name=Recife&count=1&language=pt",
                "ativa": True,
                "editavel": False,
            },
            {
                "id": "open_meteo_archive",
                "nome": "Open-Meteo Historical Archive API",
                "papel": "Clima histórico para auditoria de geração e diagnóstico das placas",
                "categoria": "historico",
                "url": f"https://archive-api.open-meteo.com/v1/archive?latitude={cfg['latitude']}&longitude={cfg['longitude']}&start_date=2025-01-01&end_date=2025-01-01&hourly=shortwave_radiation",
                "ativa": True,
                "editavel": False,
            },
            {
                "id": "conector_inversor_usina",
                "nome": f"Inversor da Usina ({cfg.get('provedor_inversor') or 'API HTTP'})",
                "papel": "Fonte configurada no Passo 1 para leitura direta do inversor",
                "categoria": "inversor",
                "url": url_inv if modo_inv == "api_inversor" else "http://127.0.0.1:8000/api/tempo-real/leitura",
                "campo_potencia": cfg.get("campo_potencia_json", "data.results.0.watts"),
                "unidade": cfg.get("unidade_potencia_api", "W"),
                "ativa": modo_inv in ("api_inversor", "webhook_push"),
                "modo_conexao": modo_inv,
                "editavel": True,
            },
            {
                "id": "helionta_webhook_local",
                "nome": "Helionta Webhook Local",
                "papel": "Recebe leituras via POST de Home Assistant, Node-RED, Shelly ou ESP32",
                "categoria": "webhook",
                "url": "http://127.0.0.1:8000/api/health",
                "endpoint_post": "POST http://127.0.0.1:8000/api/tempo-real/leitura",
                "ativa": True,
                "editavel": False,
            },
        ]

        with self._conectar() as db:
            rows = db.execute("SELECT * FROM apis_personalizadas ORDER BY criada_em DESC").fetchall()

        personalizadas = [
            {
                "id": r["id"],
                "nome": r["nome"],
                "categoria": r["categoria"],
                "url": r["url"],
                "possui_token": bool(r["token"]),
                "token_mascarado": _mascarar_token(r["token"]),
                "campo_potencia": r["campo_potencia"],
                "unidade": r["unidade"],
                "ativa": bool(r["ativa"]),
                "ultimo_status": r["ultimo_status"],
                "ultima_latencia_ms": r["ultima_latencia_ms"],
                "ultima_potencia_kw": r["ultima_potencia_kw"],
                "ultimo_teste_em": r["ultimo_teste_em"],
            }
            for r in rows
        ]

        return {
            "modelos_conector": MODELOS_CONECTOR_INVERSOR,
            "apis_nativas": apis_nativas,
            "apis_personalizadas": personalizadas,
            "total_ativas": sum(1 for a in apis_nativas if a["ativa"]) + sum(1 for p in personalizadas if p["ativa"]),
        }

    def adicionar_personalizada(
        self,
        nome: str,
        categoria: str,
        url: str,
        pasta_saida: Path,
        token: str = "",
        campo_potencia: str = "",
        unidade: str = "kW",
    ) -> dict[str, Any]:
        nome_limpo = (nome or "").strip()
        if not nome_limpo:
            raise ValueError("Informe um nome para identificar a API.")
        url_valida = _validar_url_http(url)
        cat = categoria if categoria in ("inversor", "clima", "medidor", "outro") else "inversor"
        unid = "W" if str(unidade).upper() == "W" else "kW"
        novo_id = f"api-{uuid.uuid4().hex[:8]}"

        with self._conectar() as db, db:
            db.execute(
                """
                INSERT INTO apis_personalizadas (
                    id, nome, categoria, url, token, campo_potencia, unidade, ativa, criada_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    novo_id,
                    nome_limpo[:80],
                    cat,
                    url_valida,
                    (token or "").strip(),
                    (campo_potencia or "").strip(),
                    unid,
                    datetime.now(TZ_BR).isoformat(timespec="seconds"),
                ),
            )
        return self.listar_tudo(pasta_saida)

    def alternar_ativa(self, api_id: str, ativa: bool, pasta_saida: Path) -> dict[str, Any]:
        with self._conectar() as db, db:
            cur = db.execute("UPDATE apis_personalizadas SET ativa = ? WHERE id = ?", (1 if ativa else 0, api_id))
            if cur.rowcount == 0:
                raise ValueError("API personalizada não encontrada.")
        return self.listar_tudo(pasta_saida)

    def remover_personalizada(self, api_id: str, pasta_saida: Path) -> dict[str, Any]:
        with self._conectar() as db, db:
            db.execute("DELETE FROM apis_personalizadas WHERE id = ?", (api_id,))
        return self.listar_tudo(pasta_saida)

    def testar_personalizada(self, api_id: str, pasta_saida: Path) -> dict[str, Any]:
        with self._conectar() as db:
            row = db.execute("SELECT * FROM apis_personalizadas WHERE id = ?", (api_id,)).fetchone()
        if not row:
            raise ValueError("API personalizada não encontrada.")

        res = testar_endpoint_externo(
            url=row["url"],
            token=row["token"],
            campo_potencia=row["campo_potencia"],
            unidade=row["unidade"],
        )
        with self._conectar() as db, db:
            db.execute(
                """
                UPDATE apis_personalizadas
                SET ultimo_status = ?, ultima_latencia_ms = ?, ultima_potencia_kw = ?, ultimo_teste_em = ?
                WHERE id = ?
                """,
                (
                    "online" if res["ok"] else "erro",
                    res["latencia_ms"],
                    res["potencia_kw"],
                    res["testado_em"],
                    api_id,
                ),
            )
        return {"resultado_teste": res, "central": self.listar_tudo(pasta_saida)}

    def usar_como_inversor_principal(self, api_id: str, pasta_saida: Path) -> dict[str, Any]:
        with self._conectar() as db:
            row = db.execute("SELECT * FROM apis_personalizadas WHERE id = ?", (api_id,)).fetchone()
        if not row:
            raise ValueError("API personalizada não encontrada.")
        cfg = carregar_config_ativa(pasta_saida)
        cfg.update(
            modo_conexao_inversor="api_inversor",
            provedor_inversor=row["nome"],
            url_api_inversor=row["url"],
            token_api_inversor=row["token"],
            campo_potencia_json=row["campo_potencia"],
            unidade_potencia_api=row["unidade"],
        )
        nova_cfg = salvar_config_ativa(pasta_saida, cfg)
        return {"config": nova_cfg, "central": self.listar_tudo(pasta_saida)}

    def ler_inversor_configurado(self, pasta_saida: Path) -> dict[str, Any]:
        """Consulta ao vivo a API do inversor configurada no Passo 1 e retorna a potência em kW."""
        cfg = carregar_config_ativa(pasta_saida)
        if cfg.get("modo_conexao_inversor") != "api_inversor":
            raise ValueError("Ative a conexão por API do inversor no Passo 1 antes de sincronizar.")
        url = cfg.get("url_api_inversor") or ""
        res = testar_endpoint_externo(
            url=url,
            token=cfg.get("token_api_inversor", ""),
            campo_potencia=cfg.get("campo_potencia_json", ""),
            unidade=cfg.get("unidade_potencia_api", "W"),
        )
        if not res["ok"]:
            raise ValueError(res["mensagem"])
        if res["potencia_kw"] is None:
            raise ValueError("A API respondeu, mas o campo de potência não foi encontrado no JSON.")
        return {
            **res,
            "origem": cfg.get("provedor_inversor") or "API do Inversor",
        }
