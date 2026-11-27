"""Clima atual com cache validado e demonstração explicitamente identificada."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd
import requests


def obter_clima(
    indice: pd.DatetimeIndex,
    cfg: dict,
    colunas: list[str],
    cache_path: Path,
    estimar: Callable,
    forcar_offline: bool = False,
) -> tuple[pd.DataFrame, dict]:
    agora = pd.Timestamp.now(tz="America/Recife")
    meta = {
        "consultado_em": agora.isoformat(),
        "atualizado_em": None,
        "api_disponivel": None,
        "dados_simulados": False,
        "aviso": None,
    }

    def validar(registros):
        df = pd.DataFrame(registros).set_index("time")
        df.index = pd.to_datetime(df.index)
        if df.index.has_duplicates:
            raise ValueError("Horários duplicados no clima.")
        df = df[colunas].apply(pd.to_numeric, errors="coerce").reindex(indice)
        if not np.isfinite(df.to_numpy()).all():
            raise ValueError("Clima incompleto para o período solicitado.")
        return df

    if not forcar_offline:
        try:
            resposta = requests.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": cfg["latitude"], "longitude": cfg["longitude"],
                    "hourly": ",".join(colunas), "timezone": "America/Recife",
                    "past_days": 2, "forecast_days": 3,
                    "temperature_unit": "celsius", "wind_speed_unit": "kmh",
                    "precipitation_unit": "mm",
                },
                timeout=(4, 10),
            )
            resposta.raise_for_status()
            registros = pd.DataFrame(resposta.json()["hourly"]).to_dict("records")
            clima = validar(registros)
            cache = {
                "latitude": cfg["latitude"], "longitude": cfg["longitude"],
                "capturado_em": agora.isoformat(), "registros": registros,
            }
            try:
                cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            except OSError:
                pass
            return clima, {**meta, "status": "online", "api_disponivel": True,
                           "atualizado_em": agora.isoformat(), "fonte": "Open-Meteo · previsão meteorológica"}
        except (requests.RequestException, ValueError, KeyError, TypeError):
            meta["api_disponivel"] = False

        # Nunca reutiliza clima de outra cidade, vencido ou sem as horas atuais.
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
            capturado = pd.Timestamp(cache["capturado_em"])
            idade = (agora - capturado).total_seconds() / 3600
            mesmo_local = all(abs(float(cache[k]) - float(cfg[k])) < 0.0001 for k in ("latitude", "longitude"))
            if mesmo_local and 0 <= idade <= 6:
                clima = validar(cache["registros"])
                return clima, {**meta, "status": "cache", "fonte": "Open-Meteo · arquivo recente da mesma localização",
                               "atualizado_em": capturado.isoformat(),
                               "aviso": "A consulta online falhou. Usando clima salvo há menos de seis horas para esta localização."}
        except (OSError, ValueError, KeyError, TypeError, OverflowError):
            pass

    return estimar(indice, cfg), {
        **meta, "status": "demonstracao", "dados_simulados": True,
        "fonte": "Cenário ilustrativo calculado localmente",
        "aviso": ("Modo demonstração selecionado. O clima é ilustrativo e não representa a previsão meteorológica atual."
                  if forcar_offline else
                  "Não foi possível atualizar o clima e não há arquivo recente válido. Exibindo um cenário ilustrativo; tente atualizar a previsão com internet."),
    }
