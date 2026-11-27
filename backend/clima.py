"""
Motor de Clima Hiperlocal (Helionta):
Suporta:
1. AccuWeather API Oficial (`dataservice.accuweather.com` — Current Conditions + Hourly 12h com `SolarIrradiance`).
2. Estação Meteorológica Terrestre Real (`wttr.in` / METAR aeroportos) + Irradiação Solar em Terra (`cell_selection=land`),
   corrigindo o erro clássico de grade marítima em cidades costeiras (ex.: Igarassu/Recife marcando 27,5 °C no mar vs 30 °C em terra).
3. Open-Meteo Grade Terrestre (`cell_selection=land`) com cache validado por coordenada e provedor.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd
import requests

TZ_BR = timezone(timedelta(hours=-3))

# Cache leve em memória para evitar gastar a franquia gratuita de 50 chamadas/dia da AccuWeather
_CACHE_LOCATION_KEY_ACCU: dict[tuple[float, float], str] = {}
_CACHE_CLIMA_AGORA: dict[tuple[str, float, float, bool], tuple[float, dict[str, Any]]] = {}


def _obter_chave_accuweather(cfg_ou_chave: dict[str, Any] | str | None) -> str:
    if isinstance(cfg_ou_chave, dict):
        bruta = str(cfg_ou_chave.get("chave_api_accuweather") or "").strip()
    else:
        bruta = str(cfg_ou_chave or "").strip()
    if not bruta or bruta.startswith("••••"):
        bruta = os.environ.get("ACCUWEATHER_API_KEY", "").strip()
    return bruta


def _resolver_location_key_accuweather(lat: float, lon: float, apikey: str) -> tuple[str, str]:
    chave_coord = (round(float(lat), 3), round(float(lon), 3))
    if chave_coord in _CACHE_LOCATION_KEY_ACCU:
        return _CACHE_LOCATION_KEY_ACCU[chave_coord], ""

    resp = requests.get(
        "https://dataservice.accuweather.com/locations/v1/cities/geoposition/search",
        params={"apikey": apikey, "q": f"{lat},{lon}", "language": "pt-br"},
        timeout=(4, 7),
    )
    resp.raise_for_status()
    corpo = resp.json() or {}
    loc_key = str(corpo.get("Key") or "").strip()
    if not loc_key:
        raise ValueError("AccuWeather não retornou LocationKey para esta coordenada.")
    nome_loc = corpo.get("LocalizedName") or ""
    _CACHE_LOCATION_KEY_ACCU[chave_coord] = loc_key
    return loc_key, nome_loc


def consultar_clima_agora_preciso(
    latitude: float,
    longitude: float,
    provedor_clima: str = "accuweather",
    chave_accuweather: str = "",
) -> dict[str, Any]:
    """
    Retorna a condição meteorológica atual exata para o endereço:
    - Se `provedor_clima == 'accuweather'` e houver API Key válida: consulta `dataservice.accuweather.com`.
    - Se `provedor_clima` for `'accuweather'` (sem chave ainda) ou `'estacao_local'`: consulta o termômetro real
      da estação terrestre mais próxima (`wttr.in` / METAR) combinado à irradiância solar terrestre.
    - Se `provedor_clima == 'open_meteo'`: consulta Open-Meteo forçando célula terrestre (`cell_selection=land`).
    """
    prov = (provedor_clima or "accuweather").strip().lower()
    chave = _obter_chave_accuweather(chave_accuweather)
    cache_id = (prov, round(float(latitude), 3), round(float(longitude), 3), bool(chave))
    agora_mono = time.monotonic()
    if cache_id in _CACHE_CLIMA_AGORA:
        ts_salvo, payload_salvo = _CACHE_CLIMA_AGORA[cache_id]
        if agora_mono - ts_salvo < 300:  # 5 min de cache
            return payload_salvo

    aviso_chave = None
    inicio = time.perf_counter()

    # 1. Tentativa oficial na AccuWeather API (quando há API Key configurada)
    if prov == "accuweather" and chave:
        try:
            loc_key, _ = _resolver_location_key_accuweather(latitude, longitude, chave)
            resp_aw = requests.get(
                f"https://dataservice.accuweather.com/currentconditions/v1/{loc_key}",
                params={"apikey": chave, "details": "true", "metric": "true", "language": "pt-br"},
                timeout=(4, 8),
            )
            latencia_ms = round((time.perf_counter() - inicio) * 1000)
            resp_aw.raise_for_status()
            lista = resp_aw.json()
            item = lista[0] if isinstance(lista, list) and lista else {}
            temp_c = item.get("Temperature", {}).get("Metric", {}).get("Value")
            sensacao_c = item.get("RealFeelTemperature", {}).get("Metric", {}).get("Value")
            irrad_wm2 = (item.get("SolarIrradiance") or {}).get("Value")
            nuvens_pct = item.get("CloudCover")
            vento_kmh = item.get("Wind", {}).get("Speed", {}).get("Metric", {}).get("Value")
            umidade_pct = item.get("RelativeHumidity")

            # Se o plano da AccuWeather omitir SolarIrradiance em algum horário, complementa apenas o W/m² solar
            if irrad_wm2 is None:
                try:
                    r_sol = requests.get(
                        "https://api.open-meteo.com/v1/forecast",
                        params={
                            "latitude": latitude,
                            "longitude": longitude,
                            "current": "shortwave_radiation",
                            "cell_selection": "land",
                            "timezone": "America/Recife",
                        },
                        timeout=(3, 5),
                    )
                    if r_sol.ok:
                        irrad_wm2 = r_sol.json().get("current", {}).get("shortwave_radiation", 0.0)
                except Exception:
                    irrad_wm2 = 0.0

            res_aw = {
                "ok": True,
                "fonte": "AccuWeather API Oficial",
                "modo_fonte": "accuweather_oficial",
                "latencia_ms": latencia_ms,
                "temperatura_c": float(temp_c) if temp_c is not None else None,
                "sensacao_c": float(sensacao_c) if sensacao_c is not None else None,
                "irradiancia_wm2": float(irrad_wm2 or 0.0),
                "nuvens_pct": float(nuvens_pct or 0.0),
                "vento_kmh": float(vento_kmh or 0.0),
                "umidade_pct": float(umidade_pct or 0.0),
                "condicao_texto": item.get("WeatherText") or "",
                "horario": datetime.now(TZ_BR).strftime("%H:%M:%S"),
            }
            _CACHE_CLIMA_AGORA[cache_id] = (agora_mono, res_aw)
            return res_aw
        except Exception as exc:
            status_http = getattr(getattr(exc, "response", None), "status_code", None)
            if status_http in (401, 403):
                aviso_chave = "API Key da AccuWeather inválida ou não autorizada (HTTP 401/403). Usando Estação Terrestre Real."
            elif status_http == 503:
                aviso_chave = "Limite diário da chave gratuita AccuWeather atingido. Usando Estação Terrestre Real."
            else:
                aviso_chave = "Não foi possível contactar a AccuWeather agora. Usando Estação Terrestre Real."

    # 2. Estação Meteorológica Terrestre Real (wttr.in / METAR aeroportos + Irradiação Solar em Terra)
    if prov in ("accuweather", "estacao_local"):
        inicio_est = time.perf_counter()
        temp_est: float | None = None
        sensacao_est: float | None = None
        nuvens_est: float | None = None
        vento_est: float | None = None
        umidade_est: float | None = None
        irrad_est: float | None = None

        try:
            r_wttr = requests.get(
                f"https://wttr.in/{latitude},{longitude}",
                params={"format": "j1"},
                headers={"User-Agent": "Helionta-Solar/3.1"},
                timeout=(3, 6),
            )
            r_wttr.raise_for_status()
            atual_w = (r_wttr.json().get("current_condition") or [{}])[0]
            if "temp_C" in atual_w:
                temp_est = float(atual_w["temp_C"])
                sensacao_est = float(atual_w.get("FeelsLikeC", temp_est))
                nuvens_est = float(atual_w.get("cloudcover", 0))
                vento_est = float(atual_w.get("windspeedKmph", 0))
                umidade_est = float(atual_w.get("humidity", 60))
        except Exception:
            pass

        try:
            r_om = requests.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,shortwave_radiation,cloud_cover,wind_speed_10m,relative_humidity_2m",
                    "cell_selection": "land",
                    "timezone": "America/Recife",
                },
                timeout=(3, 6),
            )
            r_om.raise_for_status()
            cur_om = r_om.json().get("current", {})
            irrad_est = float(cur_om.get("shortwave_radiation", 0.0))
            if temp_est is None and cur_om.get("temperature_2m") is not None:
                temp_est = float(cur_om["temperature_2m"])
            if nuvens_est is None and cur_om.get("cloud_cover") is not None:
                nuvens_est = float(cur_om["cloud_cover"])
            if vento_est is None and cur_om.get("wind_speed_10m") is not None:
                vento_est = float(cur_om["wind_speed_10m"])
        except Exception:
            pass

        latencia_ms = round((time.perf_counter() - inicio_est) * 1000)
        if temp_est is not None:
            res_est = {
                "ok": True,
                "fonte": "Estação Meteorológica Terrestre Real (METAR)" if prov == "estacao_local" else "Estação Meteorológica Real (contingência s/ chave AccuWeather)",
                "modo_fonte": "estacao_terrestre_real",
                "requer_chave_accuweather": prov == "accuweather" and not chave,
                "aviso_chave": aviso_chave,
                "latencia_ms": latencia_ms,
                "temperatura_c": temp_est,
                "sensacao_c": sensacao_est,
                "irradiancia_wm2": float(irrad_est or 0.0),
                "nuvens_pct": float(nuvens_est or 0.0),
                "vento_kmh": float(vento_est or 0.0),
                "umidade_pct": float(umidade_est or 60.0),
                "horario": datetime.now(TZ_BR).strftime("%H:%M:%S"),
            }
            _CACHE_CLIMA_AGORA[cache_id] = (agora_mono, res_est)
            return res_est

    # 3. Open-Meteo Grade Terrestre pura (cell_selection=land)
    try:
        r_land = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,shortwave_radiation,cloud_cover,wind_speed_10m",
                "cell_selection": "land",
                "timezone": "America/Recife",
            },
            timeout=(4, 7),
        )
        latencia_ms = round((time.perf_counter() - inicio) * 1000)
        r_land.raise_for_status()
        cur = r_land.json().get("current", {})
        if "temperature_2m" not in cur:
            return {"ok": False, "latencia_ms": latencia_ms}
        return {
            "ok": True,
            "fonte": "Open-Meteo (Grade Terrestre)",
            "modo_fonte": "open_meteo_land",
            "latencia_ms": latencia_ms,
            "temperatura_c": float(cur["temperature_2m"]),
            "sensacao_c": None,
            "irradiancia_wm2": float(cur.get("shortwave_radiation", 0.0)),
            "nuvens_pct": float(cur.get("cloud_cover", 0.0)),
            "vento_kmh": float(cur.get("wind_speed_10m", 0.0)),
            "horario": datetime.now(TZ_BR).strftime("%H:%M:%S"),
        }
    except Exception:
        return {"ok": False, "latencia_ms": round((time.perf_counter() - inicio) * 1000)}


def _calibrar_serie_com_termometro_real_ou_accuweather(
    clima_df: pd.DataFrame,
    cfg: dict[str, Any],
    agora_tz: pd.Timestamp,
) -> tuple[pd.DataFrame, str]:
    """
    Ajusta a série horária para refletir a temperatura/nuvens/vento/irradiância hiperlocal:
    - Com AccuWeather API Key: aplica Current Conditions + 12h Hourly Forecast da AccuWeather.
    - Sem chave (ou modo 'estacao_local'): aplica calibração pelo termômetro terrestre real (`wttr.in` / METAR)
      nas horas próximas ao momento atual, eliminando subestimação costeira de modelos de grade larga.
    """
    prov = str(cfg.get("provedor_clima") or "").strip().lower()
    if prov not in ("accuweather", "estacao_local"):
        return clima_df, "Open-Meteo · grade terrestre"

    df = clima_df.copy()
    lat = float(cfg["latitude"])
    lon = float(cfg["longitude"])
    chave = _obter_chave_accuweather(cfg)
    agora_naive = agora_tz.tz_localize(None)

    # A) Calibração direta com AccuWeather Oficial (Current + 12h Forecast)
    if prov == "accuweather" and chave:
        try:
            loc_key, _ = _resolver_location_key_accuweather(lat, lon, chave)
            r_cur = requests.get(
                f"https://dataservice.accuweather.com/currentconditions/v1/{loc_key}",
                params={"apikey": chave, "details": "true", "metric": "true"},
                timeout=(4, 7),
            )
            r_12h = requests.get(
                f"https://dataservice.accuweather.com/forecasts/v1/hourly/12hour/{loc_key}",
                params={"apikey": chave, "details": "true", "metric": "true"},
                timeout=(4, 7),
            )
            aplicou = False
            if r_cur.ok:
                lista_c = r_cur.json()
                if isinstance(lista_c, list) and lista_c:
                    cur = lista_c[0]
                    t_cur = cur.get("Temperature", {}).get("Metric", {}).get("Value")
                    hora_atual = agora_naive.floor("h")
                    for ts_alvo in (hora_atual, hora_atual + pd.Timedelta(hours=1)):
                        if ts_alvo in df.index and t_cur is not None and "temperature_2m" in df.columns:
                            df.loc[ts_alvo, "temperature_2m"] = float(t_cur)
                            aplicou = True

            if r_12h.ok:
                horas_aw = r_12h.json()
                if isinstance(horas_aw, list):
                    for h_item in horas_aw:
                        dt_str = h_item.get("DateTime")
                        if not dt_str:
                            continue
                        ts_h = pd.Timestamp(dt_str).tz_convert("America/Recife").tz_localize(None).floor("h")
                        if ts_h not in df.index:
                            continue
                        t_val = h_item.get("Temperature", {}).get("Value")
                        if t_val is not None and "temperature_2m" in df.columns:
                            df.loc[ts_h, "temperature_2m"] = float(t_val)
                        cc_val = h_item.get("CloudCover")
                        if cc_val is not None and "cloud_cover" in df.columns:
                            df.loc[ts_h, "cloud_cover"] = float(cc_val)
                        w_val = h_item.get("Wind", {}).get("Speed", {}).get("Value")
                        if w_val is not None and "wind_speed_10m" in df.columns:
                            df.loc[ts_h, "wind_speed_10m"] = float(w_val)
                        sol_val = (h_item.get("SolarIrradiance") or {}).get("Value")
                        if sol_val is not None and "shortwave_radiation" in df.columns:
                            ghi_antigo = float(df.loc[ts_h, "shortwave_radiation"])
                            ghi_novo = max(0.0, float(sol_val))
                            df.loc[ts_h, "shortwave_radiation"] = ghi_novo
                            if ghi_antigo > 5.0:
                                razao = min(2.5, ghi_novo / ghi_antigo)
                                for col_rad in ("direct_normal_irradiance", "diffuse_radiation"):
                                    if col_rad in df.columns:
                                        df.loc[ts_h, col_rad] = float(df.loc[ts_h, col_rad]) * razao
                        aplicou = True
            if aplicou:
                return df, "AccuWeather API Oficial · hiperlocal"
        except Exception:
            pass

    # B) Calibração com Estação Meteorológica Terrestre Real (`wttr.in` / METAR)
    try:
        r_w = requests.get(
            f"https://wttr.in/{lat},{lon}",
            params={"format": "j1"},
            headers={"User-Agent": "Helionta-Solar/3.1"},
            timeout=(3, 5),
        )
        if r_w.ok:
            dados_w = r_w.json()
            cur_list = dados_w.get("current_condition")
            if isinstance(cur_list, list) and cur_list and "temp_C" in cur_list[0]:
                t_real = float(cur_list[0]["temp_C"])
                hora_ref = agora_naive.floor("h")
                if "temperature_2m" in df.columns:
                    ts_prox = hora_ref + pd.Timedelta(hours=1) if (hora_ref + pd.Timedelta(hours=1)) in df.index else hora_ref
                    if ts_prox in df.index:
                        delta_t = float(np.clip(t_real - float(df.loc[ts_prox, "temperature_2m"]), -6.0, 6.0))
                        # Aplica o ajuste do termômetro real nas horas próximas com decaimento suave em 8h
                        for ts in df.index:
                            dist_h = abs((ts - ts_prox).total_seconds()) / 3600.0
                            if dist_h <= 8.0:
                                peso = max(0.0, 1.0 - dist_h / 9.0)
                                df.loc[ts, "temperature_2m"] = round(float(df.loc[ts, "temperature_2m"]) + delta_t * peso, 2)
                return df, "Estação Meteorológica Real (METAR) + Irradiação Terrestre"
    except Exception:
        pass

    return df, "Open-Meteo · grade terrestre"


def obter_clima(
    indice: pd.DatetimeIndex,
    cfg: dict,
    colunas: list[str],
    cache_path: Path,
    estimar: Callable,
    forcar_offline: bool = False,
) -> tuple[pd.DataFrame, dict]:
    agora = pd.Timestamp.now(tz="America/Recife")
    prov_cfg = str(cfg.get("provedor_clima") or "")
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
                    "cell_selection": "land",
                    "temperature_unit": "celsius", "wind_speed_unit": "kmh",
                    "precipitation_unit": "mm",
                },
                timeout=(4, 10),
            )
            resposta.raise_for_status()
            df_grade = pd.DataFrame(resposta.json()["hourly"]).set_index("time")
            df_grade.index = pd.to_datetime(df_grade.index)
            df_grade = df_grade[colunas].apply(pd.to_numeric, errors="coerce")

            fonte_nome = "Open-Meteo · previsão meteorológica"
            if prov_cfg in ("accuweather", "estacao_local"):
                df_grade, fonte_nome = _calibrar_serie_com_termometro_real_ou_accuweather(df_grade, cfg, agora)

            registros = df_grade.reset_index().rename(columns={"index": "time"}).assign(
                time=lambda x: pd.to_datetime(x["time"]).dt.strftime("%Y-%m-%dT%H:%M")
            ).to_dict("records")
            clima = validar(registros)
            cache = {
                "latitude": cfg["latitude"], "longitude": cfg["longitude"],
                "provedor_clima": prov_cfg,
                "fonte": fonte_nome,
                "capturado_em": agora.isoformat(), "registros": registros,
            }
            try:
                cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            except OSError:
                pass
            return clima, {**meta, "status": "online", "api_disponivel": True,
                           "atualizado_em": agora.isoformat(), "fonte": fonte_nome}
        except (requests.RequestException, ValueError, KeyError, TypeError):
            meta["api_disponivel"] = False

        # Nunca reutiliza clima de outra cidade, vencido ou sem as horas atuais.
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
            capturado = pd.Timestamp(cache["capturado_em"])
            idade = (agora - capturado).total_seconds() / 3600
            mesmo_local = all(abs(float(cache[k]) - float(cfg[k])) < 0.0001 for k in ("latitude", "longitude"))
            mesmo_prov = cache.get("provedor_clima", "") == prov_cfg
            if mesmo_local and mesmo_prov and 0 <= idade <= 6:
                clima = validar(cache["registros"])
                return clima, {**meta, "status": "cache", "fonte": cache.get("fonte") or "Cache meteorológico recente da mesma localização",
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
