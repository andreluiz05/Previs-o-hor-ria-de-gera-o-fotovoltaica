"""
================================================================================
PROJETO SOLAR V3 — SCRIPT DE PRÉ-TREINAMENTO E VERIFICAÇÃO DE INTEGRIDADE
================================================================================
Executa previamente o pipeline completo da V3 (40 épocas, 3 sementes) e valida
todas as rotinas científicas para que a interface abra instantaneamente.
================================================================================
"""

import time
from pathlib import Path
from types import SimpleNamespace

from solar_engine import (
    DEFAULT_CONFIG,
    DEFAULT_EPOCHS,
    DEFAULT_SEEDS,
    benchmark,
    demo,
    inspect_single_hour_inference,
    previsao_operacional,
    run_physics_checks,
    simulate_custom_physics,
    validate_config,
)


def executar_preparacao() -> None:
    inicio = time.perf_counter()
    diretorio_base = Path(__file__).resolve().parent
    pasta_saida = diretorio_base / "resultados_v3_notebook"

    # BLOCO 1: Verificação das 7 regras físicas
    print("1/4 Executando suíte de 7 testes físicos...")
    verificacoes = run_physics_checks()
    assert verificacoes["todos_aprovados"], "Falha nos testes físicos!"
    print(f"    OK ({verificacoes['aprovados']}/{verificacoes['total_testes']} aprovados)")

    # BLOCO 2: Treinamento completo do Benchmark V3
    print("2/4 Rodando Benchmark V3 completo (40 épocas, 3 sementes [42, 123, 2026])...")
    cfg = validate_config(DEFAULT_CONFIG)
    dados = demo(cfg)
    argumentos = SimpleNamespace(
        cfg=cfg,
        lat=cfg["latitude"],
        lon=cfg["longitude"],
        capacidade_kw=cfg["inversor_kw"],
        epocas=DEFAULT_EPOCHS,
        seeds=DEFAULT_SEEDS,
        smoke=True,
        modo="previsao_ficticia",
    )
    metadados = benchmark(dados, argumentos, pasta_saida)
    print("    Ranking Validação:", metadados["ranking_validacao"][:4])

    # BLOCO 3: Validação da inferência de 1h e simulador físico
    print("3/4 Validando inferência de 1 hora e simulador físico...")
    inferencia_1h = inspect_single_hour_inference(pasta_saida)
    simulacao = simulate_custom_physics(pasta_saida, {"inversor_kw": 2.5})
    assert simulacao["horas_clipping"] > 0
    print(
        f"    Inferência 1h ({inferencia_1h['instante_alvo']}): "
        f"prev={inferencia_1h['previsao_final_kwh']} kWh vs alvo={inferencia_1h['alvo_real_kwh']} kWh"
    )

    # BLOCO 4: Teste da previsão operacional Open-Meteo / Contingência
    print("4/4 Testando previsão operacional 24h (Open-Meteo / Cache)...")
    operacional = previsao_operacional(cfg["latitude"], cfg["longitude"], pasta_saida, horas=24, forcar_offline=False)
    print(
        f"    Fonte: {operacional['fonte_meteorologia']} | "
        f"Energia 24h: {operacional['energia_total_lstm_kwh']} kWh (Seed {operacional['seed_selecionada']})"
    )

    duracao = time.perf_counter() - inicio
    print(f"Concluído em {duracao:.1f}s! Artefatos prontos em: {pasta_saida}")


if __name__ == "__main__":
    executar_preparacao()
