import React, { useEffect, useState } from 'react';
import {
  MapPin as IconeMapa,
  Search as IconeBusca,
  ArrowRight as IconeSeta,
  CheckCircle2 as IconeSucesso,
  ExternalLink as IconeLinkExterno,
  Layers as IconeCamadasMapa,
  PlugZap as IconeConexao,
  RefreshCw as IconeTestar,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';

const MODELOS_API_INVERSOR = [
  {
    id: 'solarnetwork',
    nome: 'SolarNetwork · SÓ TESTE TÉCNICO (não reflete sua usina real)',
    url: 'https://data.solarnetwork.net/solarquery/api/v1/pub/datum/mostRecent?nodeId=1000&sourceId=%2F0145%2FS1%2FG1%2FINV%2F2',
    campo: 'data.results.0.watts',
    unidade: 'W',
  },
  {
    id: 'fronius',
    nome: 'Fronius Solar API (Rede Local Wi-Fi)',
    url: 'http://192.168.1.100/solar_api/v1/GetInverterRealtimeData.cgi?Scope=Device&DeviceId=1&DataCollection=CommonInverterData',
    campo: 'Body.Data.PAC.Value',
    unidade: 'W',
  },
  {
    id: 'shelly',
    nome: 'Medidor Inteligente Shelly / Tasmota / ESP32',
    url: 'http://192.168.1.120/emeter/0',
    campo: 'power',
    unidade: 'W',
  },
  {
    id: 'custom',
    nome: 'Outra API / Software (Growatt, Solarman, Huawei, WEG)',
    url: '',
    campo: 'potencia_kw',
    unidade: 'kW',
  },
];

const ORIENTACOES_TELHADO = [
  { rotulo: 'Norte (0°)', graus: 0 },
  { rotulo: 'Nordeste (45°)', graus: 45 },
  { rotulo: 'Leste (90°)', graus: 90 },
  { rotulo: 'Sudeste (135°)', graus: 135 },
  { rotulo: 'Sul (180°)', graus: 180 },
  { rotulo: 'Sudoeste (225°)', graus: 225 },
  { rotulo: 'Oeste (270°)', graus: 270 },
  { rotulo: 'Noroeste (315°)', graus: 315 },
];

const PERFIS_RAPIDOS = [
  {
    id: 'residencial',
    titulo: 'Residencial',
    detalhe: '5,5 kWp · 10 placas',
    dados: { nome: 'Sistema Solar Residencial', quantidade_placas: 10, potencia_placa_wp: 550, inversor_kw: 5.0, inclinacao_graus: 10, azimute_graus: 0 },
  },
  {
    id: 'comercial',
    titulo: 'Comércio',
    detalhe: '19,8 kWp · 36 placas',
    dados: { nome: 'Usina Solar Comercial', quantidade_placas: 36, potencia_placa_wp: 550, inversor_kw: 15.0, inclinacao_graus: 10, azimute_graus: 0 },
  },
  {
    id: 'rural',
    titulo: 'Indústria / Rural',
    detalhe: '49,5 kWp · 90 placas',
    dados: { nome: 'Planta Solar Industrial / Rural', quantidade_placas: 90, potencia_placa_wp: 550, inversor_kw: 40.0, inclinacao_graus: 12, azimute_graus: 0 },
  },
  {
    id: 'usina',
    titulo: 'Usina 99 kWp',
    detalhe: '99,0 kWp · 165 placas',
    dados: { nome: 'Usina Fotovoltaica 99 kWp', quantidade_placas: 165, potencia_placa_wp: 600, inversor_kw: 75.0, inclinacao_graus: 12, azimute_graus: 0 },
  },
];

export default function PainelMinhaUsina({ estadoSistema, aoSalvarUsina, aoIrParaAba }) {
  const [formulario, definirFormulario] = useState({
    nome: 'Usina Solar Principal',
    cidade: 'Igarassu, Pernambuco',
    latitude: -7.8342,
    longitude: -34.9064,
    quantidade_placas: 10,
    potencia_placa_wp: 550,
    modelo_placa: 'Monocristalino Half-Cell 550 Wp',
    marca_inversor: 'Inversor On-Grid 5 kW',
    inversor_kw: 5.0,
    inclinacao_graus: 10,
    azimute_graus: 0,
    eficiencia_inversor: 0.96,
    coeficiente_termico: -0.0035,
    noct_c: 45,
    perdas_dc: 0.08,
    albedo: 0.2,
    tarifa_energia_rs: 0.92,
    modo_conexao_inversor: 'api_inversor',
    provedor_inversor: 'SolarNetwork · API Real Online',
    url_api_inversor: 'https://data.solarnetwork.net/solarquery/api/v1/pub/datum/mostRecent?nodeId=1000&sourceId=%2F0145%2FS1%2FG1%2FINV%2F2',
    token_api_inversor: '',
    campo_potencia_json: 'data.results.0.watts',
    unidade_potencia_api: 'W',
  });

  const [termoCidade, definirTermoCidade] = useState('');
  const [cidadesEncontradas, definirCidadesEncontradas] = useState([]);
  const [buscandoCidade, definirBuscandoCidade] = useState(false);
  const [avisoCidade, definirAvisoCidade] = useState('');
  const [modoMapa, definirModoMapa] = useState('mapa');
  const [coordsMapa, definirCoordsMapa] = useState({ lat: -7.8342, lon: -34.9064 });
  const [testandoApi, definirTestandoApi] = useState(false);
  const [resultadoTesteApi, definirResultadoTesteApi] = useState(null);
  const [salvando, definirSalvando] = useState(false);
  const [erroSalvar, definirErroSalvar] = useState('');
  const [salvoOk, definirSalvoOk] = useState(false);

  useEffect(() => {
    if (estadoSistema?.config) {
      definirFormulario((atual) => ({ ...atual, ...estadoSistema.config }));
      if (Number.isFinite(Number(estadoSistema.config.latitude)) && Number.isFinite(Number(estadoSistema.config.longitude))) {
        definirCoordsMapa({
          lat: Number(estadoSistema.config.latitude),
          lon: Number(estadoSistema.config.longitude),
        });
      }
    }
  }, [estadoSistema]);

  useEffect(() => {
    const latNum = Number(formulario.latitude);
    const lonNum = Number(formulario.longitude);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return undefined;
    const timer = setTimeout(() => definirCoordsMapa({ lat: latNum, lon: lonNum }), 320);
    return () => clearTimeout(timer);
  }, [formulario.latitude, formulario.longitude]);

  const pesquisarLocalizacao = async (e) => {
    e?.preventDefault();
    if (!termoCidade.trim()) { definirAvisoCidade('Digite o nome de uma cidade.'); return; }
    definirAvisoCidade('');
    definirBuscandoCidade(true);
    try {
      const resposta = await clienteApi.pesquisarCidades(termoCidade);
      definirCidadesEncontradas(resposta.resultados || []);
      if (!resposta.resultados?.length) definirAvisoCidade('Cidade não encontrada.');
    } catch {
      definirAvisoCidade('Não foi possível buscar agora.');
    } finally {
      definirBuscandoCidade(false);
    }
  };

  const selecionarCidade = (item) => {
    const nomeCompleto = item.estado ? `${item.nome}, ${item.estado}` : item.nome;
    definirFormulario((atual) => ({
      ...atual,
      cidade: nomeCompleto,
      latitude: item.latitude,
      longitude: item.longitude,
    }));
    definirCoordsMapa({ lat: Number(item.latitude), lon: Number(item.longitude) });
    definirCidadesEncontradas([]);
    definirTermoCidade('');
  };

  const testarConexaoInversor = async () => {
    definirTestandoApi(true);
    definirResultadoTesteApi(null);
    try {
      const res = await clienteApi.testarUrlApi({
        url: formulario.url_api_inversor,
        token: formulario.token_api_inversor || '',
        campo_potencia: formulario.campo_potencia_json || '',
        unidade: formulario.unidade_potencia_api || 'W',
      });
      definirResultadoTesteApi(res);
    } catch (err) {
      definirResultadoTesteApi({ ok: false, mensagem: err.message || 'Erro ao testar API.' });
    } finally {
      definirTestandoApi(false);
    }
  };

  const salvarEAvancar = async (e) => {
    e.preventDefault();
    definirSalvando(true);
    definirErroSalvar('');
    definirSalvoOk(false);
    try {
      await clienteApi.salvarConfiguracaoUsina(formulario);
      try { localStorage.setItem('helionta-passo1-salvo', 'sim'); } catch { /* opcional */ }
      if (aoSalvarUsina) await aoSalvarUsina();
      definirSalvoOk(true);
      if (aoIrParaAba) aoIrParaAba('monitoramento');
    } catch (erro) {
      definirErroSalvar(erro.message || 'Erro ao salvar.');
    } finally {
      definirSalvando(false);
    }
  };

  const potenciaTotalKwp = (Number(formulario.quantidade_placas || 0) * Number(formulario.potencia_placa_wp || 0)) / 1000;

  return (
    <form onSubmit={salvarEAvancar} className="view-stack">
      {/* ESCOLHA DE PORTE EM 1 CLIQUE */}
      <div className="preset-cards-grid">
        {PERFIS_RAPIDOS.map((perfil) => {
          const selecionado =
            Number(formulario.quantidade_placas) === perfil.dados.quantidade_placas &&
            Number(formulario.potencia_placa_wp) === perfil.dados.potencia_placa_wp;
          return (
            <button
              key={perfil.id}
              type="button"
              className={`preset-card ${selecionado ? 'is-selected' : ''}`}
              aria-pressed={selecionado}
              onClick={() => definirFormulario((atual) => ({ ...atual, ...perfil.dados }))}
            >
              <strong>{perfil.titulo}</strong>
              <span>{perfil.detalhe}</span>
            </button>
          );
        })}
      </div>

      {/* BLOCO PRINCIPAL ENXUTO: LOCAL + MAPA LADO A LADO */}
      <section className="card">
        <div className="split-equal" style={{ alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field-group">
              <label className="field-label" htmlFor="busca-cidade">Cidade da usina</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="busca-cidade"
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Buscar outra cidade (ex.: Recife, São Paulo)…"
                  value={termoCidade}
                  onChange={(e) => definirTermoCidade(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      pesquisarLocalizacao();
                    }
                  }}
                />
                <button type="button" className="btn" onClick={pesquisarLocalizacao} disabled={buscandoCidade}>
                  <IconeBusca size={15} />
                  {buscandoCidade ? '…' : 'Buscar'}
                </button>
              </div>
              {avisoCidade && <span className="search-feedback">{avisoCidade}</span>}
              {cidadesEncontradas.length > 0 && (
                <div className="city-dropdown" style={{ marginBottom: 0 }}>
                  {cidadesEncontradas.map((cid, idx) => (
                    <button key={`${cid.nome}-${idx}`} type="button" className="city-option" onClick={() => selecionarCidade(cid)}>
                      <span><strong>{cid.nome}</strong> {cid.estado ? `— ${cid.estado}` : ''}</span>
                      <span className="mono" style={{ color: 'var(--neural-teal)' }}>Escolher</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="split-equal" style={{ gap: 12 }}>
              <div className="field-group">
                <label className="field-label" htmlFor="usina-nome">Nome de identificação</label>
                <input id="usina-nome" className="input" value={formulario.nome} onChange={(e) => definirFormulario({ ...formulario, nome: e.target.value })} />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="usina-tarifa">Tarifa (R$/kWh)</label>
                <input id="usina-tarifa" type="number" step="0.01" min="0" className="input" value={formulario.tarifa_energia_rs} onChange={(e) => definirFormulario({ ...formulario, tarifa_energia_rs: Number(e.target.value) })} />
              </div>
            </div>

            <div className="split-equal" style={{ gap: 12 }}>
              <div className="field-group">
                <label className="field-label" htmlFor="usina-qtd-placas">Placas (unidades)</label>
                <input id="usina-qtd-placas" type="number" min="1" max="50000" className="input" value={formulario.quantidade_placas} onChange={(e) => definirFormulario({ ...formulario, quantidade_placas: Number(e.target.value) })} />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="usina-wp">Potência da placa (Wp)</label>
                <input id="usina-wp" type="number" min="50" max="1000" className="input" value={formulario.potencia_placa_wp} onChange={(e) => definirFormulario({ ...formulario, potencia_placa_wp: Number(e.target.value) })} />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="usina-inv">Inversor (kW)</label>
                <input id="usina-inv" type="number" step="0.1" min="0.3" className="input" value={formulario.inversor_kw} onChange={(e) => definirFormulario({ ...formulario, inversor_kw: Number(e.target.value) })} />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="usina-direcao">Direção</label>
                <select id="usina-direcao" className="select" value={formulario.azimute_graus} onChange={(e) => definirFormulario({ ...formulario, azimute_graus: Number(e.target.value) })}>
                  {ORIENTACOES_TELHADO.map((op) => (
                    <option key={op.graus} value={op.graus}>{op.rotulo}</option>
                  ))}
                </select>
              </div>
            </div>

            <details className="manual-location" style={{ margin: 0 }}>
              <summary>Mais opções (inclinação e coordenadas exatas)</summary>
              <div className="form-grid-3" style={{ paddingBottom: 12 }}>
                <div className="field-group">
                  <label className="field-label" htmlFor="usina-inc">Inclinação (°)</label>
                  <input id="usina-inc" type="number" min="0" max="90" className="input" value={formulario.inclinacao_graus} onChange={(e) => definirFormulario({ ...formulario, inclinacao_graus: Number(e.target.value) })} />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="usina-lat">Latitude (°)</label>
                  <input id="usina-lat" type="number" step="0.0001" className="input" value={formulario.latitude} onChange={(e) => definirFormulario({ ...formulario, latitude: Number(e.target.value) })} />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="usina-lon">Longitude (°)</label>
                  <input id="usina-lon" type="number" step="0.0001" className="input" value={formulario.longitude} onChange={(e) => definirFormulario({ ...formulario, longitude: Number(e.target.value) })} />
                </div>
              </div>
            </details>
          </div>

          {/* GOOGLE MAPS LIMPO */}
          <div className="solar-map-box">
            <div className="solar-map-toolbar">
              <span className="solar-map-coords">
                <IconeMapa size={14} color="var(--neural-teal)" aria-hidden="true" />
                <strong>{formulario.cidade}</strong>
              </span>

              <div className="solar-map-actions">
                <button type="button" className="mini-preset" aria-pressed={modoMapa === 'mapa'} onClick={() => definirModoMapa('mapa')}>
                  Mapa
                </button>
                <button type="button" className="mini-preset" aria-pressed={modoMapa === 'satelite'} onClick={() => definirModoMapa('satelite')}>
                  <IconeCamadasMapa size={11} style={{ marginRight: 4 }} aria-hidden="true" />
                  Satélite
                </button>
                <a
                  className="mini-preset"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordsMapa.lat},${coordsMapa.lon}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Maps <IconeLinkExterno size={10} style={{ marginLeft: 3 }} aria-hidden="true" />
                </a>
              </div>
            </div>

            <iframe
              title={`Google Maps — ${formulario.cidade}`}
              className="solar-map-frame"
              style={{ height: 310 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(`${coordsMapa.lat},${coordsMapa.lon}`)}&t=${modoMapa === 'satelite' ? 'h' : 'm'}&z=${modoMapa === 'satelite' ? 17 : 14}&hl=pt-BR&output=embed`}
            />
          </div>
        </div>

        {/* BLOCO CLEAN DE MODO DE OPERAÇÃO (CLIMA+MANUAL vs API DO INVERSOR) */}
        <div className="connection-selector-section">
          <div className="connection-selector-head">
            <span className="field-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Como você vai acompanhar sua usina?
            </span>
            {aoIrParaAba && (
              <button type="button" className="link-subtle-btn" onClick={() => aoIrParaAba('apis')}>
                Ver painel de APIs →
              </button>
            )}
          </div>

          <div className="mode-cards-grid" role="radiogroup" aria-label="Modo de acompanhamento da usina">
            <button
              type="button"
              role="radio"
              aria-checked={formulario.modo_conexao_inversor === 'manual'}
              className={`mode-choice-card ${formulario.modo_conexao_inversor === 'manual' ? 'is-active' : ''}`}
              onClick={() => {
                definirFormulario({ ...formulario, modo_conexao_inversor: 'manual' });
                definirResultadoTesteApi(null);
              }}
            >
              <div className="mode-choice-top">
                <strong>Clima + Manual</strong>
                <span className="mode-tag">Sem API de inversor</span>
              </div>
              <p>Calcula tudo pelo sol ao vivo da sua cidade; você digita os kWh gerados quando quiser comparar.</p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={formulario.modo_conexao_inversor === 'api_inversor'}
              className={`mode-choice-card ${formulario.modo_conexao_inversor === 'api_inversor' ? 'is-active' : ''}`}
              onClick={() => definirFormulario({ ...formulario, modo_conexao_inversor: 'api_inversor' })}
            >
              <div className="mode-choice-top">
                <strong>API do Inversor</strong>
                <span className="mode-tag">Automático</span>
              </div>
              <p>Busca a potência direto do software/API do inversor (SolarNetwork, Fronius, Shelly ou nuvem).</p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={formulario.modo_conexao_inversor === 'webhook_push'}
              className={`mode-choice-card ${formulario.modo_conexao_inversor === 'webhook_push' ? 'is-active' : ''}`}
              onClick={() => {
                definirFormulario({ ...formulario, modo_conexao_inversor: 'webhook_push' });
                definirResultadoTesteApi(null);
              }}
            >
              <div className="mode-choice-top">
                <strong>Webhook Local</strong>
                <span className="mode-tag">Home Assistant</span>
              </div>
              <p>Seu medidor Wi-Fi, ESP32 ou automação envia as leituras direto para o Helionta.</p>
            </button>
          </div>

          {formulario.modo_conexao_inversor === 'manual' && (
            <div className="mode-explain-strip">
              <span><strong>Tempo real:</strong> estima kW agora pelo sol atual</span>
              <span>·</span>
              <span><strong>Previsão 24h:</strong> 100% ativa via Open-Meteo</span>
              <span>·</span>
              <span><strong>Saúde das placas:</strong> basta lançar o kWh do dia ou planilha</span>
            </div>
          )}

          {formulario.modo_conexao_inversor === 'api_inversor' && (
            <div className="mode-config-inline">
              {(formulario.url_api_inversor || '').toLowerCase().includes('solarnetwork.net') && (
                <div className="test-only-callout" role="note">
                  <strong>Aviso importante — API apenas para título de teste:</strong> este conector SolarNetwork consulta um inversor público externo só para testar a comunicação no código e <strong>não mostra a geração real da sua usina</strong>. Caso não tenha o link/IP real do seu inversor, escolha <strong>Clima + Manual</strong> acima.
                </div>
              )}

              <div className="mode-config-row">
                <select
                  aria-label="Conector do inversor"
                  className="select"
                  style={{ flex: '1 1 240px' }}
                  value={MODELOS_API_INVERSOR.find((m) => m.url === formulario.url_api_inversor)?.id || 'custom'}
                  onChange={(e) => {
                    const m = MODELOS_API_INVERSOR.find((item) => item.id === e.target.value);
                    if (m) {
                      definirFormulario((atual) => ({
                        ...atual,
                        provedor_inversor: m.nome.split('·')[0].trim(),
                        url_api_inversor: m.url || atual.url_api_inversor,
                        campo_potencia_json: m.campo,
                        unidade_potencia_api: m.unidade,
                      }));
                      definirResultadoTesteApi(null);
                    }
                  }}
                >
                  {MODELOS_API_INVERSOR.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>

                <input
                  aria-label="URL da API do inversor"
                  className="input mono"
                  style={{ flex: '2 1 280px', fontSize: 12 }}
                  placeholder="https://endereco-da-api-do-inversor..."
                  value={formulario.url_api_inversor || ''}
                  onChange={(e) => definirFormulario({ ...formulario, url_api_inversor: e.target.value })}
                />

                <button type="button" className="btn" disabled={testandoApi || !formulario.url_api_inversor} onClick={testarConexaoInversor}>
                  <IconeTestar size={14} /> {testandoApi ? 'Testando…' : 'Testar conexão'}
                </button>
              </div>

              <details className="subtle-details">
                <summary>Credenciais e mapeamento JSON (opcional)</summary>
                <div className="form-grid-3" style={{ marginTop: 10 }}>
                  <div className="field-group">
                    <label className="field-label" htmlFor="api-campo-json">Campo JSON</label>
                    <input id="api-campo-json" className="input mono" value={formulario.campo_potencia_json || ''} onChange={(e) => definirFormulario({ ...formulario, campo_potencia_json: e.target.value })} />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="api-unidade">Unidade</label>
                    <select id="api-unidade" className="select" value={formulario.unidade_potencia_api || 'W'} onChange={(e) => definirFormulario({ ...formulario, unidade_potencia_api: e.target.value })}>
                      <option value="W">Watts (W)</option>
                      <option value="kW">Quilowatts (kW)</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="api-token">Token / API Key</label>
                    <input id="api-token" type="password" className="input mono" placeholder="Opcional" value={formulario.token_api_inversor || ''} onChange={(e) => definirFormulario({ ...formulario, token_api_inversor: e.target.value })} />
                  </div>
                </div>
              </details>

              {resultadoTesteApi && (
                <div className={`api-test-result ${resultadoTesteApi.ok ? 'is-ok' : 'is-err'}`}>
                  {resultadoTesteApi.mensagem}
                </div>
              )}
            </div>
          )}

          {formulario.modo_conexao_inversor === 'webhook_push' && (
            <div className="mode-explain-strip mono" style={{ fontSize: 11.5 }}>
              Endpoint receptor ativo: <strong>POST http://127.0.0.1:8000/api/tempo-real/leitura</strong> · JSON: <code>{'{"potencia_kw": 3.5}'}</code>
            </div>
          )}
        </div>

        {/* BARRA INFERIOR OBJETIVA */}
        <div className="step1-footer-bar">
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Potência total configurada: </span>
            <strong className="mono" style={{ fontSize: 18 }}>{formatarNumero(potenciaTotalKwp, 2)} kWp</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              (Inversor {formatarNumero(formulario.inversor_kw, 1)} kW)
            </span>
          </div>

          <button type="submit" className="btn btn-primary next-step-cta" disabled={salvando}>
            <span>{salvando ? 'Salvando…' : 'Salvar e ver energia em tempo real'}</span>
            <IconeSeta size={16} />
          </button>
        </div>

        {salvoOk && (
          <div className="notice-banner teal" role="status" style={{ marginTop: 12 }}>
            <IconeSucesso size={18} color="var(--neural-teal)" />
            <div>Configuração salva!</div>
          </div>
        )}
        {erroSalvar && (
          <div className="notice-banner danger" role="alert" style={{ marginTop: 12 }}>
            <div>{erroSalvar}</div>
          </div>
        )}
      </section>
    </form>
  );
}
