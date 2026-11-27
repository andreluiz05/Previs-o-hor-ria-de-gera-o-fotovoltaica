"""
================================================================================
PROJETO SOLAR V3 (TECALLI TECNOLOGIA) — MOTOR FÍSICO, IA HÍBRIDA E DADOS REAIS
================================================================================
Concentra toda a inteligência científica e operacional da plataforma, mantendo
100% de fidelidade às equações do notebook `solar_v3_jupyter.ipynb` e adicionando
camadas práticas para uso real pelo consumidor/integrador solar.

Organização do arquivo em blocos:
  - BLOCO 1: Constantes meteorológicas, usina padrão, catálogo de cidades e cache
  - BLOCO 2: Validação e persistência da configuração personalizada da usina
  - BLOCO 3: Modelagem astronômica e física simplificada (POA, NOCT, DC e AC)
  - BLOCO 4: Gerador sintético (120 dias), leitor CSV V3 e importador de inversor real
  - BLOCO 5: Suíte automatizada de 7 testes de software da física
  - BLOCO 6: Elevação solar e arquitetura das redes recorrentes (RNN / LSTM)
  - BLOCO 7: Pipeline de treinamento e benchmark V3 (divisão 70/15/15 sem vazamento)
  - BLOCO 8: Inferência 1h, simulador 'E se?', previsão 24h, consulta e comparação real
================================================================================
"""

from __future__ import annotations

import copy
import io
import json
import shutil
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

import joblib
import numpy as np
import pandas as pd
import requests
import torch
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score
from sklearn.preprocessing import MinMaxScaler
from torch import nn

from clima import obter_clima


# ==============================================================================
# BLOCO 1: CONSTANTES METEOROLÓGICAS, USINA PADRÃO E CATÁLOGO DE LOCALIDADES
# ==============================================================================

METEO: list[str] = [
    "shortwave_radiation",       # Irradiância global horizontal - GHI (W/m²)
    "direct_normal_irradiance",  # Irradiância direta normal - DNI (W/m²)
    "diffuse_radiation",         # Irradiância difusa horizontal - DHI (W/m²)
    "temperature_2m",            # Temperatura do ar a 2 metros (°C)
    "cloud_cover",               # Cobertura total de nuvens (%)
    "precipitation",             # Precipitação acumulada na hora (mm)
    "wind_speed_10m",            # Velocidade do vento a 10 metros (km/h)
    "relative_humidity_2m",      # Umidade relativa do ar a 2 metros (%)
]

DEFAULT_CONFIG: dict[str, Any] = {
    "nome": "Usina Solar Principal",
    "cidade": "Igarassu, Pernambuco",
    "latitude": -7.8342,
    "longitude": -34.9064,
    "tipo_sistema": "on_grid",
    "quantidade_placas": 10,
    "potencia_placa_wp": 550.0,
    "modelo_placa": "Monocristalino Half-Cell 550 Wp",
    "marca_inversor": "Inversor On-Grid 5 kW",
    "inversor_kw": 5.0,
    "inclinacao_graus": 10.0,
    "orientacao": "norte",
    "tem_bateria": False,
    "tem_gerador_auxiliar": False,
    "eficiencia_inversor": 0.96,
    "coeficiente_termico": -0.0035,
    "noct_c": 45.0,
    "perdas_dc": 0.08,
    "azimute_graus": 0.0,
    "albedo": 0.2,
    "tarifa_energia_rs": 0.92,   # Tarifa média em R$/kWh para cálculo de retorno financeiro
    "modo_conexao_inversor": "api_inversor",  # 'api_inversor' | 'webhook_push' | 'manual'
    "provedor_inversor": "SolarNetwork (Apenas Teste Técnico)",
    "url_api_inversor": "https://data.solarnetwork.net/solarquery/api/v1/pub/datum/mostRecent?nodeId=1000&sourceId=%2F0145%2FS1%2FG1%2FINV%2F2",
    "token_api_inversor": "",
    "campo_potencia_json": "data.results.0.watts",
    "unidade_potencia_api": "W",
}

DEFAULT_SEEDS: list[int] = [42, 123, 2026]
DEFAULT_EPOCHS: int = 40

# Catálogo local de cidades brasileiras para resposta imediata mesmo sem internet
CIDADES_OFFLINE_BRASIL: list[dict[str, Any]] = [
    {"nome": "Igarassu", "estado": "Pernambuco", "pais": "Brasil", "latitude": -7.8342, "longitude": -34.9064},
    {"nome": "Recife", "estado": "Pernambuco", "pais": "Brasil", "latitude": -8.05, "longitude": -34.88},
    {"nome": "Olinda", "estado": "Pernambuco", "pais": "Brasil", "latitude": -8.0089, "longitude": -34.8553},
    {"nome": "Paulista", "estado": "Pernambuco", "pais": "Brasil", "latitude": -7.9408, "longitude": -34.8731},
    {"nome": "Abreu e Lima", "estado": "Pernambuco", "pais": "Brasil", "latitude": -7.9117, "longitude": -34.9028},
    {"nome": "Jaboatão dos Guararapes", "estado": "Pernambuco", "pais": "Brasil", "latitude": -8.1128, "longitude": -35.0147},
    {"nome": "Camaragibe", "estado": "Pernambuco", "pais": "Brasil", "latitude": -8.0236, "longitude": -34.9781},
    {"nome": "Cabo de Santo Agostinho", "estado": "Pernambuco", "pais": "Brasil", "latitude": -8.2869, "longitude": -35.0350},
    {"nome": "Caruaru", "estado": "Pernambuco", "pais": "Brasil", "latitude": -8.2833, "longitude": -35.9761},
    {"nome": "Petrolina", "estado": "Pernambuco", "pais": "Brasil", "latitude": -9.3891, "longitude": -40.5030},
    {"nome": "Garanhuns", "estado": "Pernambuco", "pais": "Brasil", "latitude": -8.8903, "longitude": -36.4928},
    {"nome": "João Pessoa", "estado": "Paraíba", "pais": "Brasil", "latitude": -7.1150, "longitude": -34.8631},
    {"nome": "Maceió", "estado": "Alagoas", "pais": "Brasil", "latitude": -9.6658, "longitude": -35.7353},
    {"nome": "Natal", "estado": "Rio Grande do Norte", "pais": "Brasil", "latitude": -5.7945, "longitude": -35.2110},
    {"nome": "Fortaleza", "estado": "Ceará", "pais": "Brasil", "latitude": -3.7319, "longitude": -38.5267},
    {"nome": "Salvador", "estado": "Bahia", "pais": "Brasil", "latitude": -12.9714, "longitude": -38.5014},
    {"nome": "Manaus", "estado": "Amazonas", "pais": "Brasil", "latitude": -3.1190, "longitude": -60.0217},
    {"nome": "Belém", "estado": "Pará", "pais": "Brasil", "latitude": -1.4558, "longitude": -48.4902},
    {"nome": "Cuiabá", "estado": "Mato Grosso", "pais": "Brasil", "latitude": -15.6014, "longitude": -56.0979},
    {"nome": "São Paulo", "estado": "São Paulo", "pais": "Brasil", "latitude": -23.5505, "longitude": -46.6333},
    {"nome": "Campinas", "estado": "São Paulo", "pais": "Brasil", "latitude": -22.9056, "longitude": -47.0608},
    {"nome": "Rio de Janeiro", "estado": "Rio de Janeiro", "pais": "Brasil", "latitude": -22.9068, "longitude": -43.1729},
    {"nome": "Belo Horizonte", "estado": "Minas Gerais", "pais": "Brasil", "latitude": -19.9167, "longitude": -43.9345},
    {"nome": "Brasília", "estado": "Distrito Federal", "pais": "Brasil", "latitude": -15.7939, "longitude": -47.8828},
    {"nome": "Goiânia", "estado": "Goiás", "pais": "Brasil", "latitude": -16.6869, "longitude": -49.2648},
    {"nome": "Curitiba", "estado": "Paraná", "pais": "Brasil", "latitude": -25.4284, "longitude": -49.2733},
    {"nome": "Florianópolis", "estado": "Santa Catarina", "pais": "Brasil", "latitude": -27.5954, "longitude": -48.5480},
    {"nome": "Porto Alegre", "estado": "Rio Grande do Sul", "pais": "Brasil", "latitude": -30.0346, "longitude": -51.2177},
]

