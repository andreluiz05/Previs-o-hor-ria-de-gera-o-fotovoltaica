import React, { useEffect, useState } from 'react';
import {
  CloudSun,
  MapPin,
  Search,
  Layers,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';

const ATALHOS_LOCAIS = [
  { rotulo: 'Igarassu, PE', cidade: 'Igarassu, Pernambuco', latitude: -7.8342, longitude: -34.9064 },
  { rotulo: 'Boa Viagem, Recife', cidade: 'Boa Viagem, Recife - PE', latitude: -8.1195, longitude: -34.8988 },
  { rotulo: 'Petrolina, PE', cidade: 'Petrolina, Pernambuco', latitude: -9.3891, longitude: -40.503 },
  { rotulo: 'Av. Paulista, SP', cidade: 'Avenida Paulista, São Paulo - SP', latitude: -23.5614, longitude: -46.6559 },
  { rotulo: 'Fortaleza, CE', cidade: 'Fortaleza, Ceará', latitude: -3.7319, longitude: -38.5267 },
];

export default function SeletorLocalMapaClima({
  estadoSistema,
  aoLocalAtualizado,
  alturaMapa = 250,
  titulo = 'API de Clima e Localização (Open-Meteo + Google Maps)',
  subtitulo = 'Busque qualquer rua, bairro, CEP ou cidade para mudar o ponto meteorológico consultado pela API de Clima.',
}) {
  const cfg = estadoSistema?.config || {};
  const [termoBusca, definirTermoBusca] = useState('');
  const [resultados, definirResultados] = useState([]);
  const [buscando, definirBuscando] = useState(false);
  const [salvandoLocal, definirSalvandoLocal] = useState(false);
  const [modoMapa, definirModoMapa] = useState('mapa');
  const [aviso, definirAviso] = useState('');
  const [climaAoVivo, definirClimaAoVivo] = useState(null);

  const [localAtivo, definirLocalAtivo] = useState({
    cidade: cfg.cidade || 'Igarassu, Pernambuco',
    latitude: Number(cfg.latitude ?? -7.8342),
    longitude: Number(cfg.longitude ?? -34.9064),
  });

  const [latManual, definirLatManual] = useState(String(cfg.latitude ?? -7.8342));
  const [lonManual, definirLonManual] = useState(String(cfg.longitude ?? -34.9064));

  useEffect(() => {
    if (cfg.latitude !== undefined && cfg.longitude !== undefined) {
      definirLocalAtivo({
        cidade: cfg.cidade || 'Igarassu, Pernambuco',
        latitude: Number(cfg.latitude),
        longitude: Number(cfg.longitude),
      });
      definirLatManual(String(cfg.latitude));
      definirLonManual(String(cfg.longitude));
    }
  }, [cfg.cidade, cfg.latitude, cfg.longitude]);

  const pesquisarEndereco = async (e) => {
    e?.preventDefault();
    if (!termoBusca.trim()) {
      definirAviso('Digite um endereço, bairro, CEP ou cidade.');
      return;
    }
    definirBuscando(true);
    definirAviso('');
    try {
      const resp = await clienteApi.pesquisarCidades(termoBusca);
      definirResultados(resp.resultados || []);
      if (!resp.resultados?.length) {
        definirAviso('Endereço não encontrado. Tente incluir cidade ou estado.');
      }
    } catch {
      definirAviso('Não foi possível consultar endereços agora.');
    } finally {
      definirBuscando(false);
    }
  };

  const aplicarNovoLocal = async ({ cidade, latitude, longitude }) => {
    definirSalvandoLocal(true);
    definirAviso('');
    try {
      const resp = await clienteApi.atualizarLocalApiClima({
        cidade,
        latitude: Number(latitude),
        longitude: Number(longitude),
      });
      definirLocalAtivo({
        cidade: resp.config.cidade,
        latitude: Number(resp.config.latitude),
        longitude: Number(resp.config.longitude),
      });
      definirLatManual(String(resp.config.latitude));
      definirLonManual(String(resp.config.longitude));
      definirClimaAoVivo(resp.clima_atual || null);
      definirResultados([]);
      definirTermoBusca('');
      if (aoLocalAtualizado) await aoLocalAtualizado(resp);
    } catch (err) {
      definirAviso(err.message || 'Erro ao atualizar localização da API de Clima.');
    } finally {
      definirSalvandoLocal(false);
    }
  };

  const zoomMapa = modoMapa === 'satelite' ? 17 : localAtivo.cidade.includes(',') ? 15 : 14;

  return (
    <section className="card weather-geo-card">
      <div className="weather-geo-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="integration-icon">
            <CloudSun size={19} />
          </span>
          <div>
            <h2 className="card-title" style={{ fontSize: 16 }}>{titulo}</h2>
            <p className="card-subtitle" style={{ marginTop: 2 }}>{subtitulo}</p>
          </div>
        </div>

        <span className="integration-dot-badge on">
          api.open-meteo.com · Ativa
        </span>
      </div>

      <div className="split-equal" style={{ alignItems: 'start', marginTop: 14 }}>
        {/* COLUNA ESQUERDA: BUSCA DE ENDEREÇO + ATALHOS + LEITURA AO VIVO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field-group">
            <label className="field-label" htmlFor="busca-clima-endereco">
              Mudar endereço, bairro, CEP ou cidade
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="busca-clima-endereco"
                className="input"
                style={{ flex: 1 }}
                placeholder="Ex.: Av. Boa Viagem, Recife · Petrolina · Av. Paulista, SP…"
                value={termoBusca}
                onChange={(e) => definirTermoBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    pesquisarEndereco();
                  }
                }}
              />
              <button type="button" className="btn btn-primary" disabled={buscando || salvandoLocal} onClick={pesquisarEndereco}>
                <Search size={15} /> {buscando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>

            {aviso && <span className="search-feedback">{aviso}</span>}

            {resultados.length > 0 && (
              <div className="city-dropdown" style={{ marginTop: 6, marginBottom: 0 }}>
                {resultados.map((item, idx) => {
                  const nomeCompleto = item.estado ? `${item.nome}, ${item.estado}` : item.nome;
                  return (
                    <button
                      key={`${item.latitude}-${item.longitude}-${idx}`}
                      type="button"
                      className="city-option"
                      disabled={salvandoLocal}
                      onClick={() =>
                        aplicarNovoLocal({
                          cidade: nomeCompleto,
                          latitude: item.latitude,
                          longitude: item.longitude,
                        })
                      }
                    >
                      <span>
                        <strong>{item.nome}</strong>
                        {item.estado ? ` — ${item.estado}` : ''}
                      </span>
                      <span className="mono" style={{ color: 'var(--neural-teal)', fontSize: 11 }}>
                        Aplicar no Clima
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="quick-places-row">
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Troca rápida:</span>
            {ATALHOS_LOCAIS.map((loc) => {
              const ativo =
                Math.abs(localAtivo.latitude - loc.latitude) < 0.01 &&
                Math.abs(localAtivo.longitude - loc.longitude) < 0.01;
              return (
                <button
                  key={loc.rotulo}
                  type="button"
                  className="mini-preset"
                  aria-pressed={ativo}
                  disabled={salvandoLocal}
                  onClick={() => aplicarNovoLocal(loc)}
                >
                  {loc.rotulo}
                </button>
              );
            })}
          </div>

          {/* CONFIRMAÇÃO DO CLIMA AO VIVO NA COORDENADA ESCOLHIDA */}
          <div className="weather-active-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5 }}>
                <MapPin size={13} color="var(--neural-teal)" style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Consultando clima em: <strong>{localAtivo.cidade}</strong>
              </span>
              <button
                type="button"
                className="mini-preset"
                disabled={salvandoLocal}
                onClick={() => aplicarNovoLocal(localAtivo)}
              >
                <RefreshCw size={11} style={{ marginRight: 4 }} />
                {salvandoLocal ? 'Consultando…' : 'Testar clima aqui'}
              </button>
            </div>

            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Coordenadas ativas na Open-Meteo: {localAtivo.latitude.toFixed(4)}, {localAtivo.longitude.toFixed(4)}
            </span>

            {climaAoVivo?.ok && (
              <div className="weather-live-pills">
                <span><CheckCircle2 size={13} color="var(--signal-ok)" /> {climaAoVivo.fonte || 'Clima ativo'} ({climaAoVivo.latencia_ms} ms)</span>
                <strong>
                  {formatarNumero(climaAoVivo.temperatura_c, 1)} °C
                  {climaAoVivo.sensacao_c !== null && climaAoVivo.sensacao_c !== undefined
                    ? ` (Sensação ${formatarNumero(climaAoVivo.sensacao_c, 0)} °C)`
                    : ''}
                </strong>
                <span>Sol: <strong>{formatarNumero(climaAoVivo.irradiancia_wm2, 0)} W/m²</strong></span>
                <span>Nuvens: <strong>{formatarNumero(climaAoVivo.nuvens_pct, 0)}%</strong></span>
                <span>Vento: <strong>{formatarNumero(climaAoVivo.vento_kmh, 1)} km/h</strong></span>
              </div>
            )}
          </div>

          <details className="subtle-details">
            <summary>Informar latitude e longitude manualmente</summary>
            <div className="controls-row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="clima-lat-manual">Latitude</label>
                <input id="clima-lat-manual" type="number" step="0.0001" className="input mono" value={latManual} onChange={(e) => definirLatManual(e.target.value)} />
              </div>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="clima-lon-manual">Longitude</label>
                <input id="clima-lon-manual" type="number" step="0.0001" className="input mono" value={lonManual} onChange={(e) => definirLonManual(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={salvandoLocal}
                onClick={() =>
                  aplicarNovoLocal({
                    cidade: `Ponto (${Number(latManual).toFixed(4)}, ${Number(lonManual).toFixed(4)})`,
                    latitude: Number(latManual),
                    longitude: Number(lonManual),
                  })
                }
              >
                Aplicar coordenadas
              </button>
            </div>
          </details>
        </div>

        {/* COLUNA DIREITA: GOOGLE MAPS SINCRONIZADO COM A API DE CLIMA */}
        <div className="solar-map-box">
          <div className="solar-map-toolbar">
            <span className="solar-map-coords">
              <MapPin size={14} color="var(--neural-teal)" aria-hidden="true" />
              <strong>{localAtivo.cidade}</strong>
            </span>

            <div className="solar-map-actions">
              <button type="button" className="mini-preset" aria-pressed={modoMapa === 'mapa'} onClick={() => definirModoMapa('mapa')}>
                Mapa
              </button>
              <button type="button" className="mini-preset" aria-pressed={modoMapa === 'satelite'} onClick={() => definirModoMapa('satelite')}>
                <Layers size={11} style={{ marginRight: 4 }} aria-hidden="true" />
                Satélite
              </button>
              <a
                className="mini-preset"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${localAtivo.latitude},${localAtivo.longitude}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Maps <ExternalLink size={10} style={{ marginLeft: 3 }} aria-hidden="true" />
              </a>
            </div>
          </div>

          <iframe
            title={`Google Maps Clima — ${localAtivo.cidade}`}
            className="solar-map-frame"
            style={{ height: alturaMapa }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(`${localAtivo.latitude},${localAtivo.longitude}`)}&t=${modoMapa === 'satelite' ? 'h' : 'm'}&z=${zoomMapa}&hl=pt-BR&output=embed`}
          />
        </div>
      </div>
    </section>
  );
}
