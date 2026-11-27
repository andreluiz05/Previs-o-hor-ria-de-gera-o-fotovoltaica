"""
Motor de Energia em Tempo Real (Helionta):
1. Calcula minuto a minuto a potência solar instantânea (kW), irradiância no plano das placas (W/m²)
   e energia acumulada hoje até o minuto atual usando o clima real da Open-Meteo.
2. Recebe leituras reais ao vivo de inversores / medidores (HTTP Webhook / API / lançamento ao vivo),
   comparando Potência Medida Agora × Potência Esperada pelo Sol Agora e emitindo alerta instantâneo.
"""

from __future__ import annotations

import json
import math
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from clima import obter_clima
from solar_engine import METEO, _clima_ilustrativo, carregar_config_ativa, reference, vector

TZ_BR = timezone(timedelta(hours=-3))
JANELA_ONLINE_SEGUNDOS = 900  # 15 minutos


class CentralTempoReal:
    def __init__(self, arquivo_sqlite: Path) -> None:
        self.arquivo = Path(arquivo_sqlite)
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        with self._conectar() as db, db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS leituras_reais (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instante TEXT NOT NULL,
                    potencia_kw REAL NOT NULL,
                    energia_dia_kwh REAL,
                    origem TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_leituras_reais_instante ON leituras_reais(instante);
                """
            )

    def _conectar(self):
        conn = sqlite3.connect(self.arquivo, timeout=10)
        conn.row_factory = sqlite3.Row
        return closing(conn)

    def registrar_leitura_real(
        self,
        potencia_kw: float,
        pasta_saida: Path,
        energia_dia_kwh: float | None = None,
        origem: str = "Inversor / Medidor",
        agora_override: datetime | None = None,
    ) -> dict[str, Any]:
        if not np.isfinite(potencia_kw) or potencia_kw < 0:
            raise ValueError("A potência em tempo real (kW) deve ser um número maior ou igual a zero.")
        if energia_dia_kwh is not None and (not np.isfinite(energia_dia_kwh) or energia_dia_kwh < 0):
            raise ValueError("A energia acumulada no dia (kWh) deve ser maior ou igual a zero.")

        agora = (agora_override or datetime.now(TZ_BR)).astimezone(TZ_BR)
        with self._conectar() as db, db:
            db.execute(
                "INSERT INTO leituras_reais (instante, potencia_kw, energia_dia_kwh, origem) VALUES (?, ?, ?, ?)",
                (
                    agora.isoformat(timespec="seconds"),
                    round(float(potencia_kw), 4),
                    round(float(energia_dia_kwh), 4) if energia_dia_kwh is not None else None,
                    (origem or "Inversor").strip()[:60],
                ),
            )
        return self.estado_agora(pasta_saida, agora_override=agora)

    def limpar_leituras_hoje(self, pasta_saida: Path) -> dict[str, Any]:
        with self._conectar() as db, db:
            db.execute("DELETE FROM leituras_reais")
        return self.estado_agora(pasta_saida)

    def _obter_clima_hoje(self, indice_hoje: pd.DatetimeIndex, cfg: dict[str, Any], pasta_saida: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
        cache_path = Path(pasta_saida) / "ultimo_open_meteo_cache.json"
        agora = pd.Timestamp.now(tz="America/Recife")
        # Se o cache local tiver menos de 15 minutos e for da mesma coordenada, reutiliza sem latência de rede
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
            capturado = pd.Timestamp(cache["capturado_em"])
            idade_min = (agora - capturado).total_seconds() / 60.0
            mesmo_local = all(abs(float(cache[k]) - float(cfg[k])) < 0.0001 for k in ("latitude", "longitude"))
            mesmo_prov = cache.get("provedor_clima", "") == cfg.get("provedor_clima", "accuweather")
            if mesmo_local and mesmo_prov and 0 <= idade_min <= 15:
                df = pd.DataFrame(cache["registros"]).set_index("time")
                df.index = pd.to_datetime(df.index)
                df = df[METEO].apply(pd.to_numeric, errors="coerce").reindex(indice_hoje)
                if np.isfinite(df.to_numpy()).all():
                    return df, {
                        "status": "online",
                        "dados_simulados": False,
                        "atualizado_em": capturado.isoformat(),
                        "fonte": "Open-Meteo · clima em tempo real",
                    }
        except Exception:
            pass

        return obter_clima(indice_hoje, cfg, METEO, cache_path, _clima_ilustrativo, False)

    def estado_agora(
        self,
        pasta_saida: Path,
        agora_override: datetime | None = None,
    ) -> dict[str, Any]:
        pasta_saida = Path(pasta_saida)
        cfg = carregar_config_ativa(pasta_saida)
        tarifa = float(cfg.get("tarifa_energia_rs", 0.92))
        kwp = cfg["quantidade_placas"] * cfg["potencia_placa_wp"] / 1000.0

        agora = (agora_override or datetime.now(TZ_BR)).astimezone(TZ_BR)
        agora_naive = pd.Timestamp(agora.replace(tzinfo=None))
        inicio_dia = agora_naive.normalize()
        # Intervalos horários do dia atual: 01:00 até 24:00 (fim de cada hora)
        fins_hoje = pd.date_range(inicio_dia + pd.Timedelta(hours=1), periods=24, freq="h")
        clima_hoje, meteo_info = self._obter_clima_hoje(fins_hoje, cfg, pasta_saida)
        fisica_hoje = reference(clima_hoje, cfg)

        # Geometria solar no instante exato atual
        up_arr, north_arr, east_arr = vector(pd.DatetimeIndex([agora_naive]), cfg)
        up, north, east = float(up_arr[0]), float(north_arr[0]), float(east_arr[0])
        sol_acima = up > 0.0
        elevacao_graus = round(math.degrees(math.asin(max(-1.0, min(1.0, up)))), 1)

        # Clima da hora corrente (intervalo que se encerra na próxima hora cheia)
        hora_corrente_fim = agora_naive.floor("h") + pd.Timedelta(hours=1)
        if hora_corrente_fim not in clima_hoje.index:
            hora_corrente_fim = fins_hoje[-1]
        linha_clima = clima_hoje.loc[hora_corrente_fim]

        ghi_agora = max(0.0, float(linha_clima["shortwave_radiation"])) if sol_acima else 0.0
        dni_agora = max(0.0, float(linha_clima["direct_normal_irradiance"])) if sol_acima else 0.0
        dhi_agora = max(0.0, float(linha_clima["diffuse_radiation"])) if sol_acima else 0.0
        temp_ar = float(linha_clima["temperature_2m"])
        nuvens_pct = float(linha_clima["cloud_cover"])
        vento_kmh = float(linha_clima["wind_speed_10m"])

        if sol_acima:
            b = math.radians(cfg["inclinacao_graus"])
            az = math.radians(cfg["azimute_graus"])
            cos_aoi = max(0.0, up * math.cos(b) + math.sin(b) * (north * math.cos(az) + east * math.sin(az)))
            poa_agora = dni_agora * cos_aoi + dhi_agora * (1 + math.cos(b)) / 2 + ghi_agora * cfg["albedo"] * (1 - math.cos(b)) / 2
            temp_celula = temp_ar + (cfg["noct_c"] - 20) * poa_agora / 800.0 / (1 + 0.1 * max(vento_kmh / 3.6 - 1.0, 0.0))
            dc_kw = max(0.0, kwp * poa_agora / 1000.0 * (1 + cfg["coeficiente_termico"] * (temp_celula - 25.0)) * (1 - cfg["perdas_dc"]))
            potencia_esperada_kw = min(dc_kw * cfg["eficiencia_inversor"], cfg["inversor_kw"])
        else:
            poa_agora = 0.0
            temp_celula = temp_ar
            potencia_esperada_kw = 0.0

        # Acumulado esperado hoje até este minuto exato + restante até o fim do dia
        fracao_hora = (agora.minute + agora.second / 60.0) / 60.0
        horas_concluidas = fins_hoje[fins_hoje <= agora_naive.floor("h")]
        energia_concluida = float(fisica_hoje.loc[horas_concluidas, "referencia_kwh"].sum()) if len(horas_concluidas) else 0.0
        energia_hora_atual = float(fisica_hoje.loc[hora_corrente_fim, "referencia_kwh"]) * fracao_hora if hora_corrente_fim in fisica_hoje.index else 0.0
        energia_esperada_ate_agora = energia_concluida + energia_hora_atual
        energia_total_dia = float(fisica_hoje["referencia_kwh"].sum())
        energia_restante_hoje = max(0.0, energia_total_dia - energia_esperada_ate_agora)

        # Verifica leituras reais recebidas do inversor / medidor hoje
        hoje_prefixo = agora.strftime("%Y-%m-%d")
        with self._conectar() as db:
            leituras_hoje = db.execute(
                "SELECT * FROM leituras_reais WHERE instante LIKE ? ORDER BY id DESC LIMIT 120",
                (f"{hoje_prefixo}%",),
            ).fetchall()

        ultima_real = dict(leituras_hoje[0]) if leituras_hoje else None
        inversor_ao_vivo = False
        idade_leitura_seg: int | None = None
        potencia_medida_kw: float | None = None
        energia_medida_hoje_kwh: float | None = None

        if ultima_real:
            dt_ult = datetime.fromisoformat(ultima_real["instante"])
            idade_leitura_seg = max(0, int((agora - dt_ult).total_seconds()))
            inversor_ao_vivo = idade_leitura_seg <= JANELA_ONLINE_SEGUNDOS
            potencia_medida_kw = float(ultima_real["potencia_kw"])
            if ultima_real["energia_dia_kwh"] is not None:
                energia_medida_hoje_kwh = float(ultima_real["energia_dia_kwh"])

        # Diagnóstico instantâneo quando há leitura real recente do inversor
        diagnostico_agora = self._diagnosticar_instante(
            inversor_ao_vivo=inversor_ao_vivo,
            sol_acima=sol_acima,
            potencia_medida_kw=potencia_medida_kw,
            potencia_esperada_kw=potencia_esperada_kw,
            inversor_kw=cfg["inversor_kw"],
        )

        # Série horária de hoje (01h..24h) marcando horas passadas, hora atual e projeção futura
        leituras_por_hora: dict[int, list[float]] = {}
        for row in leituras_hoje:
            h_row = datetime.fromisoformat(row["instante"]).hour
            leituras_por_hora.setdefault(h_row, []).append(float(row["potencia_kw"]))

        serie_hoje = []
        hora_atual_int = agora.hour
        for idx_h, ts in enumerate(fins_hoje):
            # idx_h = 0 representa o intervalo 00:00 -> 01:00 (hora 0)
            esperado_h = round(float(fisica_hoje.loc[ts, "referencia_kwh"]), 3)
            passado_ou_atual = idx_h <= hora_atual_int
            medido_h = round(float(np.mean(leituras_por_hora[idx_h])), 3) if idx_h in leituras_por_hora else None
            serie_hoje.append(
                {
                    "hora": f"{idx_h:02d}h",
                    "estado_hora": "atual" if idx_h == hora_atual_int else ("passado" if idx_h < hora_atual_int else "futuro"),
                    "realizado_estimado_kwh": esperado_h if passado_ou_atual else None,
                    "projecao_restante_kwh": esperado_h if idx_h >= hora_atual_int else None,
                    "medido_inversor_kwh": medido_h,
                    "nuvens_pct": round(float(clima_hoje.loc[ts, "cloud_cover"]), 0),
                }
            )

        potencia_principal = potencia_medida_kw if inversor_ao_vivo and potencia_medida_kw is not None else potencia_esperada_kw
        energia_hoje_principal = (
            energia_medida_hoje_kwh
            if energia_medida_hoje_kwh is not None
            else round(energia_esperada_ate_agora, 3)
        )

        return {
            "instante_atual": agora.isoformat(timespec="seconds"),
            "horario_formatado": agora.strftime("%H:%M:%S"),
            "usina_nome": cfg["nome"],
            "usina_cidade": cfg["cidade"],
            "kwp_instalado": round(kwp, 2),
            "inversor_kw": cfg["inversor_kw"],
            "sol_acima_horizonte": sol_acima,
            "elevacao_solar_graus": elevacao_graus,
            "modo_operacao": "inversor_conectado" if inversor_ao_vivo else "clima_tempo_real",
            "inversor_conectado_ao_vivo": inversor_ao_vivo,
            "potencia_atual_kw": round(potencia_principal, 3),
            "potencia_esperada_agora_kw": round(potencia_esperada_kw, 3),
            "potencia_medida_inversor_kw": round(potencia_medida_kw, 3) if potencia_medida_kw is not None else None,
            "idade_leitura_segundos": idade_leitura_seg,
            "origem_ultima_leitura": ultima_real["origem"] if ultima_real else None,
            "energia_hoje_ate_agora_kwh": round(energia_hoje_principal, 2),
            "energia_esperada_ate_agora_kwh": round(energia_esperada_ate_agora, 2),
            "energia_restante_hoje_kwh": round(energia_restante_hoje, 2),
            "energia_total_prevista_hoje_kwh": round(energia_total_dia, 2),
            "economia_hoje_ate_agora_rs": round(energia_hoje_principal * tarifa, 2),
            "economia_prevista_hoje_rs": round(energia_total_dia * tarifa, 2),
            "clima_agora": {
                "poa_wm2": round(poa_agora, 0),
                "ghi_wm2": round(ghi_agora, 0),
                "temperatura_ar_c": round(temp_ar, 1),
                "temperatura_placa_c": round(temp_celula, 1),
                "nuvens_pct": round(nuvens_pct, 0),
                "fonte": meteo_info.get("fonte", "Open-Meteo"),
                "online": meteo_info.get("status") == "online",
            },
            "diagnostico_agora": diagnostico_agora,
            "serie_hoje": serie_hoje,
            "ultimas_leituras_reais": [
                {
                    "id": r["id"],
                    "horario": datetime.fromisoformat(r["instante"]).strftime("%H:%M:%S"),
                    "potencia_kw": round(float(r["potencia_kw"]), 3),
                    "origem": r["origem"],
                }
                for r in leituras_hoje[:8]
            ],
        }

    def _diagnosticar_instante(
        self,
        inversor_ao_vivo: bool,
        sol_acima: bool,
        potencia_medida_kw: float | None,
        potencia_esperada_kw: float,
        inversor_kw: float,
    ) -> dict[str, Any]:
        if not inversor_ao_vivo or potencia_medida_kw is None:
            return {
                "nivel": "normal",
                "titulo": (
                    "Estimativa solar em tempo real ativa"
                    if sol_acima
                    else "Período noturno · geração solar em repouso (0 kW)"
                ),
                "detalhe": (
                    "Calculando a potência instantânea pelo ângulo do Sol agora e pelo clima atual da Open-Meteo. "
                    "Conecte seu inversor ou informe uma leitura em kW abaixo para comparar em tempo real."
                    if sol_acima
                    else "O Sol está abaixo do horizonte na sua localização neste momento."
                ),
            }

        if not sol_acima or potencia_esperada_kw < 0.08:
            return {
                "nivel": "normal",
                "titulo": "Inversor conectado · Baixa irradiação ou noite",
                "detalhe": f"Leitura recebida ({potencia_medida_kw:.2f} kW) compatível com o horário.",
            }

        desvio_pct = 100.0 * (potencia_medida_kw - potencia_esperada_kw) / max(potencia_esperada_kw, 1e-6)
        if potencia_medida_kw <= 0.03 and potencia_esperada_kw >= max(0.3, inversor_kw * 0.20):
            return {
                "nivel": "alerta",
                "titulo": "Alerta imediato · Sol forte agora, mas inversor em 0 kW!",
                "detalhe": (
                    f"Era esperado cerca de {potencia_esperada_kw:.2f} kW neste minuto, porém a leitura foi {potencia_medida_kw:.2f} kW. "
                    "Verifique se o disjuntor desarmou ou se o inversor entrou em proteção."
                ),
            }
        if desvio_pct <= -25.0:
            return {
                "nivel": "atencao",
                "titulo": f"Atenção agora · Potência {abs(desvio_pct):.0f}% abaixo do sol atual",
                "detalhe": (
                    f"Medido {potencia_medida_kw:.2f} kW contra {potencia_esperada_kw:.2f} kW esperados agora. "
                    "Pode haver nuvem passageira local, sombra batendo nas placas neste horário ou sujeira nos módulos."
                ),
            }
        return {
            "nivel": "otimo",
            "titulo": f"Inversor saudável agora ({potencia_medida_kw:.2f} kW)",
            "detalhe": f"Potência alinhada com a irradiação solar deste minuto ({potencia_esperada_kw:.2f} kW esperados).",
        }
