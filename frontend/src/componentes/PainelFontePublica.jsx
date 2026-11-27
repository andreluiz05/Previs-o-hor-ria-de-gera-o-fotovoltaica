import React, {useEffect, useRef, useState} from 'react';
import {BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {Radio, PlugZap, Unplug, Download, AlertTriangle, ExternalLink, ArrowRight} from 'lucide-react';
import {clienteApi} from '../api/clienteApi';
import {formatarNumero} from '../utilitarios/formatadores';

const FUSO = 'America/New_York';
const dataHora = (valor, timeZone = 'America/Fortaleza') => valor ? new Date(valor).toLocaleString('pt-BR', {
  timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : 'Aguardando consulta';
const ESTADOS = {online:'API conectada · leitura recente', pausado:'API desconectada · histórico salvo', aguardando:'Aguardando a primeira consulta', atrasado:'API respondeu · leitura atrasada', erro:'Consulta à API indisponível'};
const formatarWatts = (kw) => Number.isFinite(kw)
  ? (kw * 1000).toLocaleString('pt-BR', {maximumFractionDigits: 2}) : '—';

export default function PainelFontePublica({aoIrParaAba}) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [acaoAtual, setAcaoAtual] = useState(null);
  const ocupado = acaoAtual !== null;
  const versao = useRef(0);
  useEffect(() => {
    let cancelado = false, timer, abort;
    const consultar = async () => {
      if (document.hidden) { timer = setTimeout(consultar, 10000); return; }
      const atual = versao.current;
      abort = new AbortController();
      try {
        const resposta = await clienteApi.obterFontePublica(abort.signal);
        if (!cancelado && atual === versao.current) { setDados(resposta); setErro(''); }
      } catch (e) {
        if (!cancelado && atual === versao.current && e.name !== 'AbortError') setErro('Sem conexão com o servidor. Os valores exibidos são da última resposta recebida.');
      } finally { if (!cancelado) timer = setTimeout(consultar, 10000); }
    };
    consultar();
    return () => { cancelado = true; clearTimeout(timer); abort?.abort(); };
  }, []);

  const executar = async (acao, nomeAcao) => {
    versao.current += 1;
    setAcaoAtual(nomeAcao); setErroAcao('');
    try { setDados(await acao()); setErro(''); }
    catch (e) { setErroAcao(e.message || 'Não foi possível executar a ação. Tente novamente.'); }
    finally { versao.current += 1; setAcaoAtual(null); }
  };
  const leitura = dados?.ultima_leitura;
  const fonte = dados?.fonte;
  const recentes = dados?.leituras_recentes ?? (leitura ? [leitura] : []);
  const serie = (dados?.serie_horaria || []).map(h => ({...h, rotulo:dataHora(h.inicio, FUSO)}));
  const valor = (n, casas = 3) => n === null || n === undefined ? '—' : formatarNumero(n, casas);
  const status = erro ? 'Servidor desconectado' : ocupado ? acaoAtual === 'desconectar' ? 'Desconectando a API…' : 'Conectando a API…' : ESTADOS[dados?.estado] || 'Carregando fonte pública…';

  return <div className="view-stack public-source-view" aria-busy={ocupado}>
    <div className="test-only-callout" role="note">
      <strong>Demonstração de API externa (não representa sua usina real):</strong> estas medições pertencem a um inversor público instalado na região de <strong>Nova York (EUA)</strong> via SolarNetwork, exibido apenas para demonstrar coleta automática minuto a minuto. A previsão e os cálculos da sua usina usam exclusivamente o cadastro do Passo 1.
    </div>

    <section className="card monitoring-source public-live" aria-labelledby="inversor-potencia">
      <div className="card-header">
        <span className="public-live-source">SolarNetwork · Nó 1000 · Inversor 2</span>
        <span className="monitoring-state" data-estado={erro ? 'erro' : dados?.estado} role="status"><Radio size={15} aria-hidden="true" />{status}</span>
      </div>
      <div className="public-live-grid">
        <div>
          <h2 className="card-title" id="inversor-potencia">Potência na última medição</h2>
          <div className="public-live-watts">{formatarWatts(leitura?.potencia_kw)} <small>W</small></div>
          {leitura ? <>
            {leitura.potencia_kw == null && <p className="field-help">A fonte omitiu a potência nesta medição.</p>}
            <dl className="public-live-times">
              <div><dt>Nova York</dt><dd><time dateTime={leitura.instante}>{dataHora(leitura.instante, FUSO)}</time></dd></div>
              <div><dt>Pernambuco</dt><dd><time dateTime={leitura.instante}>{dataHora(leitura.instante)}</time></dd></div>
            </dl>
          </> : <p className="field-help">{dados?.ativo ? 'Aguardando a primeira medição do inversor.' : dados ? 'Conecte a API para receber as medições.' : 'Buscando a última medição…'}</p>}
        </div>
        <div className="public-live-feed">
          <h3 className="card-title">Últimas medições</h3>
          {recentes.length ? <table>
            <thead><tr><th scope="col">Horário em Nova York</th><th scope="col">Potência</th></tr></thead>
            <tbody>{recentes.map(item => <tr key={item.instante}>
              <td><time dateTime={item.instante}>{dataHora(item.instante, FUSO)}</time></td>
              <td>{Number.isFinite(item.potencia_kw) ? `${formatarWatts(item.potencia_kw)} W` : 'Sem valor'}</td>
            </tr>)}</tbody>
          </table> : <p className="field-help">As medições recebidas aparecerão aqui.</p>}
        </div>
      </div>
      <div className="monitoring-buttons">
        <button type="button" className="btn btn-primary" disabled={!dados || ocupado || dados.ativo} onClick={() => executar(clienteApi.conectarFontePublica, 'conectar')}><PlugZap size={15} aria-hidden="true" />{acaoAtual === 'conectar' ? 'Conectando…' : 'Conectar API'}</button>
        <button type="button" className="btn" disabled={!dados?.ativo || ocupado} onClick={() => executar(clienteApi.desconectarFontePublica, 'desconectar')}><Unplug size={15} aria-hidden="true" />{acaoAtual === 'desconectar' ? 'Desconectando…' : 'Desconectar API'}</button>
        <a className="btn" href={clienteApi.urlExportarFontePublica} download><Download size={15} aria-hidden="true" />Exportar histórico</a>
      </div>
      <p className="field-help">Com a coleta ligada, o Helionta consulta a SolarNetwork a cada minuto. Cada nova medição recebida aparece automaticamente.</p>
      {dados?.ultima_tentativa_em && <p className="field-help">Última consulta à API em <time dateTime={dados.ultima_tentativa_em}>{dataHora(dados.ultima_tentativa_em)}</time> (Pernambuco).</p>}
      {dados && !dados.ativo && <p className="notice-banner teal public-disconnected" role="status">API desconectada. As consultas automáticas estão desligadas e o histórico permanece disponível. Você pode cadastrar sua instalação e calcular a previsão normalmente.</p>}
    </section>

    {(erro || erroAcao || (dados?.ativo && dados?.erro)) && <div className="notice-banner danger" role="alert"><AlertTriangle size={19} aria-hidden="true" /><div>{erro || erroAcao || dados.erro}</div></div>}
    {dados?.ativo && (dados?.estado === 'atrasado' || dados?.erro_historico) && <div className="notice-banner amber" role="status">{dados?.erro_historico || 'A API está acessível, mas o equipamento não publicou uma medição recente. Confira o horário antes de interpretar a potência como atual.'}</div>}
    <div className="kpi-grid public-source-kpis">
      <div className="card card-compact"><div className="kpi-label">Energia informada · janela de 48h</div><div className="kpi-value">{dados?.horas_com_dados ? valor(dados.energia_periodo_kwh) : '—'} <small>kWh</small></div><div className="kpi-foot">{dados?.horas_com_dados || 0} de 48 intervalos com energia publicada. Lacunas ficam em branco.</div></div>
      <div className="card card-compact"><div className="kpi-label">Contador acumulado do equipamento</div><div className="kpi-value">{valor(leitura?.contador_kwh)} <small>kWh</small></div><div className="kpi-foot">Contador recebido da API; não é a geração de hoje.</div></div>
    </div>

    <section className="card public-source-chart">
      <div className="card-header"><div><h3 className="card-title">Geração publicada por hora</h3><p className="card-subtitle">Últimas 48 horas encerradas · horários na origem: America/New_York.</p></div></div>
      <p className="field-help">{dataHora(dados?.periodo_inicio, FUSO)} a {dataHora(dados?.periodo_fim, FUSO)} · Energia horária informada pela SolarNetwork em Wh e convertida para kWh, sem simulação nem interpolação.</p>
      {dados?.horas_com_dados ? <div className="chart-container"><ResponsiveContainer><BarChart accessibilityLayer data={serie} margin={{top:12,right:16,left:-12,bottom:8}}><CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 5" /><XAxis dataKey="rotulo" minTickGap={28} tick={{fontSize:10}} stroke="var(--text-muted)" tickFormatter={v=>v.split(', ').pop()} axisLine={false} tickLine={false} /><YAxis tick={{fontSize:10}} stroke="var(--text-muted)" axisLine={false} tickLine={false} /><Tooltip formatter={v=>[`${valor(v)} kWh`,'Energia publicada']} contentStyle={{backgroundColor:'var(--tooltip-bg)',borderColor:'var(--border-subtle)',borderRadius:10,fontSize:12}} /><Bar dataKey="energia_kwh" name="Energia publicada" fill="var(--neural-teal)" radius={[4,4,0,0]} isAnimationActive={false} maxBarSize={30} /></BarChart></ResponsiveContainer></div> : <div className="monitoring-empty"><Radio size={30} aria-hidden="true" /><strong>{dados?.ativo ? 'Aguardando o histórico publicado na API.' : 'Conecte a fonte pública para carregar as leituras.'}</strong><p>Horas sem informação não são preenchidas com zero.</p></div>}
      <details className="public-source-hourly"><summary>Conferir os valores e a origem de cada intervalo</summary><div className="table-wrap"><table className="data-table"><caption className="visually-hidden">Intervalos horários da fonte pública externa no fuso de Nova York</caption><thead><tr><th>Início · Nova York</th><th>Fim · Nova York</th><th>Energia publicada</th><th>Origem do valor</th></tr></thead><tbody>{serie.map(h=><tr key={h.inicio}><td>{dataHora(h.inicio,FUSO)}</td><td>{dataHora(h.fim,FUSO)}</td><td>{h.energia_kwh === null ? 'Sem leitura' : `${valor(h.energia_kwh)} kWh`}</td><td>{h.qualidade === 'informada_provedor' ? 'SolarNetwork · agregado horário' : h.qualidade === 'contador_inconsistente' ? 'Contador inconsistente · valor omitido' : 'Sem energia informada'}</td></tr>)}</tbody></table></div></details>
    </section>
    {aoIrParaAba && <section className="card public-source-forecast"><h3 className="card-title">Previsão da sua instalação</h3><p className="card-subtitle">A previsão usa as placas e o endereço cadastrados na sua usina.</p><div className="monitoring-buttons"><button type="button" className="btn" onClick={() => aoIrParaAba('usina')}>Configurar minha usina <ArrowRight size={15} aria-hidden="true" /></button><button type="button" className="btn" onClick={() => aoIrParaAba('operacional')}>Ver minha previsão <ArrowRight size={15} aria-hidden="true" /></button></div></section>}
    <section className="card public-source-attribution"><h3 className="card-title">Origem verificável dos dados</h3><p>Identificador publicado como inversor: <code>{fonte?.source_id || '/0145/S1/G1/INV/2'}</code>, nó {fonte?.node_id || 1000}. A identificação é fornecida pela plataforma; marca, modelo e capacidade não foram verificados no equipamento.</p><p>Essas leituras não treinam a IA e não são comparadas automaticamente com a previsão de Igarassu.</p><a href={fonte?.url_consulta} target="_blank" rel="noreferrer" className="btn btn-sm"><ExternalLink size={14} aria-hidden="true" />Conferir resposta da API</a> <a href="https://solarnetwork.net/" target="_blank" rel="noreferrer">Dados: SolarNetwork</a><p className="field-help">Uso pessoal/educacional conforme as condições da SolarNetwork. A disponibilidade e a atualização dos dados públicos dependem do provedor e do proprietário da instalação.</p></section>
  </div>;
}
