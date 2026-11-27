import React, { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  BarChart,
  Bar,
  Area,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import {
  Sun,
  Zap,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  ArrowRight,
  Info,
  Wallet,
  CalendarDays,
  CalendarRange,
  Calendar,
  BarChart3,
  ShieldCheck,
  Clock3,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';

const LISTA_HORAS_24 = Array.from({ length: 24 }, (_, i) => i);

function obterDataIsoRecife(deslocamentoDias = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + deslocamentoDias * 86400000));
}

function orientacaoCardeal(azimute = 0) {
  const az = ((Number(azimute) || 0) % 360 + 360) % 360;
  if (az < 22.5 || az >= 337.5) return 'Norte';
  if (az < 67.5) return 'Nordeste';
  if (az < 112.5) return 'Leste';
  if (az < 157.5) return 'Sudeste';
  if (az < 202.5) return 'Sul';
  if (az < 247.5) return 'Sudoeste';
  if (az < 292.5) return 'Oeste';
  return 'Noroeste';
}

function DesenhoSinopticoInstalacao({
  cfg,
  tempoReal,
  previsao24h,
  saudeDiag,
  estimativaMensalRs,
  aoIrParaAba,
}) {
  const qtdPlacas = Number(cfg.quantidade_placas || 10);
  const wpPlaca = Number(cfg.potencia_placa_wp || 550);
  const kwp = (qtdPlacas * wpPlaca) / 1000;
  const invKw = Number(cfg.inversor_kw || 5);
  const tarifa = Number(cfg.tarifa_energia_rs || 0.92);

  const clima = tempoReal?.clima_agora || {};
  const solAcima = Boolean(tempoReal?.sol_acima_horizonte);
  const potAgoraKw = Number(tempoReal?.potencia_atual_kw || 0);
  const poaWm2 = Number(clima.poa_wm2 || 0);
  const tempAr = clima.temperatura_ar_c ?? previsao24h?.meteorologia?.temperatura_max_c ?? 29;
  const tempPlaca = clima.temperatura_placa_c ?? tempAr;
  const nuvens = clima.nuvens_pct ?? previsao24h?.meteorologia?.nuvens_media_pct ?? 30;
  const geradoHojeKwh = Number(tempoReal?.energia_hoje_ate_agora_kwh || 0);
  const previstoHojeKwh = Number(tempoReal?.energia_total_prevista_hoje_kwh || previsao24h?.energia_total_lstm_kwh || 0);
  const retornoHojeRs = geradoHojeKwh * tarifa;
  const cargaInversorPct = invKw > 0 ? Math.min(100, Math.round((potAgoraKw / invKw) * 100)) : 0;

  const modoTexto =
    cfg.modo_conexao_inversor === 'api_inversor'
      ? (cfg.url_api_inversor || '').includes('solarnetwork')
        ? 'Modo API (Só Teste)'
        : 'API do Inversor'
      : cfg.modo_conexao_inversor === 'webhook_push'
      ? 'Webhook Local'
      : 'Clima + Manual';

  const corSaude =
    saudeDiag?.nivel === 'alerta'
      ? 'var(--signal-danger)'
      : saudeDiag?.nivel === 'atencao'
      ? 'var(--signal-warn)'
      : 'var(--signal-ok)';

  return (
    <div className="synoptic-wrapper">
      <svg
        viewBox="0 0 960 258"
        className="synoptic-svg"
        role="img"
        aria-label="Desenho esquemático da instalação solar: Sol e Clima, Placas Solares, Inversor e Rede Elétrica"
      >
        <defs>
          <linearGradient id="grad-painel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#115e59" />
          </linearGradient>
          <linearGradient id="grad-sol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* LINHAS DE CONEXÃO ELÉTRICA / SOLAR */}
        {/* 1) Raios Solares -> Placas */}
        <path
          d="M 205 124 L 268 124"
          className={`synoptic-wire solar-ray ${solAcima ? 'is-flowing' : ''}`}
        />
        <text x="236" y="113" textAnchor="middle" className="synoptic-wire-label">
          {solAcima ? `${formatarNumero(poaWm2, 0)} W/m²` : 'Noite'}
        </text>

        {/* 2) Cabo CC (Placas -> Inversor) */}
        <path
          d="M 476 124 L 538 124"
          className={`synoptic-wire dc-wire ${potAgoraKw > 0.02 ? 'is-flowing' : ''}`}
        />
        <text x="507" y="113" textAnchor="middle" className="synoptic-wire-label">
          Cabo CC
        </text>
        <text x="507" y="143" textAnchor="middle" className="synoptic-wire-sub">
          -{Math.round((cfg.perdas_dc ?? 0.08) * 100)}% perdas
        </text>

        {/* 3) Cabo CA (Inversor -> Imóvel / Concessionária) */}
        <path
          d="M 716 124 L 776 124"
          className={`synoptic-wire ac-wire ${potAgoraKw > 0.02 ? 'is-flowing' : ''}`}
        />
        <text x="746" y="113" textAnchor="middle" className="synoptic-wire-label">
          Rede CA
        </text>
        <text x="746" y="143" textAnchor="middle" className="synoptic-wire-sub">
          Efic. {Math.round((cfg.eficiencia_inversor ?? 0.96) * 100)}%
        </text>

        {/* ================= NÓ 1: SOL E CLIMA LOCAL ================= */}
        <g className="synoptic-node" onClick={() => aoIrParaAba && aoIrParaAba('usina')} style={{ cursor: 'pointer' }}>
          <rect x="16" y="24" width="188" height="206" rx="16" className="synoptic-box" />
          <circle cx="66" cy="74" r="24" fill="url(#grad-sol)" stroke="#d97706" strokeWidth="2" />
          <circle cx="66" cy="74" r="12" fill="#f59e0b" />
          {/* Raios do sol */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((ang) => {
            const rad = (ang * Math.PI) / 180;
            const x1 = 66 + Math.cos(rad) * 16;
            const y1 = 74 + Math.sin(rad) * 16;
            const x2 = 66 + Math.cos(rad) * 21;
            const y2 = 74 + Math.sin(rad) * 21;
            return <line key={ang} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d97706" strokeWidth="2" strokeLinecap="round" />;
          })}
          {/* Desenho sutil de nuvem */}
          <path
            d="M 80 84 Q 80 76 88 76 Q 91 70 99 71 Q 107 72 107 80 Q 112 81 111 86 Q 111 90 105 90 L 84 90 Q 80 90 80 84 Z"
            fill="var(--bg-elevated)"
            stroke="var(--border-input)"
            strokeWidth="1.4"
          />

          <text x="122" y="67" className="synoptic-tag">1 · CLIMA</text>
          <text x="122" y="86" className="synoptic-value-sm">{formatarNumero(tempAr, 1)} °C</text>

          <text x="32" y="124" className="synoptic-title">Sol e Atmosfera</text>
          <text x="32" y="144" className="synoptic-detail">
            Local: {(cfg.cidade || 'Igarassu').split(',')[0].slice(0, 20)}
          </text>
          <text x="32" y="164" className="synoptic-detail">
            Nuvens: {formatarNumero(nuvens, 0)}% · {solAcima ? 'Sol ativo' : 'Pôr do sol'}
          </text>
          <rect x="32" y="182" width="156" height="30" rx="8" className="synoptic-pill" />
          <text x="110" y="201" textAnchor="middle" className="synoptic-pill-text">
            Irradiação: {formatarNumero(poaWm2, 0)} W/m²
          </text>
        </g>

        {/* ================= NÓ 2: ARRANJO DE PLACAS SOLARES ================= */}
        <g className="synoptic-node" onClick={() => aoIrParaAba && aoIrParaAba('usina')} style={{ cursor: 'pointer' }}>
          <rect x="268" y="24" width="208" height="206" rx="16" className="synoptic-box" />

          {/* Desenho técnico de módulo fotovoltaico em grade 4x3 */}
          <g transform="translate(284, 42)">
            <rect x="0" y="0" width="84" height="54" rx="5" fill="url(#grad-painel)" stroke="#0d9488" strokeWidth="2" />
            <line x1="21" y1="0" x2="21" y2="54" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
            <line x1="42" y1="0" x2="42" y2="54" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
            <line x1="63" y1="0" x2="63" y2="54" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
            <line x1="0" y1="18" x2="84" y2="18" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
            <line x1="0" y1="36" x2="84" y2="36" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
          </g>

          <text x="380" y="58" className="synoptic-tag">2 · MÓDULOS</text>
          <text x="380" y="79" className="synoptic-value-sm">{formatarNumero(kwp, 2)} kWp</text>
          <text x="380" y="95" className="synoptic-detail">{qtdPlacas}× {wpPlaca} Wp</text>

          <text x="284" y="124" className="synoptic-title">Placas Solares</text>
          <text x="284" y="144" className="synoptic-detail">
            Telhado: {orientacaoCardeal(cfg.azimute_graus)} · Inclin. {cfg.inclinacao_graus}°
          </text>
          <text x="284" y="164" className="synoptic-detail">
            Temp. célula: {formatarNumero(tempPlaca, 0)} °C
          </text>

          <rect x="284" y="182" width="176" height="30" rx="8" className="synoptic-pill" />
          <circle cx="299" cy="197" r="4.5" fill={corSaude} />
          <text x="311" y="201" className="synoptic-pill-text">
            {saudeDiag?.causa === 'sujeira_nos_modulos'
              ? 'Atenção: possível sujeira'
              : saudeDiag?.causa === 'sombreamento_parcial'
              ? 'Atenção: sombra parcial'
              : saudeDiag?.nivel === 'alerta'
              ? 'Verificar instalação'
              : 'Placas dentro do esperado'}
          </text>
        </g>

        {/* ================= NÓ 3: INVERSOR SOLAR ================= */}
        <g className="synoptic-node" onClick={() => aoIrParaAba && aoIrParaAba('monitoramento')} style={{ cursor: 'pointer' }}>
          <rect x="538" y="24" width="178" height="206" rx="16" className="synoptic-box" />

          {/* Desenho do gabinete do inversor com visor digital */}
          <g transform="translate(554, 40)">
            <rect x="0" y="0" width="56" height="60" rx="7" fill="var(--bg-elevated)" stroke="var(--border-input)" strokeWidth="2" />
            <rect x="9" y="11" width="38" height="20" rx="3" fill="#0f172a" />
            <text x="28" y="24" textAnchor="middle" fill="#34d399" fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="700">
              {formatarNumero(potAgoraKw, 1)}kW
            </text>
            <circle cx="15" cy="43" r="3" fill={solAcima ? '#22c55e' : '#94a3b8'} />
            <line x1="24" y1="43" x2="44" y2="43" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
          </g>

          <text x="622" y="58" className="synoptic-tag">3 · INVERSOR</text>
          <text x="622" y="79" className="synoptic-value-sm">{formatarNumero(invKw, 1)} kW</text>
          <text x="622" y="95" className="synoptic-detail">Uso: {cargaInversorPct}%</text>

          <text x="554" y="124" className="synoptic-title">Conversão CC/CA</text>
          <text x="554" y="144" className="synoptic-detail">
            Agora: {formatarNumero(potAgoraKw, 2)} kW instantâneos
          </text>
          <text x="554" y="164" className="synoptic-detail">
            Modo: {modoTexto}
          </text>

          <rect x="554" y="182" width="146" height="30" rx="8" className="synoptic-pill" />
          <text x="627" y="201" textAnchor="middle" className="synoptic-pill-text">
            Relação CC/CA: {formatarNumero((kwp / Math.max(invKw, 0.1)) * 100, 0)}%
          </text>
        </g>

        {/* ================= NÓ 4: CONSUMO, REDE E RETORNO R$ ================= */}
        <g className="synoptic-node" onClick={() => aoIrParaAba && aoIrParaAba('operacional')} style={{ cursor: 'pointer' }}>
          <rect x="776" y="24" width="168" height="206" rx="16" className="synoptic-box" />

          {/* Desenho do imóvel / unidade consumidora */}
          <g transform="translate(792, 42)">
            <polygon points="24,2 2,20 46,20" fill="var(--neural-teal-soft)" stroke="var(--neural-teal)" strokeWidth="2" />
            <rect x="7" y="20" width="34" height="32" rx="2" fill="var(--bg-elevated)" stroke="var(--neural-teal)" strokeWidth="1.8" />
            <rect x="19" y="32" width="10" height="20" fill="var(--neural-teal-soft)" stroke="var(--neural-teal)" strokeWidth="1.4" />
          </g>

          <text x="850" y="58" className="synoptic-tag">4 · ENERGIA</text>
          <text x="850" y="79" className="synoptic-value-sm" style={{ fill: 'var(--signal-ok)' }}>
            R$ {formatarNumero(retornoHojeRs, 2)}
          </text>
          <text x="850" y="95" className="synoptic-detail">acumulado hoje</text>

          <text x="792" y="124" className="synoptic-title">Quadro e Rede</text>
          <text x="792" y="144" className="synoptic-detail">
            Hoje até agora: {formatarNumero(geradoHojeKwh, 2)} kWh
          </text>
          <text x="792" y="164" className="synoptic-detail">
            Total dia: ~{formatarNumero(previstoHojeKwh, 1)} kWh
          </text>

          <rect x="792" y="182" width="136" height="30" rx="8" className="synoptic-pill" />
          <text x="860" y="201" textAnchor="middle" className="synoptic-pill-text">
            Mês: ~R$ {formatarNumero(estimativaMensalRs, 0)}
          </text>
        </g>
      </svg>
    </div>
  );
}

