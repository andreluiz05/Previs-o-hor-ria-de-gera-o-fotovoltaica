"""
================================================================================
PROJETO SOLAR V3 (TECALLI TECNOLOGIA) — SERVIDOR BACKEND FASTAPI
================================================================================
Disponibiliza rotas HTTP completas tanto para a jornada do usuário final
(cadastro personalizado da usina, busca de cidade, consulta de dados, comparação
Real × Previsto e importação simples de inversor) quanto para o benchmark científico.

Organização do arquivo em blocos:
  - BLOCO 1: Inicialização da aplicação FastAPI, diretórios, CORS e estado global
  - BLOCO 2: Esquemas de entrada (Pydantic) e utilitários auxiliares
  - BLOCO 3: Rotas do Usuário Final (Minha Usina, Busca de Cidade, Consulta e Inversor)
  - BLOCO 4: Rotas Científicas de Benchmark e Laboratório Físico
  - BLOCO 5: Previsão Operacional 24h (Open-Meteo) e Treinamento em Segundo Plano
================================================================================
"""

from __future__ import annotations

import csv
import io
import json
from contextlib import asynccontextmanager
import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from central_apis import CentralApisProjeto, testar_endpoint_externo
from diario_casa import DiarioSolarCasa
from monitoramento import MonitoramentoSolar
from fonte_publica import MonitorPublico
from tempo_real import CentralTempoReal

from clima import consultar_clima_agora_preciso, obter_clima
from solar_engine import (
    DEFAULT_CONFIG,
    DEFAULT_EPOCHS,
    DEFAULT_SEEDS,
    METEO,
    _buscar_clima_historico_open_meteo,
    _clima_ilustrativo,
    benchmark,
    buscar_localidades,
    carregar_config_ativa,
    consultar_historico_comparativo,
    demo,
    export_results_zip,
    importar_planilha_inversor_usuario,
    inspect_single_hour_inference,
    ler_csv_bytes,
    previsao_operacional,
    reference,
    run_physics_checks,
    salvar_config_ativa,
    simulate_custom_physics,
    validate_config,
)


# ==============================================================================
# BLOCO 1: INICIALIZAÇÃO DA APLICAÇÃO FASTAPI, DIRETÓRIOS E ESTADO DE TREINO
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent
SAIDA_DIR = BASE_DIR / "resultados_v3_notebook"
SAIDA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADED_CSV_PATH = SAIDA_DIR / "csv_usuario_carregado.csv"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

MONITORAMENTO = MonitoramentoSolar(BASE_DIR / "monitoramento" / "telemetria.sqlite3")
FONTE_PUBLICA = MonitorPublico(BASE_DIR / "monitoramento" / "fonte_publica.sqlite3")
DIARIO_CASA = DiarioSolarCasa(BASE_DIR / "monitoramento" / "diario_casa.sqlite3")
TEMPO_REAL = CentralTempoReal(BASE_DIR / "monitoramento" / "tempo_real.sqlite3")
CENTRAL_APIS = CentralApisProjeto(BASE_DIR / "monitoramento" / "apis_projeto.sqlite3")


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    MONITORAMENTO.iniciar_coletor()
    FONTE_PUBLICA.iniciar_coletor()
    try:
        yield
    finally:
        MONITORAMENTO.parar_coletor()
        FONTE_PUBLICA.parar_coletor()