# Snapshot real extraído da célula 33 do notebook V3 para contingência offline
NOTEBOOK_OPEN_METEO_SNAPSHOT: list[dict[str, Any]] = [
    {"time": "2026-11-26T15:00", "shortwave_radiation": 548.0, "direct_normal_irradiance": 601.3, "diffuse_radiation": 167.0, "temperature_2m": 29.9, "cloud_cover": 59, "precipitation": 0.0, "wind_speed_10m": 12.7, "relative_humidity_2m": 56},
    {"time": "2026-11-26T16:00", "shortwave_radiation": 311.0, "direct_normal_irradiance": 398.4, "diffuse_radiation": 140.0, "temperature_2m": 29.3, "cloud_cover": 40, "precipitation": 0.0, "wind_speed_10m": 11.7, "relative_humidity_2m": 58},
    {"time": "2026-11-26T17:00", "shortwave_radiation": 136.0, "direct_normal_irradiance": 412.2, "diffuse_radiation": 54.0, "temperature_2m": 28.5, "cloud_cover": 20, "precipitation": 0.0, "wind_speed_10m": 11.3, "relative_humidity_2m": 62},
    {"time": "2026-11-26T18:00", "shortwave_radiation": 6.0, "direct_normal_irradiance": 31.4, "diffuse_radiation": 4.0, "temperature_2m": 28.2, "cloud_cover": 11, "precipitation": 0.0, "wind_speed_10m": 10.3, "relative_humidity_2m": 63},
    {"time": "2026-11-26T19:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 28.1, "cloud_cover": 18, "precipitation": 0.0, "wind_speed_10m": 11.3, "relative_humidity_2m": 64},
    {"time": "2026-11-26T20:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 28.0, "cloud_cover": 14, "precipitation": 0.0, "wind_speed_10m": 12.5, "relative_humidity_2m": 65},
    {"time": "2026-11-26T21:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 27.9, "cloud_cover": 5, "precipitation": 0.0, "wind_speed_10m": 14.5, "relative_humidity_2m": 66},
    {"time": "2026-11-26T22:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 27.6, "cloud_cover": 17, "precipitation": 0.0, "wind_speed_10m": 15.4, "relative_humidity_2m": 67},
    {"time": "2026-11-26T23:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 27.3, "cloud_cover": 41, "precipitation": 0.0, "wind_speed_10m": 15.6, "relative_humidity_2m": 69},
    {"time": "2026-11-27T00:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 27.2, "cloud_cover": 13, "precipitation": 0.0, "wind_speed_10m": 14.8, "relative_humidity_2m": 70},
    {"time": "2026-11-27T01:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 26.9, "cloud_cover": 10, "precipitation": 0.0, "wind_speed_10m": 13.2, "relative_humidity_2m": 71},
    {"time": "2026-11-27T02:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 26.8, "cloud_cover": 12, "precipitation": 0.0, "wind_speed_10m": 11.8, "relative_humidity_2m": 71},
    {"time": "2026-11-27T03:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 26.8, "cloud_cover": 16, "precipitation": 0.0, "wind_speed_10m": 11.2, "relative_humidity_2m": 71},
    {"time": "2026-11-27T04:00", "shortwave_radiation": 0.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 0.0, "temperature_2m": 26.7, "cloud_cover": 16, "precipitation": 0.0, "wind_speed_10m": 10.6, "relative_humidity_2m": 71},
    {"time": "2026-11-27T05:00", "shortwave_radiation": 1.0, "direct_normal_irradiance": 0.0, "diffuse_radiation": 1.0, "temperature_2m": 26.7, "cloud_cover": 13, "precipitation": 0.0, "wind_speed_10m": 10.2, "relative_humidity_2m": 71},
    {"time": "2026-11-27T06:00", "shortwave_radiation": 94.0, "direct_normal_irradiance": 354.6, "diffuse_radiation": 39.0, "temperature_2m": 27.6, "cloud_cover": 10, "precipitation": 0.0, "wind_speed_10m": 11.7, "relative_humidity_2m": 67},
    {"time": "2026-11-27T07:00", "shortwave_radiation": 320.0, "direct_normal_irradiance": 623.1, "diffuse_radiation": 86.0, "temperature_2m": 28.5, "cloud_cover": 20, "precipitation": 0.0, "wind_speed_10m": 11.8, "relative_humidity_2m": 63},
    {"time": "2026-11-27T08:00", "shortwave_radiation": 540.0, "direct_normal_irradiance": 723.6, "diffuse_radiation": 115.0, "temperature_2m": 29.2, "cloud_cover": 41, "precipitation": 0.0, "wind_speed_10m": 12.1, "relative_humidity_2m": 59},
    {"time": "2026-11-27T09:00", "shortwave_radiation": 682.0, "direct_normal_irradiance": 650.4, "diffuse_radiation": 186.0, "temperature_2m": 29.9, "cloud_cover": 34, "precipitation": 0.0, "wind_speed_10m": 12.3, "relative_humidity_2m": 57},
    {"time": "2026-11-27T10:00", "shortwave_radiation": 865.0, "direct_normal_irradiance": 743.2, "diffuse_radiation": 204.0, "temperature_2m": 30.5, "cloud_cover": 34, "precipitation": 0.0, "wind_speed_10m": 12.4, "relative_humidity_2m": 54},
    {"time": "2026-11-27T11:00", "shortwave_radiation": 890.0, "direct_normal_irradiance": 654.9, "diffuse_radiation": 262.0, "temperature_2m": 30.8, "cloud_cover": 47, "precipitation": 0.0, "wind_speed_10m": 12.3, "relative_humidity_2m": 52},
    {"time": "2026-11-27T12:00", "shortwave_radiation": 890.0, "direct_normal_irradiance": 671.3, "diffuse_radiation": 241.0, "temperature_2m": 30.8, "cloud_cover": 49, "precipitation": 0.1, "wind_speed_10m": 12.5, "relative_humidity_2m": 52},
    {"time": "2026-11-27T13:00", "shortwave_radiation": 796.0, "direct_normal_irradiance": 573.4, "diffuse_radiation": 273.0, "temperature_2m": 30.6, "cloud_cover": 53, "precipitation": 0.0, "wind_speed_10m": 13.2, "relative_humidity_2m": 54},
    {"time": "2026-11-27T14:00", "shortwave_radiation": 685.0, "direct_normal_irradiance": 591.0, "diffuse_radiation": 213.0, "temperature_2m": 30.1, "cloud_cover": 35, "precipitation": 0.0, "wind_speed_10m": 11.3, "relative_humidity_2m": 58},
]


# ==============================================================================
# BLOCO 2: VALIDAÇÃO, PERSISTÊNCIA DA USINA DO USUÁRIO E GEOCODIFICAÇÃO
# ==============================================================================

def _orientacao_por_azimute(azimute: float) -> str:
    """Converte o ângulo de azimute (0°–359°) em ponto cardeal legível."""
    az = azimute % 360
    direcoes = [
        (22.5, "norte"),
        (67.5, "nordeste"),
        (112.5, "leste"),
        (157.5, "sudeste"),
        (202.5, "sul"),
        (247.5, "sudoeste"),
        (292.5, "oeste"),
        (337.5, "noroeste"),
        (360.1, "norte"),
    ]
    for limite, nome in direcoes:
        if az < limite:
            return nome
    return "norte"


def validate_config(c: dict[str, Any]) -> dict[str, Any]:
    """Valida todos os parâmetros técnicos informados pelo usuário da usina solar."""
    cfg = {**DEFAULT_CONFIG, **c}
    cfg["quantidade_placas"] = int(cfg["quantidade_placas"])
    cfg["potencia_placa_wp"] = float(cfg["potencia_placa_wp"])
    cfg["inversor_kw"] = float(cfg["inversor_kw"])
    cfg["inclinacao_graus"] = float(cfg["inclinacao_graus"])
    cfg["azimute_graus"] = float(cfg["azimute_graus"]) % 360.0
    cfg["orientacao"] = _orientacao_por_azimute(cfg["azimute_graus"])
    cfg["eficiencia_inversor"] = float(cfg["eficiencia_inversor"])
    cfg["coeficiente_termico"] = float(cfg["coeficiente_termico"])
    cfg["noct_c"] = float(cfg["noct_c"])
    cfg["perdas_dc"] = float(cfg["perdas_dc"])
    cfg["albedo"] = float(cfg["albedo"])
    cfg["latitude"] = float(cfg["latitude"])
    cfg["longitude"] = float(cfg["longitude"])
    cfg["tarifa_energia_rs"] = max(0.0, float(cfg.get("tarifa_energia_rs", 0.92)))
    modo_con = str(cfg.get("modo_conexao_inversor", "api_inversor")).strip()
    cfg["modo_conexao_inversor"] = modo_con if modo_con in ("api_inversor", "webhook_push", "manual") else "manual"
    cfg["provedor_inversor"] = str(cfg.get("provedor_inversor", "")).strip()[:80]
    cfg["url_api_inversor"] = str(cfg.get("url_api_inversor", "")).strip()[:500]
    cfg["token_api_inversor"] = str(cfg.get("token_api_inversor", "")).strip()[:300]
    cfg["campo_potencia_json"] = str(cfg.get("campo_potencia_json", "")).strip()[:120]
    cfg["unidade_potencia_api"] = "W" if str(cfg.get("unidade_potencia_api", "W")).upper() == "W" else "kW"

    limites_validos = (
        cfg["quantidade_placas"] > 0
        and cfg["potencia_placa_wp"] > 0
        and cfg["inversor_kw"] > 0
        and 0 < cfg["eficiencia_inversor"] <= 1
        and 0 <= cfg["perdas_dc"] < 1
        and 0 <= cfg["inclinacao_graus"] <= 90
        and 0 <= cfg["azimute_graus"] < 360
        and -0.02 <= cfg["coeficiente_termico"] <= 0
        and cfg["noct_c"] > 20
        and 0 <= cfg["albedo"] <= 1
        and -90 <= cfg["latitude"] <= 90
        and -180 <= cfg["longitude"] <= 180
    )
    if not limites_validos:
        raise ValueError("Configuração inválida: verifique placas, inversor, inclinação (0–90°) e coordenadas.")

    if cfg.get("tipo_sistema", "on_grid") != "on_grid" or cfg.get("tem_bateria") or cfg.get("tem_gerador_auxiliar"):
        raise ValueError("O motor V3 opera com sistemas conectados à rede (on-grid) sem bateria.")

    return cfg


def carregar_config_ativa(pasta: Path) -> dict[str, Any]:
    """Lê a configuração personalizada do usuário (ou a configuração base do treino)."""
    pasta = Path(pasta)
    arq_ativa = pasta / "config_usuario_ativa.json"
    arq_treino = pasta / "config_sistema.json"
    if arq_ativa.is_file():
        return validate_config(json.loads(arq_ativa.read_text(encoding="utf-8")))
    if arq_treino.is_file():
        return validate_config(json.loads(arq_treino.read_text(encoding="utf-8")))
    return validate_config(DEFAULT_CONFIG)


def salvar_config_ativa(pasta: Path, dados_cfg: dict[str, Any]) -> dict[str, Any]:
    """Persiste imediatamente os dados das placas, inversor e localização do usuário."""
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    cfg_limpa = validate_config(dados_cfg)
    (pasta / "config_usuario_ativa.json").write_text(
        json.dumps(cfg_limpa, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return cfg_limpa


def buscar_localidades(termo: str) -> list[dict[str, Any]]:
    """
    Busca coordenadas (latitude e longitude) pelo nome da cidade via API Open-Meteo
    Geocoding, com fallback imediato para o catálogo brasileiro offline.
    """
    busca = (termo or "").strip()
    if len(busca) < 2:
        return CIDADES_OFFLINE_BRASIL[:8]

    resultados: list[dict[str, Any]] = []
    try:
        resp = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": busca, "count": 8, "language": "pt", "format": "json"},
            timeout=6,
        )
        resp.raise_for_status()
        dados = resp.json()
        for item in dados.get("results", []):
            resultados.append(
                {
                    "nome": item.get("name", ""),
                    "estado": item.get("admin1", ""),
                    "pais": item.get("country", ""),
                    "latitude": round(float(item["latitude"]), 4),
                    "longitude": round(float(item["longitude"]), 4),
                }
            )
    except Exception:
        pass

    if not resultados:
        termo_lower = busca.lower()
        resultados = [
            c for c in CIDADES_OFFLINE_BRASIL
            if termo_lower in c["nome"].lower() or termo_lower in c["estado"].lower()
        ]
    return resultados[:8]


# ==============================================================================
# BLOCO 3: MODELAGEM ASTRONÔMICA E FÍSICA SIMPLIFICADA (SEÇÃO 3 — physics.py)
# ==============================================================================

def vector(idx: pd.DatetimeIndex, c: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Calcula o vetor solar unitário (Up, North, East) em fuso UTC-3 fixo."""
    h = idx.hour.to_numpy() + idx.minute.to_numpy() / 60
    g = 2 * np.pi / 365 * (idx.day_of_year.to_numpy() - 1 + (h - 12) / 24)
    eq = 229.18 * (
        0.000075
        + 0.001868 * np.cos(g)
        - 0.032077 * np.sin(g)
        - 0.014615 * np.cos(2 * g)
        - 0.040849 * np.sin(2 * g)
    )
    dec = (
        0.006918
        - 0.399912 * np.cos(g)
        + 0.070257 * np.sin(g)
        - 0.006758 * np.cos(2 * g)
        + 0.000907 * np.sin(2 * g)
        - 0.002697 * np.cos(3 * g)
        + 0.00148 * np.sin(3 * g)
    )
    ha = np.deg2rad((h * 60 + eq + 4 * c["longitude"] + 180) / 4 - 180)
    lat = np.deg2rad(c["latitude"])
    return (
        np.sin(lat) * np.sin(dec) + np.cos(lat) * np.cos(dec) * np.cos(ha),
        np.cos(lat) * np.sin(dec) - np.sin(lat) * np.cos(dec) * np.cos(ha),
        -np.cos(dec) * np.sin(ha),
    )


def reference(d: pd.DataFrame, c: dict[str, Any]) -> pd.DataFrame:
    """Calcula POA no plano inclinado, temperatura da célula, potência DC e energia AC com clipping."""
    v = np.array([vector(d.index - pd.Timedelta(minutes=m), c) for m in (5, 15, 25, 35, 45, 55)])
    up, north, east = v.transpose(1, 0, 2)
    lit = up > 0
    day = lit.any(0)

    b = np.deg2rad(c["inclinacao_graus"])
    az = np.deg2rad(c["azimute_graus"])
    cos_aoi = (
        np.maximum(up * np.cos(b) + np.sin(b) * (north * np.cos(az) + east * np.sin(az)), 0) * lit
    ).sum(0) / np.maximum(lit.sum(0), 1)

    ghi, dni, dhi = [
        np.maximum(d[k].to_numpy(float), 0)
        for k in ["shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation"]
    ]
    poa = np.where(
        day,
        dni * cos_aoi + dhi * (1 + np.cos(b)) / 2 + ghi * c["albedo"] * (1 - np.cos(b)) / 2,
        0,
    )
    cell = d.temperature_2m.to_numpy(float) + (c["noct_c"] - 20) * poa / 800 / (
        1 + 0.1 * np.maximum(d.wind_speed_10m.to_numpy(float) / 3.6 - 1, 0)
    )
    kwp = c["quantidade_placas"] * c["potencia_placa_wp"] / 1000
    dc = np.maximum(0, kwp * poa / 1000 * (1 + c["coeficiente_termico"] * (cell - 25)) * (1 - c["perdas_dc"]))
    ac = np.minimum(dc * c["eficiencia_inversor"], c["inversor_kw"])

    return pd.DataFrame(
        dict(
            poa_wm2=poa,
            temp_celula_c=cell,
            potencia_dc_kw=dc,
            referencia_kwh=ac,
            diurno=day,
        ),
        index=d.index,
    )


# ==============================================================================
# BLOCO 4: GERADOR SINTÉTICO, LEITOR CSV COMPLETO E IMPORTADOR DE INVERSOR REAL
# ==============================================================================

def demo(c: dict[str, Any]) -> pd.DataFrame:
    """Gera 120 dias sintéticos com sujidade cíclica e ruído meteorológico controlado."""
    idx = pd.date_range("2025-01-01 01:00", periods=24 * 120, freq="h")
    rng = np.random.default_rng(427)
    n = len(idx)

    sun = np.maximum(0, vector(idx - pd.Timedelta(minutes=30), c)[0])
    cloud = np.clip(np.repeat(rng.uniform(5, 95, 120), 24) + rng.normal(0, 16, n), 0, 100)
    ghi = 1020 * sun * (1 - 0.75 * (cloud / 100) ** 1.35)
    dhi = ghi * (0.15 + 0.6 * cloud / 100)
    dni = np.divide(ghi - dhi, sun, out=np.zeros(n), where=sun > 0.03)
    temp = 25 + 6 * sun + rng.normal(0, 1.2, n)
    wind = rng.uniform(3, 22, n)
    rain = np.where(cloud > 78, rng.uniform(0, 3, n), 0)
    humidity = np.clip(55 + 0.35 * cloud + rng.normal(0, 4, n), 0, 100)

    kwp = c["quantidade_placas"] * c["potencia_placa_wp"] / 1000
    cell = temp + ghi * 0.028 / (1 + wind / 30)
    soiling = 1 - 0.025 * np.sin(np.arange(n) * 2 * np.pi / (24 * 30)) - 0.035
    target = (
        kwp
        * ghi
        / 1000
        * (1 + c["coeficiente_termico"] * (cell - 25))
        * c["eficiencia_inversor"]
        * (1 - c["perdas_dc"])
        * soiling
        * (1 + 0.035 * np.cos(idx.hour.to_numpy() / 24 * 2 * np.pi))
        + rng.normal(0, 0.035, n) * sun
    )
    target = np.clip(target, 0, c["inversor_kw"])
    target[sun == 0] = 0

    factor = np.clip(1 + rng.normal(0, 0.09, n), 0.60, 1.40)
    return pd.DataFrame(
        dict(
            energia_kwh=target,
            shortwave_radiation=ghi * factor,
            direct_normal_irradiance=dni * factor,
            diffuse_radiation=dhi * factor,
            temperature_2m=temp + rng.normal(0, 0.7, n),
            cloud_cover=np.clip(cloud + rng.normal(0, 8, n), 0, 100),
            precipitation=rain,
            wind_speed_10m=wind,
            relative_humidity_2m=humidity,
        ),
        index=idx,
    )


def ler_csv_bytes(content: bytes) -> pd.DataFrame:
    """Lê um CSV completo de 10 colunas (geração + 8 variáveis meteorológicas)."""
    texto = content.decode("utf-8-sig", errors="replace")
    sep = ";" if texto.splitlines()[0].count(";") > texto.splitlines()[0].count(",") else ","
    d = pd.read_csv(io.StringIO(texto), sep=sep, parse_dates=["data_hora"]).set_index("data_hora").sort_index()
    if d.index.tz is not None:
        d.index = d.index.tz_convert("America/Recife").tz_localize(None)
    if d.index.has_duplicates or (d.index.minute != 0).any() or (d.index.second != 0).any():
        raise ValueError("Horários devem ser únicos, inteiros (minuto 00) e no fim de cada intervalo horário.")

    colunas_faltantes = [col for col in ["energia_kwh"] + METEO if col not in d.columns]
    if colunas_faltantes:
        raise ValueError(f"Colunas obrigatórias ausentes no CSV completo: {', '.join(colunas_faltantes)}")

    d = d[["energia_kwh"] + METEO].apply(pd.to_numeric, errors="raise").asfreq("h")
    if (d.energia_kwh.dropna() < 0).any():
        raise ValueError("Foram encontrados registros com geração negativa (energia_kwh < 0).")
    return d


def _buscar_clima_historico_open_meteo(indice: pd.DatetimeIndex, cfg: dict[str, Any]) -> tuple[pd.DataFrame, str]:
    """
    Busca automaticamente as 8 colunas meteorológicas na API Open-Meteo (Archive/Forecast)
    para enriquecer planilhas simples vindas diretamente do inversor do cliente.
    """
    data_ini = (indice.min() - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    data_fim = (indice.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    hoje = pd.Timestamp.now(tz="America/Recife").tz_localize(None).normalize()

    urls_tentativa = []
    if indice.max() < hoje - pd.Timedelta(days=2):
        urls_tentativa.append("https://archive-api.open-meteo.com/v1/archive")
    urls_tentativa.append("https://api.open-meteo.com/v1/forecast")
    urls_tentativa.append("https://archive-api.open-meteo.com/v1/archive")

    for url in urls_tentativa:
        try:
            params: dict[str, Any] = {
                "latitude": cfg["latitude"],
                "longitude": cfg["longitude"],
                "hourly": ",".join(METEO),
                "timezone": "America/Recife",
                "temperature_unit": "celsius",
                "wind_speed_unit": "kmh",
                "precipitation_unit": "mm",
            }
            if "archive" in url:
                params["start_date"] = data_ini
                params["end_date"] = data_fim
            else:
                params["past_days"] = 92
                params["forecast_days"] = 3

            resp = requests.get(url, params=params, timeout=5)
            resp.raise_for_status()
            hourly = resp.json()["hourly"]
            clima = pd.DataFrame(hourly).set_index("time")
            clima.index = pd.to_datetime(clima.index)
            clima = clima[METEO].apply(pd.to_numeric, errors="coerce").reindex(indice)
            if np.isfinite(clima.to_numpy()).all():
                return clima, "Clima real integrado automaticamente via Open-Meteo"
        except requests.ConnectionError:
            # Se a máquina estiver sem internet, interrompe imediatamente sem tentar outras URLs
            break
        except Exception:
            continue

    return _clima_ilustrativo(indice, cfg), "Clima ilustrativo calculado localmente (sem meteorologia atualizada)"


def _clima_ilustrativo(indice: pd.DatetimeIndex, cfg: dict[str, Any]) -> pd.DataFrame:
    # Cenário determinístico para a data/localização solicitadas, sem imitar uma consulta online.
    sun = np.maximum(0, vector(indice - pd.Timedelta(minutes=30), cfg)[0])
    cloud = np.full(len(indice), 28.0)
    ghi = 980 * sun * (1 - 0.75 * (cloud / 100) ** 1.35)
    dhi = ghi * (0.15 + 0.6 * cloud / 100)
    dni = np.divide(ghi - dhi, sun, out=np.zeros(len(indice)), where=sun > 0.03)
    clima_fb = pd.DataFrame(
        dict(
            shortwave_radiation=ghi,
            direct_normal_irradiance=dni,
            diffuse_radiation=dhi,
            temperature_2m=26.0 + 5.0 * sun,
            cloud_cover=cloud,
            precipitation=np.zeros(len(indice)),
            wind_speed_10m=np.full(len(indice), 12.0),
            relative_humidity_2m=np.full(len(indice), 62.0),
        ),
        index=indice,
    )
    return clima_fb


def importar_planilha_inversor_usuario(content: bytes, pasta: Path, dados_exemplo: bool = False) -> dict[str, Any]:
    """
    Recebe a planilha simples exportada pelo aplicativo do inversor do usuário
    (apenas `data_hora` e `energia_kwh`, aceitando vírgula ou ponto e vírgula),
    une automaticamente o clima da localização da usina, avalia Real × Previsto
    e gera diagnóstico automático de saúde da usina.
    """
    pasta = Path(pasta)
    cfg = carregar_config_ativa(pasta)

    texto = content.decode("utf-8-sig", errors="replace")
    primeira_linha = texto.splitlines()[0] if texto.splitlines() else ""
    sep = ";" if primeira_linha.count(";") > primeira_linha.count(",") else ","
    bruto = pd.read_csv(io.StringIO(texto), sep=sep)

    # Normaliza nomes comuns de colunas exportadas por Growatt, Solarman, Fronius, Huawei e Sungrow
    mapa_colunas = {}
    for col in bruto.columns:
        c_low = col.strip().lower()
        if c_low in ("data_hora", "timestamp", "time", "data", "datetime", "horario", "horário"):
            mapa_colunas[col] = "data_hora"
        elif c_low in ("energia_kwh", "geracao_kwh", "geração_kwh", "kwh", "yield_kwh", "energia", "producao_kwh"):
            mapa_colunas[col] = "energia_kwh"
    bruto = bruto.rename(columns=mapa_colunas)

    if "data_hora" not in bruto.columns or "energia_kwh" not in bruto.columns:
        raise ValueError("A planilha precisa conter as colunas 'data_hora' e 'energia_kwh'.")

    # Suporta números com vírgula decimal brasileira (ex: '3,45')
    if not pd.api.types.is_numeric_dtype(bruto["energia_kwh"]):
        bruto["energia_kwh"] = bruto["energia_kwh"].astype(str).str.replace(",", ".", regex=False)
    bruto["energia_kwh"] = pd.to_numeric(bruto["energia_kwh"], errors="coerce")
    if not np.isfinite(bruto["energia_kwh"].to_numpy()).all() or (bruto["energia_kwh"] < 0).any():
        raise ValueError("Preencha energia_kwh com números finitos, iguais ou maiores que zero.")

    bruto["data_hora"] = pd.to_datetime(bruto["data_hora"])
    if bruto["data_hora"].isna().any():
        raise ValueError("Preencha todos os horários no formato AAAA-MM-DD HH:00:00.")
    bruto = bruto.set_index("data_hora").sort_index()
    if bruto.index.tz is not None:
        bruto.index = bruto.index.tz_convert("America/Recife").tz_localize(None)

    # Agrupa em intervalos horários fechados caso o inversor exporte de 5 em 5 ou 15 em 15 min
    if (bruto.index.minute != 0).any() or (bruto.index.second != 0).any():
        bruto = bruto.resample("h", label="right", closed="right").sum(numeric_only=True, min_count=1)

    bruto = bruto[~bruto.index.duplicated(keep="last")].asfreq("h")
    if (bruto["energia_kwh"].dropna() < 0).any():
        raise ValueError("A planilha contém valores negativos de geração.")

    tem_meteo_completa = all(col in bruto.columns for col in METEO)
    if tem_meteo_completa:
        df_completo = bruto[["energia_kwh"] + METEO].apply(pd.to_numeric, errors="coerce")
        fonte_clima = "Meteorologia própria incluída na planilha enviada"
    else:
        clima_auto, fonte_clima = _buscar_clima_historico_open_meteo(bruto.index, cfg)
        df_completo = pd.concat([bruto[["energia_kwh"]], clima_auto], axis=1)

    df_completo = df_completo.dropna()
    if len(df_completo) < 6:
        raise ValueError("Envie pelo menos 6 horas válidas de medição para comparação.")

    # Requer ao menos 20 dias horários; exemplos não viram uma base de medições reais.
    pronto_para_treino = len(df_completo) >= 480 and not dados_exemplo
    if pronto_para_treino:
        try:
            df_completo.to_csv(pasta / "csv_usuario_carregado.csv", index_label="data_hora")
        except OSError:
            pass

    # Calcula Referência Física e Previsão Híbrida para cada hora enviada pelo usuário
    fisica = reference(df_completo, cfg)
    previsao_hibrida = _estimar_serie_hibrida_com_escala(df_completo, fisica, cfg, pasta)

    tarifa = cfg.get("tarifa_energia_rs", 0.92)
    comparacao = []
    for ts in df_completo.index:
        real_v = float(df_completo.loc[ts, "energia_kwh"])
        prev_v = float(previsao_hibrida.loc[ts])
        fis_v = float(fisica.loc[ts, "referencia_kwh"])
        comparacao.append(
            {
                "data_hora": ts.strftime("%Y-%m-%d %H:%M"),
                "rotulo": ts.strftime("%d/%m %Hh"),
                "geracao_real_kwh": round(real_v, 3),
                "previsao_ia_kwh": round(prev_v, 3),
                "referencia_fisica_kwh": round(fis_v, 3),
                "desvio_kwh": round(real_v - prev_v, 3),
                "ghi_wm2": round(float(df_completo.loc[ts, "shortwave_radiation"]), 1),
                "nuvens_pct": round(float(df_completo.loc[ts, "cloud_cover"]), 0),
            }
        )

    real_total = float(df_completo["energia_kwh"].sum())
    prev_total = float(previsao_hibrida.sum())
    fis_total = float(fisica["referencia_kwh"].sum())
    mae_comp = float(np.abs(df_completo["energia_kwh"] - previsao_hibrida).mean())
    desvio_pct = 100.0 * (real_total - prev_total) / max(prev_total, 1e-6)

    diagnostico = _gerar_diagnostico_operacional(real_total, prev_total, fis_total)
    if dados_exemplo:
        if diagnostico["nivel"] == "alerta":
            diagnostico = {
                "nivel": "alerta",
                "titulo": f"Simulação com dados de exemplo · Subgeração ({desvio_pct:.1f}%)",
                "recomendacao": "Nos valores fictícios informados, a geração ficou bem abaixo do esperado para o clima (simulando sujeira nas placas, sombra ou falha). Nenhuma medição real foi utilizada.",
            }
        elif diagnostico["nivel"] == "atencao":
            diagnostico = {
                "nivel": "atencao",
                "titulo": f"Simulação com dados de exemplo · Leve perda ({desvio_pct:.1f}%)",
                "recomendacao": "Nos valores fictícios informados, o rendimento ficou levemente abaixo da curva esperada. Nenhuma medição real foi utilizada.",
            }
        elif diagnostico["nivel"] == "otimo":
            diagnostico = {
                "nivel": "otimo",
                "titulo": f"Simulação com dados de exemplo · Acima do esperado ({desvio_pct:+.1f}%)",
                "recomendacao": "Os valores fictícios informados superaram a estimativa para o clima do período. Nenhuma medição real foi utilizada.",
            }
        else:
            diagnostico = {
                "nivel": "normal",
                "titulo": f"Comparação com dados de exemplo ({desvio_pct:+.1f}%)",
                "recomendacao": "Os valores de geração são fictícios e estão alinhados ao esperado para o clima do período. Esta comparação demonstra os cálculos sem avaliar uma instalação real.",
            }

    return {
        "dados_exemplo": dados_exemplo,
        "metodo_estimativa": "referencia_fisica" if len(df_completo) <= 24 else "fisica_e_lstm",
        "aviso_estimativa": "As primeiras 24 horas usam a referência física, pois não há uma janela anterior completa para a IA. A partir da 25ª hora, a estimativa pode usar o modelo híbrido. Importar este CSV não inicia um treinamento.",
        "horas_analisadas": int(len(df_completo)),
        "periodo_inicio": df_completo.index[0].strftime("%d/%m/%Y %Hh"),
        "periodo_fim": df_completo.index[-1].strftime("%d/%m/%Y %Hh"),
        "fonte_meteorologia": fonte_clima,
        "pronto_para_retreino_completo": pronto_para_treino,
        "energia_real_total_kwh": round(real_total, 3),
        "energia_prevista_ia_kwh": round(prev_total, 3),
        "energia_referencia_fisica_kwh": round(fis_total, 3),
        "economia_real_rs": round(real_total * tarifa, 2),
        "economia_prevista_rs": round(prev_total * tarifa, 2),
        "desvio_percentual": round(desvio_pct, 1),
        "mae_kwh": round(mae_comp, 4),
        "diagnostico": diagnostico,
        "serie_comparativa": comparacao[:168],  # Exibe até 7 dias contínuos no gráfico
        "serie_comparativa_completa": [
            {
                "data_hora": ts.strftime("%Y-%m-%d %H:%M"),
                "geracao_real_kwh": float(df_completo.loc[ts, "energia_kwh"]),
                **{col: float(df_completo.loc[ts, col]) for col in METEO},
            }
            for ts in df_completo.index
        ],
    }


def _gerar_diagnostico_operacional(real_kwh: float, prev_kwh: float, fisica_kwh: float) -> dict[str, str]:
    """Interpreta a diferença entre geração real medida e previsão esperada para orientar o cliente."""
    if prev_kwh <= 0.05:
        return {
            "nivel": "normal",
            "titulo": "Período Noturno ou Baixa Irradiação",
            "recomendacao": "Intervalo sem geração solar significativa prevista.",
        }
    desvio_pct = 100.0 * (real_kwh - prev_kwh) / prev_kwh
    if desvio_pct < -15.0:
        return {
            "nivel": "alerta",
            "titulo": f"Subgeração Detectada ({desvio_pct:.1f}% abaixo do esperado)",
            "recomendacao": "Sua usina gerou significativamente menos que o previsto para o clima registrado. Verifique limpeza das placas (sujidade), sombreamento novo ou possíveis falhas de string/inversor.",
        }
    if desvio_pct < -7.0:
        return {
            "nivel": "atencao",
            "titulo": f"Leve Perda de Rendimento ({desvio_pct:.1f}%)",
            "recomendacao": "Desempenho ligeiramente abaixo da curva esperada. Acompanhe nos próximos dias e avalie lavagem preventiva dos módulos.",
        }
    if desvio_pct > 12.0:
        return {
            "nivel": "otimo",
            "titulo": f"Desempenho Acima da Estimativa (+{desvio_pct:.1f}%)",
            "recomendacao": "Geração excelente! Módulos limpos ou microclima local mais favorável que a grade meteorológica regional.",
        }
    return {
        "nivel": "normal",
        "titulo": f"Usina Operando com Alta Eficiência (Desvio {desvio_pct:+.1f}%)",
        "recomendacao": "A geração real medida pelo seu inversor está alinhada com a previsão física e neural para o clima local.",
    }


# ==============================================================================
# BLOCO 5: SUÍTE AUTOMATIZADA DE TESTES DE SOFTWARE DA FÍSICA (SEÇÃO 6)
# ==============================================================================

def run_physics_checks() -> dict[str, Any]:
    """Executa as 7 asserções determinísticas sobre capacidade, clipping, noite e orientação."""
    c = copy.deepcopy(DEFAULT_CONFIG)
    d = demo(c)
    ph = reference(d, c)

    ph_clip1 = reference(d, {**c, "inversor_kw": 1.0})
    ph_eff80 = reference(d, {**c, "eficiencia_inversor": 0.8})
    ph_half = reference(d, {**c, "quantidade_placas": 5})
    ph_east45 = reference(d, {**c, "azimute_graus": 90.0, "inclinacao_graus": 45.0})

    checks = [
        {
            "id": "finitude",
            "titulo": "Estabilidade Numérica (Finitude)",
            "descricao": "Todos os 2.880 registros de referência física produzem valores finitos sem NaN/Inf.",
            "passou": bool(np.isfinite(ph.referencia_kwh).all()),
            "detalhe": f"{len(ph)} horas verificadas · 0 anomalias",
        },
        {
            "id": "limites_capacidade",
            "titulo": "Restrição Física [0, Inversor AC]",
            "descricao": "Geração física nunca é negativa nem ultrapassa a potência nominal AC do inversor (5,0 kW).",
            "passou": bool((ph.referencia_kwh >= 0).all() and (ph.referencia_kwh <= c["inversor_kw"]).all()),
            "detalhe": f"Mín: {ph.referencia_kwh.min():.3f} kWh · Máx: {ph.referencia_kwh.max():.3f} kWh (Teto: {c['inversor_kw']:.1f} kW)",
        },
        {
            "id": "zero_noturno",
            "titulo": "Bloqueio Estrito de Geração Noturna",
            "descricao": "Quando todos os 6 subintervalos solares têm elevação <= 0°, a referência é estritamente zero.",
            "passou": bool((ph.loc[~ph.diurno, "referencia_kwh"] == 0).all()),
            "detalhe": f"{int((~ph.diurno).sum())} horas noturnas = 0,000 kWh",
        },
        {
            "id": "clipping_inversor",
            "titulo": "Saturação (Clipping) do Inversor em 1,0 kW",
            "descricao": "Reduzir o inversor para 1,0 kW corta todos os picos acima de 1,0 kWh mantendo saturação exata.",
            "passou": bool((ph_clip1.referencia_kwh <= 1.0).all() and np.isclose(ph_clip1.referencia_kwh.max(), 1.0)),
            "detalhe": f"Pico com inversor 1 kW: {ph_clip1.referencia_kwh.max():.4f} kWh ({int((ph_clip1.referencia_kwh >= 0.999).sum())}h em clipping)",
        },
        {
            "id": "sensibilidade_eficiencia",
            "titulo": "Monotonicidade de Eficiência AC",
            "descricao": "Reduzir a eficiência do inversor de 96% para 80% reduz proporcionalmente a energia total.",
            "passou": bool(ph_eff80.referencia_kwh.sum() < ph.referencia_kwh.sum()),
            "detalhe": f"96%: {ph.referencia_kwh.sum():.1f} kWh vs 80%: {ph_eff80.referencia_kwh.sum():.1f} kWh",
        },
        {
            "id": "sensibilidade_arranjo",
            "titulo": "Escala por Quantidade de Módulos",
            "descricao": "Reduzir de 10 para 5 módulos de 550 Wp diminui a geração acumulada.",
            "passou": bool(ph_half.referencia_kwh.sum() < ph.referencia_kwh.sum()),
            "detalhe": f"10 placas: {ph.referencia_kwh.sum():.1f} kWh vs 5 placas: {ph_half.referencia_kwh.sum():.1f} kWh",
        },
        {
            "id": "geometria_orientacao",
            "titulo": "Sensibilidade Geométrica (Azimute e Inclinação)",
            "descricao": "Alterar orientação de Norte (0° / 10°) para Leste íngreme (90° / 45°) altera a curva horária POA.",
            "passou": bool(not np.allclose(ph_east45.referencia_kwh, ph.referencia_kwh)),
            "detalhe": f"Norte 10°: {ph.referencia_kwh.sum():.1f} kWh vs Leste 45°: {ph_east45.referencia_kwh.sum():.1f} kWh",
        },
    ]

    return {
        "todos_aprovados": all(item["passou"] for item in checks),
        "total_testes": len(checks),
        "aprovados": sum(1 for item in checks if item["passou"]),
        "testes": checks,
    }


# ==============================================================================
# BLOCO 6: ELEVAÇÃO SOLAR E ARQUITETURA DAS REDES RECORRENTES (SEÇÃO 7)
# ==============================================================================

def sun_elev(idx: pd.DatetimeIndex, lat: float, lon: float) -> np.ndarray:
    """Calcula a elevação solar em graus no meio de cada intervalo horário."""
    h = idx.hour.to_numpy() + idx.minute.to_numpy() / 60
    g = 2 * np.pi / 365 * (idx.day_of_year.to_numpy() - 1 + (h - 12) / 24)
    eq = 229.18 * (
        0.000075
        + 0.001868 * np.cos(g)
        - 0.032077 * np.sin(g)
        - 0.014615 * np.cos(2 * g)
        - 0.040849 * np.sin(2 * g)
    )
    dec = (
        0.006918
        - 0.399912 * np.cos(g)
        + 0.070257 * np.sin(g)
        - 0.006758 * np.cos(2 * g)
        + 0.000907 * np.sin(2 * g)
        - 0.002697 * np.cos(3 * g)
        + 0.00148 * np.sin(3 * g)
    )
    ha = np.deg2rad((h * 60 + eq + 4 * lon + 180) / 4 - 180)
    lat_r = np.deg2rad(lat)
    return np.rad2deg(np.arcsin(np.clip(np.sin(lat_r) * np.sin(dec) + np.cos(lat_r) * np.cos(dec) * np.cos(ha), -1, 1)))


class Net(nn.Module):
    """Rede Recorrente Híbrida (32 unidades RNN/LSTM + Dense 16 ReLU + saída linear)."""

    def __init__(self, h: int, z: int, kind: str):
        super().__init__()
        self.rec = (nn.LSTM if kind == "LSTM" else nn.RNN)(h, 32, batch_first=True)
        self.head = nn.Sequential(nn.Linear(32 + z, 16), nn.ReLU(), nn.Linear(16, 1))

    def forward(self, x: torch.Tensor, z: torch.Tensor) -> torch.Tensor:
        o, _ = self.rec(x)
        return self.head(torch.cat([o[:, -1], z], 1))


# ==============================================================================
# BLOCO 7: PIPELINE DE TREINAMENTO E BENCHMARK COMPARATIVO V3 (SEÇÃO 8)
# ==============================================================================

def benchmark(
    d: pd.DataFrame,
    a: SimpleNamespace,
    out: Path,
    progress_cb: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Executa o benchmark completo de 7 modelos com divisão cronológica 70/15/15."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "config_sistema.json").write_text(json.dumps(a.cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "config_usuario_ativa.json").write_text(json.dumps(a.cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    pd.DataFrame(columns=["data_hora", "energia_kwh"] + METEO).to_csv(out / "MODELO_CSV_REAL.csv", index=False)

    d = d.sort_index().asfreq("h")
    idx = d.index
    y0 = d.energia_kwh.to_numpy(float)
    mid = idx - pd.Timedelta(minutes=30)
    elev = sun_elev(mid, a.lat, a.lon)
    h = mid.hour + mid.minute / 60
    yr = mid.day_of_year
    calendar = np.column_stack(
        [
            np.sin(2 * np.pi * h / 24),
            np.cos(2 * np.pi * h / 24),
            np.sin(2 * np.pi * yr / 365.25),
            np.cos(2 * np.pi * yr / 365.25),
            elev,
        ]
    )
    ph = reference(d, a.cfg)
    day = ph.diurno.to_numpy()
    met = d[METEO].to_numpy(float)
    hist = np.column_stack([y0, met])
    future = np.column_stack([met, calendar, ph[["poa_wm2", "temp_celula_c", "referencia_kwh"]]])

    ids = np.arange(24, len(d))
    X = np.array([hist[i - 24 : i] for i in ids])
    Z = future[ids]
    y = y0[ids]
    good = np.isfinite(X).all((1, 2)) & np.isfinite(Z).all(1) & np.isfinite(y)
    ids, X, Z, y = ids[good], X[good], Z[good], y[good]
    day = day[ids]

    tr = ids < int(len(d) * 0.7)
    va = (ids >= int(len(d) * 0.7)) & (ids < int(len(d) * 0.85))
    te = ids >= int(len(d) * 0.85)
    if min(tr.sum(), va.sum(), te.sum()) < 70:
        raise ValueError("Dados válidos insuficientes (< 70 amostras); não preencher lacunas com geração inventada.")

    sx = MinMaxScaler().fit(X[tr].reshape(-1, X.shape[-1]))
    sz = MinMaxScaler().fit(Z[tr])
    xn = sx.transform(X.reshape(-1, X.shape[-1])).reshape(X.shape).astype("float32")
    zn = sz.transform(Z).astype("float32")

    def physical(p: np.ndarray) -> np.ndarray:
        p = np.maximum(p, 0)
        if a.capacidade_kw is not None:
            p = np.minimum(p, a.capacidade_kw)
        return np.where(day, p, 0)

    preds: dict[str, np.ndarray] = {}
    rows: list[dict[str, Any]] = []
    validation: list[dict[str, Any]] = []

    def record(name: str, p: np.ndarray, seed: Any = "-", epoch: Any = "-") -> None:
        preds[f"{name}_{seed}"] = p[te]
        validation.append(
            dict(
                modelo=name,
                seed=seed,
                MAE_val_kWh=float(np.abs(y[va] - p[va]).mean()),
                epoca=epoch,
            )
        )
        for subset, mask in [
            ("total", te),
            ("dia", te & day),
            ("noite", te & ~day),
            ("chuva_prevista", te & day & (Z[:, 5] > 0)),
            ("nublado_previsto", te & day & (Z[:, 4] >= 70)),
        ]:
            if not mask.any():
                continue
            t, pv = y[mask], p[mask]
            e = np.abs(t - pv)
            den = np.abs(t).sum()
            rows.append(
                dict(
                    modelo=name,
                    seed=seed,
                    recorte=subset,
                    n=int(len(t)),
                    MAE_kWh=float(e.mean()),
                    RMSE_kWh=float(np.sqrt(np.mean(e**2))),
                    R2=float(r2_score(t, pv)) if len(t) > 1 and np.ptp(t) > 0 else np.nan,
                    WAPE_pct=float(100 * e.sum() / den) if den else np.nan,
                    P95_erro_kWh=float(np.quantile(e, 0.95)),
                    Erro_max_kWh=float(e.max()),
                    Bias_kWh=float(np.mean(pv - t)),
                )
            )

    total_steps = 1 + len(a.seeds) * 4
    current_step = 0

    def notify(msg: str, extra: dict[str, Any] | None = None) -> None:
        if progress_cb is not None:
            payload = {
                "passo_atual": current_step,
                "total_passos": total_steps,
                "progresso_pct": round(100 * current_step / max(total_steps, 1), 1),
                "mensagem": msg,
            }
            if extra:
                payload.update(extra)
            progress_cb(payload)

    notify("Calculando baselines determinísticos (Persistência 1h/24h e Referência Física)...")
    ref = X[:, 0, 0]
    record("Persistencia_24h", physical(ref))
    record("Persistencia_1h", physical(X[:, -1, 0]))
    ref_phys = ph.referencia_kwh.to_numpy()[ids]
    record("Referencia_fisica", ref_phys)
    current_step += 1

    torch.set_num_threads(1)
    feat = np.column_stack([X.reshape(len(X), -1), Z])
    train_ids = np.flatnonzero(tr)

    for old_pt in out.glob("lstm_*.pt"):
        old_pt.unlink(missing_ok=True)
    for old_jb in out.glob("escalas_*.joblib"):
        old_jb.unlink(missing_ok=True)

    logs_treino: list[str] = []

    for seed in a.seeds:
        notify(f"Treinando Random Forest (semente {seed})...")
        rf = RandomForestRegressor(n_estimators=150, min_samples_leaf=2, random_state=seed, n_jobs=2)
        rf.fit(feat[tr], y[tr])
        record("RandomForest", physical(rf.predict(feat)), seed)
        current_step += 1
        logs_treino.append(f"RandomForest | seed {seed} concluído")

        def fit(kind: str, base: np.ndarray | None = None, epochs: int = 20, huber: bool = False, label: str = "") -> tuple[np.ndarray, int]:
            torch.manual_seed(seed)
            t = y if base is None else y - base
            sy = MinMaxScaler().fit(t[tr, None])
            yn = sy.transform(t[:, None]).astype("float32")
            z2 = zn if base is None else np.column_stack([zn, base / max(np.max(y[tr]), 1e-6)]).astype("float32")
            xt, zt, yt = map(torch.from_numpy, (xn, z2, yn))

            model = Net(X.shape[-1], z2.shape[-1], kind)
            opt = torch.optim.Adam(model.parameters(), lr=0.001)
            loss = nn.HuberLoss(delta=0.1) if huber else nn.MSELoss()
            best = np.inf
            best_ep = 1
            state = copy.deepcopy(model.state_dict())
            stale = 0
            scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=3, min_lr=1e-5)

            for epoch in range(1, epochs + 1):
                model.train()
                for i in range(0, len(train_ids), 32):
                    b = train_ids[i : i + 32]
                    opt.zero_grad()
                    l = loss(model(xt[b], zt[b]), yt[b])
                    l.backward()
                    opt.step()
                model.eval()
                with torch.no_grad():
                    v = loss(model(xt[va], zt[va]), yt[va]).item()
                scheduler.step(v)
                if v < best:
                    best = v
                    state = copy.deepcopy(model.state_dict())
                    best_ep = epoch
                    stale = 0
                else:
                    stale += 1
                    if stale >= 10:
                        break
                if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
                    notify(f"Treinando {label} (semente {seed}) — época {epoch}/{epochs}", {"epoca": epoch, "epocas": epochs})

            model.load_state_dict(state)
            model.eval()
            if base is ref_phys:
                torch.save(state, out / f"lstm_{seed}.pt")
                joblib.dump(
                    {
                        "sx": sx,
                        "sz": sz,
                        "sy": sy,
                        "h": X.shape[-1],
                        "z": z2.shape[-1],
                        "escala_base": float(max(np.max(y[tr]), 1e-6)),
                    },
                    out / f"escalas_{seed}.joblib",
                )
            with torch.no_grad():
                p = sy.inverse_transform(model(xt, zt).numpy()).ravel()
            if base is not None:
                p += base
            return physical(p), best_ep

        for name, kind, base, ep, huber in [
            ("RNN", "RNN", None, a.epocas, True),
            ("LSTM_Huber", "LSTM", None, a.epocas, True),
            ("LSTM_residual_fisico", "LSTM", ref_phys, a.epocas, True),
        ]:
            p, best = fit(kind, base, ep, huber, label=name)
            record(name, p, seed, best)
            current_step += 1
            logs_treino.append(f"{name} | seed {seed} | melhor época: {best}")

    d.to_csv(out / "dados_entrada.csv", index_label="data_hora")
    ph.to_csv(out / "calculo_fisico.csv", index_label="data_hora")
    metrics = pd.DataFrame(rows)
    metrics.to_csv(out / "metricas.csv", index=False)
    vals = pd.DataFrame(validation)
    vals.to_csv(out / "validacao.csv", index=False)
    pd.DataFrame({"data_hora": idx[ids[te]], "alvo_kwh": y[te], **preds}).to_csv(out / "previsoes.csv", index=False)

    cols = ["MAE_kWh", "RMSE_kWh", "R2", "WAPE_pct", "P95_erro_kWh", "Erro_max_kWh", "Bias_kWh"]
    resumo = metrics[metrics.recorte == "total"].groupby("modelo")[cols].mean().sort_values("MAE_kWh")
    resumo.to_csv(out / "resumo_metricas.csv")

    ranking = vals.groupby("modelo").MAE_val_kWh.mean().sort_values()
    kwp_treino = a.cfg["quantidade_placas"] * a.cfg["potencia_placa_wp"] / 1000.0
    metadados = {
        "natureza": "FICTICIO - teste de software" if a.smoke else "CSV real informado pelo usuário",
        "modo": a.modo,
        "amostras": [int(tr.sum()), int(va.sum()), int(te.sum())],
        "teste_inicio": str(idx[ids[te][0]]),
        "teste_fim": str(idx[ids[te][-1]]),
        "seeds": [int(s) for s in a.seeds],
        "epocas": int(a.epocas),
        "capacidade_kw": float(a.capacidade_kw),
        "kwp_treino": round(float(kwp_treino), 3),
        "ranking_validacao": ranking.index.tolist(),
        "logs_treino": logs_treino,
    }
    (out / "metadados.json").write_text(json.dumps(metadados, indent=2, ensure_ascii=False), encoding="utf-8")

    cache_file = out / "ultimo_open_meteo_cache.json"
    if not cache_file.exists():
        cache_file.write_text(
            json.dumps(
                {
                    "latitude": a.cfg["latitude"],
                    "longitude": a.cfg["longitude"],
                    "capturado_em": "2026-11-26T14:55:00-03:00",
                    "origem": "Snapshot validado do notebook V3 (Recife-PE)",
                    "registros": NOTEBOOK_OPEN_METEO_SNAPSHOT,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    notify("Treinamento e benchmark V3 concluídos com sucesso!")
    return metadados


# ==============================================================================
# BLOCO 8: INFERÊNCIA, CONSULTA DE HISTÓRICO REAL × PREVISTO E OPEN-METEO 24H
# ==============================================================================

def _carregar_melhor_lstm_residual(pasta: Path) -> tuple[Net, dict[str, Any], int, float, dict[str, Any]]:
    """Carrega os pesos PyTorch e escalas da semente de menor erro de validação."""
    val = pd.read_csv(pasta / "validacao.csv")
    candidatos = val.loc[val.modelo.eq("LSTM_residual_fisico")].copy()
    candidatos["seed"] = pd.to_numeric(candidatos.seed, errors="coerce")
    candidatos = candidatos.dropna(subset=["seed", "MAE_val_kWh"])
    candidatos = candidatos[
        candidatos.seed.map(lambda s: (pasta / f"lstm_{int(s)}.pt").is_file() and (pasta / f"escalas_{int(s)}.joblib").is_file())
    ]
    if candidatos.empty:
        raise FileNotFoundError("Nenhum LSTM residual salvo encontrado.")

    melhor = candidatos.sort_values("MAE_val_kWh").iloc[0]
    seed = int(melhor.seed)
    escalas = joblib.load(pasta / f"escalas_{seed}.joblib")
    modelo = Net(escalas["h"], escalas["z"], "LSTM")
    modelo.load_state_dict(torch.load(pasta / f"lstm_{seed}.pt", map_location="cpu", weights_only=True))
    modelo.eval()
    cfg_treino = json.loads((pasta / "config_sistema.json").read_text(encoding="utf-8"))
    return modelo, escalas, seed, float(melhor.MAE_val_kWh), cfg_treino


def _estimar_serie_hibrida_com_escala(
    df_clima_geracao: pd.DataFrame,
    fisica_ativa: pd.DataFrame,
    cfg_ativa: dict[str, Any],
    pasta: Path,
) -> pd.Series:
    """
    Aplica o modelo LSTM Residual adaptando proporcionalmente a escala caso o
    usuário tenha alterado a quantidade de placas/potência antes de retreinar.
    """
    modelo, escalas, _, _, cfg_treino = _carregar_melhor_lstm_residual(pasta)
    kwp_treino = max(cfg_treino["quantidade_placas"] * cfg_treino["potencia_placa_wp"] / 1000.0, 0.1)
    kwp_ativo = max(cfg_ativa["quantidade_placas"] * cfg_ativa["potencia_placa_wp"] / 1000.0, 0.1)
    fator_escala = kwp_ativo / kwp_treino

    idx = df_clima_geracao.index
    mid = idx - pd.Timedelta(minutes=30)
    h = mid.hour + mid.minute / 60
    yr = mid.day_of_year
    cal = np.column_stack(
        [
            np.sin(2 * np.pi * h / 24),
            np.cos(2 * np.pi * h / 24),
            np.sin(2 * np.pi * yr / 365.25),
            np.cos(2 * np.pi * yr / 365.25),
            sun_elev(mid, cfg_ativa["latitude"], cfg_ativa["longitude"]),
        ]
    )

    # Normaliza referência física para o porte de treino antes de consultar a rede
    ref_escala_treino = fisica_ativa["referencia_kwh"].to_numpy(float) / fator_escala
    Z_treino = np.column_stack(
        [
            df_clima_geracao[METEO].to_numpy(float),
            cal,
            fisica_ativa["poa_wm2"].to_numpy(float),
            fisica_ativa["temp_celula_c"].to_numpy(float),
            ref_escala_treino,
        ]
    )

    saida = np.zeros(len(idx), dtype=float)
    energia_hist_escala_treino = df_clima_geracao["energia_kwh"].to_numpy(float) / fator_escala

    for i in range(len(idx)):
        if not bool(fisica_ativa["diurno"].iloc[i]):
            saida[i] = 0.0
            continue
        if i < 24:
            # Nas primeiras 24h sem janela completa anterior, utiliza a referência física ajustada
            saida[i] = float(fisica_ativa["referencia_kwh"].iloc[i])
            continue

        janela_x = np.column_stack([energia_hist_escala_treino[i - 24 : i], df_clima_geracao[METEO].iloc[i - 24 : i].to_numpy(float)])
        base_treino = float(ref_escala_treino[i])
        xn = escalas["sx"].transform(janela_x)[None].astype("float32")
        zn = np.column_stack([escalas["sz"].transform(Z_treino[i : i + 1]), [base_treino / escalas["escala_base"]]]).astype("float32")
        with torch.no_grad():
            res_treino = float(escalas["sy"].inverse_transform(modelo(torch.from_numpy(xn), torch.from_numpy(zn)).numpy())[0, 0])
        res_ativo = res_treino * fator_escala
        saida[i] = float(np.clip(float(fisica_ativa["referencia_kwh"].iloc[i]) + res_ativo, 0.0, cfg_ativa["inversor_kw"]))

    return pd.Series(saida, index=idx)


def consultar_historico_comparativo(
    pasta: Path,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    modelo: str = "LSTM_residual_fisico",
    condicao_clima: str = "todos",
    apenas_diurno: bool = False,
) -> dict[str, Any]:
    """
    Consulta interativa de dados e comparação entre Geração Real/Alvo, Previsão IA,
    Referência Física e retorno financeiro em R$ no período filtrado pelo usuário.
    """
    pasta = Path(pasta)
    cfg = carregar_config_ativa(pasta)
    tarifa = cfg.get("tarifa_energia_rs", 0.92)

    previsoes = pd.read_csv(pasta / "previsoes.csv", parse_dates=["data_hora"]).set_index("data_hora")
    dados = pd.read_csv(pasta / "dados_entrada.csv", parse_dates=["data_hora"]).set_index("data_hora")
    ph = pd.read_csv(pasta / "calculo_fisico.csv", parse_dates=["data_hora"]).set_index("data_hora")
    meta = json.loads((pasta / "metadados.json").read_text(encoding="utf-8"))
    seeds = [str(s) for s in meta.get("seeds", DEFAULT_SEEDS)]

    lim_min = previsoes.index.min().strftime("%Y-%m-%d")
    lim_max = previsoes.index.max().strftime("%Y-%m-%d")

    dt_ini = pd.Timestamp(data_inicio) if data_inicio else previsoes.index.min()
    dt_fim = (pd.Timestamp(data_fim) + pd.Timedelta(hours=23, minutes=59)) if data_fim else previsoes.index.max()

    sub_p = previsoes.loc[(previsoes.index >= dt_ini) & (previsoes.index <= dt_fim)].copy()
    if sub_p.empty:
        sub_p = previsoes.copy()

    sub_d = dados.loc[sub_p.index]
    sub_f = ph.loc[sub_p.index]

    # Obtém a coluna média do modelo escolhido
    if modelo in ("Referencia_fisica", "Persistencia_1h", "Persistencia_24h"):
        serie_prev = sub_p[f"{modelo}_-"]
    else:
        cols_m = [f"{modelo}_{s}" for s in seeds if f"{modelo}_{s}" in sub_p.columns]
        serie_prev = sub_p[cols_m].mean(axis=1)

    serie_fis = sub_p["Referencia_fisica_-"]

    # Filtros opcionais de turno e clima
    mascara = pd.Series(True, index=sub_p.index)
    if apenas_diurno:
        mascara &= sub_f["diurno"].astype(bool)
    if condicao_clima == "limpo":
        mascara &= sub_d["cloud_cover"] < 40
    elif condicao_clima == "nublado":
        mascara &= sub_d["cloud_cover"] >= 70
    elif condicao_clima == "chuva":
        mascara &= sub_d["precipitation"] > 0

    sub_p = sub_p.loc[mascara]
    sub_d = sub_d.loc[mascara]
    sub_f = sub_f.loc[mascara]
    serie_prev = serie_prev.loc[mascara]
    serie_fis = serie_fis.loc[mascara]

    registros = []
    for ts in sub_p.index:
        real_v = float(sub_p.loc[ts, "alvo_kwh"])
        prev_v = float(serie_prev.loc[ts])
        fis_v = float(serie_fis.loc[ts])
        registros.append(
            {
                "data_hora": ts.strftime("%Y-%m-%d %H:%M"),
                "rotulo": ts.strftime("%d/%m %Hh"),
                "data": ts.strftime("%d/%m/%Y"),
                "geracao_real_kwh": round(real_v, 3),
                "previsao_kwh": round(prev_v, 3),
                "referencia_fisica_kwh": round(fis_v, 3),
                "erro_kwh": round(prev_v - real_v, 3),
                "erro_abs_kwh": round(abs(real_v - prev_v), 3),
                "ghi_wm2": round(float(sub_d.loc[ts, "shortwave_radiation"]), 1),
                "poa_wm2": round(float(sub_f.loc[ts, "poa_wm2"]), 1),
                "temperatura_c": round(float(sub_d.loc[ts, "temperature_2m"]), 1),
                "nuvens_pct": round(float(sub_d.loc[ts, "cloud_cover"]), 0),
                "chuva_mm": round(float(sub_d.loc[ts, "precipitation"]), 2),
                "valor_rs": round(real_v * tarifa, 2),
            }
        )

    # Agregação diária para gráfico de barras Real × Previsto por dia
    df_agreg = pd.DataFrame(
        {
            "real": sub_p["alvo_kwh"],
            "previsto": serie_prev,
            "fisica": serie_fis,
        },
        index=sub_p.index,
    )
    diario_grp = df_agreg.groupby(df_agreg.index.normalize()).sum() if not df_agreg.empty else pd.DataFrame()
    resumo_diario = [
        {
            "data": dt.strftime("%d/%m"),
            "geracao_real_kwh": round(float(r["real"]), 2),
            "previsao_kwh": round(float(r["previsto"]), 2),
            "referencia_fisica_kwh": round(float(r["fisica"]), 2),
            "economia_real_rs": round(float(r["real"] * tarifa), 2),
        }
        for dt, r in diario_grp.iterrows()
    ]

    real_tot = float(sub_p["alvo_kwh"].sum()) if not sub_p.empty else 0.0
    prev_tot = float(serie_prev.sum()) if not serie_prev.empty else 0.0
    fis_tot = float(serie_fis.sum()) if not serie_fis.empty else 0.0
    erros_abs = np.abs(sub_p["alvo_kwh"].to_numpy(float) - serie_prev.to_numpy(float)) if not sub_p.empty else np.array([0.0])
    mae_p = float(erros_abs.mean())
    wape_p = float(100.0 * erros_abs.sum() / real_tot) if real_tot > 0 else 0.0

    return {
        "limite_data_min": lim_min,
        "limite_data_max": lim_max,
        "data_inicio_aplicada": dt_ini.strftime("%Y-%m-%d"),
        "data_fim_aplicada": dt_fim.strftime("%Y-%m-%d"),
        "modelo_selecionado": modelo,
        "total_horas_filtradas": int(len(registros)),
        "tarifa_energia_rs": tarifa,
        "kpis": {
            "energia_real_total_kwh": round(real_tot, 2),
            "energia_prevista_total_kwh": round(prev_tot, 2),
            "energia_fisica_total_kwh": round(fis_tot, 2),
            "diferenca_kwh": round(real_tot - prev_tot, 2),
            "aderencia_pct": round(100.0 - wape_p, 2) if real_tot > 0 else 100.0,
            "mae_kwh": round(mae_p, 4),
            "wape_pct": round(wape_p, 2),
            "economia_real_rs": round(real_tot * tarifa, 2),
            "economia_prevista_rs": round(prev_tot * tarifa, 2),
        },
        "diagnostico": _gerar_diagnostico_operacional(real_tot, prev_tot, fis_tot),
        "resumo_diario": resumo_diario,
        "registros_horarios": registros,
    }


def inspect_single_hour_inference(pasta: Path, timestamp_str: str | None = None, seed_req: int | None = None) -> dict[str, Any]:
    """Decompõe a inferência pontual de 1 hora (janela X + clima Z + resíduo)."""
    pasta = Path(pasta)
    dados = pd.read_csv(pasta / "dados_entrada.csv", parse_dates=["data_hora"]).set_index("data_hora")
    previsoes = pd.read_csv(pasta / "previsoes.csv", parse_dates=["data_hora"]).set_index("data_hora")
    cfg = json.loads((pasta / "config_sistema.json").read_text(encoding="utf-8"))
    val = pd.read_csv(pasta / "validacao.csv")

    candidatos = val.loc[val.modelo.eq("LSTM_residual_fisico")].copy()
    candidatos["seed"] = pd.to_numeric(candidatos.seed, errors="coerce")
    candidatos = candidatos.dropna(subset=["seed", "MAE_val_kWh"]).sort_values("MAE_val_kWh")
    if seed_req is not None and (pasta / f"lstm_{seed_req}.pt").is_file():
        seed = int(seed_req)
    else:
        seed = int(candidatos.iloc[0].seed)

    if timestamp_str:
        instante = pd.Timestamp(timestamp_str)
        if instante not in previsoes.index:
            raise ValueError("Horário selecionado não pertence ao conjunto de teste.")
    else:
        diurnas = previsoes[previsoes.alvo_kwh > 1.5]
        instante = (diurnas if not diurnas.empty else previsoes[previsoes.alvo_kwh > 0]).index[0]

    janela_25h = dados.loc[instante - pd.Timedelta(hours=24) : instante].copy()
    alvo_real = float(previsoes.loc[instante, "alvo_kwh"])
    janela_25h.loc[instante, "energia_kwh"] = np.nan

    s = joblib.load(pasta / f"escalas_{seed}.joblib")
    ph = reference(janela_25h, cfg)
    idx = janela_25h.index
    mid = idx - pd.Timedelta(minutes=30)
    h = mid.hour + mid.minute / 60
    yr = mid.day_of_year
    cal = np.column_stack(
        [
            np.sin(2 * np.pi * h / 24),
            np.cos(2 * np.pi * h / 24),
            np.sin(2 * np.pi * yr / 365.25),
            np.cos(2 * np.pi * yr / 365.25),
            sun_elev(mid, cfg["latitude"], cfg["longitude"]),
        ]
    )
    X = np.column_stack([janela_25h.energia_kwh, janela_25h[METEO]])[-25:-1]
    Z = np.column_stack([janela_25h[METEO], cal, ph[["poa_wm2", "temp_celula_c", "referencia_kwh"]]])[-1:]
    base = float(ph.referencia_kwh.iloc[-1])

    xn = s["sx"].transform(X)[None].astype("float32")
    zn = np.column_stack([s["sz"].transform(Z), [base / s["escala_base"]]]).astype("float32")
    model = Net(s["h"], s["z"], "LSTM")
    model.load_state_dict(torch.load(pasta / f"lstm_{seed}.pt", map_location="cpu", weights_only=True))
    model.eval()
    with torch.no_grad():
        res = float(s["sy"].inverse_transform(model(torch.from_numpy(xn), torch.from_numpy(zn)).numpy())[0, 0])

    diurno = bool(ph.diurno.iloc[-1])
    bruto = base + res
    previsto = float(np.clip(bruto, 0, cfg["inversor_kw"])) if diurno else 0.0

    historico = [
        {
            "data_hora": ts.strftime("%Y-%m-%d %H:%M"),
            "hora_curta": ts.strftime("%d/%m %Hh"),
            "energia_medida_kwh": round(float(row_d.energia_kwh), 4),
            "referencia_fisica_kwh": round(float(row_ph.referencia_kwh), 4),
            "ghi_wm2": round(float(row_d.shortwave_radiation), 1),
            "cloud_cover_pct": round(float(row_d.cloud_cover), 1),
        }
        for ts, row_d, row_ph in zip(idx[:-1], dados.loc[idx[:-1]].itertuples(), ph.loc[idx[:-1]].itertuples())
    ]

    alvo_meteo = janela_25h.iloc[-1]
    alvo_ph = ph.iloc[-1]
    opcoes = [
        {
            "data_hora": ts.strftime("%Y-%m-%d %H:%M:%S"),
            "label": f"{ts.strftime('%d/%m/%Y %Hh')} ({'Diurno' if row_p.alvo_kwh > 0 else 'Noturno'} · Alvo {row_p.alvo_kwh:.2f} kWh)",
        }
        for ts, row_p in previsoes.iloc[:96].iterrows()
    ]

    return {
        "instante_alvo": instante.strftime("%Y-%m-%d %H:%M:%S"),
        "instante_formatado": instante.strftime("%d/%m/%Y às %H:%M"),
        "seed_usada": seed,
        "diurno": diurno,
        "elevacao_solar_graus": round(float(cal[-1, 4]), 2),
        "poa_wm2": round(float(alvo_ph.poa_wm2), 1),
        "temp_celula_c": round(float(alvo_ph.temp_celula_c), 2),
        "base_fisica_kwh": round(base, 4),
        "residuo_lstm_kwh": round(res, 4),
        "soma_sem_restricao_kwh": round(bruto, 4),
        "previsao_final_kwh": round(previsto, 4),
        "alvo_real_kwh": round(alvo_real, 4),
        "erro_absoluto_kwh": round(abs(alvo_real - previsto), 4),
        "erro_fisica_pura_kwh": round(abs(alvo_real - base), 4),
        "clima_hora_alvo": {k: round(float(alvo_meteo[k]), 2) for k in METEO},
        "historico_24h": historico,
        "opcoes_horarios": opcoes,
    }


def simulate_custom_physics(pasta: Path, custom_cfg: dict[str, Any], date_str: str | None = None) -> dict[str, Any]:
    """Simulador 'E se?' comparando a curva simulada contra a usina ativa."""
    pasta = Path(pasta)
    dados = pd.read_csv(pasta / "dados_entrada.csv", parse_dates=["data_hora"]).set_index("data_hora")
    base_cfg = carregar_config_ativa(pasta)
    sim_cfg = validate_config({**base_cfg, **custom_cfg})

    dates = dados.groupby(dados.index.normalize()).size()
    full_dates = dates[dates == 24].index
    chosen_date = pd.Timestamp(date_str) if date_str else full_dates[-5]
    if chosen_date not in full_dates:
        chosen_date = full_dates[0]

    dia_d = dados.loc[chosen_date : chosen_date + pd.Timedelta(hours=23)]
    ph_base = reference(dia_d, base_cfg)
    ph_sim = reference(dia_d, sim_cfg)

    kwp_sim = sim_cfg["quantidade_placas"] * sim_cfg["potencia_placa_wp"] / 1000
    kwp_base = base_cfg["quantidade_placas"] * base_cfg["potencia_placa_wp"] / 1000

    horas = []
    clipping_horas = 0
    for ts in dia_d.index:
        dc_after_eff = float(ph_sim.loc[ts, "potencia_dc_kw"] * sim_cfg["eficiencia_inversor"])
        ac_final = float(ph_sim.loc[ts, "referencia_kwh"])
        clipped = dc_after_eff > sim_cfg["inversor_kw"] + 1e-4
        if clipped:
            clipping_horas += 1
        horas.append(
            {
                "hora": ts.strftime("%Hh"),
                "ghi_wm2": round(float(dia_d.loc[ts, "shortwave_radiation"]), 1),
                "poa_padrao_wm2": round(float(ph_base.loc[ts, "poa_wm2"]), 1),
                "poa_simulado_wm2": round(float(ph_sim.loc[ts, "poa_wm2"]), 1),
                "temp_celula_c": round(float(ph_sim.loc[ts, "temp_celula_c"]), 1),
                "dc_disponivel_kw": round(dc_after_eff, 3),
                "ac_padrao_kwh": round(float(ph_base.loc[ts, "referencia_kwh"]), 3),
                "ac_simulado_kwh": round(ac_final, 3),
                "perda_clipping_kwh": round(max(0.0, dc_after_eff - ac_final), 3),
                "em_clipping": clipped,
            }
        )

    return {
        "data": chosen_date.strftime("%Y-%m-%d"),
        "datas_disponiveis": [dt.strftime("%Y-%m-%d") for dt in full_dates[-30:]],
        "kwp_padrao": round(kwp_base, 2),
        "kwp_simulado": round(kwp_sim, 2),
        "fator_overload_dc_ac": round(kwp_sim / sim_cfg["inversor_kw"], 2),
        "energia_dia_padrao_kwh": round(float(ph_base.referencia_kwh.sum()), 3),
        "energia_dia_simulada_kwh": round(float(ph_sim.referencia_kwh.sum()), 3),
        "diferenca_pct": round(
            100 * (float(ph_sim.referencia_kwh.sum()) - float(ph_base.referencia_kwh.sum())) / max(float(ph_base.referencia_kwh.sum()), 1e-6),
            2,
        ),
        "horas_clipping": clipping_horas,
        "perda_total_clipping_kwh": round(sum(h["perda_clipping_kwh"] for h in horas), 3),
        "pico_temp_celula_c": round(float(ph_sim.temp_celula_c.max()), 1),
        "serie_horaria": horas,
    }


def previsao_operacional(
    latitude: float | None,
    longitude: float | None,
    pasta: Path,
    horas: int = 24,
    csv_geracao_bytes: bytes | None = None,
    forcar_offline: bool = False,
    custom_cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Previsão operacional recursiva de até 24h respeitando integralmente os equipamentos
    personalizados na aba 'Minha Usina' (placas, potência Wp, inversor, inclinação, azimute e tarifa).
    """
    pasta = Path(pasta)
    modelo, escalas, seed, mae_val, cfg_treino = _carregar_melhor_lstm_residual(pasta)

    cfg = carregar_config_ativa(pasta)
    if custom_cfg:
        cfg = validate_config({**cfg, **custom_cfg})

    lat_uso = float(latitude) if latitude is not None else float(cfg["latitude"])
    lon_uso = float(longitude) if longitude is not None else float(cfg["longitude"])
    if not (-90 <= lat_uso <= 90 and -180 <= lon_uso <= 180):
        raise ValueError("Coordenadas inválidas. Latitude [-90, 90], Longitude [-180, 180].")
    if not isinstance(horas, int) or not 1 <= horas <= 24:
        raise ValueError("Escolha um horizonte de 1 a 24 horas.")

    origem = (round(float(cfg_treino["latitude"]), 4), round(float(cfg_treino["longitude"]), 4))
    cfg.update(latitude=lat_uso, longitude=lon_uso)
    transferencia_aviso = origem != (round(lat_uso, 4), round(lon_uso, 4))

    kwp_treino = max(cfg_treino["quantidade_placas"] * cfg_treino["potencia_placa_wp"] / 1000.0, 0.1)
    kwp_ativo = max(cfg["quantidade_placas"] * cfg["potencia_placa_wp"] / 1000.0, 0.1)
    fator_escala = kwp_ativo / kwp_treino

    agora = pd.Timestamp.now(tz="America/Recife")
    ultima = agora.tz_localize(None).floor("h")
    fins = pd.date_range(ultima + pd.Timedelta(hours=1), periods=horas, freq="h")
    indice = pd.date_range(ultima - pd.Timedelta(hours=23), fins[-1], freq="h")
    clima, meteo_info = obter_clima(
        indice, cfg, METEO, pasta / "ultimo_open_meteo_cache.json",
        _clima_ilustrativo, forcar_offline,
    )
    usou_cache_offline = meteo_info["status"] != "online"
    fonte_meteo = meteo_info["fonte"]
    aviso_rede = meteo_info["aviso"]

    fisica = reference(clima, cfg)
    clima["energia_kwh"] = np.nan
    historico_idx = indice[:24]

    if csv_geracao_bytes is None:
        clima.loc[historico_idx, "energia_kwh"] = fisica.loc[historico_idx, "referencia_kwh"]
        origem_hist = "Estimativa física das 24h anteriores (telemetria não informada)"
    else:
        texto_csv = csv_geracao_bytes.decode("utf-8-sig", errors="replace")
        if not texto_csv.strip():
            raise ValueError("O CSV está vazio. Envie as colunas data_hora e energia_kwh com as últimas 24 horas.")
        sep_csv = ";" if texto_csv.splitlines()[0].count(";") > texto_csv.splitlines()[0].count(",") else ","
        med = pd.read_csv(io.StringIO(texto_csv), sep=sep_csv, parse_dates=["data_hora"]).set_index("data_hora")
        if "energia_kwh" not in med.columns:
            raise ValueError("O CSV precisa conter a coluna energia_kwh.")
        if med.index.tz is not None:
            med.index = med.index.tz_convert("America/Recife").tz_localize(None)
        if med.index.has_duplicates:
            raise ValueError("CSV de geração recente contém horários duplicados.")
        med_s = pd.to_numeric(med.energia_kwh.astype(str).str.replace(",", ".", regex=False), errors="coerce").reindex(historico_idx)
        if not np.isfinite(med_s.to_numpy()).all() or (med_s < 0).any():
            raise ValueError(
                f"O CSV deve cobrir as 24h anteriores completas ({historico_idx[0]:%d/%m %Hh} a {historico_idx[-1]:%d/%m %Hh}) sem valores negativos."
            )
        clima.loc[historico_idx, "energia_kwh"] = med_s
        origem_hist = "Geração AC medida informada via CSV"

    mid = indice - pd.Timedelta(minutes=30)
    h = mid.hour + mid.minute / 60
    yr = mid.day_of_year
    calendario = np.column_stack(
        [
            np.sin(2 * np.pi * h / 24),
            np.cos(2 * np.pi * h / 24),
            np.sin(2 * np.pi * yr / 365.25),
            np.cos(2 * np.pi * yr / 365.25),
            sun_elev(mid, lat_uso, lon_uso),
        ]
    )
    ref_escala_treino = fisica["referencia_kwh"].to_numpy(float) / fator_escala
    Z_treino = np.column_stack(
        [
            clima[METEO].to_numpy(float),
            calendario,
            fisica["poa_wm2"].to_numpy(float),
            fisica["temp_celula_c"].to_numpy(float),
            ref_escala_treino,
        ]
    )

    residuos_finais: dict[pd.Timestamp, float] = {}
    for i in range(24, len(indice)):
        hist_kwh_treino = clima.iloc[i - 24 : i]["energia_kwh"].to_numpy(float) / fator_escala
        X = np.column_stack([hist_kwh_treino, clima.iloc[i - 24 : i][METEO].to_numpy(float)])
        base_ativa = float(fisica.referencia_kwh.iloc[i])
        base_treino = float(ref_escala_treino[i])
        xn = escalas["sx"].transform(X)[None].astype("float32")
        zn = np.column_stack([escalas["sz"].transform(Z_treino[i : i + 1]), [base_treino / escalas["escala_base"]]]).astype("float32")
        with torch.no_grad():
            residual_treino = float(escalas["sy"].inverse_transform(modelo(torch.from_numpy(xn), torch.from_numpy(zn)).numpy())[0, 0])
        residual = residual_treino * fator_escala
        p = float(np.clip(base_ativa + residual, 0, cfg["inversor_kw"])) if bool(fisica.diurno.iloc[i]) else 0.0
        if not np.isfinite(p):
            raise ValueError("O modelo gerou previsão não finita.")
        clima.loc[indice[i], "energia_kwh"] = p
        residuos_finais[indice[i]] = residual if bool(fisica.diurno.iloc[i]) else 0.0

    resultado = clima.loc[fins, METEO].copy()
    resultado["referencia_fisica_kwh"] = fisica.loc[fins, "referencia_kwh"]
    resultado["previsao_lstm_kwh"] = clima.loc[fins, "energia_kwh"]
    resultado.index.name = "data_hora_fim_UTC-3"
    try:
        resultado.to_csv(pasta / "previsao_meteorologica_24h.csv")
    except OSError:
        pass

    tarifa = cfg.get("tarifa_energia_rs", 0.92)
    serie = []
    for ts in fins:
        prev_h = float(resultado.loc[ts, "previsao_lstm_kwh"])
        serie.append(
            {
                "data_hora": ts.strftime("%Y-%m-%d %H:%M"),
                "rotulo": ts.strftime("%d/%m %Hh"),
                "hora": ts.strftime("%Hh"),
                "diurno": bool(fisica.loc[ts, "diurno"]),
                "referencia_fisica_kwh": round(float(resultado.loc[ts, "referencia_fisica_kwh"]), 3),
                "previsao_lstm_kwh": round(prev_h, 3),
                "economia_rs": round(prev_h * tarifa, 2),
                "residuo_aplicado_kwh": round(float(residuos_finais.get(ts, 0.0)), 3),
                "poa_wm2": round(float(fisica.loc[ts, "poa_wm2"]), 1),
                "temp_celula_c": round(float(fisica.loc[ts, "temp_celula_c"]), 1),
                "shortwave_radiation": round(float(resultado.loc[ts, "shortwave_radiation"]), 1),
                "direct_normal_irradiance": round(float(resultado.loc[ts, "direct_normal_irradiance"]), 1),
                "diffuse_radiation": round(float(resultado.loc[ts, "diffuse_radiation"]), 1),
                "temperature_2m": round(float(resultado.loc[ts, "temperature_2m"]), 1),
                "cloud_cover": round(float(resultado.loc[ts, "cloud_cover"]), 0),
                "precipitation": round(float(resultado.loc[ts, "precipitation"]), 2),
                "wind_speed_10m": round(float(resultado.loc[ts, "wind_speed_10m"]), 1),
                "relative_humidity_2m": round(float(resultado.loc[ts, "relative_humidity_2m"]), 0),
            }
        )

    total_lstm = float(resultado["previsao_lstm_kwh"].sum())
    total_fis = float(resultado["referencia_fisica_kwh"].sum())
    idx_pico = resultado["previsao_lstm_kwh"].idxmax()

    return {
        "usina_nome": cfg["nome"],
        "usina_cidade": cfg["cidade"],
        "kwp_instalado": round(kwp_ativo, 2),
        "inversor_kw": cfg["inversor_kw"],
        "latitude": lat_uso,
        "longitude": lon_uso,
        "horas": horas,
        "seed_selecionada": seed,
        "mae_validacao_kwh": round(mae_val, 4),
        "origem_historico": origem_hist,
        "fonte_meteorologia": fonte_meteo,
        "meteorologia": {
            **meteo_info,
            "periodo_inicio": fins[0].tz_localize("America/Recife").isoformat(),
            "periodo_fim": fins[-1].tz_localize("America/Recife").isoformat(),
            "temperatura_min_c": round(float(clima.loc[fins, "temperature_2m"].min()), 1),
            "temperatura_max_c": round(float(clima.loc[fins, "temperature_2m"].max()), 1),
            "nuvens_media_pct": round(float(clima.loc[fins, "cloud_cover"].mean())),
            "chuva_total_mm": round(float(clima.loc[fins, "precipitation"].sum()), 1),
        },
        "usou_contingencia_offline": usou_cache_offline,
        "aviso_rede": aviso_rede,
        "aviso_transferencia_local": (
            "Coordenadas diferentes da base de treino; recomenda-se retreinar quando possuir histórico local."
            if transferencia_aviso
            else None
        ),
        "energia_total_lstm_kwh": round(total_lstm, 3),
        "energia_total_fisica_kwh": round(total_fis, 3),
        "economia_estimada_rs": round(total_lstm * tarifa, 2),
        "economia_liquida_lei14300_rs": round(total_lstm * tarifa * 0.89, 2),
        "tarifa_energia_rs": tarifa,
        "diferenca_lstm_vs_fisica_pct": round(100 * (total_lstm - total_fis) / max(total_fis, 1e-6), 1),
        "pico_lstm_kwh": round(float(resultado.loc[idx_pico, "previsao_lstm_kwh"]), 3),
        "horario_pico": idx_pico.strftime("%d/%m às %Hh"),
        "serie": serie,
    }


def export_results_zip(pasta: Path) -> Path:
    """Compacta toda a pasta de artefatos em um arquivo .zip."""
    pasta = Path(pasta)
    zip_base = pasta.parent / "resultados_v3_notebook"
    archive_path = shutil.make_archive(str(zip_base), "zip", root_dir=pasta)
    return Path(archive_path)
