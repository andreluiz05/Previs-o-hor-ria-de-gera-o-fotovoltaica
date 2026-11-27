"""
Diário persistente da energia solar residencial do usuário (SQLite).
Permite lançar geração diária total (kWh/dia), valores hora a hora ou CSV,
salvando permanentemente em disco com o clima e a estimativa da usina da casa.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from solar_engine import (
    METEO,
    _buscar_clima_historico_open_meteo,
    _estimar_serie_hibrida_com_escala,
    carregar_config_ativa,
    reference,
)


def diagnosticar_saude_detalhada(sub: pd.DataFrame) -> dict[str, Any]:
    """
    Analisa desvios tanto no acumulado do dia quanto em horários específicos de sol,
    diferenciando operação normal, sujeira nas placas, sombreamento parcial e falha elétrica.
    """
    if sub.empty:
        return {
            "nivel": "normal",
            "causa": "sem_dados",
            "titulo": "Aguardando lançamentos",
            "recomendacao": "Registre ao menos um dia de geração para avaliar a saúde das placas e da parte elétrica.",
            "horarios_afetados": [],
            "verificacoes": [],
        }

    real_tot = float(sub["geracao_real_kwh"].sum())
    prev_tot = float(sub["previsao_kwh"].sum())
    if prev_tot <= 0.05:
        return {
            "nivel": "normal",
            "causa": "baixa_irradiacao",
            "titulo": "Período noturno ou sem sol relevante",
            "recomendacao": "Não havia expectativa relevante de geração solar para o intervalo filtrado.",
            "horarios_afetados": [],
            "verificacoes": [],
        }

    desvio_pct = 100.0 * (real_tot - prev_tot) / prev_tot

    # Analisa comportamento hora a hora nos horários de sol relevante
    pico_esp = float(sub["previsao_kwh"].max())
    limiar_sol_forte = max(0.25, pico_esp * 0.30)
    horas_sol = sub[sub["previsao_kwh"] >= limiar_sol_forte].copy()

    horas_zeradas: list[str] = []
    horas_queda_local: list[str] = []
    horas_boas = 0

    if not horas_sol.empty:
        for _, r in horas_sol.iterrows():
            esp_h = float(r["previsao_kwh"])
            real_h = float(r["geracao_real_kwh"])
            rotulo_h = pd.Timestamp(r["data_hora"]).strftime("%d/%m %Hh")
            razao = real_h / max(esp_h, 1e-6)
            if real_h <= 0.02 and esp_h >= max(0.4, pico_esp * 0.45):
                horas_zeradas.append(rotulo_h)
            elif razao < 0.70:
                horas_queda_local.append(rotulo_h)
            elif razao >= 0.85:
                horas_boas += 1

    # 1. Falha elétrica, disjuntor desarmado ou inversor parado (queda > 30% ou corte a zero sob sol forte)
    if horas_zeradas or desvio_pct <= -30.0:
        detalhe_horas = (
            f" A geração caiu a zero em pleno sol ({', '.join(horas_zeradas[:5])})."
            if horas_zeradas
            else ""
        )
        return {
            "nivel": "alerta",
            "causa": "eletrica_ou_inversor",
            "titulo": f"Alerta crítico · Possível problema elétrico ou inversor ({desvio_pct:.1f}%)",
            "recomendacao": (
                f"A geração ficou muito distante do esperado para o clima registrado.{detalhe_horas} "
                "Isso costuma indicar parada do inversor, disjuntor desarmado ou falha em cabos/placas."
            ),
            "horarios_afetados": (horas_zeradas + horas_queda_local)[:6],
            "verificacoes": [
                "Checar se algum disjuntor CA/CC ou proteção (DPS) desarmou no quadro solar.",
                "Conferir o visor ou luzes do inversor em busca de alerta ou desligamento.",
                "Verificar cabos, conectores MC4 ou possível falha em uma fila (string) de placas.",
            ],
        }

    # 2. Sombreamento parcial em horários específicos (parte do dia boa, mas horas específicas com queda forte)
    if horas_queda_local and horas_boas >= 2 and desvio_pct > -30.0:
        lista_h = ", ".join(horas_queda_local[:5])
        return {
            "nivel": "atencao",
            "causa": "sombreamento_parcial",
            "titulo": f"Atenção · Queda em horários específicos ({desvio_pct:.1f}%)",
            "recomendacao": (
                f"As placas funcionaram bem em parte do dia, mas perderam força em horários específicos ({lista_h})."
            ),
            "horarios_afetados": horas_queda_local[:6],
            "verificacoes": [
                "Observar se árvores, prédios vizinhos, muros ou antenas fazem sombra nas placas nesses horários.",
                "Verificar folhas secas ou sujeira concentrada em apenas algumas placas.",
            ],
        }

    # 3. Sujeira acumulada / perda moderada a alta distribuída no dia (-8% a -30%)
    if desvio_pct <= -8.0:
        severo = desvio_pct <= -18.0
        return {
            "nivel": "alerta" if severo else "atencao",
            "causa": "sujeira_nos_modulos",
            "titulo": (
                f"{'Alerta' if severo else 'Atenção'} · Placas abaixo do esperado ({desvio_pct:.1f}%)"
            ),
            "recomendacao": (
                "A usina produziu menos energia que o esperado durante todo o dia para o sol disponível na região — "
                "sinal típico de sujeira acumulada nas placas ou perda gradual de eficiência."
            ),
            "horarios_afetados": horas_queda_local[:6],
            "verificacoes": [
                "Verificar acúmulo de poeira, fuligem ou sujeira de pássaros sobre o vidro das placas (programar limpeza).",
                "Checar se há aquecimento excessivo por falta de ventilação sob os módulos.",
                "Se a geração continuar baixa mesmo após limpar as placas, revisar conexões elétricas.",
            ],
        }

    # 4. Acima da expectativa
    if desvio_pct >= 12.0:
        return {
            "nivel": "otimo",
            "causa": "operacao_otima",
            "titulo": f"Excelente desempenho ({desvio_pct:+.1f}% acima do esperado)",
            "recomendacao": "Placas limpas e parte elétrica operando com ótimo aproveitamento do sol.",
            "horarios_afetados": [],
            "verificacoes": [],
        }

    # 5. Operação saudável dentro do esperado
    return {
        "nivel": "normal",
        "causa": "operacao_normal",
        "titulo": f"Placas e parte elétrica saudáveis ({desvio_pct:+.1f}%)",
        "recomendacao": "A geração está alinhada ao clima da sua região, sem sinais de sujeira excessiva, sombra ou falha elétrica.",
        "horarios_afetados": [],
        "verificacoes": [],
    }


class DiarioSolarCasa:
    def __init__(self, arquivo_sqlite: Path) -> None:
        self.arquivo = Path(arquivo_sqlite)
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        with self._conectar() as db, db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS registros_horarios (
                    data_hora TEXT PRIMARY KEY,
                    data_dia TEXT NOT NULL,
                    geracao_real_kwh REAL NOT NULL,
                    previsao_kwh REAL NOT NULL,
                    referencia_fisica_kwh REAL NOT NULL,
                    ghi_wm2 REAL NOT NULL,
                    temperatura_c REAL NOT NULL,
                    nuvens_pct REAL NOT NULL,
                    chuva_mm REAL NOT NULL,
                    fonte_clima TEXT NOT NULL,
                    atualizado_em TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_registros_dia ON registros_horarios(data_dia);
                """
            )

    def _conectar(self):
        conn = sqlite3.connect(self.arquivo, timeout=10)
        conn.row_factory = sqlite3.Row
        return closing(conn)

    def registrar_dia_total(self, data_dia: str, energia_dia_kwh: float, pasta_saida: Path) -> dict[str, Any]:
        """Distribui o total kWh do dia pela curva solar real da data e salva as 24 horas."""
        if not np.isfinite(energia_dia_kwh) or energia_dia_kwh < 0:
            raise ValueError("Informe um valor de geração diária maior ou igual a zero (kWh).")
        dt = self._validar_data(data_dia)
        cfg = carregar_config_ativa(pasta_saida)
        indice = pd.date_range(dt, periods=24, freq="h")
        clima, fonte_clima = _buscar_clima_historico_open_meteo(indice, cfg)
        fisica = reference(clima, cfg)
        pesos = fisica["referencia_kwh"].to_numpy(float)
        soma_pesos = float(pesos.sum())
        if soma_pesos > 1e-6:
            serie_gerada = energia_dia_kwh * (pesos / soma_pesos)
        else:
            fallback = np.array([1.0 if 8 <= h <= 16 else 0.0 for h in range(24)], dtype=float)
            serie_gerada = energia_dia_kwh * (fallback / fallback.sum())

        df_horas = pd.DataFrame({"energia_kwh": serie_gerada}, index=indice)
        return self._persistir_serie(df_horas, clima, fonte_clima, cfg, pasta_saida)

    def registrar_horas_dia(self, data_dia: str, horas_kwh: dict[str, float], pasta_saida: Path) -> dict[str, Any]:
        """Salva os valores horários (0..23) informados pelo usuário para um dia específico."""
        dt = self._validar_data(data_dia)
        cfg = carregar_config_ativa(pasta_saida)
        indice = pd.date_range(dt, periods=24, freq="h")
        valores = []
        for h in range(24):
            bruto = horas_kwh.get(str(h), horas_kwh.get(h, 0.0))
            val = float(bruto) if bruto is not None else 0.0
            if not np.isfinite(val) or val < 0:
                raise ValueError(f"Valor inválido na hora {h:02d}:00. Informe números >= 0.")
            valores.append(val)
        clima, fonte_clima = _buscar_clima_historico_open_meteo(indice, cfg)
        df_horas = pd.DataFrame({"energia_kwh": valores}, index=indice)
        return self._persistir_serie(df_horas, clima, fonte_clima, cfg, pasta_saida)

    def registrar_dataframe_importado(
        self, df_completo: pd.DataFrame, fonte_clima: str, pasta_saida: Path
    ) -> None:
        """Persiste uma planilha importada pelo usuário no diário da casa."""
        cfg = carregar_config_ativa(pasta_saida)
        self._persistir_serie(df_completo[["energia_kwh"]], df_completo[METEO], fonte_clima, cfg, pasta_saida)

    def remover_dia(self, data_dia: str, pasta_saida: Path) -> dict[str, Any]:
        dt = self._validar_data(data_dia)
        chave = dt.strftime("%Y-%m-%d")
        with self._conectar() as db, db:
            db.execute("DELETE FROM registros_horarios WHERE data_dia = ?", (chave,))
        return self.consultar(pasta_saida)

    def limpar_tudo(self, pasta_saida: Path) -> dict[str, Any]:
        with self._conectar() as db, db:
            db.execute("DELETE FROM registros_horarios")
        return self.consultar(pasta_saida)

    def _validar_data(self, texto_data: str) -> pd.Timestamp:
        try:
            dt = pd.Timestamp(str(texto_data).strip()).normalize()
            if pd.isna(dt):
                raise ValueError
            return dt
        except Exception as exc:
            raise ValueError("Informe uma data válida no formato AAAA-MM-DD.") from exc

    def _persistir_serie(
        self,
        df_energia: pd.DataFrame,
        clima: pd.DataFrame,
        fonte_clima: str,
        cfg: dict[str, Any],
        pasta_saida: Path,
    ) -> dict[str, Any]:
        df_completo = pd.concat([df_energia[["energia_kwh"]], clima[METEO]], axis=1).dropna()
        fisica = reference(df_completo, cfg)
        if (Path(pasta_saida) / "validacao.csv").is_file() and len(df_completo) > 24:
            previsao = _estimar_serie_hibrida_com_escala(df_completo, fisica, cfg, Path(pasta_saida))
        else:
            previsao = fisica["referencia_kwh"]

        agora_iso = datetime.now(timezone.utc).isoformat()
        linhas_sql = []
        for ts in df_completo.index:
            linhas_sql.append(
                (
                    ts.strftime("%Y-%m-%d %H:%M"),
                    ts.strftime("%Y-%m-%d"),
                    round(float(df_completo.loc[ts, "energia_kwh"]), 4),
                    round(float(previsao.loc[ts]), 4),
                    round(float(fisica.loc[ts, "referencia_kwh"]), 4),
                    round(float(df_completo.loc[ts, "shortwave_radiation"]), 2),
                    round(float(df_completo.loc[ts, "temperature_2m"]), 2),
                    round(float(df_completo.loc[ts, "cloud_cover"]), 1),
                    round(float(df_completo.loc[ts, "precipitation"]), 2),
                    fonte_clima,
                    agora_iso,
                )
            )

        with self._conectar() as db, db:
            db.executemany(
                """
                INSERT INTO registros_horarios (
                    data_hora, data_dia, geracao_real_kwh, previsao_kwh, referencia_fisica_kwh,
                    ghi_wm2, temperatura_c, nuvens_pct, chuva_mm, fonte_clima, atualizado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(data_hora) DO UPDATE SET
                    data_dia = excluded.data_dia,
                    geracao_real_kwh = excluded.geracao_real_kwh,
                    previsao_kwh = excluded.previsao_kwh,
                    referencia_fisica_kwh = excluded.referencia_fisica_kwh,
                    ghi_wm2 = excluded.ghi_wm2,
                    temperatura_c = excluded.temperatura_c,
                    nuvens_pct = excluded.nuvens_pct,
                    chuva_mm = excluded.chuva_mm,
                    fonte_clima = excluded.fonte_clima,
                    atualizado_em = excluded.atualizado_em
                """,
                linhas_sql,
            )

        # Se já acumulou >= 20 dias (480h), atualiza também o CSV pronto para retreinamento opcional
        with self._conectar() as db:
            total_horas = db.execute("SELECT COUNT(*) FROM registros_horarios").fetchone()[0]
        if total_horas >= 480:
            try:
                self._exportar_para_treino(Path(pasta_saida), cfg)
            except OSError:
                pass

        return self.consultar(pasta_saida)

    def _exportar_para_treino(self, pasta_saida: Path, cfg: dict[str, Any]) -> None:
        with self._conectar() as db:
            rows = db.execute(
                "SELECT data_hora, geracao_real_kwh FROM registros_horarios ORDER BY data_hora"
            ).fetchall()
        if len(rows) < 480:
            return
        idx = pd.to_datetime([r["data_hora"] for r in rows])
        vals = [float(r["geracao_real_kwh"]) for r in rows]
        clima, _ = _buscar_clima_historico_open_meteo(pd.DatetimeIndex(idx), cfg)
        df = pd.concat([pd.DataFrame({"energia_kwh": vals}, index=idx), clima[METEO]], axis=1).asfreq("h").dropna()
        if len(df) >= 480:
            df.to_csv(pasta_saida / "csv_usuario_carregado.csv", index_label="data_hora")

    def consultar(
        self,
        pasta_saida: Path,
        data_inicio: str | None = None,
        data_fim: str | None = None,
        condicao_clima: str = "todos",
        apenas_diurno: bool = False,
    ) -> dict[str, Any]:
        cfg = carregar_config_ativa(pasta_saida)
        tarifa = float(cfg.get("tarifa_energia_rs", 0.92))

        with self._conectar() as db:
            todas = db.execute("SELECT * FROM registros_horarios ORDER BY data_hora").fetchall()

        if not todas:
            return {
                "possui_registros": False,
                "total_dias": 0,
                "total_horas_filtradas": 0,
                "limite_data_min": None,
                "limite_data_max": None,
                "tarifa_energia_rs": tarifa,
                "kpis": {
                    "energia_real_total_kwh": 0.0,
                    "energia_prevista_total_kwh": 0.0,
                    "energia_fisica_total_kwh": 0.0,
                    "diferenca_kwh": 0.0,
                    "desvio_pct": 0.0,
                    "aderencia_pct": 100.0,
                    "mae_kwh": 0.0,
                    "economia_real_rs": 0.0,
                    "economia_liquida_rs": 0.0,
                    "economia_prevista_rs": 0.0,
                },
                "diagnostico": None,
                "resumo_diario": [],
                "registros_horarios": [],
            }

        df = pd.DataFrame([dict(r) for r in todas])
        lim_min = str(df["data_dia"].min())
        lim_max = str(df["data_dia"].max())

        ini = data_inicio if data_inicio else lim_min
        fim = data_fim if data_fim else lim_max
        sub = df[(df["data_dia"] >= ini) & (df["data_dia"] <= fim)].copy()
        if sub.empty:
            sub = df.copy()

        if apenas_diurno:
            sub = sub[(sub["ghi_wm2"] > 0) | (sub["referencia_fisica_kwh"] > 0) | (sub["geracao_real_kwh"] > 0)]
        if condicao_clima == "limpo":
            sub = sub[sub["nuvens_pct"] < 40]
        elif condicao_clima == "nublado":
            sub = sub[sub["nuvens_pct"] >= 70]
        elif condicao_clima == "chuva":
            sub = sub[sub["chuva_mm"] > 0]

        registros = []
        for _, r in sub.iterrows():
            ts = pd.Timestamp(r["data_hora"])
            real_v = float(r["geracao_real_kwh"])
            prev_v = float(r["previsao_kwh"])
            fis_v = float(r["referencia_fisica_kwh"])
            registros.append(
                {
                    "data_hora": str(r["data_hora"]),
                    "data_dia": str(r["data_dia"]),
                    "rotulo": ts.strftime("%d/%m %Hh"),
                    "hora": ts.strftime("%H:%M"),
                    "geracao_real_kwh": round(real_v, 3),
                    "previsao_kwh": round(prev_v, 3),
                    "referencia_fisica_kwh": round(fis_v, 3),
                    "erro_kwh": round(real_v - prev_v, 3),
                    "ghi_wm2": round(float(r["ghi_wm2"]), 1),
                    "temperatura_c": round(float(r["temperatura_c"]), 1),
                    "nuvens_pct": round(float(r["nuvens_pct"]), 0),
                    "chuva_mm": round(float(r["chuva_mm"]), 2),
                    "valor_rs": round(real_v * tarifa, 2),
                }
            )

        resumo_diario = []
        if not sub.empty:
            for dia, grp in sub.groupby("data_dia"):
                dt_dia = pd.Timestamp(dia)
                real_d = float(grp["geracao_real_kwh"].sum())
                prev_d = float(grp["previsao_kwh"].sum())
                fis_d = float(grp["referencia_fisica_kwh"].sum())
                resumo_diario.append(
                    {
                        "data_iso": str(dia),
                        "data": dt_dia.strftime("%d/%m/%Y"),
                        "data_curta": dt_dia.strftime("%d/%m"),
                        "geracao_real_kwh": round(real_d, 2),
                        "previsao_kwh": round(prev_d, 2),
                        "referencia_fisica_kwh": round(fis_d, 2),
                        "diferenca_kwh": round(real_d - prev_d, 2),
                        "economia_real_rs": round(real_d * tarifa, 2),
                        "fonte_clima": str(grp["fonte_clima"].iloc[-1]),
                    }
                )

        real_tot = float(sub["geracao_real_kwh"].sum()) if not sub.empty else 0.0
        prev_tot = float(sub["previsao_kwh"].sum()) if not sub.empty else 0.0
        fis_tot = float(sub["referencia_fisica_kwh"].sum()) if not sub.empty else 0.0
        erros_abs = np.abs(sub["geracao_real_kwh"].to_numpy(float) - sub["previsao_kwh"].to_numpy(float)) if not sub.empty else np.array([0.0])
        mae = float(erros_abs.mean())
        denom = max(prev_tot, real_tot, 1e-6)
        wape = float(100.0 * erros_abs.sum() / denom) if (real_tot > 0 or prev_tot > 0) else 0.0
        desvio_pct = float(100.0 * (real_tot - prev_tot) / max(prev_tot, 1e-6)) if prev_tot > 0 else 0.0

        return {
            "possui_registros": True,
            "total_dias": int(df["data_dia"].nunique()),
            "total_horas_salvas": int(len(df)),
            "total_horas_filtradas": int(len(registros)),
            "limite_data_min": lim_min,
            "limite_data_max": lim_max,
            "data_inicio_aplicada": ini,
            "data_fim_aplicada": fim,
            "tarifa_energia_rs": tarifa,
            "kpis": {
                "energia_real_total_kwh": round(real_tot, 2),
                "energia_prevista_total_kwh": round(prev_tot, 2),
                "energia_fisica_total_kwh": round(fis_tot, 2),
                "diferenca_kwh": round(real_tot - prev_tot, 2),
                "desvio_pct": round(desvio_pct, 1),
                "aderencia_pct": round(max(0.0, 100.0 - wape), 1),
                "mae_kwh": round(mae, 3),
                "economia_real_rs": round(real_tot * tarifa, 2),
                "economia_liquida_rs": round(real_tot * tarifa * 0.89, 2),
                "economia_prevista_rs": round(prev_tot * tarifa, 2),
            },
            "diagnostico": diagnosticar_saude_detalhada(sub),
            "resumo_diario": resumo_diario,
            "registros_horarios": registros,
        }
