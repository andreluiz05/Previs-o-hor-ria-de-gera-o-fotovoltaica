import React, { useEffect, useRef, useState } from 'react';
import {
  ComposedChart as GraficoComposto,
  Line as Linha,
  Area as AreaGrafico,
  XAxis as EixoX,
  YAxis as EixoY,
  CartesianGrid as GradeCartesiana,
  Tooltip as DicaFlutuante,
  Legend as Legenda,
  ResponsiveContainer as ContainerResponsivo,
} from 'recharts';
import {
  AlertTriangle as IconeAviso,
  CloudSun as IconeClimaSol,
  Download as IconeDownload,
  Flame as IconePico,
  MapPin as IconeMapa,
  RefreshCw as IconeAtualizar,
  Sun as IconeSol,
  Wallet as IconeCarteira,
  Zap as IconeRaio,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';
import { BarraProximoPasso } from './TrilhaGuiada';
import SeletorLocalMapaClima from './SeletorLocalMapaClima';

export default function PainelPrevisaoOperacional({ estadoSistema, aoAtualizarConfig, aoIrParaAba }) {
  const cfgAtiva = estadoSistema?.config || {};
  const [horizonteHoras, definirHorizonteHoras] = useState(24);
  const [mostrarMapaClima, definirMostrarMapaClima] = useState(false);
  const [consultando, definirConsultando] = useState(false);
  const [mensagemErro, definirMensagemErro] = useState('');
  const [resultadoPrevisao, definirResultadoPrevisao] = useState(null);
  const consultaAtual = useRef(0);

  const consultarPrevisao = async (horas = horizonteHoras) => {
    const numeroConsulta = ++consultaAtual.current;
    definirConsultando(true);
    definirMensagemErro('');
    try {
      const formulario = new FormData();
      formulario.append('latitude', String(cfgAtiva.latitude ?? -7.8342));
      formulario.append('longitude', String(cfgAtiva.longitude ?? -34.9064));
      formulario.append('horas', String(horas));
      formulario.append('forcar_offline', 'false');
      const resposta = await clienteApi.executarPrevisaoOperacional(formulario);
      if (numeroConsulta === consultaAtual.current) definirResultadoPrevisao(resposta);
    } catch (erro) {
      if (numeroConsulta === consultaAtual.current) definirMensagemErro(erro.message || 'Falha ao consultar previsão.');
    } finally {
      if (numeroConsulta === consultaAtual.current) definirConsultando(false);
    }
  };

  useEffect(() => {
    consultarPrevisao(horizonteHoras);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cfgAtiva.latitude, cfgAtiva.longitude, cfgAtiva.quantidade_placas, cfgAtiva.potencia_placa_wp,
    cfgAtiva.inversor_kw, cfgAtiva.inclinacao_graus, cfgAtiva.azimute_graus, cfgAtiva.tarifa_energia_rs,
  ]);

  useEffect(() => () => { consultaAtual.current += 1; }, []);

  const baixarCsvPrevisao = () => {
    if (!resultadoPrevisao?.serie?.length) return;
    const colunas = ['data_hora', 'previsao_lstm_kwh', 'referencia_fisica_kwh', 'economia_rs', 'temperature_2m', 'cloud_cover', 'precipitation'];
    const linhasCsv = [
      colunas.join(';'),
      ...resultadoPrevisao.serie.map((item) => colunas.map((col) => item[col]).join(';')),
    ];
    const blob = new Blob([linhasCsv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `previsao_${resultadoPrevisao.horas}h.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const meteo = resultadoPrevisao?.meteorologia;

  return (
    <div className="view-stack forecast-view" aria-busy={consultando}>
      {mensagemErro && (
        <div className="notice-banner danger" role="alert">
          <IconeAviso size={18} />
          <div>{mensagemErro}</div>
        </div>
      )}

      {consultando && !resultadoPrevisao && (
        <section className="card chart-loading" role="status">
          <IconeSol size={30} aria-hidden="true" />
          <strong>Consultando clima e calculando geração…</strong>
        </section>
      )}

      {resultadoPrevisao && (
        <>
          {/* 4 INDICADORES DIRETOS E OBJETIVOS */}
          <div className="kpi-grid forecast-kpis">
            <div className="card card-compact">
              <div className="kpi-label">
                <span>Energia prevista ({resultadoPrevisao.horas}h)</span>
                <span className="kpi-icon-badge teal"><IconeRaio size={15} /></span>
              </div>
              <div className="kpi-value">
                {formatarNumero(resultadoPrevisao.energia_total_lstm_kwh, 2)} <small>kWh</small>
              </div>
              <div className="kpi-foot">Usina de {formatarNumero(resultadoPrevisao.kwp_instalado, 2)} kWp</div>
            </div>

            <div className="card card-compact">
              <div className="kpi-label">
                <span>Economia estimada</span>
                <span className="kpi-icon-badge teal"><IconeCarteira size={15} /></span>
              </div>
              <div className="kpi-value" style={{ color: 'var(--signal-ok)' }}>
                <small>R$</small> {formatarNumero(resultadoPrevisao.economia_estimada_rs, 2)}
              </div>
              <div className="kpi-foot">
                Líquida est.: R$ {formatarNumero(resultadoPrevisao.economia_liquida_lei14300_rs ?? resultadoPrevisao.economia_estimada_rs, 2)}
              </div>
            </div>

            <div className="card card-compact">
              <div className="kpi-label">
                <span>Pico de geração</span>
                <span className="kpi-icon-badge amber"><IconePico size={15} /></span>
              </div>
              <div className="kpi-value">{resultadoPrevisao.horario_pico}</div>
              <div className="kpi-foot">Máxima de {formatarNumero(resultadoPrevisao.pico_lstm_kwh, 2)} kWh/h</div>
            </div>

            <div className="card card-compact">
              <div className="kpi-label">
                <span>Clima em {cfgAtiva.cidade?.split(',')[0] || 'sua região'}</span>
                <span className="kpi-icon-badge sky"><IconeClimaSol size={15} /></span>
              </div>
              <div className="kpi-value" style={{ fontSize: 24 }}>
                {formatarNumero(meteo?.temperatura_min_c, 0)}° a {formatarNumero(meteo?.temperatura_max_c, 0)}°C
              </div>
              <div className="kpi-foot">
                Nuvens {formatarNumero(meteo?.nuvens_media_pct, 0)}% · Chuva {formatarNumero(meteo?.chuva_total_mm, 1)} mm
              </div>
            </div>
          </div>

          {/* GRÁFICO LIMPO */}
          <section className="card forecast-chart" aria-label="Previsão horária de geração">
            <div className="card-header">
              <div>
                <h2 className="card-title">Geração prevista hora a hora</h2>
                <p className="card-subtitle">{resultadoPrevisao.usina_cidade} · próximas {resultadoPrevisao.horas} horas</p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${mostrarMapaClima ? 'btn-primary' : ''}`}
                  onClick={() => definirMostrarMapaClima((v) => !v)}
                >
                  <IconeMapa size={14} /> {mostrarMapaClima ? 'Fechar mapa' : 'Mudar endereço / local'}
                </button>
                <select
                  aria-label="Período da previsão"
                  className="select"
                  style={{ minHeight: 36, padding: '6px 10px', fontSize: 12 }}
                  value={horizonteHoras}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    definirHorizonteHoras(h);
                    consultarPrevisao(h);
                  }}
                >
                  <option value={12}>12 horas</option>
                  <option value={24}>24 horas</option>
                </select>
                <button type="button" className="btn btn-sm" onClick={baixarCsvPrevisao}>
                  <IconeDownload size={14} /> Baixar CSV
                </button>
                <button type="button" className="btn btn-sm btn-primary" disabled={consultando} onClick={() => consultarPrevisao(horizonteHoras)}>
                  <IconeAtualizar size={14} /> {consultando ? 'Atualizando…' : 'Atualizar'}
                </button>
              </div>
            </div>

            {mostrarMapaClima && (
              <div style={{ marginBottom: 18 }}>
                <SeletorLocalMapaClima
                  estadoSistema={estadoSistema}
                  alturaMapa={230}
                  titulo="Mudar endereço da previsão meteorológica"
                  subtitulo="Escolha qualquer endereço ou cidade no Google Maps para recalcular a previsão de 24h."
                  aoLocalAtualizado={async () => {
                    if (aoAtualizarConfig) await aoAtualizarConfig();
                  }}
                />
              </div>
            )}

            <div className="chart-container">
              <ContainerResponsivo>
                <GraficoComposto accessibilityLayer data={resultadoPrevisao.serie} margin={{ top: 10, right: 16, left: -15, bottom: 5 }}>
                  <defs>
                    <linearGradient id="solar-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--neural-teal)" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="var(--neural-teal)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <GradeCartesiana strokeDasharray="3 5" stroke="var(--chart-grid)" vertical={false} />
                  <EixoX dataKey="rotulo" stroke="var(--text-muted)" axisLine={false} tickLine={false} minTickGap={32} tick={{ fontSize: 11 }} tickFormatter={(v) => v?.split(' ').pop() || v} />
                  <EixoY stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <DicaFlutuante formatter={(valor, nome) => [`${formatarNumero(valor, 2)} kWh`, nome]} contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-subtle)', borderRadius: 10, fontSize: 12 }} />
                  <Legenda verticalAlign="top" align="right" iconType="plainline" wrapperStyle={{ paddingBottom: 16 }} />
                  <AreaGrafico type="monotone" dataKey="previsao_lstm_kwh" name="Geração prevista" stroke="var(--neural-teal)" strokeWidth={2.5} fill="url(#solar-area)" isAnimationActive={false} />
                  <Linha type="monotone" dataKey="referencia_fisica_kwh" name="Estimativa básica pelo sol" stroke="var(--chart-physical)" strokeWidth={1.8} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                </GraficoComposto>
              </ContainerResponsivo>
            </div>

            <details style={{ marginTop: 14 }}>
              <summary style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Ver tabela hora a hora
              </summary>
              <div className="table-wrap" style={{ maxHeight: 260, marginTop: 10 }}>
                <table className="data-table mono">
                  <thead>
                    <tr>
                      <th>Horário</th>
                      <th>Energia prevista</th>
                      <th>Economia</th>
                      <th>Temperatura</th>
                      <th>Nuvens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadoPrevisao.serie.map((item) => (
                      <tr key={item.data_hora}>
                        <td>{item.rotulo}</td>
                        <td className="winner-cell">{formatarNumero(item.previsao_lstm_kwh, 2)} kWh</td>
                        <td>R$ {formatarNumero(item.economia_rs, 2)}</td>
                        <td>{formatarNumero(item.temperature_2m, 0)} °C</td>
                        <td>{formatarNumero(item.cloud_cover, 0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}

      {aoIrParaAba && <BarraProximoPasso passoAtualNumero={3} aoNavegar={aoIrParaAba} />}
    </div>
  );
}
