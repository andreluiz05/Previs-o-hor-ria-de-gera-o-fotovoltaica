/* ============================================================================
 * PROJETO SOLAR V3 (TECALLI TECNOLOGIA) — CLIENTE HTTP DA API FASTAPI
 * ============================================================================
 * Organizado em blocos funcionais:
 *   - BLOCO 1: Tratamento padronizado de respostas HTTP e mensagens de erro
 *   - BLOCO 2: Rotas do Usuário Final (Minha Usina, Busca de Cidade, Consulta e Inversor)
 *   - BLOCO 3: Rotas Científicas (Benchmark, Dias de Teste, Física, Previsão 24h e Treino)
 * ============================================================================ */

const BASE_API = import.meta.env.VITE_API_BASE || '';

/* ==================== BLOCO 1: TRATAMENTO DE RESPOSTAS ==================== */

async function tratarRespostaJson(resposta) {
  if (!resposta.ok) {
    let mensagemErro = `Erro HTTP ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (corpo?.detail) mensagemErro = corpo.detail;
    } catch {
      // Mantém mensagem padrão caso o corpo não seja JSON
    }
    throw new Error(mensagemErro);
  }
  return resposta.json();
}

/* ==================== BLOCO 2 E 3: SERVIÇOS DA API REST ==================== */

export const clienteApi = {
  /** Busca configuração ativa da usina, métricas do benchmark e metadados */
  obterEstadoGeral: () => fetch(`${BASE_API}/api/status`).then(tratarRespostaJson),

  /** Pesquisa cidades e retorna latitude/longitude automaticamente */
  pesquisarCidades: (termoBusca) => {
    const parametros = new URLSearchParams({ busca: termoBusca });
    return fetch(`${BASE_API}/api/geocoding?${parametros.toString()}`).then(tratarRespostaJson);
  },

  /** Salva os dados personalizados de placas, inversor, localização e tarifa do usuário */
  salvarConfiguracaoUsina: (dadosUsina) =>
    fetch(`${BASE_API}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dadosUsina),
    }).then(tratarRespostaJson),

  /** Consulta histórico filtrável comparando Geração Real × Previsão × Física + R$ */
  consultarDadosComparativos: (filtros = {}) => {
    const parametros = new URLSearchParams();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') {
        parametros.set(chave, String(valor));
      }
    });
    return fetch(`${BASE_API}/api/dados/consulta?${parametros.toString()}`).then(tratarRespostaJson);
  },

  /** Importa planilha simples de 2 colunas do inversor e une clima automaticamente */
  importarPlanilhaInversor: (arquivo, dadosExemplo = false, salvarNoDiario = false) => {
    const formulario = new FormData();
    formulario.append('arquivo', arquivo);
    formulario.append('dados_exemplo', String(dadosExemplo));
    formulario.append('salvar_no_diario', String(salvarNoDiario));
    return fetch(`${BASE_API}/api/importar-inversor`, {
      method: 'POST',
      body: formulario,
    }).then(tratarRespostaJson);
  },

  /** Diário permanente da energia solar da casa (SQLite) */
  obterDiarioCasa: (filtros = {}) => {
    const parametros = new URLSearchParams();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') {
        parametros.set(chave, String(valor));
      }
    });
    return fetch(`${BASE_API}/api/diario-casa?${parametros.toString()}`).then(tratarRespostaJson);
  },

  salvarDiaTotalCasa: (dados) =>
    fetch(`${BASE_API}/api/diario-casa/dia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    }).then(tratarRespostaJson),

  salvarHorasCasa: (dados) =>
    fetch(`${BASE_API}/api/diario-casa/horas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    }).then(tratarRespostaJson),

  removerDiaCasa: (dataDia) =>
    fetch(`${BASE_API}/api/diario-casa/dia/${encodeURIComponent(dataDia)}`, {
      method: 'DELETE',
    }).then(tratarRespostaJson),

  limparDiarioCasa: () =>
    fetch(`${BASE_API}/api/diario-casa`, {
      method: 'DELETE',
    }).then(tratarRespostaJson),

  obterExemploInversor: async () => {
    const resposta = await fetch(`${BASE_API}/api/modelo-inversor-simples`);
    if (!resposta.ok) throw new Error('Não foi possível preparar o exemplo. Tente novamente.');
    return new File([await resposta.blob()], 'EXEMPLO_FICTICIO_24H.csv', { type: 'text/csv' });
  },

  obterExemploUltimas24h: async () => {
    const resposta = await fetch(`${BASE_API}/api/modelo-ultimas-24h`);
    if (!resposta.ok) throw new Error('Não foi possível gerar o histórico fictício de 24h.');
    return new File([await resposta.blob()], 'FICTICIO_ULTIMAS_24H.csv', { type: 'text/csv' });
  },

  obterCsvTreinoFicticio: async () => {
    const resposta = await fetch(`${BASE_API}/api/modelo-csv-treino-ficticio`);
    if (!resposta.ok) throw new Error('Não foi possível gerar o CSV fictício de 30 dias.');
    return new File([await resposta.blob()], 'FICTICIO_TREINO_30_DIAS.csv', { type: 'text/csv' });
  },

  /** Obtém a série horária de 24h de qualquer dia completo do conjunto de teste */
  obterDiasTeste: (data = '', semente = '42') => {
    const parametros = new URLSearchParams();
    if (data) parametros.set('date', data);
    if (semente) parametros.set('seed', semente);
    return fetch(`${BASE_API}/api/test-days?${parametros.toString()}`).then(tratarRespostaJson);
  },

  /** Executa as 7 verificações automatizadas de software da modelagem física */
  obterVerificacoesFisicas: () => fetch(`${BASE_API}/api/physics/checks`).then(tratarRespostaJson),

  /** Recalcula a curva física horária com parâmetros customizados ('E se?') */
  simularFisicaCustomizada: (parametrosPlanta) =>
    fetch(`${BASE_API}/api/physics/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parametrosPlanta),
    }).then(tratarRespostaJson),

  /** Inspeciona passo a passo a inferência de 1 hora (janela X + clima Z + resíduo) */
  obterInferenciaUmaHora: (instante = '', semente = '') => {
    const parametros = new URLSearchParams();
    if (instante) parametros.set('timestamp', instante);
    if (semente) parametros.set('seed', semente);
    return fetch(`${BASE_API}/api/inference-1h?${parametros.toString()}`).then(tratarRespostaJson);
  },

  /** Consulta previsão operacional de até 24h via Open-Meteo (ou cache offline) */
  executarPrevisaoOperacional: (dadosFormulario) =>
    fetch(`${BASE_API}/api/forecast/live`, {
      method: 'POST',
      body: dadosFormulario,
    }).then(tratarRespostaJson),

  /** Envia e valida um arquivo CSV completo (10 colunas) para retreinamento */
  enviarArquivoCsv: (arquivo) => {
    const formulario = new FormData();
    formulario.append('arquivo', arquivo);
    return fetch(`${BASE_API}/api/upload-csv`, {
      method: 'POST',
      body: formulario,
    }).then(tratarRespostaJson);
  },

  /** Dispara o pipeline de treinamento/benchmark V3 em segundo plano */
  iniciarTreinamento: (configuracaoTreino) =>
    fetch(`${BASE_API}/api/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configuracaoTreino),
    }).then(tratarRespostaJson),

  /** Consulta o percentual e a etapa atual do treinamento em andamento */
  obterProgressoTreinamento: () => fetch(`${BASE_API}/api/train/status`).then(tratarRespostaJson),

  /** Energia em tempo real (clima atual + leitura ao vivo de inversor/medidor) */
  obterTempoRealAgora: (signal) =>
    fetch(`${BASE_API}/api/tempo-real/agora`, { signal }).then(tratarRespostaJson),

  enviarLeituraTempoReal: (dados) =>
    fetch(`${BASE_API}/api/tempo-real/leitura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    }).then(tratarRespostaJson),

  limparLeiturasTempoReal: () =>
    fetch(`${BASE_API}/api/tempo-real/leituras`, { method: 'DELETE' }).then(tratarRespostaJson),

  sincronizarApiInversorTempoReal: () =>
    fetch(`${BASE_API}/api/tempo-real/sincronizar-api`, { method: 'POST' }).then(tratarRespostaJson),

  /** Central de APIs ativas e personalizadas do projeto */
  obterCentralApis: () => fetch(`${BASE_API}/api/apis`).then(tratarRespostaJson),

  atualizarLocalApiClima: (dados) =>
    fetch(`${BASE_API}/api/apis/clima/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    }).then(tratarRespostaJson),

  adicionarApiPersonalizada: (dados) =>
    fetch(`${BASE_API}/api/apis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    }).then(tratarRespostaJson),

  testarUrlApi: (dados) =>
    fetch(`${BASE_API}/api/apis/testar-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    }).then(tratarRespostaJson),

  testarApiCadastrada: (apiId) =>
    fetch(`${BASE_API}/api/apis/${encodeURIComponent(apiId)}/testar`, { method: 'POST' }).then(tratarRespostaJson),

  usarApiNoInversorPrincipal: (apiId) =>
    fetch(`${BASE_API}/api/apis/${encodeURIComponent(apiId)}/usar-no-inversor`, { method: 'POST' }).then(tratarRespostaJson),

  alternarEstadoApi: (apiId, ativa) =>
    fetch(`${BASE_API}/api/apis/${encodeURIComponent(apiId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativa }),
    }).then(tratarRespostaJson),

  excluirApiPersonalizada: (apiId) =>
    fetch(`${BASE_API}/api/apis/${encodeURIComponent(apiId)}`, { method: 'DELETE' }).then(tratarRespostaJson),

  obterMonitoramento: (sessaoId = '', signal) => {
    const parametros = new URLSearchParams();
    if (sessaoId) parametros.set('sessao_id', sessaoId);
    return fetch(`${BASE_API}/api/monitoramento/status?${parametros}`, { signal }).then(tratarRespostaJson);
  },
  iniciarSimulador: (opcoes) => fetch(`${BASE_API}/api/monitoramento/iniciar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opcoes),
  }).then(tratarRespostaJson),
  pausarSimulador: () => fetch(`${BASE_API}/api/monitoramento/pausar`, { method: 'POST' }).then(tratarRespostaJson),
  obterFontePublica: (signal) => fetch(`${BASE_API}/api/fonte-publica/status`, { signal }).then(tratarRespostaJson),
  iniciarFontePublica: () => fetch(`${BASE_API}/api/fonte-publica/iniciar`, { method: 'POST' }).then(tratarRespostaJson),
  pausarFontePublica: () => fetch(`${BASE_API}/api/fonte-publica/pausar`, { method: 'POST' }).then(tratarRespostaJson),
  conectarFontePublica: () => fetch(`${BASE_API}/api/fonte-publica/conectar`, { method: 'POST' }).then(tratarRespostaJson),
  desconectarFontePublica: () => fetch(`${BASE_API}/api/fonte-publica/desconectar`, { method: 'POST' }).then(tratarRespostaJson),
  urlExportarFontePublica: `${BASE_API}/api/fonte-publica/exportar`,
  urlExportarSimulacao: (sessaoId = '') => {
    const parametros = new URLSearchParams();
    if (sessaoId) parametros.set('sessao_id', sessaoId);
    return `${BASE_API}/api/monitoramento/exportar?${parametros}`;
  },

  /** Endereços diretos para download de modelos e pacotes */
  urlModeloInversorSimples: `${BASE_API}/api/modelo-inversor-simples`,
  urlModeloUltimas24h: `${BASE_API}/api/modelo-ultimas-24h`,
  urlModeloCsvTreinoFicticio: `${BASE_API}/api/modelo-csv-treino-ficticio`,
  urlModeloCsvReal: `${BASE_API}/api/template-csv`,
  urlExportarResultadosZip: `${BASE_API}/api/export-zip`,
};
