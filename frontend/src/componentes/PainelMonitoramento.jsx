import React, { useEffect, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Zap,
  Sun,
  PlugZap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  FlaskConical,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';
import PainelFontePublica from './PainelFontePublica';
import { BarraProximoPasso } from './TrilhaGuiada';

function CentralAoVivo({ estadoSistema }) {
  const [dados, definirDados] = useState(null);
  const [carregando, definirCarregando] = useState(true);
  const [erro, definirErro] = useState('');
  const [potenciaInput, definirPotenciaInput] = useState('');
  const [origemInput, definirOrigemInput] = useState('Inversor Principal');
  const [enviando, definirEnviando] = useState(false);
  const [sincronizandoApi, definirSincronizandoApi] = useState(false);
  const [avisoSync, definirAvisoSync] = useState('');

  const atualizarAgora = async (signal) => {
    try {
      const resp = await clienteApi.obterTempoRealAgora(signal);
      definirDados(resp);
      definirErro('');
      if (potenciaInput === '') definirPotenciaInput(String(resp.potencia_esperada_agora_kw ?? 0));
    } catch (e) {
      if (e.name !== 'AbortError') definirErro('Sem conexão momentânea com o servidor.');
    } finally {
      definirCarregando(false);
    }
  };

  useEffect(() => {
    let cancelado = false;
    let timer;
    let ctrl;
    const loop = async () => {
      if (cancelado) return;
      if (!document.hidden) {
        ctrl = new AbortController();
        await atualizarAgora(ctrl.signal);
      }
      if (!cancelado) timer = setTimeout(loop, 10000);
    };
    loop();
    return () => {
      cancelado = true;
      clearTimeout(timer);
      ctrl?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoSistema?.config?.latitude, estadoSistema?.config?.longitude, estadoSistema?.config?.quantidade_placas, estadoSistema?.config?.inversor_kw]);

  const enviarLeituraAoVivo = async (valorKw = Number(potenciaInput)) => {
    definirEnviando(true);
    definirErro('');
    try {
      const resp = await clienteApi.enviarLeituraTempoReal({
        potencia_kw: Math.max(0, Number(valorKw) || 0),
        origem: origemInput || 'Inversor',
      });
      definirDados(resp);
    } catch (e) {
      definirErro(e.message || 'Erro ao registrar leitura em tempo real.');
    } finally {
      definirEnviando(false);
    }
  };

  const desconectarLeiturasManuais = async () => {
    try { definirDados(await clienteApi.limparLeiturasTempoReal()); definirAvisoSync(''); }
    catch (e) { definirErro(e.message); }
  };

  const puxarDaApiDoInversor = async () => {
    definirSincronizandoApi(true);
    definirErro('');
    definirAvisoSync('');
    try {
      const resp = await clienteApi.sincronizarApiInversorTempoReal();
      definirDados(resp.estado_tempo_real);
      definirAvisoSync(`API sincronizada (${resp.leitura_api.latencia_ms} ms): ${formatarNumero(resp.leitura_api.potencia_kw, 3)} kW recebidos de ${resp.leitura_api.origem}.`);
    } catch (e) {
      definirErro(e.message || 'Falha ao consultar API do inversor.');
    } finally {
      definirSincronizandoApi(false);
    }
  };

  if (carregando && !dados) {
    return (
      <section className="card chart-loading" role="status">
        <Zap size={28} />
        <strong>Sincronizando energia solar em tempo real…</strong>
      </section>
    );
  }

  const diag = dados?.diagnostico_agora;
  const conectado = dados?.inversor_conectado_ao_vivo;
  const clima = dados?.clima_agora || {};

  return (
    <div className="view-stack">
      {erro && (
        <div className="notice-banner danger" role="alert">
          <AlertTriangle size={18} />
          <div>{erro}</div>
        </div>
      )}

      {/* BARRA DE STATUS AO VIVO */}
      {dados && (
        <div className="live-status-strip" role="status">
          <span className="live-pulse-badge">
            <i className="live-dot" />
            {conectado ? `INVERSOR CONECTADO · ${dados.origem_ultima_leitura}` : 'AO VIVO · CLIMA E SOL EM TEMPO REAL'}
          </span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Atualizado às {dados.horario_formatado} · {dados.usina_cidade}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {estadoSistema?.config?.modo_conexao_inversor === 'api_inversor' && (
              <button type="button" className="btn btn-sm btn-primary" disabled={sincronizandoApi} onClick={puxarDaApiDoInversor}>
                <PlugZap size={13} /> {sincronizandoApi ? 'Consultando API…' : 'Ler API do inversor agora'}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={() => atualizarAgora()}>
              <RefreshCw size={13} /> Atualizar clima
            </button>
          </div>
        </div>
      )}

      {avisoSync && (
        <div className="notice-banner teal" role="status">
          <CheckCircle2 size={17} color="var(--neural-teal)" />
          <div>{avisoSync}</div>
        </div>
      )}

      {/* ALERTA IMEDIATO SE HOUVER QUEDA ELÉTRICA OU DESVIO EM TEMPO REAL */}
      {diag && (conectado || diag.nivel !== 'normal') && (
        <div
          className={`notice-banner ${
            diag.nivel === 'alerta' ? 'danger' : diag.nivel === 'atencao' ? 'amber' : 'teal'
          }`}
          role="alert"
        >
          {diag.nivel === 'alerta' ? (
            <ShieldAlert size={20} />
          ) : diag.nivel === 'atencao' ? (
            <AlertTriangle size={20} />
          ) : (
            <CheckCircle2 size={20} color="var(--neural-teal)" />
          )}
          <div>
            <strong>{diag.titulo}:</strong> {diag.detalhe}
          </div>
        </div>
      )}

      {/* 4 KPIs EM TEMPO REAL */}
      {dados && (
        <div className="kpi-grid forecast-kpis">
          <div className="card card-compact">
            <div className="kpi-label">Potência agora</div>
            <div className="kpi-value">
              {formatarNumero(dados.potencia_atual_kw, 2)} <small>kW</small>
            </div>
            <div className="kpi-foot">
              {conectado
                ? `Esperado pelo sol agora: ${formatarNumero(dados.potencia_esperada_agora_kw, 2)} kW`
                : dados.sol_acima_horizonte
                ? `Capacidade máx.: ${formatarNumero(dados.inversor_kw, 1)} kW`
                : 'Noite · Sol abaixo do horizonte'}
            </div>
          </div>

          <div className="card card-compact">
            <div className="kpi-label">Gerado hoje até agora</div>
            <div className="kpi-value" style={{ color: 'var(--signal-ok)' }}>
              {formatarNumero(dados.energia_hoje_ate_agora_kwh, 2)} <small>kWh</small>
            </div>
            <div className="kpi-foot">Economia hoje: R$ {formatarNumero(dados.economia_hoje_ate_agora_rs, 2)}</div>
          </div>

          <div className="card card-compact">
            <div className="kpi-label">Restante previsto hoje</div>
            <div className="kpi-value" style={{ color: 'var(--sky-hybrid)' }}>
              +{formatarNumero(dados.energia_restante_hoje_kwh, 2)} <small>kWh</small>
            </div>
            <div className="kpi-foot">Total do dia: {formatarNumero(dados.energia_total_prevista_hoje_kwh, 1)} kWh</div>
          </div>

          <div className="card card-compact">
            <div className="kpi-label">Sol nas placas agora</div>
            <div className="kpi-value" style={{ fontSize: 24 }}>
              {formatarNumero(clima.poa_wm2, 0)} <small>W/m²</small>
            </div>
            <div className="kpi-foot">
              Placa {formatarNumero(clima.temperatura_placa_c, 0)}°C · Nuvens {formatarNumero(clima.nuvens_pct, 0)}%
            </div>
          </div>
        </div>
      )}

      {/* GRÁFICO DO DIA DE HOJE (REALIZADO ATÉ AGORA + RESTANTE DO DIA) */}
      {dados && (
        <section className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <h2 className="card-title">Curva de geração de hoje (00h às 23h)</h2>
              <p className="card-subtitle">Barras verdes mostram até a hora atual; linha tracejada mostra o restante previsto para hoje.</p>
            </div>
          </div>

          <div className="chart-container" style={{ height: 275 }}>
            <ResponsiveContainer>
              <ComposedChart data={dados.serie_hoje} margin={{ top: 8, right: 14, left: -14, bottom: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 5" />
                <XAxis dataKey="hora" stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, nome) => [`${formatarNumero(v, 2)} kWh`, nome]} contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-subtle)', borderRadius: 10, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="realizado_estimado_kwh" name="Acumulado até agora (kWh)" fill="var(--neural-teal)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                <Line type="monotone" dataKey="projecao_restante_kwh" name="Restante do dia (kWh)" stroke="var(--chart-physical)" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                {conectado && (
                  <Line type="monotone" dataKey="medido_inversor_kwh" name="Medido pelo inversor (kW)" stroke="var(--solar-amber)" strokeWidth={2.5} isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* CONEXÃO DE INVERSOR / MEDIDOR EM TEMPO REAL */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 12 }}>
          <div>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlugZap size={18} color="var(--neural-teal)" />
              Leitura ao vivo do inversor / medidor
            </h2>
            <p className="card-subtitle">
              Informe a potência instantânea do visor do seu inversor (ou envie automaticamente via API/Webhook) para comparar com o sol deste minuto.
            </p>
          </div>
          {conectado && (
            <button type="button" className="btn btn-sm" onClick={desconectarLeiturasManuais}>
              Voltar para estimativa automática
            </button>
          )}
        </div>

        <div className="controls-row" style={{ alignItems: 'flex-end' }}>
          <div className="field-group" style={{ width: 170 }}>
            <label className="field-label" htmlFor="kw-agora">Potência medida agora (kW)</label>
            <input
              id="kw-agora"
              type="number"
              step="0.05"
              min="0"
              className="input mono"
              value={potenciaInput}
              onChange={(e) => definirPotenciaInput(e.target.value)}
            />
          </div>

          <div className="field-group" style={{ width: 210 }}>
            <label className="field-label" htmlFor="origem-agora">Equipamento</label>
            <input
              id="origem-agora"
              className="input"
              value={origemInput}
              onChange={(e) => definirOrigemInput(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 4 }}>
            <button type="button" className="mini-preset" onClick={() => enviarLeituraAoVivo(dados?.potencia_esperada_agora_kw ?? 0)}>
              Operação normal ({formatarNumero(dados?.potencia_esperada_agora_kw, 2)} kW)
            </button>
            <button type="button" className="mini-preset" onClick={() => enviarLeituraAoVivo(0)}>
              Simular queda 0 kW
            </button>
          </div>

          <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={enviando} onClick={() => enviarLeituraAoVivo()}>
            <Zap size={15} /> {enviando ? 'Enviando…' : 'Enviar leitura agora'}
          </button>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Integrar inversor automaticamente (Home Assistant, Node-RED, Fronius, Shelly, ESP32, Growatt)
          </summary>
          <div className="subpanel" style={{ marginTop: 8, fontSize: 12 }}>
            Envie um <span className="mono">POST</span> automático a cada 1 a 5 minutos para{' '}
            <code className="mono">http://127.0.0.1:8000/api/tempo-real/leitura</code> com o JSON:{' '}
            <code className="mono">{'{"potencia_kw": 3.45, "energia_dia_kwh": 14.2, "origem": "Inversor Solar"}'}</code>.
          </div>
        </details>
      </section>
    </div>
  );
}

function SimuladorAceleradoCompacto() {
  const [dados, definirDados] = useState(null);
  const [cenario, definirCenario] = useState('sol');
  const [ocupado, definirOcupado] = useState(false);

  useEffect(() => {
    let fim = false;
    let t;
    const ler = async () => {
      if (fim) return;
      try { definirDados(await clienteApi.obterMonitoramento('')); } catch { /* ignora */ }
      if (!fim) t = setTimeout(ler, 2000);
    };
    ler();
    return () => { fim = true; clearTimeout(t); };
  }, []);

  const acao = async (fn) => { definirOcupado(true); try { definirDados(await fn()); } finally { definirOcupado(false); } };
  const ativo = Boolean(dados?.ativo);

  return (
    <section className="card">
      <div className="controls-row" style={{ alignItems: 'flex-end' }}>
        <div className="field-group">
          <label className="field-label" htmlFor="sim-rapido-cenario">Clima de teste acelerado (1h em 8s)</label>
          <select id="sim-rapido-cenario" className="select" value={cenario} disabled={ativo || ocupado} onChange={(e) => definirCenario(e.target.value)}>
            <option value="sol">Sol forte</option>
            <option value="nublado">Nublado</option>
            <option value="chuva">Chuva</option>
          </select>
        </div>
        <button type="button" className="btn btn-primary" disabled={ativo || ocupado} onClick={() => acao(() => clienteApi.iniciarSimulador({ modo: 'acelerado', cenario }))}>
          <Play size={14} /> Iniciar teste rápido
        </button>
        <button type="button" className="btn" disabled={!ativo || ocupado} onClick={() => acao(clienteApi.pausarSimulador)}>
          <Pause size={14} /> Pausar
        </button>
        <button type="button" className="btn" disabled={ocupado} onClick={() => acao(() => clienteApi.iniciarSimulador({ modo: 'acelerado', cenario, nova_sessao: true }))}>
          <RotateCcw size={14} /> Zerar
        </button>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 13 }}>
          Potência teste: <strong>{formatarNumero(dados?.ultima_leitura?.potencia_kw, 2)} kW</strong> · Acumulado: <strong>{formatarNumero(dados?.energia_dia_kwh, 2)} kWh</strong>
        </span>
      </div>
    </section>
  );
}

export default function PainelMonitoramento({ estadoSistema, aoIrParaAba }) {
  const [modoTela, definirModoTela] = useState('tempo_real'); // 'tempo_real' | 'demo' | 'api_publica'

  return (
    <div className="view-stack">
      <div className="monitoring-source-switch" role="group" aria-label="Fonte de monitoramento">
        <button type="button" className={`btn btn-sm ${modoTela === 'tempo_real' ? 'btn-primary' : ''}`} onClick={() => definirModoTela('tempo_real')}>
          <Sun size={14} /> Energia em tempo real (sua usina)
        </button>
        <button type="button" className={`btn btn-sm ${modoTela === 'demo' ? 'btn-primary' : ''}`} onClick={() => definirModoTela('demo')}>
          <FlaskConical size={14} /> Teste acelerado (opcional)
        </button>
        <button type="button" className={`btn btn-sm ${modoTela === 'api_publica' ? 'btn-primary' : ''}`} onClick={() => definirModoTela('api_publica')}>
          API pública externa (opcional)
        </button>
      </div>

      {modoTela === 'tempo_real' && <CentralAoVivo estadoSistema={estadoSistema} />}
      {modoTela === 'demo' && <SimuladorAceleradoCompacto />}
      {modoTela === 'api_publica' && <PainelFontePublica aoIrParaAba={aoIrParaAba} />}

      {aoIrParaAba && <BarraProximoPasso passoAtualNumero={2} aoNavegar={aoIrParaAba} />}
    </div>
  );
}
