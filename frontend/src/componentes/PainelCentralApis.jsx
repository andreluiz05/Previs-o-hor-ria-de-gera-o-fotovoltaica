import React, { useEffect, useState } from 'react';
import {
  PlugZap,
  Globe,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Power,
  Zap,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';

export default function PainelCentralApis({ aoAtualizarConfig, aoIrParaAba }) {
  const [central, definirCentral] = useState(null);
  const [carregando, definirCarregando] = useState(true);
  const [testandoId, definirTestandoId] = useState('');
  const [resultadosNativas, definirResultadosNativas] = useState({});
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
      definirErro(e.message || 'Não foi possível carregar as APIs.');
    } finally {
      definirCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

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
      definirMensagem('API definida como conector principal do seu inversor!');
    } catch (e) {
      definirErro(e.message);
    }
  };

  const alternarAtiva = async (api) => {
    try {
      definirCentral(await clienteApi.alternarEstadoApi(api.id, !api.ativa));
    } catch (e) {
      definirErro(e.message);
    }
  };

  const excluirApi = async (id) => {
    try {
      definirCentral(await clienteApi.excluirApiPersonalizada(id));
    } catch (e) {
      definirErro(e.message);
    }
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
      definirMensagem('Nova API personalizada cadastrada e ativada!');
    } catch (err) {
      definirErro(err.message || 'Erro ao adicionar API.');
    } finally {
      definirAdicionando(false);
    }
  };

  const preencherModelo = (mod) => {
    definirNovaApi((atual) => ({
      ...atual,
      nome: mod.nome,
      categoria: 'inversor',
      url: mod.url,
      campo_potencia: mod.campo_potencia,
      unidade: mod.unidade,
    }));
  };

  return (
    <div className="view-stack">
      {mensagem && (
        <div className="notice-banner teal" role="status">
          <CheckCircle2 size={18} color="var(--neural-teal)" />
          <div>{mensagem}</div>
        </div>
      )}
      {erro && (
        <div className="notice-banner danger" role="alert">
          <AlertTriangle size={18} />
          <div>{erro}</div>
        </div>
      )}

      {/* BLOCO 1: APIS NATIVAS DO SISTEMA */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 14 }}>
          <div>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={19} color="var(--neural-teal)" />
              APIs nativas do projeto ({central?.apis_nativas?.length || 0})
            </h2>
            <p className="card-subtitle">Serviços integrados para clima ao vivo, geolocalização, histórico e recepção do inversor.</p>
          </div>
          {aoIrParaAba && (
            <button type="button" className="btn btn-sm" onClick={() => aoIrParaAba('monitoramento')}>
              <Zap size={14} /> Abrir Tempo real
            </button>
          )}
        </div>

        <div className="api-list-grid">
          {(central?.apis_nativas || []).map((api) => {
            const teste = resultadosNativas[api.id];
            return (
              <div key={api.id} className="api-item-card">
                <div className="api-item-top">
                  <div>
                    <span className={`status-pill ${api.ativa ? 'real' : ''}`}>
                      {api.ativa ? '● Ativa' : '○ Desativada'}
                    </span>
                    <strong className="api-item-title">{api.nome}</strong>
                    <p className="api-item-desc">{api.papel}</p>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {api.editavel && aoIrParaAba && (
                      <button type="button" className="btn btn-sm" onClick={() => aoIrParaAba('usina')}>
                        Editar no Passo 1
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={testandoId === api.id}
                      onClick={() => testarNativa(api)}
                    >
                      <RefreshCw size={13} /> {testandoId === api.id ? 'Testando…' : 'Testar'}
                    </button>
                  </div>
                </div>

                <div className="api-item-url mono">{api.endpoint_post || api.url}</div>

                {teste && (
                  <div className={`api-test-result ${teste.ok ? 'is-ok' : 'is-err'}`}>
                    {teste.mensagem}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* BLOCO 2: APIS PERSONALIZADAS E DE INVERSORES */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 14 }}>
          <div>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlugZap size={19} color="var(--solar-amber)" />
              APIs personalizadas e de inversores ({central?.apis_personalizadas?.length || 0})
            </h2>
            <p className="card-subtitle">
              Gerencie APIs próprias ou conectores de inversores. A API real da <strong>SolarNetwork</strong> já está incluída abaixo para você testar no código agora mesmo.
            </p>
          </div>
        </div>

        <div className="api-list-grid" style={{ marginBottom: 20 }}>
          {(central?.apis_personalizadas || []).map((api) => (
            <div key={api.id} className="api-item-card">
              <div className="api-item-top">
                <div>
                  <span className={`status-pill ${api.ativa ? 'real' : ''}`}>
                    {api.ativa ? '● Ativa' : '○ Pausada'}
                  </span>
                  <strong className="api-item-title">{api.nome}</strong>
                  <p className="api-item-desc">
                    Tipo: <strong>{api.categoria}</strong> · Unidade: <span className="mono">{api.unidade}</span>
                    {api.campo_potencia ? <> · Campo JSON: <code className="mono">{api.campo_potencia}</code></> : null}
                    {api.possui_token ? <> · Token: <span className="mono">{api.token_mascarado}</span></> : null}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={testandoId === api.id}
                    onClick={() => testarPersonalizada(api.id)}
                  >
                    <RefreshCw size={13} /> {testandoId === api.id ? 'Consultando…' : 'Testar API'}
                  </button>
                  {api.categoria === 'inversor' && (
                    <button type="button" className="btn btn-sm" onClick={() => usarNoInversor(api.id)}>
                      <Zap size={13} /> Usar na minha usina
                    </button>
                  )}
                  <button type="button" className="btn btn-sm" onClick={() => alternarAtiva(api)} title="Ativar ou pausar">
                    <Power size={13} /> {api.ativa ? 'Pausar' : 'Ativar'}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => excluirApi(api.id)} title="Excluir API">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="api-item-url mono">{api.url}</div>

              {api.ultimo_teste_em && (
                <div className={`api-test-result ${api.ultimo_status === 'online' ? 'is-ok' : 'is-err'}`}>
                  Último teste às {api.ultimo_teste_em}: {api.ultimo_status === 'online' ? 'Online' : 'Falha'} ({api.ultima_latencia_ms} ms)
                  {api.ultima_potencia_kw !== null && api.ultima_potencia_kw !== undefined && (
                    <> · Potência lida: <strong>{formatarNumero(api.ultima_potencia_kw, 3)} kW</strong></>
                  )}
                </div>
              )}
            </div>
          ))}

          {!carregando && !central?.apis_personalizadas?.length && (
            <div className="subpanel" style={{ textAlign: 'center' }}>Nenhuma API personalizada cadastrada.</div>
          )}
        </div>

        {/* FORMULÁRIO SIMPLES PARA CADASTRAR NOVA API */}
        <form onSubmit={salvarNovaApi} className="subpanel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <strong style={{ fontSize: 14 }}>Adicionar nova API personalizada</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(central?.modelos_conector || []).slice(0, 3).map((mod) => (
                <button key={mod.id} type="button" className="mini-preset" onClick={() => preencherModelo(mod)}>
                  Modelo: {mod.nome.split('·')[0].trim()}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid-3">
            <div className="field-group">
              <label className="field-label" htmlFor="nova-api-nome">Nome da API</label>
              <input id="nova-api-nome" className="input" placeholder="Ex.: Inversor Fronius Garagem" value={novaApi.nome} onChange={(e) => definirNovaApi({ ...novaApi, nome: e.target.value })} required />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="nova-api-cat">Categoria</label>
              <select id="nova-api-cat" className="select" value={novaApi.categoria} onChange={(e) => definirNovaApi({ ...novaApi, categoria: e.target.value })}>
                <option value="inversor">Inversor Solar</option>
                <option value="medidor">Medidor Inteligente</option>
                <option value="clima">Estação / Clima</option>
                <option value="outro">Outra integração</option>
              </select>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="nova-api-unid">Unidade de potência</label>
              <select id="nova-api-unid" className="select" value={novaApi.unidade} onChange={(e) => definirNovaApi({ ...novaApi, unidade: e.target.value })}>
                <option value="W">Watts (W → converte p/ kW)</option>
                <option value="kW">Quilowatts (kW)</option>
              </select>
            </div>
          </div>

          <div className="form-grid-3" style={{ marginTop: 12 }}>
            <div className="field-group" style={{ gridColumn: 'span 2' }}>
              <label className="field-label" htmlFor="nova-api-url">URL HTTP/JSON da API</label>
              <input id="nova-api-url" className="input mono" placeholder="https://..." value={novaApi.url} onChange={(e) => definirNovaApi({ ...novaApi, url: e.target.value })} required />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="nova-api-campo">Campo JSON (opcional)</label>
              <input id="nova-api-campo" className="input mono" placeholder="Ex.: Body.Data.PAC.Value" value={novaApi.campo_potencia} onChange={(e) => definirNovaApi({ ...novaApi, campo_potencia: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
            <div className="field-group" style={{ flex: 1, minWidth: 200 }}>
              <label className="field-label" htmlFor="nova-api-token">Token / API Key (opcional)</label>
              <input id="nova-api-token" type="password" className="input mono" placeholder="Bearer token se exigido pela API" value={novaApi.token} onChange={(e) => definirNovaApi({ ...novaApi, token: e.target.value })} />
            </div>

            <button type="submit" className="btn btn-primary" disabled={adicionando}>
              <Plus size={15} /> {adicionando ? 'Adicionando…' : 'Cadastrar API'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
