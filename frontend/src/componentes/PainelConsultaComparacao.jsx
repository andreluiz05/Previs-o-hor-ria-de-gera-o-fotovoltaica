import React, { useEffect, useState } from 'react';
import {
  BarChart as GraficoBarras,
  Bar as Barra,
  XAxis as EixoX,
  YAxis as EixoY,
  CartesianGrid as GradeCartesiana,
  Tooltip as DicaFlutuante,
  Legend as Legenda,
  ResponsiveContainer as ContainerResponsivo,
} from 'recharts';
import {
  Sun as IconeSol,
  Clock3 as IconeRelogio,
  FileSpreadsheet as IconePlanilha,
  Upload as IconeUpload,
  Download as IconeDownload,
  CheckCircle2 as IconeOk,
  AlertTriangle as IconeAlerta,
  ShieldAlert as IconeCritico,
  Info as IconeInfo,
  Trash2 as IconeExcluir,
  Save as IconeSalvar,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';
import { BarraProximoPasso } from './TrilhaGuiada';

const HORAS_DIURNAS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const CURVA_BASE_5K5 = {
  6: 0.08, 7: 0.58, 8: 1.45, 9: 2.38, 10: 3.12, 11: 3.65, 12: 3.84,
  13: 3.71, 14: 3.28, 15: 2.54, 16: 1.62, 17: 0.64, 18: 0.04,
};

function obterOntemIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - 86400000));
}

function calcularTotalTipico(estadoSistema) {
  const cfg = estadoSistema?.config || {};
  const kwp = ((cfg.quantidade_placas ?? 10) * (cfg.potencia_placa_wp ?? 550)) / 1000;
  return Number((kwp * 4.8).toFixed(1));
}

function gerarCurvaHoraria(estadoSistema, tipo = 'normal') {
  const cfg = estadoSistema?.config || {};
  const kwp = ((cfg.quantidade_placas ?? 10) * (cfg.potencia_placa_wp ?? 550)) / 1000;
  const invKw = cfg.inversor_kw ?? 5.0;
  const escala = kwp / 5.5;
  const mapa = {};
  HORAS_DIURNAS.forEach((h) => {
    if (tipo === 'zerado') { mapa[h] = 0; return; }
    let fator = 1.0;
    if (tipo === 'sujeira') fator = 0.76;
    if (tipo === 'sombra_tarde' && h >= 14 && h <= 16) fator = 0.35;
    if (tipo === 'falha_eletrica' && h >= 11 && h <= 14) fator = 0.0;
    mapa[h] = Number(Math.min(CURVA_BASE_5K5[h] * escala * fator, invKw).toFixed(2));
  });
  return mapa;
}

