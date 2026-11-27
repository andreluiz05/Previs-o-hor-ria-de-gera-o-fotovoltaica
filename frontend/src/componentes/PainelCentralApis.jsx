import React, { useEffect, useState } from 'react';
import {
  PlugZap,
  CloudSun,
  MapPin,
  Database,
  Radio,
  Plus,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Zap,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';

function extrairDominioCurto(url) {
  try {
    const u = new URL(url.replace(/^POST\s+/i, ''));
    return u.host;
  } catch {
    return 'local';
  }
}

function iconePorCategoria(cat) {
  if (cat === 'clima') return CloudSun;
  if (cat === 'geolocalizacao') return MapPin;
  if (cat === 'historico') return Database;
  if (cat === 'webhook') return Radio;
  return PlugZap;
}

function obterVisualDaApi(api) {
  const id = (api.id || '').toLowerCase();
  const cat = (api.categoria || '').toLowerCase();
  const url = (api.url || '').toLowerCase();

  if (id === 'clima_principal' || url.includes('accuweather') || url.includes('wttr.in')) {
    return { foto: '/apis/api-clima.jpg', selo: 'AccuWeather · Estação Real' };
  }
  if (id === 'open_meteo_forecast') {
    return { foto: '/apis/api-irradiacao.jpg', selo: 'Satélite & Piranômetro Solar' };
  }
  if (cat === 'geolocalizacao' || id.includes('geocoding')) {
    return { foto: '/apis/api-geocoding.jpg', selo: 'Mapas & Geocodificação' };
  }
  if (cat === 'historico' || id.includes('archive')) {
    return { foto: '/apis/api-historico.jpg', selo: 'Série Histórica Solar' };
  }
  if (cat === 'webhook' || cat === 'medidor' || id.includes('webhook')) {
    return { foto: '/apis/api-webhook.jpg', selo: 'Helionta Local · Webhook' };
  }
  if (id === 'conector_inversor_usina') {
    return { foto: '/apis/api-inversor-usina.jpg', selo: 'Hardware · Inversor Principal' };
  }
  if (url.includes('solarnetwork')) {
    return { foto: '/apis/api-inversor.jpg', selo: 'SolarNetwork · Telemetria' };
  }
  if (cat === 'clima') {
    return { foto: '/apis/api-clima.jpg', selo: 'Serviço Meteorológico' };
  }
  return { foto: '/apis/api-inversor.jpg', selo: 'Conector de Inversor HTTP' };
}

export default function PainelCentralApis({ estadoSistema, aoAtualizarConfig, aoIrParaAba }) {
  const [central, definirCentral] = useState(null);
  const [carregando, definirCarregando] = useState(true);
  const [testandoId, definirTestandoId] = useState('');
  const [resultadosNativas, definirResultadosNativas] = useState({});
  const [abrirModalNova, definirAbrirModalNova] = useState(false);
  const [mensagem, definirMensagem] = useState('');
  const [erro, definirErro] = useState('');

  const [novaApi, definirNovaApi] = useState({
    nome: '',
    categoria: 'inversor',
    url: '',
    unidade: 'W',
    campo_potencia: '',
    token: '',
  });
  const [adicionando, definirAdicionando] = useState(false);

  const carregar = async () => {
    definirCarregando(true);
    try {
      definirCentral(await clienteApi.obterCentralApis());
      definirErro('');
    } catch (e) {
      definirErro(e.message || 'Não foi possível carregar as integrações.');
    } finally {
      definirCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [estadoSistema?.config?.modo_conexao_inversor, estadoSistema?.config?.url_api_inversor]);

  const testarNativa = async (api) => {
    definirTestandoId(api.id);
    definirErro('');
    try {
      const res = await clienteApi.testarUrlApi({
        url: api.url,
        campo_potencia: api.campo_potencia || '',
        unidade: api.unidade || 'W',
      });
      definirResultadosNativas((atual) => ({ ...atual, [api.id]: res }));
    } catch (e) {
      definirErro(e.message);
    } finally {
      definirTestandoId('');
    }
  };

  const testarPersonalizada = async (id) => {
    definirTestandoId(id);
    definirErro('');
    definirMensagem('');
    try {
      const resp = await clienteApi.testarApiCadastrada(id);
      definirCentral(resp.central);
      definirMensagem(resp.resultado_teste.mensagem);
    } catch (e) {
      definirErro(e.message);
    } finally {
      definirTestandoId('');
    }
  };

  const usarNoInversor = async (id) => {
    definirErro('');
    definirMensagem('');
    try {
      const resp = await clienteApi.usarApiNoInversorPrincipal(id);
      definirCentral(resp.central);
      if (aoAtualizarConfig) await aoAtualizarConfig();
      definirMensagem('Conectado como inversor principal da usina!');
    } catch (e) {
      definirErro(e.message);
    }
  };

  const alternarAtiva = async (api) => {
    try { definirCentral(await clienteApi.alternarEstadoApi(api.id, !api.ativa)); }
    catch (e) { definirErro(e.message); }
  };

  const excluirApi = async (id) => {
    try { definirCentral(await clienteApi.excluirApiPersonalizada(id)); }
    catch (e) { definirErro(e.message); }
  };

  const salvarNovaApi = async (e) => {
    e.preventDefault();
    definirAdicionando(true);
    definirErro('');
    definirMensagem('');
    try {
      const resp = await clienteApi.adicionarApiPersonalizada(novaApi);
      definirCentral(resp);
      definirNovaApi({ nome: '', categoria: 'inversor', url: '', unidade: 'W', campo_potencia: '', token: '' });
      definirAbrirModalNova(false);
      definirMensagem('Nova API adicionada com sucesso!');
    } catch (err) {
      definirErro(err.message || 'Erro ao salvar API.');
    } finally {
      definirAdicionando(false);
    }
  };

  const urlAtivaUsina = estadoSistema?.config?.url_api_inversor;
  const modoAtual = estadoSistema?.config?.modo_conexao_inversor || 'manual';

  return (
    <div className="view-stack">
      {/* BARRA DE TOPO MINIMALISTA */}
      <div className="integrations-topbar">
        <div className="integrations-summary">
          <span className="live-pulse-badge">
            <i className="live-dot" />
            {central?.total_ativas || 0} integrações ativas
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Modo da usina:{' '}
            <strong>
              {modoAtual === 'api_inversor'
                ? `API do Inversor (${estadoSistema?.config?.provedor_inversor || 'HTTP'})`
                : modoAtual === 'webhook_push'
                ? 'Webhook Local'
                : 'Clima + Manual (sem API de inversor)'}
            </strong>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {aoIrParaAba && (
            <button type="button" className="btn btn-sm" onClick={() => aoIrParaAba('usina')}>
              Trocar modo no Passo 1
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => definirAbrirModalNova((v) => !v)}
          >
            {abrirModalNova ? <X size={14} /> : <Plus size={14} />}
            {abrirModalNova ? 'Fechar formulário' : 'Nova API'}
          </button>
        </div>
      </div>

      {mensagem && (
        <div className="notice-banner teal" role="status">
          <CheckCircle2 size={17} color="var(--neural-teal)" />
          <div>{mensagem}</div>
        </div>
      )}
      {erro && (
        <div className="notice-banner danger" role="alert">
          <AlertTriangle size={17} />
          <div>{erro}</div>
        </div>
      )}

      {/* FORMULÁRIO SOB DEMANDA (SÓ APARECE QUANDO CLICA EM + NOVA API) */}
      {abrirModalNova && (
        <form onSubmit={salvarNovaApi} className="card integration-new-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <h2 className="card-title" style={{ fontSize: 16 }}>Conectar nova API personalizada</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(central?.modelos_conector || []).slice(0, 3).map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  className="mini-preset"
                  onClick={() =>
                    definirNovaApi({
                      nome: mod.nome.split('·')[0].trim(),
                      categoria: 'inversor',
                      url: mod.url,
                      campo_potencia: mod.campo_potencia,
                      unidade: mod.unidade,
                      token: '',
                    })
                  }
                >
                  Preencher: {mod.nome.split('·')[0].trim()}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid-3">
            <div className="field-group">
              <label className="field-label" htmlFor="nova-api-nome">Nome</label>
              <input id="nova-api-nome" className="input" placeholder="Ex.: Inversor Fronius" value={novaApi.nome} onChange={(e) => definirNovaApi({ ...novaApi, nome: e.target.value })} required />
            </div>

            <div className="field-group" style={{ gridColumn: 'span 2' }}>
              <label className="field-label" htmlFor="nova-api-url">URL da API (HTTP/HTTPS)</label>
              <input id="nova-api-url" className="input mono" placeholder="https://..." value={novaApi.url} onChange={(e) => definirNovaApi({ ...novaApi, url: e.target.value })} required />
            </div>
          </div>

          <details className="subtle-details" style={{ marginTop: 10 }}>
            <summary>Opções avançadas (unidade, campo JSON e token)</summary>
            <div className="form-grid-3" style={{ marginTop: 10 }}>
              <div className="field-group">
                <label className="field-label" htmlFor="nova-api-cat">Tipo</label>
                <select id="nova-api-cat" className="select" value={novaApi.categoria} onChange={(e) => definirNovaApi({ ...novaApi, categoria: e.target.value })}>
                  <option value="inversor">Inversor Solar</option>
                  <option value="medidor">Medidor Wi-Fi</option>
                  <option value="clima">Clima</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="nova-api-unid">Unidade</label>
                <select id="nova-api-unid" className="select" value={novaApi.unidade} onChange={(e) => definirNovaApi({ ...novaApi, unidade: e.target.value })}>
                  <option value="W">Watts (W)</option>
                  <option value="kW">Quilowatts (kW)</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="nova-api-campo">Caminho JSON</label>
                <input id="nova-api-campo" className="input mono" placeholder="Automático" value={novaApi.campo_potencia} onChange={(e) => definirNovaApi({ ...novaApi, campo_potencia: e.target.value })} />
              </div>
            </div>
          </details>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-sm" onClick={() => definirAbrirModalNova(false)}>Cancelar</button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={adicionando}>
              {adicionando ? 'Salvando…' : 'Salvar conexão'}
            </button>
          </div>
        </form>
      )}

      {/* SEÇÃO 1: SUAS APIS DE INVERSOR / PERSONALIZADAS (EM DESTAQUE CLEAN) */}
      <div>
        <div className="section-heading-clean">
          <h2>Conectores de inversores e APIs personalizadas</h2>
          <span>Conecte o endereço real do seu inversor ou valide o funcionamento técnico com a API de teste</span>
        </div>

        <div className="test-only-callout" style={{ marginBottom: 14 }} role="note">
          <strong>Importante — API de inversor pré-cadastrada não mostra a realidade:</strong> a integração <strong>SolarNetwork</strong> incluída no projeto serve <strong>exclusivamente a título de teste de código</strong> (lê uma usina pública remota e não reflete a geração real do seu telhado/planta). Na operação real sem inversor próprio integrado via rede, utilize o modo <strong>Clima + Manual</strong>.
        </div>

        <div className="integrations-grid">
          {(central?.apis_personalizadas || []).map((api) => {
            const emUsoNaUsina = modoAtual === 'api_inversor' && urlAtivaUsina === api.url;
            const ehApiDeTeste = (api.url || '').toLowerCase().includes('solarnetwork.net');
            const visual = obterVisualDaApi(api);
            return (
              <article key={api.id} className={`integration-card ${emUsoNaUsina ? 'is-primary-connector' : ''}`}>
                <div className="integration-photo-banner">
                  <img src={visual.foto} alt={api.nome} loading="lazy" />
                  <div className="integration-photo-overlay" />
                  <div className="integration-photo-badges">
                    {ehApiDeTeste && (
                      <span className="integration-dot-badge warn">Só teste · Não é dado real</span>
                    )}
                    <span className={`integration-dot-badge ${api.ativa ? 'on' : 'off'}`}>
                      {emUsoNaUsina ? 'Em uso na usina' : api.ativa ? 'Ativa' : 'Pausada'}
                    </span>
                  </div>
                  <span className="integration-provider-chip">
                    <PlugZap size={12} /> {visual.selo}
                  </span>
                </div>

                <div className="integration-body">
                  <div className="integration-card-head">
                    <span className="integration-icon amber">
                      <PlugZap size={17} />
                    </span>
                    <div className="integration-meta">
                      <div className="integration-title-row">
                        <strong>{api.nome}</strong>
                      </div>
                      <span className="integration-host mono">
                        {extrairDominioCurto(api.url)} · {api.unidade}
                        {ehApiDeTeste ? ' · Planta pública externa de demonstração' : ''}
                      </span>
                    </div>
                  </div>

                  {api.ultimo_teste_em && (
                    <div className={`integration-ping ${api.ultimo_status === 'online' ? 'ok' : 'err'}`}>
                      <span>
                        {api.ultimo_status === 'online'
                          ? `${ehApiDeTeste ? 'Teste HTTP OK' : 'Online'} · ${api.ultima_latencia_ms} ms`
                          : 'Sem resposta'}
                      </span>
                      {api.ultima_potencia_kw !== null && api.ultima_potencia_kw !== undefined && (
                        <strong>
                          {formatarNumero(api.ultima_potencia_kw, 2)} kW{ehApiDeTeste ? ' (teste)' : ''}
                        </strong>
                      )}
                    </div>
                  )}

                  <div className="integration-card-foot">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={testandoId === api.id}
                      onClick={() => testarPersonalizada(api.id)}
                    >
                      <RefreshCw size={13} /> {testandoId === api.id ? 'Testando…' : 'Testar'}
                    </button>

                    {api.categoria === 'inversor' && !emUsoNaUsina && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => usarNoInversor(api.id)}>
                        <Zap size={13} /> Usar na usina
                      </button>
                    )}

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button type="button" className="mini-preset" onClick={() => alternarAtiva(api)}>
                        {api.ativa ? 'Pausar' : 'Ativar'}
                      </button>
                      <button type="button" className="mini-preset" onClick={() => excluirApi(api.id)} aria-label="Remover API" title="Remover">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {!carregando && !central?.apis_personalizadas?.length && (
            <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 24 }}>
              <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)' }}>Nenhuma API personalizada cadastrada.</p>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => definirAbrirModalNova(true)}>
                <Plus size={14} /> Adicionar primeira API
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 2: SERVIÇOS NATIVOS DO HELIONTA (GRADE CLEAN SEM POLUIÇÃO DE URL) */}
      <div>
        <div className="section-heading-clean">
          <h2>Serviços nativos do sistema</h2>
          <span>APIs internas que mantêm o clima, o mapa e os cálculos funcionando mesmo sem inversor conectado</span>
        </div>

        <div className="integrations-grid">
          {(central?.apis_nativas || []).map((api) => {
            const Icone = iconePorCategoria(api.categoria);
            const teste = resultadosNativas[api.id];
            const visual = obterVisualDaApi(api);
            return (
              <article key={api.id} className="integration-card">
                <div className="integration-photo-banner">
                  <img src={visual.foto} alt={api.nome} loading="lazy" />
                  <div className="integration-photo-overlay" />
                  <div className="integration-photo-badges">
                    <span className={`integration-dot-badge ${api.ativa ? 'on' : 'off'}`}>
                      {api.ativa ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <span className="integration-provider-chip">
                    <Icone size={12} /> {visual.selo}
                  </span>
                </div>

                <div className="integration-body">
                  <div className="integration-card-head">
                    <span className="integration-icon">
                      <Icone size={17} />
                    </span>
                    <div className="integration-meta">
                      <div className="integration-title-row">
                        <strong>{api.nome}</strong>
                      </div>
                      <p className="integration-desc">
                        {api.papel}
                        {api.categoria === 'clima' && estadoSistema?.config?.cidade
                          ? ` · Local atual: ${estadoSistema.config.cidade}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  {teste && (
                    <div className={`integration-ping ${teste.ok ? 'ok' : 'err'}`}>
                      <span>{teste.ok ? `Respondendo · ${teste.latencia_ms} ms` : 'Indisponível'}</span>
                      {teste.potencia_kw !== null && teste.potencia_kw !== undefined && (
                        <strong>{formatarNumero(teste.potencia_kw, 2)} kW</strong>
                      )}
                    </div>
                  )}

                  <div className="integration-card-foot">
                    <span className="integration-host mono">{extrairDominioCurto(api.url)}</span>
                    <button
                      type="button"
                      className="mini-preset"
                      style={{ marginLeft: 'auto', padding: '5px 10px', fontSize: 11 }}
                      disabled={testandoId === api.id}
                      onClick={() => testarNativa(api)}
                    >
                      {testandoId === api.id ? 'Verificando…' : 'Verificar sinal'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