app = FastAPI(
    title="Helionta — Previsão de energia solar",
    description="Personalização de usinas solares, comparação Real × Previsto, IA LSTM com restrições físicas e Open-Meteo.",
    version="3.1.0",
    lifespan=ciclo_de_vida,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TRAIN_LOCK = threading.Lock()
TRAIN_STATE: dict[str, Any] = {
    "em_andamento": False,
    "passo_atual": 0,
    "total_passos": 1,
    "progresso_pct": 0.0,
    "mensagem": "Pronto",
    "erro": None,
    "ultima_conclusao": None,
}


# ==============================================================================
# BLOCO 2: ESQUEMAS DE VALIDAÇÃO (PYDANTIC) E UTILITÁRIOS AUXILIARES
# ==============================================================================

class RequisicaoConfigUsina(BaseModel):
    """Dados personalizados informados pelo dono/integrador da usina solar."""
    nome: str = "Minha Usina Solar"
    cidade: str = "Recife, Pernambuco"
    latitude: float = -8.05
    longitude: float = -34.88
    quantidade_placas: int = 10
    potencia_placa_wp: float = 550.0
    modelo_placa: str = "Monocristalino Half-Cell 550 Wp"
    marca_inversor: str = "Inversor On-Grid"
    inversor_kw: float = 5.0
    inclinacao_graus: float = 10.0
    azimute_graus: float = 0.0
    eficiencia_inversor: float = 0.96
    coeficiente_termico: float = -0.0035
    noct_c: float = 45.0
    perdas_dc: float = 0.08
    albedo: float = 0.2
    tarifa_energia_rs: float = 0.92
    modo_conexao_inversor: str = "api_inversor"
    provedor_inversor: str = "SolarNetwork · API Real Online"
    url_api_inversor: str = ""
    token_api_inversor: str = ""
    campo_potencia_json: str = "data.results.0.watts"
    unidade_potencia_api: str = "W"
    provedor_clima: str = "accuweather"
    chave_api_accuweather: str = ""


class RequisicaoSimulacaoFisica(BaseModel):
    """Parâmetros recebidos do simulador interativo de engenharia ('E se?')."""
    data: str | None = None
    quantidade_placas: int = 10
    potencia_placa_wp: float = 550.0
    inversor_kw: float = 5.0
    inclinacao_graus: float = 10.0
    azimute_graus: float = 0.0
    eficiencia_inversor: float = 0.96
    coeficiente_termico: float = -0.0035
    noct_c: float = 45.0
    perdas_dc: float = 0.08
    albedo: float = 0.2


class RequisicaoTreinamento(BaseModel):
    """Configuração enviada pelo painel de treinamento para reexecutar o pipeline V3."""
    modo: str = Field(default="demo", pattern="^(demo|csv)$")
    modo_clima: str = Field(default="previsao", pattern="^(previsao|historico)$")
    epocas: int = Field(default=DEFAULT_EPOCHS, ge=1, le=120)
    seeds: list[int] = Field(default_factory=lambda: list(DEFAULT_SEEDS))
    config: dict[str, Any] = Field(default_factory=lambda: dict(DEFAULT_CONFIG))


def _limpar_float(valor: Any) -> float | None:
    if valor is None or (isinstance(valor, float) and not np.isfinite(valor)):
        return None
    try:
        f = float(valor)
        return round(f, 6) if np.isfinite(f) else None
    except Exception:
        return None


def _garantir_artefatos_iniciais() -> None:
    if not (SAIDA_DIR / "metadados.json").is_file():
        cfg = validate_config(DEFAULT_CONFIG)
        dados = demo(cfg)
        args = SimpleNamespace(
            cfg=cfg,
            lat=cfg["latitude"],
            lon=cfg["longitude"],
            capacidade_kw=cfg["inversor_kw"],
            epocas=DEFAULT_EPOCHS,
            seeds=DEFAULT_SEEDS,
            smoke=True,
            modo="previsao_ficticia",
        )
        benchmark(dados, args, SAIDA_DIR)


# ==============================================================================
# BLOCO 3: ROTAS DO USUÁRIO FINAL (MINHA USINA, CIDADES, CONSULTA E INVERSOR)
# ==============================================================================

@app.get("/api/geocoding")
def pesquisar_cidade(busca: str = Query(default="", description="Nome da cidade ou município")) -> dict[str, Any]:
    """Localiza latitude e longitude automaticamente a partir do nome da cidade."""
    return {"resultados": buscar_localidades(busca)}


@app.post("/api/config")
def atualizar_configuracao_usina(req: RequisicaoConfigUsina) -> dict[str, Any]:
    """Salva imediatamente os dados personalizados das placas, inversor e localização do usuário."""
    _garantir_artefatos_iniciais()
    try:
        nova_cfg = salvar_config_ativa(SAIDA_DIR, req.model_dump())
        kwp = nova_cfg["quantidade_placas"] * nova_cfg["potencia_placa_wp"] / 1000.0
        return {
            "mensagem": "Configuração da usina salva com sucesso! Previsões e cálculos já utilizam seus equipamentos.",
            "config": nova_cfg,
            "potencia_dc_kwp": round(kwp, 3),
            "overload_dc_ac_pct": round(100.0 * kwp / nova_cfg["inversor_kw"], 1),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/dados/consulta")
def consultar_dados_geracao(
    data_inicio: str | None = Query(default=None),
    data_fim: str | None = Query(default=None),
    modelo: str = Query(default="LSTM_residual_fisico"),
    condicao_clima: str = Query(default="todos"),
    apenas_diurno: bool = Query(default=False),
) -> dict[str, Any]:
    """Consulta filtrável do histórico comparando Geração Real × Previsão IA × Física + R$."""
    _garantir_artefatos_iniciais()
    try:
        return consultar_historico_comparativo(
            SAIDA_DIR,
            data_inicio=data_inicio,
            data_fim=data_fim,
            modelo=modelo,
            condicao_clima=condicao_clima,
            apenas_diurno=apenas_diurno,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class RequisicaoDiarioDiaTotal(BaseModel):
    data_dia: str
    energia_dia_kwh: float = Field(ge=0.0, le=100000.0)


class RequisicaoDiarioHoras(BaseModel):
    data_dia: str
    horas_kwh: dict[str, float]


class RequisicaoLeituraTempoReal(BaseModel):
    potencia_kw: float = Field(ge=0.0, le=500000.0)
    energia_dia_kwh: float | None = Field(default=None, ge=0.0, le=5000000.0)
    origem: str = "Inversor / Medidor"


class RequisicaoNovaApiPersonalizada(BaseModel):
    nome: str
    categoria: str = "inversor"
    url: str
    token: str = ""
    campo_potencia: str = ""
    unidade: str = "kW"


class RequisicaoTesteUrlApi(BaseModel):
    url: str
    token: str = ""
    campo_potencia: str = ""
    unidade: str = "W"


class RequisicaoAlternarApi(BaseModel):
    ativa: bool


class RequisicaoLocalClima(BaseModel):
    cidade: str
    latitude: float
    longitude: float
    provedor_clima: str | None = None
    chave_api_accuweather: str | None = None


class RequisicaoTesteClima(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    provedor_clima: Literal["accuweather", "estacao_local", "open_meteo"]
    chave_api_accuweather: str = ""


@app.post("/api/apis/clima/testar")
def testar_clima_no_endereco(req: RequisicaoTesteClima) -> dict[str, Any]:
    """Consulta o clima para o formulário antes de salvar a configuração da usina."""
    return consultar_clima_agora_preciso(
        latitude=req.latitude,
        longitude=req.longitude,
        provedor_clima=req.provedor_clima,
        chave_accuweather=req.chave_api_accuweather,
    )


@app.get("/api/apis")
def listar_central_apis() -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    return CENTRAL_APIS.listar_tudo(SAIDA_DIR)


@app.post("/api/apis/clima/local")
async def atualizar_endereco_api_clima(req: RequisicaoLocalClima) -> dict[str, Any]:
    """Muda o endereço/provedor ativo da API de Clima e retorna o clima exato daquele ponto."""
    _garantir_artefatos_iniciais()
    try:
        return await run_in_threadpool(
            CENTRAL_APIS.atualizar_local_clima,
            req.cidade,
            req.latitude,
            req.longitude,
            SAIDA_DIR,
            req.provedor_clima,
            req.chave_api_accuweather,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/apis")
def cadastrar_api_personalizada(req: RequisicaoNovaApiPersonalizada) -> dict[str, Any]:
    try:
        return CENTRAL_APIS.adicionar_personalizada(
            nome=req.nome,
            categoria=req.categoria,
            url=req.url,
            pasta_saida=SAIDA_DIR,
            token=req.token,
            campo_potencia=req.campo_potencia,
            unidade=req.unidade,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/apis/testar-url")
async def testar_url_api_avulsa(req: RequisicaoTesteUrlApi) -> dict[str, Any]:
    try:
        return await run_in_threadpool(
            testar_endpoint_externo,
            req.url,
            req.token,
            req.campo_potencia,
            req.unidade,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/apis/{api_id}/testar")
async def testar_api_cadastrada(api_id: str) -> dict[str, Any]:
    try:
        return await run_in_threadpool(CENTRAL_APIS.testar_personalizada, api_id, SAIDA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/apis/{api_id}/usar-no-inversor")
def ativar_api_no_inversor_principal(api_id: str) -> dict[str, Any]:
    try:
        return CENTRAL_APIS.usar_como_inversor_principal(api_id, SAIDA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/api/apis/{api_id}")
def alterar_estado_api(api_id: str, req: RequisicaoAlternarApi) -> dict[str, Any]:
    try:
        return CENTRAL_APIS.alternar_ativa(api_id, req.ativa, SAIDA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/apis/{api_id}")
def excluir_api_personalizada(api_id: str) -> dict[str, Any]:
    return CENTRAL_APIS.remover_personalizada(api_id, SAIDA_DIR)


@app.post("/api/tempo-real/sincronizar-api")
async def sincronizar_api_inversor_tempo_real() -> dict[str, Any]:
    """Consulta ao vivo a API do inversor configurada na usina e registra a leitura no Tempo Real."""
    _garantir_artefatos_iniciais()
    try:
        leitura = await run_in_threadpool(CENTRAL_APIS.ler_inversor_configurado, SAIDA_DIR)
        estado = await run_in_threadpool(
            TEMPO_REAL.registrar_leitura_real,
            leitura["potencia_kw"],
            SAIDA_DIR,
            None,
            leitura["origem"],
        )
        return {"leitura_api": leitura, "estado_tempo_real": estado}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/tempo-real/agora")
async def obter_energia_tempo_real() -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    return await run_in_threadpool(TEMPO_REAL.estado_agora, SAIDA_DIR)


@app.get("/api/resumo-dia")
async def obter_resumo_horarios_do_dia(
    data: str | None = Query(default=None, description="Data no formato AAAA-MM-DD"),
) -> dict[str, Any]:
    """Retorna as 24 horas (00:00 às 23:00) de qualquer dia escolhido no filtro de data do dashboard."""
    _garantir_artefatos_iniciais()

    def _calcular_dia() -> dict[str, Any]:
        cfg = carregar_config_ativa(SAIDA_DIR)
        tarifa = float(cfg.get("tarifa_energia_rs", 0.92))
        hoje = pd.Timestamp.now(tz="America/Recife").tz_localize(None).normalize()
        try:
            dt = pd.Timestamp(data).normalize() if data else hoje
            if pd.isna(dt):
                dt = hoje
        except Exception:
            dt = hoje

        indice = pd.date_range(dt, periods=24, freq="h")
        if hoje - pd.Timedelta(days=2) <= dt <= hoje + pd.Timedelta(days=2):
            clima, meta_c = obter_clima(
                indice,
                cfg,
                METEO,
                SAIDA_DIR / "ultimo_open_meteo_cache.json",
                _clima_ilustrativo,
                False,
            )
            fonte_clima = meta_c.get("fonte", "Clima em tempo real")
        elif dt < hoje:
            clima, fonte_clima = _buscar_clima_historico_open_meteo(indice, cfg)
        else:
            clima = _clima_ilustrativo(indice, cfg)
            fonte_clima = "Projeção astronômica sazonal para data futura"

        fisica = reference(clima, cfg)

        # Verifica se há lançamentos reais salvos no Diário para essa data
        reais_por_hora: dict[int, float] = {}
        chave_iso = dt.strftime("%Y-%m-%d")
        try:
            with DIARIO_CASA._conectar() as db:
                rows = db.execute(
                    "SELECT data_hora, geracao_real_kwh FROM registros_horarios WHERE data_dia = ?",
                    (chave_iso,),
                ).fetchall()
            for r in rows:
                h_r = pd.Timestamp(r["data_hora"]).hour
                reais_por_hora[h_r] = round(float(r["geracao_real_kwh"]), 3)
        except Exception:
            pass

        horas_lista = []
        for ts in indice:
            h_int = int(ts.hour)
            ref_kwh = round(float(fisica.loc[ts, "referencia_kwh"]), 3)
            # Pequeno refinamento suave diurno quando não há histórico real lançado
            prev_kwh = round(ref_kwh * 1.02, 3) if ref_kwh > 0 else 0.0
            real_kwh = reais_por_hora.get(h_int)
            principal = real_kwh if real_kwh is not None else prev_kwh
            horas_lista.append(
                {
                    "data_hora": ts.strftime("%Y-%m-%d %H:%M"),
                    "hora": f"{h_int:02d}:00",
                    "hora_curta": f"{h_int:02d}h",
                    "hora_int": h_int,
                    "principal_kwh": principal,
                    "referencia_kwh": ref_kwh,
                    "geracao_real_kwh": real_kwh,
                    "principal_rs": round(principal * tarifa, 2),
                    "referencia_rs": round(ref_kwh * tarifa, 2),
                    "poa_wm2": round(float(fisica.loc[ts, "poa_wm2"]), 0),
                    "temperatura_c": round(float(clima.loc[ts, "temperature_2m"]), 1),
                    "nuvens_pct": round(float(clima.loc[ts, "cloud_cover"]), 0),
                }
            )

        return {
            "data": chave_iso,
            "data_br": dt.strftime("%d/%m/%Y"),
            "possui_lancamento_real": bool(reais_por_hora),
            "fonte_clima": fonte_clima,
            "horas": horas_lista,
        }

    return await run_in_threadpool(_calcular_dia)


@app.post("/api/tempo-real/leitura")
async def enviar_leitura_tempo_real(req: RequisicaoLeituraTempoReal) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    try:
        return await run_in_threadpool(
            TEMPO_REAL.registrar_leitura_real,
            req.potencia_kw,
            SAIDA_DIR,
            req.energia_dia_kwh,
            req.origem,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/tempo-real/leituras")
def limpar_leituras_tempo_real() -> dict[str, Any]:
    return TEMPO_REAL.limpar_leituras_hoje(SAIDA_DIR)


@app.get("/api/diario-casa")
def obter_diario_casa(
    data_inicio: str | None = Query(default=None),
    data_fim: str | None = Query(default=None),
    condicao_clima: str = Query(default="todos"),
    apenas_diurno: bool = Query(default=False),
) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    return DIARIO_CASA.consultar(
        SAIDA_DIR,
        data_inicio=data_inicio,
        data_fim=data_fim,
        condicao_clima=condicao_clima,
        apenas_diurno=apenas_diurno,
    )


@app.post("/api/diario-casa/dia")
async def salvar_dia_total_diario(req: RequisicaoDiarioDiaTotal) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    try:
        return await run_in_threadpool(DIARIO_CASA.registrar_dia_total, req.data_dia, req.energia_dia_kwh, SAIDA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/diario-casa/horas")
async def salvar_horas_diario(req: RequisicaoDiarioHoras) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    try:
        return await run_in_threadpool(DIARIO_CASA.registrar_horas_dia, req.data_dia, req.horas_kwh, SAIDA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/diario-casa/dia/{data_dia}")
def excluir_dia_diario(data_dia: str) -> dict[str, Any]:
    try:
        return DIARIO_CASA.remover_dia(data_dia, SAIDA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/diario-casa")
def limpar_diario_completo() -> dict[str, Any]:
    return DIARIO_CASA.limpar_tudo(SAIDA_DIR)


@app.post("/api/importar-inversor")
async def importar_planilha_simples_inversor(
    arquivo: UploadFile = File(...),
    dados_exemplo: bool = Form(False),
    salvar_no_diario: bool = Form(False),
) -> dict[str, Any]:
    """
    Importa planilha simples vinda do inversor ou digitada pelo usuário (`data_hora` e `energia_kwh`),
    une automaticamente o clima da localização da usina e opcionalmente salva no diário permanente da casa.
    """
    _garantir_artefatos_iniciais()
    try:
        conteudo = await arquivo.read()

        def _processar() -> dict[str, Any]:
            res = importar_planilha_inversor_usuario(conteudo, SAIDA_DIR, dados_exemplo)
            if salvar_no_diario:
                linhas = pd.DataFrame(res["serie_comparativa_completa"])
                idx = pd.to_datetime(linhas["data_hora"])
                df_imp = pd.DataFrame(
                    {
                        "energia_kwh": linhas["geracao_real_kwh"].to_numpy(float),
                        **{col: linhas[col].to_numpy(float) for col in METEO},
                    },
                    index=idx,
                )
                DIARIO_CASA.registrar_dataframe_importado(df_imp, res["fonte_meteorologia"], SAIDA_DIR)
            res.pop("serie_comparativa_completa", None)
            return res

        return await run_in_threadpool(_processar)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/modelo-inversor-simples")
def baixar_exemplo_inversor_simples() -> PlainTextResponse:
    """Gera um CSV de 24h no formato simples exportado por inversores comerciais (2 colunas)."""
    cfg = carregar_config_ativa(SAIDA_DIR)
    kwp = cfg["quantidade_placas"] * cfg["potencia_placa_wp"] / 1000.0
    escala = kwp / 5.5
    curva_base = [
        0.0, 0.0, 0.0, 0.0, 0.0, 0.08, 0.58, 1.45, 2.38, 3.12, 3.65, 3.84,
        3.71, 3.28, 2.54, 1.62, 0.64, 0.04, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    ]
    ontem = (pd.Timestamp.now(tz="America/Recife").tz_localize(None).normalize() - pd.Timedelta(days=1))
    linhas = ["data_hora;energia_kwh"]
    for h_idx, val_b in enumerate(curva_base, start=1):
        ts = ontem + pd.Timedelta(hours=h_idx)
        val = min(round(val_b * escala, 3), cfg["inversor_kw"])
        linhas.append(f"{ts.strftime('%Y-%m-%d %H:%M:%S')};{val:.3f}")

    return PlainTextResponse(
        content="\n".join(linhas) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="EXEMPLO_FICTICIO_24H.csv"'},
    )


# ==============================================================================
# BLOCO 4: ROTAS DE DIAGNÓSTICO, BENCHMARK CIENTÍFICO E LABORATÓRIO FÍSICO
# ==============================================================================

@app.get("/api/health")
def verificar_saude() -> dict[str, Any]:
    return {
        "status": "ok",
        "aplicacao": "Helionta",
        "artifacts_ready": (SAIDA_DIR / "metadados.json").is_file(),
        "training_running": TRAIN_STATE["em_andamento"],
    }


@app.get("/api/status")
def obter_estado_geral() -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    cfg = carregar_config_ativa(SAIDA_DIR)
    cfg_treino = json.loads((SAIDA_DIR / "config_sistema.json").read_text(encoding="utf-8"))
    meta = json.loads((SAIDA_DIR / "metadados.json").read_text(encoding="utf-8"))
    metricas = pd.read_csv(SAIDA_DIR / "metricas.csv")
    validacao = pd.read_csv(SAIDA_DIR / "validacao.csv")
    dados = pd.read_csv(SAIDA_DIR / "dados_entrada.csv", parse_dates=["data_hora"])

    ranking_df = validacao.groupby("modelo", as_index=False)["MAE_val_kWh"].mean().sort_values("MAE_val_kWh")
    ranking_val = [
        {"posicao": idx + 1, "modelo": row["modelo"], "MAE_val_kWh": round(float(row["MAE_val_kWh"]), 6)}
        for idx, (_, row) in enumerate(ranking_df.iterrows())
    ]

    validacao_sementes = [
        {
            "modelo": r["modelo"],
            "seed": str(r["seed"]),
            "MAE_val_kWh": round(float(r["MAE_val_kWh"]), 6),
            "epoca": str(r["epoca"]),
        }
        for _, r in validacao.iterrows()
    ]

    cols = ["MAE_kWh", "RMSE_kWh", "R2", "WAPE_pct", "P95_erro_kWh", "Erro_max_kWh", "Bias_kWh"]
    resumo_df = (
        metricas[metricas.recorte == "total"]
        .groupby("modelo", as_index=False)[cols]
        .mean()
        .sort_values("MAE_kWh")
    )
    resumo_teste = [
        {
            "modelo": r["modelo"],
            **{c: _limpar_float(r[c]) for c in cols},
        }
        for _, r in resumo_df.iterrows()
    ]

    pivot_mae = metricas.pivot_table(index="modelo", columns="recorte", values="MAE_kWh", aggfunc="mean")
    pivot_n = metricas.pivot_table(index="modelo", columns="recorte", values="n", aggfunc="first")
    recortes_ordem = ["total", "dia", "noite", "nublado_previsto", "chuva_prevista"]
    recortes_matriz = []
    for modelo in resumo_df["modelo"]:
        item: dict[str, Any] = {"modelo": modelo}
        for rec in recortes_ordem:
            item[rec] = _limpar_float(pivot_mae.loc[modelo, rec]) if rec in pivot_mae.columns else None
        recortes_matriz.append(item)

    amostras_recorte = {
        rec: int(pivot_n[rec].dropna().iloc[0]) if rec in pivot_n.columns and not pivot_n[rec].dropna().empty else 0
        for rec in recortes_ordem
    }

    kwp = cfg["quantidade_placas"] * cfg["potencia_placa_wp"] / 1000
    kwp_treino = cfg_treino["quantidade_placas"] * cfg_treino["potencia_placa_wp"] / 1000
    return {
        "config": cfg,
        "config_treino": cfg_treino,
        "usina_personalizada_pendente_treino": round(kwp, 3) != round(kwp_treino, 3)
        or (round(cfg["latitude"], 3), round(cfg["longitude"], 3)) != (round(cfg_treino["latitude"], 3), round(cfg_treino["longitude"], 3)),
        "potencia_dc_kwp": round(kwp, 3),
        "overload_dc_ac_pct": round(100 * kwp / cfg["inversor_kw"], 1),
        "metadados": meta,
        "total_registros": int(len(dados)),
        "periodo_dados": {
            "inicio": str(dados["data_hora"].iloc[0]),
            "fim": str(dados["data_hora"].iloc[-1]),
        },
        "csv_usuario_disponivel": UPLOADED_CSV_PATH.is_file(),
        "ranking_validacao": ranking_val,
        "validacao_por_semente": validacao_sementes,
        "resumo_teste": resumo_teste,
        "recortes_mae": recortes_matriz,
        "amostras_por_recorte": amostras_recorte,
        "colunas_meteo": METEO,
    }


@app.get("/api/test-days")
def obter_dias_teste(
    date: str | None = Query(default=None),
    seed: str = Query(default="42"),
) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    previsoes = pd.read_csv(SAIDA_DIR / "previsoes.csv", parse_dates=["data_hora"]).set_index("data_hora")
    dados = pd.read_csv(SAIDA_DIR / "dados_entrada.csv", parse_dates=["data_hora"]).set_index("data_hora")
    ph = pd.read_csv(SAIDA_DIR / "calculo_fisico.csv", parse_dates=["data_hora"]).set_index("data_hora")
    meta = json.loads((SAIDA_DIR / "metadados.json").read_text(encoding="utf-8"))
    seeds_disp = [str(s) for s in meta.get("seeds", DEFAULT_SEEDS)]

    grouped = previsoes.groupby(previsoes.index.normalize())
    dias_lista = []
    full_dates: list[pd.Timestamp] = []

    for dt, grp in grouped:
        if len(grp) == 24:
            full_dates.append(dt)
            d_sub = dados.loc[grp.index]
            dias_lista.append(
                {
                    "data": dt.strftime("%Y-%m-%d"),
                    "rotulo": dt.strftime("%d/%m/%Y"),
                    "energia_alvo_dia_kwh": round(float(grp["alvo_kwh"].sum()), 2),
                    "nuvens_media_pct": round(float(d_sub["cloud_cover"].mean()), 0),
                    "chuva_total_mm": round(float(d_sub["precipitation"].sum()), 2),
                    "ghi_pico_wm2": round(float(d_sub["shortwave_radiation"].max()), 0),
                }
            )

    if not full_dates:
        raise HTTPException(status_code=404, detail="Nenhum dia completo (24h) encontrado no conjunto de teste.")

    chosen_dt = pd.Timestamp(date) if date else full_dates[0]
    if chosen_dt not in full_dates:
        chosen_dt = full_dates[0]

    dia_prev = previsoes.loc[chosen_dt : chosen_dt + pd.Timedelta(hours=23)]
    dia_dados = dados.loc[dia_prev.index]
    dia_ph = ph.loc[dia_prev.index]

    def _valor_modelo(row: pd.Series, model_name: str) -> float:
        if model_name in ("Referencia_fisica", "Persistencia_1h", "Persistencia_24h"):
            return float(row[f"{model_name}_-"])
        if seed == "media":
            vals = [float(row[f"{model_name}_{s}"]) for s in seeds_disp if f"{model_name}_{s}" in row]
            return float(np.mean(vals))
        use_s = seed if f"{model_name}_{seed}" in row else seeds_disp[0]
        return float(row[f"{model_name}_{use_s}"])

    serie_24h = []
    for ts, row_p in dia_prev.iterrows():
        row_d = dia_dados.loc[ts]
        row_f = dia_ph.loc[ts]
        serie_24h.append(
            {
                "data_hora": ts.strftime("%Y-%m-%d %H:%M"),
                "hora": ts.strftime("%Hh"),
                "alvo_kwh": round(float(row_p["alvo_kwh"]), 3),
                "LSTM_residual_fisico": round(_valor_modelo(row_p, "LSTM_residual_fisico"), 3),
                "LSTM_Huber": round(_valor_modelo(row_p, "LSTM_Huber"), 3),
                "RandomForest": round(_valor_modelo(row_p, "RandomForest"), 3),
                "RNN": round(_valor_modelo(row_p, "RNN"), 3),
                "Referencia_fisica": round(_valor_modelo(row_p, "Referencia_fisica"), 3),
                "Persistencia_1h": round(_valor_modelo(row_p, "Persistencia_1h"), 3),
                "Persistencia_24h": round(_valor_modelo(row_p, "Persistencia_24h"), 3),
                "ghi_wm2": round(float(row_d["shortwave_radiation"]), 1),
                "poa_wm2": round(float(row_f["poa_wm2"]), 1),
                "temp_celula_c": round(float(row_f["temp_celula_c"]), 1),
                "cloud_cover_pct": round(float(row_d["cloud_cover"]), 0),
                "precipitation_mm": round(float(row_d["precipitation"]), 2),
            }
        )

    alvo_arr = np.array([h["alvo_kwh"] for h in serie_24h])
    mae_dia = {}
    totais_dia = {"alvo_kwh": round(float(alvo_arr.sum()), 3)}
    for m in ["LSTM_Huber", "LSTM_residual_fisico", "RandomForest", "RNN", "Referencia_fisica", "Persistencia_1h", "Persistencia_24h"]:
        m_arr = np.array([h[m] for h in serie_24h])
        mae_dia[m] = round(float(np.abs(alvo_arr - m_arr).mean()), 4)
        totais_dia[m] = round(float(m_arr.sum()), 3)

    return {
        "data_selecionada": chosen_dt.strftime("%Y-%m-%d"),
        "rotulo_data": chosen_dt.strftime("%d/%m/%Y"),
        "seed_selecionada": seed,
        "seeds_disponiveis": seeds_disp,
        "dias_disponiveis": dias_lista,
        "mae_do_dia": mae_dia,
        "energia_total_dia_kwh": totais_dia,
        "serie_24h": serie_24h,
    }


@app.get("/api/physics/checks")
def obter_testes_fisicos() -> dict[str, Any]:
    try:
        return run_physics_checks()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/physics/simulate")
def executar_simulacao_fisica(req: RequisicaoSimulacaoFisica) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    try:
        payload = req.model_dump(exclude={"data"})
        return simulate_custom_physics(SAIDA_DIR, payload, req.data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/inference-1h")
def obter_inferencia_1h(
    timestamp: str | None = Query(default=None),
    seed: int | None = Query(default=None),
) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    try:
        return inspect_single_hour_inference(SAIDA_DIR, timestamp, seed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ==============================================================================
# BLOCO 5: PREVISÃO OPERACIONAL 24H, UPLOAD COMPLETO E TREINAMENTO EM BACKGROUND
# ==============================================================================

@app.post("/api/forecast/live")
async def executar_previsao_tempo_real(
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    horas: int = Form(24),
    forcar_offline: bool = Form(False),
    inclinacao_graus: float | None = Form(None),
    azimute_graus: float | None = Form(None),
    quantidade_placas: int | None = Form(None),
    inversor_kw: float | None = Form(None),
    csv_geracao: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    _garantir_artefatos_iniciais()
    try:
        csv_bytes = await csv_geracao.read() if csv_geracao is not None else None
        overrides: dict[str, Any] = {}
        if inclinacao_graus is not None:
            overrides["inclinacao_graus"] = inclinacao_graus
        if azimute_graus is not None:
            overrides["azimute_graus"] = azimute_graus
        if quantidade_placas is not None:
            overrides["quantidade_placas"] = quantidade_placas
        if inversor_kw is not None:
            overrides["inversor_kw"] = inversor_kw

        return await run_in_threadpool(previsao_operacional,
            latitude=latitude,
            longitude=longitude,
            pasta=SAIDA_DIR,
            horas=horas,
            csv_geracao_bytes=csv_bytes,
            forcar_offline=forcar_offline,
            custom_cfg=overrides if overrides else None,
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha na previsão operacional: {exc}") from exc


@app.post("/api/upload-csv")
async def enviar_csv_medido(arquivo: UploadFile = File(...)) -> dict[str, Any]:
    try:
        raw = await arquivo.read()
        df = ler_csv_bytes(raw)
        df.to_csv(UPLOADED_CSV_PATH, index_label="data_hora")
        valid_rows = int(df.dropna().shape[0])
        return {
            "mensagem": "CSV validado e armazenado com sucesso para treinamento.",
            "nome_arquivo": arquivo.filename,
            "total_horas_grade": int(len(df)),
            "horas_completas_sem_nan": valid_rows,
            "inicio": str(df.index[0]),
            "fim": str(df.index[-1]),
            "energia_media_kwh": round(float(df["energia_kwh"].mean()), 4),
            "energia_max_kwh": round(float(df["energia_kwh"].max()), 4),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"CSV inválido segundo as regras da V3: {exc}") from exc


@app.get("/api/template-csv")
def baixar_modelo_csv() -> PlainTextResponse:
    header = ",".join(["data_hora", "energia_kwh"] + METEO)
    exemplo_1 = "2025-01-01 01:00:00,0.000,0.0,0.0,0.0,26.4,42,0.0,10.5,72"
    exemplo_2 = "2025-01-01 12:00:00,3.820,895.0,680.0,235.0,30.8,35,0.0,14.2,54"
    csv_text = f"{header}\n{exemplo_1}\n{exemplo_2}\n"
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="MODELO_CSV_REAL.csv"'},
    )


@app.get("/api/modelo-ultimas-24h")
def baixar_exemplo_ultimas_24h() -> PlainTextResponse:
    """Gera um CSV fictício cobrindo exatamente as últimas 24h encerradas (UTC-3) para teste em Visão Geral."""
    cfg = carregar_config_ativa(SAIDA_DIR)
    ultima = pd.Timestamp.now(tz="America/Recife").tz_localize(None).floor("h")
    indice = pd.date_range(ultima - pd.Timedelta(hours=23), periods=24, freq="h")
    clima_ilust = _clima_ilustrativo(indice, cfg)
    fis = reference(clima_ilust, cfg)
    linhas = ["data_hora;energia_kwh"]
    for ts in indice:
        val = min(round(float(fis.loc[ts, "referencia_kwh"]) * 0.95, 3), cfg["inversor_kw"])
        linhas.append(f"{ts.strftime('%Y-%m-%d %H:%M:%S')};{val:.3f}")
    return PlainTextResponse(
        content="\n".join(linhas) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="FICTICIO_ULTIMAS_24H.csv"'},
    )


@app.get("/api/modelo-csv-treino-ficticio")
def baixar_csv_treino_ficticio() -> PlainTextResponse:
    """Gera 30 dias (720h) de dados fictícios completos (10 colunas) no porte da usina ativa para testar o Modo CSV."""
    cfg = carregar_config_ativa(SAIDA_DIR)
    df_sintetico = demo(cfg).iloc[:720].round(3)
    buf = io.StringIO()
    df_sintetico.to_csv(buf, index_label="data_hora")
    return PlainTextResponse(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="FICTICIO_TREINO_30_DIAS.csv"'},
    )


@app.post("/api/train")
def iniciar_treinamento(req: RequisicaoTreinamento) -> dict[str, Any]:
    with TRAIN_LOCK:
        if TRAIN_STATE["em_andamento"]:
            raise HTTPException(status_code=409, detail="Já existe um treinamento em andamento.")
        if not req.seeds or len(set(req.seeds)) != len(req.seeds):
            raise HTTPException(status_code=400, detail="Informe sementes inteiras únicas (ex: [42, 123, 2026]).")

        try:
            cfg = validate_config(req.config)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if req.modo == "csv" and not UPLOADED_CSV_PATH.is_file():
            raise HTTPException(status_code=400, detail="Envie primeiro um arquivo CSV válido antes de treinar no modo CSV.")

        TRAIN_STATE.update(
            em_andamento=True,
            passo_atual=0,
            total_passos=1 + len(req.seeds) * 4,
            progresso_pct=0.0,
            mensagem="Inicializando pipeline de treinamento V3...",
            erro=None,
        )

    def _trabalhador_treino() -> None:
        try:
            if req.modo == "demo":
                dados = demo(cfg)
                modo_label = "previsao_ficticia"
                smoke = True
            else:
                dados = ler_csv_bytes(UPLOADED_CSV_PATH.read_bytes())
                modo_label = req.modo_clima
                smoke = False

            args = SimpleNamespace(
                cfg=cfg,
                lat=cfg["latitude"],
                lon=cfg["longitude"],
                capacidade_kw=cfg["inversor_kw"],
                epocas=req.epocas,
                seeds=req.seeds,
                smoke=smoke,
                modo=modo_label,
            )

            def _atualizar_progresso(info: dict[str, Any]) -> None:
                TRAIN_STATE.update(info)

            benchmark(dados, args, SAIDA_DIR, progress_cb=_atualizar_progresso)
            TRAIN_STATE.update(
                em_andamento=False,
                progresso_pct=100.0,
                mensagem="Benchmark concluído e artefatos salvos com sucesso!",
                ultima_conclusao=pd.Timestamp.now().strftime("%H:%M:%S"),
            )
        except Exception as exc:
            TRAIN_STATE.update(
                em_andamento=False,
                erro=str(exc),
                mensagem=f"Erro durante o treinamento: {exc}",
            )

    threading.Thread(target=_trabalhador_treino, daemon=True).start()
    return {"status": "iniciado", "estado": TRAIN_STATE}


@app.get("/api/train/status")
def consultar_progresso_treino() -> dict[str, Any]:
    return TRAIN_STATE


@app.get("/api/export-zip")
def exportar_pacote_resultados() -> FileResponse:
    _garantir_artefatos_iniciais()
    zip_path = export_results_zip(SAIDA_DIR)
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename="resultados_v3_notebook.zip",
    )


class RequisicaoSimulador(BaseModel):
    modo: Literal["acelerado", "tempo_real"] = "acelerado"
    cenario: Literal["sol", "nublado", "chuva"] = "sol"
    nova_sessao: bool = False


@app.get("/api/monitoramento/status")
def estado_monitoramento(sessao_id: str | None = Query(default=None, max_length=64)):
    try:
        return MONITORAMENTO.estado(sessao_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/monitoramento/iniciar")
def iniciar_simulador(req: RequisicaoSimulador):
    cfg = carregar_config_ativa(SAIDA_DIR)
    try:
        return MONITORAMENTO.iniciar(cfg, req.modo, req.cenario, req.nova_sessao)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/monitoramento/pausar")
def pausar_simulador():
    return MONITORAMENTO.pausar()


@app.get("/api/monitoramento/exportar")
def exportar_leituras_simuladas(sessao_id: str | None = Query(default=None, max_length=64)):
    try:
        dados = MONITORAMENTO.estado(sessao_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    arquivo = io.StringIO()
    writer = csv.writer(arquivo, delimiter=";")
    writer.writerow(["data_hora", "energia_kwh", "fonte", "qualidade", "cobertura_minutos"])
    for hora in dados["serie_horaria"]:
        writer.writerow([hora["data_hora"], hora["energia_kwh"] if hora["energia_kwh"] is not None else "",
                         "SIMULADOR_FICTICIO", hora["situacao"], hora["cobertura_minutos"]])
    return PlainTextResponse(arquivo.getvalue(), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="HELIONTA_SIMULACAO_HORARIA.csv"'})


@app.get("/api/fonte-publica/status")
def estado_fonte_publica():
    return FONTE_PUBLICA.estado()


@app.post("/api/fonte-publica/iniciar")
@app.post("/api/fonte-publica/conectar")
def iniciar_fonte_publica():
    return FONTE_PUBLICA.iniciar()


@app.post("/api/fonte-publica/pausar")
@app.post("/api/fonte-publica/desconectar")
def pausar_fonte_publica():
    return FONTE_PUBLICA.pausar()


@app.get("/api/fonte-publica/exportar")
def exportar_fonte_publica():
    dados = FONTE_PUBLICA.estado()
    arquivo = io.StringIO()
    writer = csv.writer(arquivo, delimiter=";")
    writer.writerow(["data_hora", "energia_kwh", "fonte", "node_id", "source_id", "qualidade", "fuso_origem", "consultado_em"])
    for hora in dados['serie_horaria']:
        writer.writerow([hora['fim'], hora['energia_kwh'] if hora['energia_kwh'] is not None else '',
                         'SOLARNETWORK_PUBLICO_EXTERNO', dados['fonte']['node_id'], dados['fonte']['source_id'],
                         hora['qualidade'], dados['fonte']['fuso_origem'], hora['consultado_em'] or ''])
    return PlainTextResponse(arquivo.getvalue(), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="HELIONTA_FONTE_PUBLICA_SOLARNETWORK.csv"'})


if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
