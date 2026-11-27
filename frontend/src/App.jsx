import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Sun, Zap, CloudSun, Activity, PlugZap, ChartNoAxesCombined, Compass, Settings2, AlertTriangle, ArrowUpRight, Menu, X, ChevronRight } from 'lucide-react';
import { clienteApi } from './api/clienteApi';
import CabecalhoEfemerides from './componentes/CabecalhoEfemerides';
import TrilhaGuiada from './componentes/TrilhaGuiada';
import { formatarNumero } from './utilitarios/formatadores';

const PainelMinhaUsina = lazy(() => import('./componentes/PainelMinhaUsina'));
const PainelMonitoramento = lazy(() => import('./componentes/PainelMonitoramento'));
const PainelPrevisaoOperacional = lazy(() => import('./componentes/PainelPrevisaoOperacional'));
const PainelConsultaComparacao = lazy(() => import('./componentes/PainelConsultaComparacao'));
const PainelCentralApis = lazy(() => import('./componentes/PainelCentralApis'));
const PainelBenchmark = lazy(() => import('./componentes/PainelBenchmark'));
const PainelLaboratorioFisico = lazy(() => import('./componentes/PainelLaboratorioFisico'));
const PainelTreinamentoDados = lazy(() => import('./componentes/PainelTreinamentoDados'));

const ABAS = [
  { id: 'usina', passo: 1, titulo: 'Usina e local', menu: '1. Usina e local', descricao: 'Escolha a localização no mapa, as placas, o inversor e a tarifa.', Icone: Sun, grupo: 'Sua operação' },
  { id: 'monitoramento', passo: 2, titulo: 'Energia em tempo real', menu: '2. Tempo real', descricao: 'Potência instantânea agora, acumulado do dia e leitura ao vivo do inversor.', Icone: Zap, grupo: 'Sua operação' },
  { id: 'operacional', passo: 3, titulo: 'Previsão 24h', menu: '3. Previsão 24h', descricao: 'Energia e economia esperadas nas próximas horas com o clima real.', Icone: CloudSun, grupo: 'Sua operação' },
  { id: 'consulta', passo: 4, titulo: 'Histórico e saúde', menu: '4. Histórico e saúde', descricao: 'Registre a geração e receba alertas de sujeira nas placas, sombra ou falha elétrica.', Icone: Activity, grupo: 'Sua operação' },
  { id: 'apis', titulo: 'APIs e conexões', menu: '5. APIs e conexões', descricao: 'Veja todas as APIs ativas do projeto, teste a resposta ao vivo e cadastre APIs personalizadas.', Icone: PlugZap, grupo: 'Sua operação' },
  { id: 'benchmark', titulo: 'Comparar algoritmos', menu: 'Comparar algoritmos', descricao: 'Métricas detalhadas dos 7 modelos de previsão.', Icone: ChartNoAxesCombined, grupo: 'Análise e inteligência' },
  { id: 'fisica', titulo: 'Simulador físico "E se?"', menu: 'Simulador físico "E se?"', descricao: 'Teste inclinação, direção e sobrecarga do inversor.', Icone: Compass, grupo: 'Análise e inteligência' },
  { id: 'treino', titulo: 'Calibrar IA', menu: 'Calibrar IA', descricao: 'Retreine as redes neurais para o porte da instalação.', Icone: Settings2, grupo: 'Análise e inteligência' },
];

function abaDaUrl() {
  const id = window.location.hash.slice(1);
  if (ABAS.some((aba) => aba.id === id)) return id;
  try {
    return localStorage.getItem('helionta-passo1-salvo') === 'sim' ? 'monitoramento' : 'usina';
  } catch {
    return 'usina';
  }
}

