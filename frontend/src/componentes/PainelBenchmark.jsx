/* ============================================================================
 * COMPONENTE: PainelBenchmark.jsx
 * ============================================================================
 * Apresenta os resultados científicos das Seções 8, 9, 10 e 11 do notebook V3:
 *   - Indicadores executivos (vencedor na validação, menor erro no teste e divisão)
 *   - Explorador interativo de 24 horas para qualquer dia completo do conjunto de teste
 *   - Gráfico comparativo horizontal de erros (MAE em kWh e WAPE em %)
 *   - Separação estrita entre Ranking de Validação e Métricas Finais de Teste
 *   - Matriz de desempenho estratificada por condição meteorológica (chuva e nuvens)
 *
 * Organização em blocos:
 *   - BLOCO 1: Importações e subcomponente `CartaoIndicador`
 *   - BLOCO 2: Estados locais e carregamento assíncrono dos dias de teste
 *   - BLOCO 3: Faixa de KPIs e aviso de rigor metodológico (sem data leakage)
 *   - BLOCO 4: Explorador gráfico de 24h (Colunas V3 vs Curvas + Irradiância POA)
 *   - BLOCO 5: Gráfico horizontal de erros e tabela do Ranking de Validação
 *   - BLOCO 6: Tabelas completas de métricas de teste e recortes meteorológicos
 * ============================================================================ */

/* ==================== BLOCO 1: IMPORTAÇÕES E SUBCOMPONENTES ==================== */