export default function PainelResumoInstalacao({ estadoSistema, aoIrParaAba }) {
  const cfg = estadoSistema?.config || {};
  const tarifa = Number(cfg.tarifa_energia_rs || 0.92);
  const kwp = ((cfg.quantidade_placas || 10) * (cfg.potencia_placa_wp || 550)) / 1000;

  const [tempoReal, definirTempoReal] = useState(null);
  const [previsao24h, definirPrevisao24h] = useState(null);
  const [diario, definirDiario] = useState(null);
  const [dadosDiaEspecifico, definirDadosDiaEspecifico] = useState(null);
  const [carregando, definirCarregando] = useState(true);
  const [carregandoDia, definirCarregandoDia] = useState(false);

  // Filtros interativos de Dia exato + Horas exatas (Das XX:00 até YY:00) + Clima + Unidade
  const [modoData, definirModoData] = useState('dia'); // 'dia' (calendário exato) | 'proximas24h'
  const [dataEscolhida, definirDataEscolhida] = useState(() => obterDataIsoRecife(0));
  const [horaInicio, definirHoraInicio] = useState(6);
  const [horaFim, definirHoraFim] = useState(18);
  const [filtroCeu, definirFiltroCeu] = useState('todos'); // 'todos' | 'limpo' | 'nublado'
  const [filtroUnidade, definirFiltroUnidade] = useState('kwh'); // 'kwh' | 'rs'
  const [escalaComparativo, definirEscalaComparativo] = useState('meses'); // 'dias' | 'semanas' | 'meses' | 'anos'

  const carregarResumo = async () => {
    definirCarregando(true);
    const form = new FormData();
    form.append('latitude', String(cfg.latitude ?? -7.8342));
    form.append('longitude', String(cfg.longitude ?? -34.9064));
    form.append('horas', '24');
    form.append('forcar_offline', 'false');

    const [rTempo, rPrev, rDiario, rDia] = await Promise.allSettled([
      clienteApi.obterTempoRealAgora(),
      clienteApi.executarPrevisaoOperacional(form),
      clienteApi.obterDiarioCasa(),
      clienteApi.obterResumoDia(dataEscolhida),
    ]);

    if (rTempo.status === 'fulfilled') definirTempoReal(rTempo.value);
    if (rPrev.status === 'fulfilled') definirPrevisao24h(rPrev.value);
    if (rDiario.status === 'fulfilled') definirDiario(rDiario.value);
    if (rDia.status === 'fulfilled') definirDadosDiaEspecifico(rDia.value);
    definirCarregando(false);
  };

  useEffect(() => {
    let ativo = true;
    definirCarregandoDia(true);
    clienteApi
      .obterResumoDia(dataEscolhida)
      .then((res) => { if (ativo) definirDadosDiaEspecifico(res); })
      .catch(() => {})
      .finally(() => { if (ativo) definirCarregandoDia(false); });
    return () => { ativo = false; };
  }, [dataEscolhida]);

  useEffect(() => {
    carregarResumo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cfg.latitude,
    cfg.longitude,
    cfg.quantidade_placas,
    cfg.potencia_placa_wp,
    cfg.inversor_kw,
    cfg.inclinacao_graus,
    cfg.azimute_graus,
    cfg.tarifa_energia_rs,
    cfg.provedor_clima,
  ]);

  // Normaliza e aplica os filtros de Dia específico + Intervalo exato de Horas (horaInicio..horaFim) + Céu
  const serieFiltrada = useMemo(() => {
    let base = [];
    const hMin = Math.min(horaInicio, horaFim);
    const hMax = Math.max(horaInicio, horaFim);

    if (modoData === 'dia' && dadosDiaEspecifico?.horas?.length) {
      base = dadosDiaEspecifico.horas.map((item) => ({
        rotulo: item.hora,
        horaCompleta: `${dadosDiaEspecifico.data_br} ${item.hora}`,
        horaInt: item.hora_int,
        principal_kwh: Number(item.principal_kwh || 0),
        referencia_kwh: Number(item.referencia_kwh || 0),
        principal_rs: Number((Number(item.principal_kwh || 0) * tarifa).toFixed(2)),
        referencia_rs: Number((Number(item.referencia_kwh || 0) * tarifa).toFixed(2)),
        poa_wm2: Number(item.poa_wm2 ?? 0),
        temperatura_c: Number(item.temperatura_c ?? 28),
        nuvens_pct: Number(item.nuvens_pct ?? 0),
      }));
    } else if (previsao24h?.serie?.length) {
      base = previsao24h.serie.map((item) => {
        const textoHora = item.rotulo?.split(' ').pop() || '00:00';
        const hInt = Number(textoHora.slice(0, 2));
        const kwh = Number(item.previsao_lstm_kwh || 0);
        const ref = Number(item.referencia_fisica_kwh || 0);
        return {
          rotulo: textoHora,
          horaCompleta: item.rotulo,
          horaInt: hInt,
          principal_kwh: kwh,
          referencia_kwh: ref,
          principal_rs: Number((kwh * tarifa).toFixed(2)),
          referencia_rs: Number((ref * tarifa).toFixed(2)),
          poa_wm2: Number(item.shortwave_radiation ?? 0),
          temperatura_c: Number(item.temperature_2m ?? 28),
          nuvens_pct: Number(item.cloud_cover ?? 0),
        };
      });
    }

    return base.filter((p) => {
      if (p.horaInt < hMin || p.horaInt > hMax) return false;
      if (filtroCeu === 'limpo' && p.nuvens_pct >= 40) return false;
      if (filtroCeu === 'nublado' && p.nuvens_pct < 40) return false;
      return true;
    });
  }, [modoData, dadosDiaEspecifico, previsao24h, horaInicio, horaFim, filtroCeu, tarifa]);

  // Indicadores calculados em cima do filtro ativo + estimativas mensais/anuais
  const resumoKpis = useMemo(() => {
    const somaKwh = serieFiltrada.reduce((acc, i) => acc + i.principal_kwh, 0);
    const somaRs = somaKwh * tarifa;
    const liquidaLei14300Rs = somaRs * 0.85; // Referência aproximada considerando fio B / autoconsumo
    const melhor = serieFiltrada.reduce(
      (max, i) => (i.principal_kwh > max.val ? { val: i.principal_kwh, rotulo: i.rotulo } : max),
      { val: 0, rotulo: '—' }
    );

    const baseDiaKwh =
      Number(previsao24h?.energia_total_lstm_kwh) ||
      Number(tempoReal?.energia_total_prevista_hoje_kwh) ||
      kwp * 4.6;
    const mensalKwh = baseDiaKwh * 30;
    const mensalRs = mensalKwh * tarifa;
    const anualRs = mensalRs * 12;

    return {
      somaKwh,
      somaRs,
      liquidaLei14300Rs,
      melhor,
      mensalKwh,
      mensalRs,
      anualRs,
      baseDiaKwh,
    };
  }, [serieFiltrada, tarifa, previsao24h, tempoReal, kwp]);

  // Balanço visual da cadeia energética da instalação (Bruto Placas -> Após Perdas CC -> Entregue CA)
  const cadeiaPerdas = useMemo(() => {
    const perdasDc = Number(cfg.perdas_dc ?? 0.08);
    const eficInv = Number(cfg.eficiencia_inversor ?? 0.96);
    const entregueCa = resumoKpis.baseDiaKwh;
    const antesInversor = entregueCa / Math.max(eficInv, 0.5);
    const brutoPlacas = antesInversor / Math.max(1 - perdasDc, 0.5);

    return [
      { etapa: 'Captação nas placas', kwh: Number(brutoPlacas.toFixed(2)), cor: '#f59e0b' },
      { etapa: 'Após calor e cabos CC', kwh: Number(antesInversor.toFixed(2)), cor: '#0284c7' },
      { etapa: 'Energia útil (CA)', kwh: Number(entregueCa.toFixed(2)), cor: '#0f766e' },
    ];
  }, [cfg.perdas_dc, cfg.eficiencia_inversor, resumoKpis.baseDiaKwh]);

  // Comparativo multi-escala: Dias (7d), Semanas (4 sem), Meses (12m com sazonalidade da latitude) e Anos (5 anos)
  const serieMultiPeriodo = useMemo(() => {
    const baseDia = resumoKpis.baseDiaKwh;
    const latAbs = Math.abs(Number(cfg.latitude ?? -7.83));
    const amplitudeSazonal = Math.min(0.26, 0.08 + (latAbs / 35) * 0.20);
    const hemisferioSul = Number(cfg.latitude ?? -7.83) <= 0;

    if (escalaComparativo === 'dias') {
      if (diario?.resumo_diario?.length >= 2) {
        return diario.resumo_diario.slice(-7).map((d) => ({
          periodo: d.data_curta || d.data,
          estimado_kwh: Number(d.geracao_real_kwh || 0),
          referencia_kwh: Number(d.previsao_kwh || 0),
          estimado_rs: Number((Number(d.geracao_real_kwh || 0) * tarifa).toFixed(2)),
          referencia_rs: Number((Number(d.previsao_kwh || 0) * tarifa).toFixed(2)),
        }));
      }
      const diasNomes = ['Dia 1 (Hoje)', 'Dia 2', 'Dia 3', 'Dia 4', 'Dia 5', 'Dia 6', 'Dia 7'];
      const fatoresClima = [1.0, 1.04, 0.91, 0.97, 1.06, 0.88, 1.02];
      return diasNomes.map((nome, idx) => {
        const kwh = Number((baseDia * fatoresClima[idx]).toFixed(2));
        const ref = Number(baseDia.toFixed(2));
        return {
          periodo: nome,
          estimado_kwh: kwh,
          referencia_kwh: ref,
          estimado_rs: Number((kwh * tarifa).toFixed(2)),
          referencia_rs: Number((ref * tarifa).toFixed(2)),
        };
      });
    }

    if (escalaComparativo === 'semanas') {
      const semFatores = [0.97, 1.03, 0.94, 1.06];
      return ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'].map((rot, idx) => {
        const kwh = Number((baseDia * 7 * semFatores[idx]).toFixed(1));
        const ref = Number((baseDia * 7).toFixed(1));
        return {
          periodo: rot,
          estimado_kwh: kwh,
          referencia_kwh: ref,
          estimado_rs: Number((kwh * tarifa).toFixed(2)),
          referencia_rs: Number((ref * tarifa).toFixed(2)),
        };
      });
    }

    if (escalaComparativo === 'meses') {
      const meses = [
        { m: 'Jan', dias: 31 }, { m: 'Fev', dias: 28 }, { m: 'Mar', dias: 31 }, { m: 'Abr', dias: 30 },
        { m: 'Mai', dias: 31 }, { m: 'Jun', dias: 30 }, { m: 'Jul', dias: 31 }, { m: 'Ago', dias: 31 },
        { m: 'Set', dias: 30 }, { m: 'Out', dias: 31 }, { m: 'Nov', dias: 30 }, { m: 'Dez', dias: 31 },
      ];
      return meses.map((item, idx) => {
        const fase = ((idx - (hemisferioSul ? 11 : 5)) / 12) * 2 * Math.PI;
        const fatorSazonal = 1 + amplitudeSazonal * Math.cos(fase);
        const kwh = Number((baseDia * item.dias * fatorSazonal).toFixed(0));
        const ref = Number((baseDia * item.dias).toFixed(0));
        return {
          periodo: item.m,
          estimado_kwh: kwh,
          referencia_kwh: ref,
          estimado_rs: Number((kwh * tarifa).toFixed(0)),
          referencia_rs: Number((ref * tarifa).toFixed(0)),
        };
      });
    }

    // Escala Anos (Ano 1 ao Ano 5 com degradação natural de 0,5%/ano dos módulos e reajuste tarifário médio de 4%/ano)
    const anoAtual = new Date().getFullYear();
    const baseAnual = baseDia * 365;
    return [0, 1, 2, 3, 4].map((offset) => {
      const fatorDegradacao = Math.pow(0.995, offset);
      const tarifaAjustada = tarifa * Math.pow(1.04, offset);
      const kwh = Number((baseAnual * fatorDegradacao).toFixed(0));
      const ref = Number(baseAnual.toFixed(0));
      return {
        periodo: `${anoAtual + offset}`,
        estimado_kwh: kwh,
        referencia_kwh: ref,
        estimado_rs: Number((kwh * tarifaAjustada).toFixed(0)),
        referencia_rs: Number((ref * tarifa).toFixed(0)),
      };
    });
  }, [escalaComparativo, resumoKpis.baseDiaKwh, cfg.latitude, diario?.resumo_diario, tarifa]);

  const chavePrincipal = filtroUnidade === 'rs' ? 'principal_rs' : 'principal_kwh';
  const chaveReferencia = filtroUnidade === 'rs' ? 'referencia_rs' : 'referencia_kwh';
  const sufixoUnidade = filtroUnidade === 'rs' ? 'R$' : 'kWh';

  return (
    <div className="view-stack">
      {/* NOTA DISCRETA DE ESTIMATIVA COMPLEMENTAR */}
      <div className="mode-explain-strip" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Info size={14} color="var(--neural-teal)" />
          <strong>Visão geral complementar:</strong> desenho vivo da instalação, estimativas financeiras e filtros dinâmicos para apoio à sua gestão solar.
        </span>
        <button type="button" className="mini-preset" disabled={carregando} onClick={carregarResumo}>
          <RefreshCw size={12} style={{ marginRight: 4 }} /> {carregando ? 'Atualizando…' : 'Atualizar resumo'}
        </button>
      </div>

      {/* 1. DESENHO ESQUEMÁTICO DA INSTALAÇÃO SOLAR */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="card-title">Desenho da instalação solar — {cfg.nome || 'Usina Principal'}</h2>
            <p className="card-subtitle">
              Clique em qualquer etapa do desenho (Clima, Placas, Inversor ou Rede) para abrir os detalhes correspondentes.
            </p>
          </div>
          <span className="selected-address-pill">
            <Sun size={13} color="var(--solar-amber)" />
            <strong>{formatarNumero(kwp, 2)} kWp instalados</strong>
          </span>
        </div>

        <DesenhoSinopticoInstalacao
          cfg={cfg}
          tempoReal={tempoReal}
          previsao24h={previsao24h}
          saudeDiag={diario?.diagnostico}
          estimativaMensalRs={resumoKpis.mensalRs}
          aoIrParaAba={aoIrParaAba}
        />
      </section>

      {/* 2. BARRA DE FILTROS INTERATIVOS: DIA ESPECÍFICO + HORAS EXATAS (DAS / ATÉ) */}
      <section className="card overview-filters-card" aria-label="Filtros de dia e horas do dashboard">
        {/* LINHA 1: CALENDÁRIO DO DIA + SELETORES DE HORA INICIAL E FINAL */}
        <div className="overview-filters-row">
          <div className="filter-group-inline">
            <label className="filter-title" htmlFor="filtro-dia-input">
              <CalendarDays size={14} color="var(--neural-teal)" /> Dia:
            </label>
            <input
              id="filtro-dia-input"
              type="date"
              className="input filter-date-input mono"
              value={dataEscolhida}
              onChange={(e) => {
                definirModoData('dia');
                definirDataEscolhida(e.target.value);
              }}
            />
            <button
              type="button"
              className={`mini-preset ${modoData === 'dia' && dataEscolhida === obterDataIsoRecife(-1) ? 'is-selected' : ''}`}
              onClick={() => { definirModoData('dia'); definirDataEscolhida(obterDataIsoRecife(-1)); }}
            >
              Ontem
            </button>
            <button
              type="button"
              className={`mini-preset ${modoData === 'dia' && dataEscolhida === obterDataIsoRecife(0) ? 'is-selected' : ''}`}
              onClick={() => { definirModoData('dia'); definirDataEscolhida(obterDataIsoRecife(0)); }}
            >
              Hoje
            </button>
            <button
              type="button"
              className={`mini-preset ${modoData === 'dia' && dataEscolhida === obterDataIsoRecife(1) ? 'is-selected' : ''}`}
              onClick={() => { definirModoData('dia'); definirDataEscolhida(obterDataIsoRecife(1)); }}
            >
              Amanhã
            </button>
            <button
              type="button"
              className={`mini-preset ${modoData === 'proximas24h' ? 'is-selected' : ''}`}
              onClick={() => definirModoData('proximas24h')}
            >
              Próx. 24h corridas
            </button>
          </div>

          <div className="filter-group-inline">
            <label className="filter-title" htmlFor="filtro-hora-ini">
              <Clock3 size={14} color="var(--solar-amber)" /> Horas:
            </label>
            <select
              id="filtro-hora-ini"
              aria-label="Hora inicial"
              className="select filter-hour-select mono"
              value={horaInicio}
              onChange={(e) => definirHoraInicio(Number(e.target.value))}
            >
              {LISTA_HORAS_24.map((h) => (
                <option key={`ini-${h}`} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>até</span>
            <select
              id="filtro-hora-fim"
              aria-label="Hora final"
              className="select filter-hour-select mono"
              value={horaFim}
              onChange={(e) => definirHoraFim(Number(e.target.value))}
            >
              {LISTA_HORAS_24.map((h) => (
                <option key={`fim-${h}`} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        </div>

        {/* LINHA 2: ATALHOS RÁPIDOS DE HORÁRIO + CÉU + UNIDADE */}
        <div className="overview-filters-row" style={{ paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
          <div className="filter-group-inline">
            <span className="filter-title"><SlidersHorizontal size={13} /> Atalhos de hora:</span>
            <button type="button" className={`mini-preset ${horaInicio === 0 && horaFim === 23 ? 'is-selected' : ''}`} onClick={() => { definirHoraInicio(0); definirHoraFim(23); }}>
              00h–23h (24h)
            </button>
            <button type="button" className={`mini-preset ${horaInicio === 6 && horaFim === 18 ? 'is-selected' : ''}`} onClick={() => { definirHoraInicio(6); definirHoraFim(18); }}>
              Sol (06h–18h)
            </button>
            <button type="button" className={`mini-preset ${horaInicio === 6 && horaFim === 12 ? 'is-selected' : ''}`} onClick={() => { definirHoraInicio(6); definirHoraFim(12); }}>
              Manhã (06h–12h)
            </button>
            <button type="button" className={`mini-preset ${horaInicio === 12 && horaFim === 18 ? 'is-selected' : ''}`} onClick={() => { definirHoraInicio(12); definirHoraFim(18); }}>
              Tarde (12h–18h)
            </button>
            <button type="button" className={`mini-preset ${horaInicio === 10 && horaFim === 15 ? 'is-selected' : ''}`} onClick={() => { definirHoraInicio(10); definirHoraFim(15); }}>
              Pico (10h–15h)
            </button>
          </div>

          <div className="filter-group-inline">
            <span className="filter-title"><Filter size={13} /> Céu:</span>
            <button type="button" className={`mini-preset ${filtroCeu === 'todos' ? 'is-selected' : ''}`} onClick={() => definirFiltroCeu('todos')}>
              Todos
            </button>
            <button type="button" className={`mini-preset ${filtroCeu === 'limpo' ? 'is-selected' : ''}`} onClick={() => definirFiltroCeu('limpo')}>
              Sol aberto
            </button>
            <button type="button" className={`mini-preset ${filtroCeu === 'nublado' ? 'is-selected' : ''}`} onClick={() => definirFiltroCeu('nublado')}>
              Nublado
            </button>
          </div>

          <div className="filter-group-inline" style={{ marginLeft: 'auto' }}>
            <span className="filter-title">Unidade:</span>
            <button type="button" className={`mini-preset ${filtroUnidade === 'kwh' ? 'is-selected' : ''}`} onClick={() => definirFiltroUnidade('kwh')}>
              Energia (kWh)
            </button>
            <button type="button" className={`mini-preset ${filtroUnidade === 'rs' ? 'is-selected' : ''}`} onClick={() => definirFiltroUnidade('rs')}>
              Reais (R$)
            </button>
          </div>
        </div>
      </section>

      {/* 3. INDICADORES EXECUTIVOS + ESTIMATIVAS MENSAIS E ANUAIS */}
      <div className="kpi-grid forecast-kpis">
        <div className="card card-compact">
          <div className="kpi-label">
            <span>Energia no filtro ({serieFiltrada.length}h)</span>
            <span className="kpi-icon-badge teal"><Zap size={15} /></span>
          </div>
          <div className="kpi-value">
            {formatarNumero(resumoKpis.somaKwh, 2)} <small>kWh</small>
          </div>
          <div className="kpi-foot">
            Pico no filtro: {resumoKpis.melhor.rotulo} ({formatarNumero(resumoKpis.melhor.val, 2)} kWh)
          </div>
        </div>

        <div className="card card-compact">
          <div className="kpi-label">
            <span>Retorno no filtro</span>
            <span className="kpi-icon-badge teal"><Wallet size={15} /></span>
          </div>
          <div className="kpi-value" style={{ color: 'var(--signal-ok)' }}>
            <small>R$</small> {formatarNumero(resumoKpis.somaRs, 2)}
          </div>
          <div className="kpi-foot">
            Líquido est. (Lei 14.300): R$ {formatarNumero(resumoKpis.liquidaLei14300Rs, 2)}
          </div>
        </div>

        <div className="card card-compact">
          <div className="kpi-label">
            <span>Estimativa mensal (30 dias)</span>
            <span className="kpi-icon-badge sky"><CalendarRange size={15} /></span>
          </div>
          <div className="kpi-value" style={{ color: 'var(--sky-hybrid)' }}>
            <small>R$</small> {formatarNumero(resumoKpis.mensalRs, 0)}
          </div>
          <div className="kpi-foot">
            ~{formatarNumero(resumoKpis.mensalKwh, 0)} kWh/mês · ~R$ {formatarNumero(resumoKpis.anualRs, 0)}/ano
          </div>
        </div>

        <div className="card card-compact">
          <div className="kpi-label">
            <span>Estado da instalação</span>
            <span className="kpi-icon-badge amber"><ShieldCheck size={15} /></span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19, display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {diario?.diagnostico?.nivel === 'alerta' ? (
              <AlertTriangle size={20} color="var(--signal-danger)" />
            ) : (
              <CheckCircle2 size={20} color="var(--signal-ok)" />
            )}
            <span>
              {diario?.possui_registros
                ? diario.diagnostico?.causa === 'sujeira_nos_modulos'
                  ? 'Verificar limpeza'
                  : diario.diagnostico?.causa === 'sombreamento_parcial'
                  ? 'Sombra parcial'
                  : diario.diagnostico?.nivel === 'alerta'
                  ? 'Revisar elétrica'
                  : 'Operação saudável'
                : 'Pronta p/ operar'}
            </span>
          </div>
          <div className="kpi-foot">
            {aoIrParaAba ? (
              <button type="button" className="link-subtle-btn" style={{ fontSize: 11, padding: 0 }} onClick={() => aoIrParaAba('consulta')}>
                Abrir triagem de saúde →
              </button>
            ) : (
              'Triagem complementar ativa'
            )}
          </div>
        </div>
      </div>

      {/* 4. DOIS GRÁFICOS LADO A LADO: CURVA FILTRADA + APROVEITAMENTO FÍSICO */}
      <div className="split-asymmetric">
        <section className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <h3 className="card-title">
                {modoData === 'dia'
                  ? `Curva horária do dia ${dadosDiaEspecifico?.data_br || dataEscolhida} (${String(Math.min(horaInicio, horaFim)).padStart(2, '0')}:00 às ${String(Math.max(horaInicio, horaFim)).padStart(2, '0')}:00)`
                  : `Próximas 24h corridas (${String(Math.min(horaInicio, horaFim)).padStart(2, '0')}:00 às ${String(Math.max(horaInicio, horaFim)).padStart(2, '0')}:00)`}
              </h3>
              <p className="card-subtitle">
                {carregandoDia
                  ? 'Consultando horários do dia selecionado…'
                  : dadosDiaEspecifico?.possui_lancamento_real && modoData === 'dia'
                  ? `Exibindo geração real lançada × esperado (${serieFiltrada.length}h visíveis).`
                  : `Exibindo ${serieFiltrada.length} hora(s) filtradas · Clima: ${dadosDiaEspecifico?.fonte_clima || 'Ativo'}.`}
              </p>
            </div>
          </div>

          {serieFiltrada.length > 0 ? (
            <div className="chart-container" style={{ height: 265 }}>
              <ResponsiveContainer>
                <ComposedChart data={serieFiltrada} margin={{ top: 8, right: 14, left: -12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="overview-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--neural-teal)" stopOpacity={0.26} />
                      <stop offset="95%" stopColor="var(--neural-teal)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 5" />
                  <XAxis dataKey="rotulo" stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v, nome) => [
                      filtroUnidade === 'rs' ? `R$ ${formatarNumero(v, 2)}` : `${formatarNumero(v, 2)} kWh`,
                      nome,
                    ]}
                    contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-subtle)', borderRadius: 10, fontSize: 12 }}
                  />
                  <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 12 }} />
                  <Area
                    type="monotone"
                    dataKey={chavePrincipal}
                    name={modoData === 'dia' && dadosDiaEspecifico?.possui_lancamento_real ? `Gerado (${sufixoUnidade})` : `Geração prevista (${sufixoUnidade})`}
                    stroke="var(--neural-teal)"
                    strokeWidth={2.5}
                    fill="url(#overview-area)"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={chaveReferencia}
                    name={`Estimativa básica pelo sol (${sufixoUnidade})`}
                    stroke="var(--chart-physical)"
                    strokeWidth={1.8}
                    strokeDasharray="5 5"
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              Nenhum horário corresponde a essa combinação de filtros (ex.: sem horas nubladas no período). Clique em <strong>Todos</strong> em Céu para ver a curva completa.
            </div>
          )}

          {serieFiltrada.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Ver tabela hora a hora deste filtro ({serieFiltrada.length}h)
              </summary>
              <div className="table-wrap" style={{ maxHeight: 230, marginTop: 10 }}>
                <table className="data-table mono">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Energia</th>
                      <th>Base Sol</th>
                      <th>Retorno</th>
                      <th>Temp.</th>
                      <th>Nuvens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serieFiltrada.map((h) => (
                      <tr key={h.horaCompleta || h.rotulo}>
                        <td>{h.rotulo}</td>
                        <td className="winner-cell">{formatarNumero(h.principal_kwh, 2)} kWh</td>
                        <td>{formatarNumero(h.referencia_kwh, 2)} kWh</td>
                        <td>R$ {formatarNumero(h.principal_rs, 2)}</td>
                        <td>{formatarNumero(h.temperatura_c, 1)} °C</td>
                        <td>{formatarNumero(h.nuvens_pct, 0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>

        <section className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <h3 className="card-title">Balanço das placas até a tomada (dia típico)</h3>
              <p className="card-subtitle">
                Quanto as {cfg.quantidade_placas} placas captam e quanto chega limpo após temperatura, cabos e inversor.
              </p>
            </div>
          </div>

          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer>
              <BarChart data={cadeiaPerdas} layout="vertical" margin={{ top: 6, right: 20, left: 10, bottom: 6 }}>
                <CartesianGrid stroke="var(--chart-grid)" horizontal={false} strokeDasharray="3 5" />
                <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="etapa" width={132} stroke="var(--text-secondary)" tick={{ fontSize: 11.5 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [`${formatarNumero(v, 2)} kWh/dia`, 'Energia']}
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-subtle)', borderRadius: 10, fontSize: 12 }}
                />
                <Bar dataKey="kwh" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
                  {cadeiaPerdas.map((entry) => (
                    <Cell key={entry.etapa} fill={entry.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overview-specs-mini">
            <span><strong>Placas:</strong> {cfg.quantidade_placas}× {cfg.potencia_placa_wp} Wp</span>
            <span><strong>Inversor:</strong> {formatarNumero(cfg.inversor_kw, 1)} kW ({Math.round((cfg.eficiencia_inversor ?? 0.96) * 100)}%)</span>
            <span><strong>Tarifa:</strong> R$ {formatarNumero(tarifa, 2)}/kWh</span>
            {aoIrParaAba && (
              <button type="button" className="link-subtle-btn" onClick={() => aoIrParaAba('fisica')}>
                Simular mudanças <ArrowRight size={12} style={{ verticalAlign: '-2px' }} />
              </button>
            )}
          </div>
        </section>
      </div>

      {/* 5. GRÁFICO COMPARATIVO MULTI-PERÍODO: DIAS, SEMANAS, MESES E ANOS */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 14 }}>
          <div>
            <h3 className="card-title">Comparativo por Dias, Semanas, Meses e Anos</h3>
            <p className="card-subtitle">
              {escalaComparativo === 'dias'
                ? diario?.resumo_diario?.length >= 2
                  ? 'Comparando seus últimos dias lançados no histórico (Gerado × Esperado).'
                  : 'Projeção comparativa de 7 dias para o porte atual da usina.'
                : escalaComparativo === 'semanas'
                ? 'Comparativo estimado das 4 semanas do mês em relação à linha base.'
                : escalaComparativo === 'meses'
                ? 'Curva sazonal dos 12 meses do ano (Jan–Dez) ajustada pela latitude da usina.'
                : 'Projeção de 5 anos considerando degradação natural dos módulos (0,5%/ano) e retorno acumulado.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Escala temporal do comparativo">
            <button type="button" className={`btn btn-sm ${escalaComparativo === 'dias' ? 'btn-primary' : ''}`} onClick={() => definirEscalaComparativo('dias')}>
              <CalendarDays size={14} /> Dias
            </button>
            <button type="button" className={`btn btn-sm ${escalaComparativo === 'semanas' ? 'btn-primary' : ''}`} onClick={() => definirEscalaComparativo('semanas')}>
              <CalendarRange size={14} /> Semanas
            </button>
            <button type="button" className={`btn btn-sm ${escalaComparativo === 'meses' ? 'btn-primary' : ''}`} onClick={() => definirEscalaComparativo('meses')}>
              <Calendar size={14} /> Meses
            </button>
            <button type="button" className={`btn btn-sm ${escalaComparativo === 'anos' ? 'btn-primary' : ''}`} onClick={() => definirEscalaComparativo('anos')}>
              <BarChart3 size={14} /> Anos
            </button>
          </div>
        </div>

        <div className="chart-container" style={{ height: 270 }}>
          <ResponsiveContainer>
            <ComposedChart data={serieMultiPeriodo} margin={{ top: 10, right: 16, left: -8, bottom: 4 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 5" />
              <XAxis dataKey="periodo" stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11.5 }} />
              <YAxis stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, nome) => [
                  filtroUnidade === 'rs' ? `R$ ${formatarNumero(v, escalaComparativo === 'dias' ? 2 : 0)}` : `${formatarNumero(v, escalaComparativo === 'dias' ? 1 : 0)} kWh`,
                  nome,
                ]}
                contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-subtle)', borderRadius: 10, fontSize: 12 }}
              />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 12 }} />
              <Bar
                dataKey={filtroUnidade === 'rs' ? 'estimado_rs' : 'estimado_kwh'}
                name={filtroUnidade === 'rs' ? 'Retorno estimado (R$)' : 'Geração estimada (kWh)'}
                fill="var(--neural-teal)"
                radius={[5, 5, 0, 0]}
                maxBarSize={38}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey={filtroUnidade === 'rs' ? 'referencia_rs' : 'referencia_kwh'}
                name={filtroUnidade === 'rs' ? 'Média base linear (R$)' : 'Média base linear (kWh)'}
                stroke="var(--chart-physical)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
