/* ============================================================================
 * PROJETO SOLAR V3 — METADADOS VISUAIS DOS MODELOS E FORMATADORES NUMÉRICOS
 * ============================================================================
 * Centraliza a identidade cromática e os rótulos em português dos 7 modelos
 * comparados no benchmark, além da formatação numérica no padrão brasileiro.
 * ============================================================================ */

/* ==================== BLOCO 1: DICIONÁRIO DE MODELOS V3 ==================== */

export const METADADOS_MODELOS = {
  alvo_kwh: {
    rotuloCompleto: 'Alvo (Geração de Referência)',
    rotuloCurto: 'Alvo',
    cor: 'var(--solar-amber)',
    categoria: 'Série Alvo',
  },
  LSTM_Huber: {
    rotuloCompleto: 'LSTM Direto (Huber Loss)',
    rotuloCurto: 'LSTM Huber',
    cor: 'var(--neural-teal)',
    categoria: 'Rede Recorrente Direta',
  },
  LSTM_residual_fisico: {
    rotuloCompleto: 'LSTM Residual Físico',
    rotuloCurto: 'LSTM Residual',
    cor: 'var(--sky-hybrid)',
    categoria: 'Híbrido Física + ML (Salvo)',
  },
  RandomForest: {
    rotuloCompleto: 'Random Forest Regressor',
    rotuloCurto: 'Random Forest',
    cor: 'var(--chart-forest)',
    categoria: 'Ensemble de Árvores',
  },
  RNN: {
    rotuloCompleto: 'RNN Simples (Huber Loss)',
    rotuloCurto: 'RNN',
    cor: 'var(--chart-rnn)',
    categoria: 'Recorrente Clássica',
  },
  Referencia_fisica: {
    rotuloCompleto: 'Referência Física Pura',
    rotuloCurto: 'Física Pura',
    cor: 'var(--chart-physical)',
    categoria: 'Determinístico Sem ML',
  },
  Persistencia_1h: {
    rotuloCompleto: 'Persistência de 1 Hora',
    rotuloCurto: 'Persist. 1h',
    cor: 'var(--chart-cloud)',
    categoria: 'Baseline Ingênuo (t - 1h)',
  },
  Persistencia_24h: {
    rotuloCompleto: 'Persistência de 24 Horas',
    rotuloCurto: 'Persist. 24h',
    cor: 'var(--chart-persistence)',
    categoria: 'Baseline Ingênuo (t - 24h)',
  },
};

/* ==================== BLOCO 2: FUNÇÕES DE FORMATAÇÃO ==================== */

/** Formata números decimais no padrão pt-BR com casas fixas e segurança contra NaN/null */
export function formatarNumero(valor, casasDecimais = 3) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
    return '—';
  }
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  });
}

/** Retorna o nome amigável em português de qualquer identificador de modelo */
export function formatarNomeModelo(chaveModelo) {
  return METADADOS_MODELOS[chaveModelo]?.rotuloCurto || chaveModelo;
}