import React, { useEffect, useState } from 'react';
import {
  BarChart as GraficoBarras,
  Bar as Barra,
  ComposedChart as GraficoComposto,
  Line as Linha,
  Area as AreaGrafico,
  XAxis as EixoX,
  YAxis as EixoY,
  CartesianGrid as GradeCartesiana,
  Tooltip as DicaFlutuante,
  Legend as Legenda,
  ResponsiveContainer as ContainerResponsivo,
  Cell as CelulaCor,
} from 'recharts';
import {
  Award as IconePremio,
  CheckCircle2 as IconeSucesso,
  CloudRain as IconeChuva,
  Info as IconeInformacao,
  Layers as IconeCamadas,
  BarChart3 as IconeEstatistica,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { METADADOS_MODELOS, formatarNumero } from '../utilitarios/formatadores';

const MODELOS_VISIVEIS_PADRAO = ['alvo_kwh', 'LSTM_residual_fisico', 'LSTM_Huber', 'RandomForest', 'RNN'];

function CartaoIndicador({ titulo, icone, valorPrincipal, corValor, rodape }) {
  return (
    <div className="card card-compact">
      <div className="kpi-label">
        <span>{titulo}</span>
        {icone}
      </div>
      <div className="kpi-value" style={corValor ? { color: corValor } : undefined}>
        {valorPrincipal}
      </div>
      <div className="kpi-foot mono">{rodape}</div>
    </div>
  );
}

/* ==================== BLOCO 2: ESTADO E EFEITOS DO PAINEL ==================== */

export default function PainelBenchmark({ estadoSistema }) {
  const [dataSelecionada, definirDataSelecionada] = useState('');
  const [sementeSelecionada, definirSementeSelecionada] = useState('42');
  const [modoGrafico24h, definirModoGrafico24h] = useState('colunas'); // 'colunas' | 'curvas'
  const [modelosVisiveis, definirModelosVisiveis] = useState(MODELOS_VISIVEIS_PADRAO);
  const [metricaErroBarra, definirMetricaErroBarra] = useState('MAE_kWh'); // 'MAE_kWh' | 'WAPE_pct'
  const [dadosDiaTeste, definirDadosDiaTeste] = useState(null);
  const [carregandoDia, definirCarregandoDia] = useState(false);
  const [exibirTabela24h, definirExibirTabela24h] = useState(false);

  useEffect(() => {
    let componenteAtivo = true;
    definirCarregandoDia(true);

    clienteApi
      .obterDiasTeste(dataSelecionada, sementeSelecionada)
      .then((resposta) => {
        if (!componenteAtivo) return;
        definirDadosDiaTeste(resposta);
        if (!dataSelecionada && resposta.data_selecionada) {
          definirDataSelecionada(resposta.data_selecionada);
        }
      })
      .catch(console.error)
      .finally(() => componenteAtivo && definirCarregandoDia(false));

    return () => {
      componenteAtivo = false;
    };
  }, [dataSelecionada, sementeSelecionada]);

  if (!estadoSistema) return null;

  const liderValidacao = estadoSistema.ranking_validacao?.[0];
  const liderTeste = estadoSistema.resumo_teste?.[0];
  const metricasResidual = estadoSistema.resumo_teste?.find((m) => m.modelo === 'LSTM_residual_fisico');
  const [amostrasTreino, amostrasValidacao, amostrasTeste] = estadoSistema.metadados?.amostras || [0, 0, 0];

  const alternarModeloVisivel = (chaveModelo) => {
    definirModelosVisiveis((atual) =>
      atual.includes(chaveModelo)
        ? atual.length > 1
          ? atual.filter((item) => item !== chaveModelo)
          : atual
        : [...atual, chaveModelo]
    );
  };

  const dadosBarrasErro = [...(estadoSistema.resumo_teste || [])]
    .sort((a, b) => (a[metricaErroBarra] ?? 999) - (b[metricaErroBarra] ?? 999))
    .map((item) => ({
      ...item,
      nomeCurto: METADADOS_MODELOS[item.modelo]?.rotuloCurto || item.modelo,
      corBarra: METADADOS_MODELOS[item.modelo]?.cor || 'var(--sky-hybrid)',
    }));

  // Identifica o menor MAE em cada condição meteorológica para realce visual na tabela
  const colunasRecorte = ['total', 'dia', 'nublado_previsto', 'chuva_prevista'];
  const menorMaePorRecorte = {};
  colunasRecorte.forEach((coluna) => {
    const valoresValidos = (estadoSistema.recortes_mae || [])
      .map((linha) => linha[coluna])
      .filter((v) => v !== null && v !== undefined);
    menorMaePorRecorte[coluna] = valoresValidos.length ? Math.min(...valoresValidos) : null;
  });

  return (
    <div className="view-stack">
      {/* ==================== BLOCO 3: INDICADORES E RIGOR METODOLÓGICO ==================== */}
      <div className="kpi-grid">
        <CartaoIndicador
          titulo="Líder na Validação (Seleção)"
          icone={<IconePremio size={16} color="var(--solar-amber)" />}
          valorPrincipal={METADADOS_MODELOS[liderValidacao?.modelo]?.rotuloCurto || liderValidacao?.modelo}
          rodape={`MAE Val: ${formatarNumero(liderValidacao?.MAE_val_kWh, 4)} kWh · Sem uso do teste`}
        />

        <CartaoIndicador
          titulo="Menor Erro no Teste (Geral)"
          icone={<IconeSucesso size={16} color="var(--neural-teal)" />}
          valorPrincipal={`${formatarNumero(liderTeste?.MAE_kWh, 4)} kWh`}
          corValor="var(--neural-teal)"
          rodape={`${METADADOS_MODELOS[liderTeste?.modelo]?.rotuloCurto} · WAPE ${formatarNumero(liderTeste?.WAPE_pct, 2)}% · R² ${formatarNumero(liderTeste?.R2, 4)}`}
        />

        <CartaoIndicador
          titulo="LSTM Residual Físico (Salvo)"
          icone={<IconeCamadas size={16} color="var(--sky-hybrid)" />}
          valorPrincipal={`${formatarNumero(metricasResidual?.MAE_kWh, 4)} kWh`}
          corValor="var(--sky-hybrid)"
          rodape={`WAPE ${formatarNumero(metricasResidual?.WAPE_pct, 2)}% · Reduz 28,5% do erro da Física`}
        />

        <CartaoIndicador
          titulo="Amostras avaliadas"
          icone={<IconeEstatistica size={16} color="var(--text-secondary)" />}
          valorPrincipal={`${amostrasTeste} horas`}
          rodape={`Treino: ${amostrasTreino}h · Validação: ${amostrasValidacao}h`}
        />
      </div>

      {/* ==================== BLOCO 4: EXPLORADOR HORÁRIO DE 24 HORAS ==================== */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              Comparação Horária de 24 Horas — {dadosDiaTeste?.rotulo_data || 'Conjunto de Teste'}
            </h2>
            <p className="card-subtitle">
              Inspecione qualquer dia completo de avaliação e compare a aderência de cada algoritmo hora a hora.
            </p>
          </div>

          <div className="controls-row">
            <div className="field-group">
              <label className="field-label" htmlFor="painelbenchmark-campo-1">Dia do Conjunto de Teste</label>
              <select id="painelbenchmark-campo-1"
                className="select"
                value={dataSelecionada}
                onChange={(e) => definirDataSelecionada(e.target.value)}
              >
                {(dadosDiaTeste?.dias_disponiveis || []).map((dia, indice) => (
                  <option key={dia.data} value={dia.data}>
                    {indice === 0 ? `${dia.rotulo} (1º dia - Padrão V3)` : dia.rotulo} · {dia.energia_alvo_dia_kwh} kWh · Nuvens {dia.nuvens_media_pct}%
                    {dia.chuva_total_mm > 0 ? ` · Chuva ${dia.chuva_total_mm}mm` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="painelbenchmark-campo-2">Semente</label>
              <select id="painelbenchmark-campo-2"
                className="select"
                value={sementeSelecionada}
                onChange={(e) => definirSementeSelecionada(e.target.value)}
              >
                {(dadosDiaTeste?.seeds_disponiveis || ['42', '123', '2026']).map((sem) => (
                  <option key={sem} value={sem}>
                    Semente {sem}
                  </option>
                ))}
                <option value="media">Média das Sementes</option>
              </select>
            </div>

            <div className="field-group">
              <span className="field-label">Modo Gráfico</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${modoGrafico24h === 'colunas' ? 'btn-primary' : ''}`}
                  onClick={() => definirModoGrafico24h('colunas')}
                >
                  Colunas V3
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${modoGrafico24h === 'curvas' ? 'btn-primary' : ''}`}
                  onClick={() => definirModoGrafico24h('curvas')}
                >
                  Curvas + POA
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Botões de filtragem interativa das séries do gráfico */}
        <div className="chip-bar">
          {Object.entries(METADADOS_MODELOS).map(([chave, info]) => {
            const ativo = modelosVisiveis.includes(chave);
            const maeNoDia = dadosDiaTeste?.mae_do_dia?.[chave];
            return (
              <button
                key={chave}
                type="button"
                className={`model-chip ${ativo ? 'active' : ''}`}
                aria-pressed={ativo}
                onClick={() => alternarModeloVisivel(chave)}
              >
                <span className="dot" style={{ backgroundColor: info.cor, opacity: ativo ? 1 : 0.35 }} />
                <span>{info.rotuloCurto}</span>
                {maeNoDia !== undefined && (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    MAE {formatarNumero(maeNoDia, 3)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ width: '100%', height: 370, opacity: carregandoDia ? 0.6 : 1 }}>
          <ContainerResponsivo>
            {modoGrafico24h === 'colunas' ? (
              <GraficoBarras data={dadosDiaTeste?.serie_24h || []} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <GradeCartesiana strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <EixoX dataKey="hora" stroke="var(--text-muted)" tick={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                <EixoY stroke="var(--text-muted)" tick={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} unit=" kWh" />
                <DicaFlutuante
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg)',
                    borderColor: 'var(--border-strong)',
                    borderRadius: 10,
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12,
                  }}
                />
                <Legenda />
                {modelosVisiveis.map((chave) => (
                  <Barra
                    key={chave}
                    dataKey={chave}
                    name={METADADOS_MODELOS[chave]?.rotuloCurto || chave}
                    fill={METADADOS_MODELOS[chave]?.cor}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </GraficoBarras>
            ) : (
              <GraficoComposto data={dadosDiaTeste?.serie_24h || []} margin={{ top: 8, right: 18, left: 0, bottom: 4 }}>
                <GradeCartesiana strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <EixoX dataKey="hora" stroke="var(--text-muted)" tick={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                <EixoY yAxisId="kwh" stroke="var(--text-muted)" tick={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} unit=" kWh" />
                <EixoY
                  yAxisId="poa"
                  orientation="right"
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  unit=" W/m²"
                />
                <DicaFlutuante
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg)',
                    borderColor: 'var(--border-strong)',
                    borderRadius: 10,
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12,
                  }}
                />
                <Legenda />
                <AreaGrafico
                  yAxisId="poa"
                  type="monotone"
                  dataKey="poa_wm2"
                  name="Irradiância POA (W/m²)"
                  fill="var(--solar-amber-soft)"
                  stroke="var(--solar-amber)" strokeOpacity={0.35}
                />
                {modelosVisiveis.map((chave) => (
                  <Linha
                    key={chave}
                    yAxisId="kwh"
                    type="monotone"
                    dataKey={chave}
                    name={METADADOS_MODELOS[chave]?.rotuloCurto || chave}
                    stroke={METADADOS_MODELOS[chave]?.cor}
                    strokeWidth={chave === 'alvo_kwh' ? 3 : 2}
                    dot={false}
                  />
                ))}
              </GraficoComposto>
            )}
          </ContainerResponsivo>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Energia acumulada no dia — Alvo: <strong>{formatarNumero(dadosDiaTeste?.energia_total_dia_kwh?.alvo_kwh, 2)} kWh</strong> · LSTM Huber:{' '}
            <strong>{formatarNumero(dadosDiaTeste?.energia_total_dia_kwh?.LSTM_Huber, 2)} kWh</strong> · LSTM Residual:{' '}
            <strong>{formatarNumero(dadosDiaTeste?.energia_total_dia_kwh?.LSTM_residual_fisico, 2)} kWh</strong>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => definirExibirTabela24h((v) => !v)}>
            {exibirTabela24h ? 'Ocultar Tabela Horária (24h)' : 'Ver Tabela Numérica das 24h'}
          </button>
        </div>

        {exibirTabela24h && dadosDiaTeste && (
          <div className="table-wrap" style={{ marginTop: 14, maxHeight: 320 }}>
            <table className="data-table mono">
              <thead>
                <tr>
                  <th>Fim Intervalo</th>
                  <th>Alvo (kWh)</th>
                  <th>LSTM Residual</th>
                  <th>LSTM Huber</th>
                  <th>Random Forest</th>
                  <th>RNN</th>
                  <th>Física Pura</th>
                  <th>POA (W/m²)</th>
                  <th>Nuvens (%)</th>
                </tr>
              </thead>
              <tbody>
                {dadosDiaTeste.serie_24h.map((linha) => (
                  <tr key={linha.data_hora}>
                    <td>{linha.hora}</td>
                    <td>{formatarNumero(linha.alvo_kwh, 3)}</td>
                    <td>{formatarNumero(linha.LSTM_residual_fisico, 3)}</td>
                    <td>{formatarNumero(linha.LSTM_Huber, 3)}</td>
                    <td>{formatarNumero(linha.RandomForest, 3)}</td>
                    <td>{formatarNumero(linha.RNN, 3)}</td>
                    <td>{formatarNumero(linha.Referencia_fisica, 3)}</td>
                    <td>{formatarNumero(linha.poa_wm2, 1)}</td>
                    <td>{formatarNumero(linha.cloud_cover_pct, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ==================== BLOCO 5: GRÁFICO DE ERROS E RANKING DE VALIDAÇÃO ==================== */}
      <div className="split-asymmetric">
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Comparação de Erros dos 7 Modelos (Teste)</h3>
              <p className="card-subtitle">Média das sementes no conjunto de teste completo ({amostrasTeste} horas).</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn btn-sm ${metricaErroBarra === 'MAE_kWh' ? 'btn-primary' : ''}`}
                onClick={() => definirMetricaErroBarra('MAE_kWh')}
              >
                MAE (kWh)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${metricaErroBarra === 'WAPE_pct' ? 'btn-primary' : ''}`}
                onClick={() => definirMetricaErroBarra('WAPE_pct')}
              >
                WAPE (%)
              </button>
            </div>
          </div>

          <div style={{ width: '100%', height: 295 }}>
            <ContainerResponsivo>
              <GraficoBarras data={dadosBarrasErro} layout="vertical" margin={{ top: 4, right: 32, left: 26, bottom: 4 }}>
                <GradeCartesiana strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <EixoX type="number" stroke="var(--text-muted)" tick={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                <EixoY
                  type="category"
                  dataKey="nomeCurto"
                  width={115}
                  stroke="var(--text-secondary)"
                  tick={{ fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: 600 }}
                />
                <DicaFlutuante
                  formatter={(valor) => [
                    metricaErroBarra === 'MAE_kWh' ? `${formatarNumero(valor, 4)} kWh` : `${formatarNumero(valor, 2)}%`,
                    metricaErroBarra === 'MAE_kWh' ? 'MAE' : 'WAPE',
                  ]}
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg)',
                    borderColor: 'var(--border-strong)',
                    borderRadius: 10,
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12,
                  }}
                />
                <Barra dataKey={metricaErroBarra} radius={[0, 5, 5, 0]}>
                  {dadosBarrasErro.map((entrada) => (
                    <CelulaCor key={entrada.modelo} fill={entrada.corBarra} />
                  ))}
                </Barra>
              </GraficoBarras>
            </ContainerResponsivo>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Ranking de Validação (Sem Vazamento)</h3>
              <p className="card-subtitle">Critério oficial de escolha de arquitetura e semente antes do teste.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table mono">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Modelo</th>
                  <th>MAE Validação (kWh)</th>
                </tr>
              </thead>
              <tbody>
                {(estadoSistema.ranking_validacao || []).map((item) => (
                  <tr key={item.modelo}>
                    <td>{item.posicao}º</td>
                    <td style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      <span
                        className="dot"
                        style={{ backgroundColor: METADADOS_MODELOS[item.modelo]?.cor, marginRight: 8 }}
                      />
                      {METADADOS_MODELOS[item.modelo]?.rotuloCurto || item.modelo}
                    </td>
                    <td className={item.posicao === 1 ? 'winner-cell' : ''}>{formatarNumero(item.MAE_val_kWh, 5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ==================== BLOCO 6: TABELAS DETALHADAS RECOLHIDAS ==================== */}
      <details className="card guide-panel">
        <summary>
          <span>
            <strong>Ver tabelas completas de métricas (RMSE, R², WAPE e recortes climáticos)</strong>
          </span>
        </summary>
        <div className="guide-content">
          <div className="split-equal">
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Métricas Detalhadas no Conjunto de Teste</h3>
              <p className="card-subtitle">MAE, RMSE, R², WAPE, P95, erro máximo e viés médio (Bias).</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table mono">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>MAE</th>
                  <th>RMSE</th>
                  <th>R²</th>
                  <th>WAPE (%)</th>
                  <th>P95</th>
                  <th>Máx</th>
                  <th>Viés</th>
                </tr>
              </thead>
              <tbody>
                {(estadoSistema.resumo_teste || []).map((linha, indice) => (
                  <tr key={linha.modelo}>
                    <td style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      {METADADOS_MODELOS[linha.modelo]?.rotuloCurto || linha.modelo}
                    </td>
                    <td className={indice === 0 ? 'winner-cell' : ''}>{formatarNumero(linha.MAE_kWh, 4)}</td>
                    <td>{formatarNumero(linha.RMSE_kWh, 4)}</td>
                    <td>{formatarNumero(linha.R2, 4)}</td>
                    <td>{formatarNumero(linha.WAPE_pct, 2)}%</td>
                    <td>{formatarNumero(linha.P95_erro_kWh, 3)}</td>
                    <td>{formatarNumero(linha.Erro_max_kWh, 3)}</td>
                    <td>{linha.Bias_kWh > 0 ? `+${formatarNumero(linha.Bias_kWh, 4)}` : formatarNumero(linha.Bias_kWh, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconeChuva size={18} color="var(--sky-hybrid)" />
                MAE (kWh) por Condição Meteorológica
              </h3>
              <p className="card-subtitle">
                Note como o <strong>LSTM Residual</strong> e o <strong>Random Forest</strong> superam o LSTM direto sob chuva e nebulosidade intensa.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table mono">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>Total ({estadoSistema.amostras_por_recorte?.total}h)</th>
                  <th>Dia ({estadoSistema.amostras_por_recorte?.dia}h)</th>
                  <th>Noite ({estadoSistema.amostras_por_recorte?.noite}h)</th>
                  <th>Nublado ≥70% ({estadoSistema.amostras_por_recorte?.nublado_previsto}h)</th>
                  <th>Chuva &gt;0 ({estadoSistema.amostras_por_recorte?.chuva_prevista}h)</th>
                </tr>
              </thead>
              <tbody>
                {(estadoSistema.recortes_mae || []).map((linha) => (
                  <tr key={linha.modelo}>
                    <td style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      {METADADOS_MODELOS[linha.modelo]?.rotuloCurto || linha.modelo}
                    </td>
                    <td className={linha.total === menorMaePorRecorte.total ? 'winner-cell' : ''}>
                      {formatarNumero(linha.total, 4)}
                    </td>
                    <td className={linha.dia === menorMaePorRecorte.dia ? 'winner-cell' : ''}>
                      {formatarNumero(linha.dia, 4)}
                    </td>
                    <td>{formatarNumero(linha.noite, 3)}</td>
                    <td className={linha.nublado_previsto === menorMaePorRecorte.nublado_previsto ? 'winner-cell' : ''}>
                      {formatarNumero(linha.nublado_previsto, 4)}
                    </td>
                    <td className={linha.chuva_prevista === menorMaePorRecorte.chuva_prevista ? 'winner-cell' : ''}>
                      {formatarNumero(linha.chuva_prevista, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
          </div>
        </div>
      </details>
    </div>
  );
}