export default function PainelConsultaComparacao({ estadoSistema, aoIrParaAba }) {
  const [modoLancamento, definirModoLancamento] = useState('dia');
  const [dataLancamento, definirDataLancamento] = useState(obterOntemIso);
  const [totalDiaInput, definirTotalDiaInput] = useState(() => calcularTotalTipico(estadoSistema));
  const [horasInput, definirHorasInput] = useState(() => gerarCurvaHoraria(estadoSistema, 'normal'));
  const [salvando, definirSalvando] = useState(false);
  const [mensagem, definirMensagem] = useState('');
  const [erro, definirErro] = useState('');
  const [diario, definirDiario] = useState(null);
  const [carregandoInicial, definirCarregandoInicial] = useState(true);

  useEffect(() => {
    definirTotalDiaInput(calcularTotalTipico(estadoSistema));
    definirHorasInput(gerarCurvaHoraria(estadoSistema, 'normal'));
  }, [estadoSistema?.config?.quantidade_placas, estadoSistema?.config?.potencia_placa_wp, estadoSistema?.config?.inversor_kw]);

  useEffect(() => {
    clienteApi
      .obterDiarioCasa()
      .then(definirDiario)
      .catch(() => definirErro('Não foi possível carregar o histórico salvo.'))
      .finally(() => definirCarregandoInicial(false));
  }, []);

  const salvarTotalDoDia = async (e) => {
    e?.preventDefault();
    definirSalvando(true);
    definirErro('');
    definirMensagem('');
    try {
      const resp = await clienteApi.salvarDiaTotalCasa({
        data_dia: dataLancamento,
        energia_dia_kwh: Number(totalDiaInput),
      });
      definirDiario(resp);
      definirMensagem(`Geração de ${dataLancamento.split('-').reverse().join('/')} salva e analisada!`);
    } catch (err) {
      definirErro(err.message || 'Não foi possível salvar o lançamento.');
    } finally {
      definirSalvando(false);
    }
  };

  const salvarHorasDoDia = async () => {
    definirSalvando(true);
    definirErro('');
    definirMensagem('');
    try {
      const mapa = {};
      HORAS_DIURNAS.forEach((h) => { mapa[String(h)] = Math.max(0, Number(horasInput[h] ?? 0) || 0); });
      const resp = await clienteApi.salvarHorasCasa({ data_dia: dataLancamento, horas_kwh: mapa });
      definirDiario(resp);
      definirMensagem(`Horários de ${dataLancamento.split('-').reverse().join('/')} salvos e analisados!`);
    } catch (err) {
      definirErro(err.message || 'Não foi possível salvar os horários.');
    } finally {
      definirSalvando(false);
    }
  };

  const processarCsv = async (evento) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    definirSalvando(true);
    definirErro('');
    definirMensagem('');
    try {
      await clienteApi.importarPlanilhaInversor(arquivo, false, true);
      definirDiario(await clienteApi.obterDiarioCasa());
      definirMensagem('Planilha importada e analisada com sucesso!');
    } catch (err) {
      definirErro(err.message || 'Não foi possível ler a planilha.');
    } finally {
      definirSalvando(false);
      evento.target.value = '';
    }
  };

  const excluirDia = async (dataIso) => {
    try { definirDiario(await clienteApi.removerDiaCasa(dataIso)); }
    catch (err) { definirErro(err.message); }
  };

  const limparTudo = async () => {
    if (!window.confirm('Apagar todos os dias registrados no histórico?')) return;
    try { definirDiario(await clienteApi.limparDiarioCasa()); definirMensagem(''); }
    catch (err) { definirErro(err.message); }
  };

  const exportarCsv = () => {
    if (!diario?.registros_horarios?.length) return;
    const cols = ['data_hora', 'geracao_real_kwh', 'previsao_kwh', 'valor_rs'];
    const linhas = [cols.join(';'), ...diario.registros_horarios.map((r) => cols.map((c) => r[c]).join(';'))];
    const url = URL.createObjectURL(new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historico_helionta.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const baseTipica = calcularTotalTipico(estadoSistema);
  const kpis = diario?.kpis || {};
  const diag = diario?.diagnostico;

  return (
    <div className="view-stack">
      {/* AVISO FIXO E EXPLÍCITO: FERRAMENTA COMPLEMENTAR (NÃO É VERDADE ABSOLUTA) */}
      <div className="test-only-callout" role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <IconeInfo size={18} style={{ color: 'var(--solar-amber)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <div>
          <strong>Importante — Ferramenta complementar (não é 100% exata nem verdade absoluta):</strong>{' '}
          as comparações e alertas desta aba usam estimativas de clima regional por satélite e modelos matemáticos/IA, podendo variar conforme nuvens passageiras sobre o seu telhado, microclima local e rede elétrica. Utilize estes resultados <strong>apenas como apoio complementar</strong> para acompanhar sua energia solar — nunca como substituto do medidor oficial ou da avaliação presencial de um técnico/integrador habilitado.
        </div>
      </div>

      {/* CAIXA 1: REGISTRAR GERAÇÃO (DIÁRIA, HORÁRIA OU CSV) */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 14 }}>
          <h2 className="card-title">Registrar energia gerada</h2>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Modo de registro">
            <button type="button" className={`btn btn-sm ${modoLancamento === 'dia' ? 'btn-primary' : ''}`} onClick={() => definirModoLancamento('dia')}>
              <IconeSol size={14} /> Total do dia
            </button>
            <button type="button" className={`btn btn-sm ${modoLancamento === 'horas' ? 'btn-primary' : ''}`} onClick={() => definirModoLancamento('horas')}>
              <IconeRelogio size={14} /> Hora a hora
            </button>
            <button type="button" className={`btn btn-sm ${modoLancamento === 'csv' ? 'btn-primary' : ''}`} onClick={() => definirModoLancamento('csv')}>
              <IconePlanilha size={14} /> Planilha CSV
            </button>
          </div>
        </div>

        {modoLancamento === 'dia' && (
          <form onSubmit={salvarTotalDoDia} className="controls-row" style={{ alignItems: 'flex-end' }}>
            <div className="field-group">
              <label className="field-label" htmlFor="diario-data">Data</label>
              <input id="diario-data" type="date" className="input" value={dataLancamento} onChange={(e) => definirDataLancamento(e.target.value)} />
            </div>

            <div className="field-group" style={{ width: 170 }}>
              <label className="field-label" htmlFor="diario-kwh">Energia gerada (kWh)</label>
              <input id="diario-kwh" type="number" step="0.1" min="0" className="input mono" value={totalDiaInput} onChange={(e) => definirTotalDiaInput(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 4 }}>
              <button type="button" className="mini-preset" onClick={() => definirTotalDiaInput(baseTipica)}>Normal ({baseTipica})</button>
              <button type="button" className="mini-preset" onClick={() => definirTotalDiaInput(Number((baseTipica * 0.78).toFixed(1)))}>Testar sujeira ({Number((baseTipica * 0.78).toFixed(1))})</button>
              <button type="button" className="mini-preset" onClick={() => definirTotalDiaInput(Number((baseTipica * 0.45).toFixed(1)))}>Testar falha elétrica ({Number((baseTipica * 0.45).toFixed(1))})</button>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={salvando}>
              <IconeSalvar size={15} />
              {salvando ? 'Analisando…' : 'Salvar e diagnosticar'}
            </button>
          </form>
        )}

        {modoLancamento === 'horas' && (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="field-group">
                <label className="field-label" htmlFor="diario-data-h">Data</label>
                <input id="diario-data-h" type="date" className="input" value={dataLancamento} onChange={(e) => definirDataLancamento(e.target.value)} />
              </div>
              <button type="button" className="btn btn-sm" onClick={() => definirHorasInput(gerarCurvaHoraria(estadoSistema, 'normal'))}>Dia normal</button>
              <button type="button" className="btn btn-sm" onClick={() => definirHorasInput(gerarCurvaHoraria(estadoSistema, 'sujeira'))}>Sujeira nas placas</button>
              <button type="button" className="btn btn-sm" onClick={() => definirHorasInput(gerarCurvaHoraria(estadoSistema, 'sombra_tarde'))}>Sombra 14h–16h</button>
              <button type="button" className="btn btn-sm" onClick={() => definirHorasInput(gerarCurvaHoraria(estadoSistema, 'falha_eletrica'))}>Queda elétrica 11h–14h</button>
              <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={salvando} onClick={salvarHorasDoDia}>
                <IconeSalvar size={15} /> {salvando ? 'Analisando…' : 'Salvar e diagnosticar'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
              {HORAS_DIURNAS.map((h) => (
                <div key={h} className="field-group" style={{ gap: 3 }}>
                  <label className="field-label mono" htmlFor={`h-${h}`} style={{ fontSize: 11 }}>{String(h).padStart(2, '0')}h</label>
                  <input id={`h-${h}`} type="number" step="0.1" min="0" className="input mono" style={{ padding: '6px 8px', minHeight: 36 }} value={horasInput[h] ?? 0} onChange={(e) => definirHorasInput((a) => ({ ...a, [h]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
        )}

        {modoLancamento === 'csv' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Envie a planilha exportada do inversor (<span className="mono">data_hora;energia_kwh</span>).</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a className="btn btn-sm" href={clienteApi.urlModeloInversorSimples} download><IconeDownload size={14} /> Baixar modelo</a>
              <label className="btn btn-primary file-picker">
                <IconeUpload size={15} /> {salvando ? 'Importando…' : 'Importar CSV'}
                <input type="file" accept=".csv,.txt" className="visually-hidden" disabled={salvando} onChange={processarCsv} />
              </label>
            </div>
          </div>
        )}

        {mensagem && (
          <div className="notice-banner teal" role="status" style={{ marginTop: 12 }}>
            <IconeOk size={17} color="var(--neural-teal)" />
            <div>{mensagem}</div>
          </div>
        )}
        {erro && (
          <div className="notice-banner danger" role="alert" style={{ marginTop: 12 }}>
            <IconeAlerta size={17} />
            <div>{erro}</div>
          </div>
        )}
      </section>

      {/* ESTADO VAZIO CLARO */}
      {!carregandoInicial && !diario?.possui_registros && (
        <section className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <IconeSol size={28} color="var(--solar-amber)" style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>Nenhum lançamento registrado ainda</div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 460, margin: '6px auto 14px' }}>
            Clique em <strong>Salvar e diagnosticar</strong> acima para comparar a geração com o esperado pelo clima e verificar se há sujeira nas placas, sombra ou falha elétrica.
          </p>
        </section>
      )}

      {/* CAIXA 2: DIAGNÓSTICO DE SAÚDE DAS PLACAS E PARTE ELÉTRICA + COMPARAÇÃO */}
      {diario?.possui_registros && (
        <>
          {diag && (
            <section
              className={`card health-diagnosis-card ${
                diag.nivel === 'alerta' ? 'is-critical' : diag.nivel === 'atencao' ? 'is-warning' : 'is-healthy'
              }`}
              aria-label="Diagnóstico de saúde da usina"
            >
              <div className="health-diagnosis-header">
                <span className="health-diagnosis-icon">
                  {diag.nivel === 'alerta' ? (
                    <IconeCritico size={22} />
                  ) : diag.nivel === 'atencao' ? (
                    <IconeAlerta size={22} />
                  ) : (
                    <IconeOk size={22} />
                  )}
                </span>
                <div>
                  <span className="section-tag">TRIAGEM COMPLEMENTAR APROXIMADA · NÃO SUBSTITUI VISTORIA TÉCNICA</span>
                  <h2 className="card-title" style={{ marginTop: 2 }}>{diag.titulo}</h2>
                  <p className="card-subtitle" style={{ marginTop: 4 }}>{diag.recomendacao}</p>
                </div>
              </div>

              {diag.horarios_afetados?.length > 0 && (
                <div className="health-hours-row">
                  <span>Horários com queda detectada:</span>
                  {diag.horarios_afetados.map((h) => (
                    <span key={h} className="health-hour-chip mono">{h}</span>
                  ))}
                </div>
              )}

              {diag.verificacoes?.length > 0 && (
                <div className="health-checklist">
                  <strong>Sugestões de conferência (apoio complementar):</strong>
                  <ul>
                    {diag.verificacoes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p style={{ margin: '12px 0 0', paddingTop: 10, borderTop: '1px dashed var(--border-subtle)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                <strong>Nota de uso:</strong> esta leitura é uma estimativa estatística de apoio complementar, não um diagnóstico 100% verdadeiro ou definitivo. Confirme sempre no visor do inversor, na fatura da concessionária e com um profissional qualificado antes de realizar manutenção.
              </p>
            </section>
          )}

          <section className="card">
            <div className="card-header" style={{ marginBottom: 14 }}>
              <h2 className="card-title">Gerado × Esperado ({diario.total_dias} {diario.total_dias === 1 ? 'dia' : 'dias'})</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={exportarCsv}><IconeDownload size={14} /> Baixar CSV</button>
                <button type="button" className="btn btn-sm" onClick={limparTudo}><IconeExcluir size={14} /> Limpar</button>
              </div>
            </div>

            <div className="kpi-grid beginner-kpis" style={{ marginBottom: 18 }}>
              <div className="card card-compact">
                <div className="kpi-label">Energia gerada</div>
                <div className="kpi-value" style={{ color: 'var(--solar-amber)' }}>
                  {formatarNumero(kpis.energia_real_total_kwh, 1)} <small>kWh</small>
                </div>
                <div className="kpi-foot">Retorno: R$ {formatarNumero(kpis.economia_real_rs, 2)}</div>
              </div>

              <div className="card card-compact">
                <div className="kpi-label">Esperado pelo clima</div>
                <div className="kpi-value" style={{ color: 'var(--neural-teal)' }}>
                  {formatarNumero(kpis.energia_prevista_total_kwh, 1)} <small>kWh</small>
                </div>
                <div className="kpi-foot">Estimado: R$ {formatarNumero(kpis.economia_prevista_rs, 2)}</div>
              </div>

              <div className="card card-compact">
                <div className="kpi-label">Diferença no período</div>
                <div
                  className="kpi-value"
                  style={{
                    color: diag?.nivel === 'alerta' ? 'var(--signal-danger)' : diag?.nivel === 'atencao' ? 'var(--signal-warn)' : 'var(--signal-ok)',
                  }}
                >
                  {kpis.desvio_pct > 0 ? '+' : ''}{formatarNumero(kpis.desvio_pct, 1)}%
                </div>
                <div className="kpi-foot">{kpis.diferenca_kwh > 0 ? '+' : ''}{formatarNumero(kpis.diferenca_kwh, 1)} kWh vs esperado</div>
              </div>
            </div>

            <div className="split-equal">
              <div style={{ width: '100%', height: 245 }}>
                <ContainerResponsivo>
                  <GraficoBarras data={diario.resumo_diario} margin={{ top: 6, right: 10, left: -12, bottom: 4 }}>
                    <GradeCartesiana strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <EixoX dataKey="data_curta" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                    <EixoY stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                    <DicaFlutuante contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-subtle)', borderRadius: 10, fontSize: 12 }} />
                    <Legenda />
                    <Barra dataKey="geracao_real_kwh" name="Gerado (kWh)" fill="var(--solar-amber)" radius={[4, 4, 0, 0]} />
                    <Barra dataKey="previsao_kwh" name="Esperado (kWh)" fill="var(--neural-teal)" radius={[4, 4, 0, 0]} />
                  </GraficoBarras>
                </ContainerResponsivo>
              </div>

              <div className="table-wrap" style={{ maxHeight: 245 }}>
                <table className="data-table mono">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Gerado</th>
                      <th>Esperado</th>
                      <th>Valor</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...diario.resumo_diario].reverse().map((d) => (
                      <tr key={d.data_iso}>
                        <td>{d.data}</td>
                        <td>{formatarNumero(d.geracao_real_kwh, 1)} kWh</td>
                        <td className="winner-cell">{formatarNumero(d.previsao_kwh, 1)} kWh</td>
                        <td>R$ {formatarNumero(d.economia_real_rs, 2)}</td>
                        <td>
                          <button type="button" className="mini-preset" onClick={() => excluirDia(d.data_iso)}>Excluir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {aoIrParaAba && <BarraProximoPasso passoAtualNumero={4} aoNavegar={aoIrParaAba} />}
    </div>
  );
}