function temaSalvo() {
  try { return localStorage.getItem('tecalli-tema') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export default function AplicacaoSolarV3() {
  const [temaAtual, definirTemaAtual] = useState(temaSalvo);
  const [abaAtiva, definirAbaAtiva] = useState(abaDaUrl);
  const [menuAberto, definirMenuAberto] = useState(false);
  const [analiseAberta, definirAnaliseAberta] = useState(() => ['benchmark', 'fisica', 'treino'].includes(abaDaUrl()));
  const [estadoSistema, definirEstadoSistema] = useState(null);
  const [carregandoInicial, definirCarregandoInicial] = useState(true);
  const [erroConexao, definirErroConexao] = useState('');
  const aba = ABAS.find((item) => item.id === abaAtiva) || ABAS[0];

  const carregarEstadoSistema = useCallback(async () => {
    definirCarregandoInicial(true);
    definirErroConexao('');
    try { definirEstadoSistema(await clienteApi.obterEstadoGeral()); }
    catch (erro) { definirErroConexao(erro.message || 'Não foi possível conectar ao servidor. Verifique se o Helionta está iniciado.'); }
    finally { definirCarregandoInicial(false); }
  }, []);

  useEffect(() => { carregarEstadoSistema(); }, [carregarEstadoSistema]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', temaAtual);
    try { localStorage.setItem('tecalli-tema', temaAtual); } catch { /* Sem armazenamento local */ }
  }, [temaAtual]);

  useEffect(() => {
    const sincronizar = () => {
      if (!ABAS.some((item) => item.id === window.location.hash.slice(1))) return;
      const id = abaDaUrl();
      definirAbaAtiva(id);
      definirMenuAberto(false);
      if (['benchmark', 'fisica', 'treino'].includes(id)) definirAnaliseAberta(true);
    };
    window.addEventListener('hashchange', sincronizar);
    return () => window.removeEventListener('hashchange', sincronizar);
  }, []);

  useEffect(() => {
    if (!menuAberto) return;
    const sidebar = document.getElementById('navegacao');
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.querySelector('a[aria-current="page"]')?.focus();
    const fechar = (evento) => {
      if (evento.key === 'Escape') definirMenuAberto(false);
      if (evento.key === 'Tab') {
        const controles = [...sidebar.querySelectorAll('a, button')].filter((item) => item.getClientRects().length);
        const primeiro = controles[0];
        const ultimo = controles.at(-1);
        if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
        else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
      }
    };
    window.addEventListener('keydown', fechar);
    return () => {
      window.removeEventListener('keydown', fechar);
      document.body.style.overflow = overflowAnterior;
      document.getElementById('abrir-menu')?.focus();
    };
  }, [menuAberto]);

  const navegar = (id) => {
    if (!ABAS.some((item) => item.id === id)) return;
    window.location.hash = id;
    definirAbaAtiva(id);
    if (['benchmark', 'fisica', 'treino'].includes(id)) definirAnaliseAberta(true);
    definirMenuAberto(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo" onClick={(evento) => { evento.preventDefault(); document.getElementById('conteudo')?.focus(); }}>Pular para o conteúdo</a>
      {menuAberto && <button className="menu-backdrop" aria-label="Fechar navegação" onClick={() => definirMenuAberto(false)} />}
      <aside id="navegacao" className={`sidebar ${menuAberto ? 'is-open' : ''}`} aria-label="Navegação principal">
        <a className="sidebar-brand" href="#usina" onClick={(e) => { e.preventDefault(); navegar('usina'); }} aria-label="Helionta — início">
          <img className="helionta-logo" src="/brand/helionta-logo.png" alt="Helionta" width="188" height="63" />
        </a>
        <button className="sidebar-close icon-button" onClick={() => definirMenuAberto(false)} aria-label="Fechar menu"><X size={20} /></button>

        <nav style={{ marginTop: 22 }}>
          <div className="nav-group">
            <div className="nav-group-label">Operação (1 a 5)</div>
            {ABAS.filter((item) => item.grupo === 'Sua operação').map(({ id, menu, Icone }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`nav-link ${abaAtiva === id ? 'active' : ''}`}
                aria-current={abaAtiva === id ? 'page' : undefined}
                onClick={(evento) => { evento.preventDefault(); navegar(id); }}
              >
                <Icone size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{menu}</span>
                {abaAtiva === id && <span className="nav-active-dot" />}
              </a>
            ))}
          </div>

          <details className="advanced-navigation" open={analiseAberta} onToggle={(evento) => definirAnaliseAberta(evento.currentTarget.open)}>
            <summary>Área técnica (opcional)</summary>
            {ABAS.filter((item) => item.grupo !== 'Sua operação').map(({ id, menu, Icone }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`nav-link ${abaAtiva === id ? 'active' : ''}`}
                aria-current={abaAtiva === id ? 'page' : undefined}
                onClick={(evento) => { evento.preventDefault(); navegar(id); }}
              >
                <Icone size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{menu}</span>
                {abaAtiva === id && <span className="nav-active-dot" />}
              </a>
            ))}
          </details>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-plant">
            <span className="section-tag">Usina ativa</span>
            <strong>{estadoSistema?.config?.nome || 'Carregando…'}</strong>
            <span>{estadoSistema?.config?.cidade || 'Aguardando conexão'}</span>
            <div className="sidebar-plant-power">
              <Sun size={17} aria-hidden="true" />
              <b>{formatarNumero(estadoSistema?.potencia_dc_kwp, 2)}</b> kWp · {formatarNumero(estadoSistema?.config?.inversor_kw, 1)} kW
            </div>
            <button onClick={() => navegar('usina')}>Editar usina <ArrowUpRight size={15} aria-hidden="true" /></button>
          </div>
          <div className="sidebar-signature">
            <span>Desenvolvido por</span>
            <img src="/brand/tecalli-tecnologia-logo.png" alt="Tecalli Tecnologia" width="120" height="40" />
          </div>
        </div>
      </aside>

      <div className="app-workspace">
        <div className="workspace-topbar">
          <div className="breadcrumb">
            <button id="abrir-menu" className="icon-button mobile-menu" aria-label="Abrir menu" aria-expanded={menuAberto} aria-controls="navegacao" onClick={() => definirMenuAberto(!menuAberto)}><Menu size={21} /></button>
            <span>Helionta</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{aba.passo ? `Passo ${aba.passo} · ${aba.titulo}` : aba.titulo}</strong>
          </div>
          <span className={`connection-status ${erroConexao ? 'disconnected' : ''}`}>
            <i />{erroConexao ? 'Sem conexão' : carregandoInicial ? 'Sincronizando' : 'Sistema online'}
          </span>
        </div>

        <div className="workspace-content">
          <TrilhaGuiada abaAtiva={abaAtiva} aoNavegar={navegar} />

          <CabecalhoEfemerides
            temaAtual={temaAtual}
            aoAlternarTema={() => definirTemaAtual((atual) => atual === 'dark' ? 'light' : 'dark')}
            aba={aba}
          />

          <main id="conteudo" tabIndex={-1}>
            {erroConexao && (
              <div className="notice-banner danger connection-error" role="alert">
                <AlertTriangle size={22} aria-hidden="true" />
                <div>
                  <strong>Não foi possível sincronizar a plataforma</strong>
                  <p>{erroConexao}</p>
                  <button className="btn" onClick={carregarEstadoSistema} disabled={carregandoInicial}>
                    {carregandoInicial ? 'Reconectando…' : 'Tentar novamente'}
                  </button>
                </div>
              </div>
            )}
            {carregandoInicial && !estadoSistema && !erroConexao && (
              <div className="initial-loading" role="status">
                <Sun size={32} aria-hidden="true" />
                <h2>Preparando seu painel solar</h2>
                <div className="skeleton-grid"><span /><span /><span /><span /></div>
              </div>
            )}
            {estadoSistema && (
              <Suspense fallback={<div className="card chart-loading" role="status">Carregando tela…</div>}>
                {abaAtiva === 'usina' && <PainelMinhaUsina estadoSistema={estadoSistema} aoSalvarUsina={carregarEstadoSistema} aoIrParaAba={navegar} />}
                {abaAtiva === 'monitoramento' && <PainelMonitoramento estadoSistema={estadoSistema} aoIrParaAba={navegar} />}
                {abaAtiva === 'operacional' && <PainelPrevisaoOperacional estadoSistema={estadoSistema} aoAtualizarConfig={carregarEstadoSistema} aoIrParaAba={navegar} />}
                {abaAtiva === 'consulta' && <PainelConsultaComparacao estadoSistema={estadoSistema} aoIrParaAba={navegar} />}
                {abaAtiva === 'apis' && <PainelCentralApis estadoSistema={estadoSistema} aoAtualizarConfig={carregarEstadoSistema} aoIrParaAba={navegar} />}
                {abaAtiva === 'benchmark' && <PainelBenchmark estadoSistema={estadoSistema} />}
                {abaAtiva === 'fisica' && <PainelLaboratorioFisico estadoSistema={estadoSistema} />}
                {abaAtiva === 'treino' && <PainelTreinamentoDados estadoSistema={estadoSistema} aoConcluirTreinamento={carregarEstadoSistema} />}
              </Suspense>
            )}
          </main>
          <footer className="app-footer"><span><strong>Helionta</strong> · Energia solar em tempo real e previsão inteligente.</span><span>Desenvolvido por Tecalli Tecnologia</span></footer>
        </div>
      </div>
    </div>
  );
}
