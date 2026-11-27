import React, { useEffect, useState } from 'react';
import {
  ComposedChart as GraficoComposto,
  Area as AreaGrafico,
  Line as Linha,
  Bar as Barra,
  XAxis as EixoX,
  YAxis as EixoY,
  CartesianGrid as GradeCartesiana,
  Tooltip as DicaFlutuante,
  Legend as Legenda,
  ResponsiveContainer as ContainerResponsivo,
} from 'recharts';
import {
  Sliders as IconeControles,
  RefreshCw as IconeRestaurar,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';

export default function PainelLaboratorioFisico({ estadoSistema }) {
  const [dadosVerificacoes, definirDadosVerificacoes] = useState(null);
  const [dadosInferencia1h, definirDadosInferencia1h] = useState(null);
  const [horarioAlvoSelecionado, definirHorarioAlvoSelecionado] = useState('');
  const [resultadoSimulacao, definirResultadoSimulacao] = useState(null);

  const [parametrosSimulados, definirParametrosSimulados] = useState(() => {
    const padrao = estadoSistema?.config || {};
    return {
      quantidade_placas: padrao.quantidade_placas ?? 10,
      potencia_placa_wp: padrao.potencia_placa_wp ?? 550,
      inversor_kw: padrao.inversor_kw ?? 5.0,
      inclinacao_graus: padrao.inclinacao_graus ?? 10,
      azimute_graus: padrao.azimute_graus ?? 0,
      eficiencia_inversor: padrao.eficiencia_inversor ?? 0.96,
      perdas_dc: padrao.perdas_dc ?? 0.08,
      noct_c: padrao.noct_c ?? 45,
    };
  });

  useEffect(() => {
    const temporizador = setTimeout(() => {
      clienteApi.simularFisicaCustomizada(parametrosSimulados).then(definirResultadoSimulacao).catch(() => {});
    }, 150);
    return () => clearTimeout(temporizador);
  }, [parametrosSimulados]);

  const restaurarParametrosPadrao = () => {
    const padrao = estadoSistema?.config || {};
    definirParametrosSimulados({
      quantidade_placas: padrao.quantidade_placas ?? 10,
      potencia_placa_wp: padrao.potencia_placa_wp ?? 550,
      inversor_kw: padrao.inversor_kw ?? 5.0,
      inclinacao_graus: padrao.inclinacao_graus ?? 10,
      azimute_graus: padrao.azimute_graus ?? 0,
      eficiencia_inversor: padrao.eficiencia_inversor ?? 0.96,
      perdas_dc: padrao.perdas_dc ?? 0.08,
      noct_c: padrao.noct_c ?? 45,
    });
  };

  const carregarInferenciaSeNecessario = (instante = horarioAlvoSelecionado) => {
    clienteApi.obterInferenciaUmaHora(instante).then((r) => {
      definirDadosInferencia1h(r);
      if (!instante && r.instante_alvo) definirHorarioAlvoSelecionado(r.instante_alvo);
    }).catch(() => {});
  };

  return (
    <div className="view-stack">
      {/* SIMULADOR PRINCIPAL NO TOPO */}
      <div className="split-asymmetric">
        <section className="card">
          <div className="card-header" style={{ marginBottom: 14 }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconeControles size={18} color="var(--solar-amber)" />
              Simulador “E se?”
            </h2>
            <button type="button" className="btn btn-sm" onClick={restaurarParametrosPadrao}>
              <IconeRestaurar size={13} /> Restaurar usina ativa
            </button>
          </div>

          {resultadoSimulacao && (
            <>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
                <span>Arranjo: <strong className="mono">{formatarNumero(resultadoSimulacao.kwp_simulado, 2)} kWp</strong></span>
                <span style={{ color: 'var(--sky-hybrid)' }}>
                  Dia simulado: <strong className="mono">{formatarNumero(resultadoSimulacao.energia_dia_simulada_kwh, 1)} kWh</strong> ({resultadoSimulacao.diferenca_pct >= 0 ? '+' : ''}{formatarNumero(resultadoSimulacao.diferenca_pct, 1)}%)
                </span>
                {resultadoSimulacao.horas_clipping > 0 && (
                  <span style={{ color: 'var(--signal-danger)' }}>
                    Limitado pelo inversor: <strong>{resultadoSimulacao.horas_clipping}h</strong>
                  </span>
                )}
              </div>

              <div style={{ width: '100%', height: 290 }}>
                <ContainerResponsivo>
                  <GraficoComposto data={resultadoSimulacao.serie_horaria} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
                    <GradeCartesiana strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <EixoX dataKey="hora" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                    <EixoY stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                    <DicaFlutuante contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-subtle)', borderRadius: 10, fontSize: 12 }} />
                    <Legenda />
                    <Linha type="monotone" dataKey="ac_padrao_kwh" name={`Usina ativa (${formatarNumero(resultadoSimulacao.kwp_padrao, 1)} kWp)`} stroke="var(--chart-cloud)" strokeDasharray="4 4" strokeWidth={2} dot={false} />
                    <AreaGrafico type="monotone" dataKey="ac_simulado_kwh" name="Simulado (kWh)" fill="var(--sky-hybrid-soft)" stroke="var(--sky-hybrid)" strokeWidth={2.5} />
                    <Barra dataKey="perda_clipping_kwh" name="Corte do inversor (kWh)" fill="var(--signal-danger)" radius={[3, 3, 0, 0]} />
                  </GraficoComposto>
                </ContainerResponsivo>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h3 className="card-title" style={{ marginBottom: 14 }}>Ajuste os controles</h3>
          <div className="slider-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="slider-item">
              <div className="slider-top">
                <label htmlFor="sim-placas">Placas</label>
                <strong className="mono">{parametrosSimulados.quantidade_placas} un</strong>
              </div>
              <input id="sim-placas" type="range" min="2" max={Math.max(200, (estadoSistema?.config?.quantidade_placas || 10) * 2)} step="1" className="range-input" value={parametrosSimulados.quantidade_placas} onChange={(e) => definirParametrosSimulados((p) => ({ ...p, quantidade_placas: Number(e.target.value) }))} />
            </div>

            <div className="slider-item">
              <div className="slider-top">
                <label htmlFor="sim-inv">Inversor</label>
                <strong className="mono">{formatarNumero(parametrosSimulados.inversor_kw, 1)} kW</strong>
              </div>
              <input id="sim-inv" type="range" min="1.0" max={Math.max(100, (estadoSistema?.config?.inversor_kw || 5) * 2)} step="0.5" className="range-input" value={parametrosSimulados.inversor_kw} onChange={(e) => definirParametrosSimulados((p) => ({ ...p, inversor_kw: Number(e.target.value) }))} />
            </div>

            <div className="slider-item">
              <div className="slider-top">
                <label htmlFor="sim-inc">Inclinação</label>
                <strong className="mono">{parametrosSimulados.inclinacao_graus}°</strong>
              </div>
              <input id="sim-inc" type="range" min="0" max="65" step="1" className="range-input" value={parametrosSimulados.inclinacao_graus} onChange={(e) => definirParametrosSimulados((p) => ({ ...p, inclinacao_graus: Number(e.target.value) }))} />
            </div>

            <div className="slider-item">
              <div className="slider-top">
                <label htmlFor="sim-az">Direção (0°=N, 90°=L, 270°=O)</label>
                <strong className="mono">{parametrosSimulados.azimute_graus}°</strong>
              </div>
              <input id="sim-az" type="range" min="0" max="355" step="5" className="range-input" value={parametrosSimulados.azimute_graus} onChange={(e) => definirParametrosSimulados((p) => ({ ...p, azimute_graus: Number(e.target.value) }))} />
            </div>
          </div>
        </section>
      </div>

      {/* DETALHES TÉCNICOS RECOLHIDOS */}
      <details
        className="card guide-panel"
        onToggle={(e) => {
          if (e.currentTarget.open && !dadosInferencia1h) carregarInferenciaSeNecessario();
          if (e.currentTarget.open && !dadosVerificacoes) clienteApi.obterVerificacoesFisicas().then(definirDadosVerificacoes).catch(() => {});
        }}
      >
        <summary>
          <span><strong>Ver detalhes internos do cálculo da IA e verificações físicas</strong></span>
        </summary>
        <div className="guide-content">
          {dadosInferencia1h && (
            <div className="anatomy-flow" style={{ marginTop: 6 }}>
              <div className="anatomy-box">
                <div className="chain-step">Base Física</div>
                <div className="kpi-value" style={{ fontSize: 20 }}>{formatarNumero(dadosInferencia1h.base_fisica_kwh, 3)} kWh</div>
              </div>
              <div className="anatomy-op">+</div>
              <div className="anatomy-box">
                <div className="chain-step">Ajuste IA</div>
                <div className="kpi-value" style={{ fontSize: 20, color: 'var(--neural-teal)' }}>{dadosInferencia1h.residuo_lstm_kwh >= 0 ? '+' : ''}{formatarNumero(dadosInferencia1h.residuo_lstm_kwh, 3)} kWh</div>
              </div>
              <div className="anatomy-op">→</div>
              <div className="anatomy-box final">
                <div className="chain-step">Previsão Final</div>
                <div className="kpi-value" style={{ fontSize: 20, color: 'var(--sky-hybrid)' }}>{formatarNumero(dadosInferencia1h.previsao_final_kwh, 3)} kWh</div>
              </div>
              <div className="anatomy-op">vs</div>
              <div className="anatomy-box target">
                <div className="chain-step">Referência</div>
                <div className="kpi-value" style={{ fontSize: 20, color: 'var(--solar-amber)' }}>{formatarNumero(dadosInferencia1h.alvo_real_kwh, 3)} kWh</div>
              </div>
            </div>
          )}

          {dadosVerificacoes && (
            <p style={{ fontSize: 12.5, color: 'var(--signal-ok)', fontWeight: 600, margin: '12px 0 0' }}>
              ✓ {dadosVerificacoes.aprovados}/{dadosVerificacoes.total_testes} verificações automáticas de segurança física aprovadas.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
