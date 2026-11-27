import React, { useEffect, useState } from 'react';
import {
  Play as IconeExecutar,
  Upload as IconeEnviarArquivo,
  Download as IconeBaixarArquivo,
  CheckCircle2 as IconeSucesso,
  AlertCircle as IconeErro,
} from 'lucide-react';
import { clienteApi } from '../api/clienteApi';
import { formatarNumero } from '../utilitarios/formatadores';

export default function PainelTreinamentoDados({ estadoSistema, aoConcluirTreinamento }) {
  const [modoDados, definirModoDados] = useState('demo');
  const [modoClimaCsv, definirModoClimaCsv] = useState('previsao');
  const [ritmoTreino, definirRitmoTreino] = useState('rapido'); // 'rapido' | 'completo'
  const [resumoCsvEnviado, definirResumoCsvEnviado] = useState(null);
  const [erroUploadCsv, definirErroUploadCsv] = useState('');
  const [progressoTreino, definirProgressoTreino] = useState(null);
  const [erroTreinamento, definirErroTreinamento] = useState('');

  useEffect(() => {
    let intervalo = null;
    if (progressoTreino?.em_andamento) {
      intervalo = setInterval(async () => {
        try {
          const estadoAtual = await clienteApi.obterProgressoTreinamento();
          definirProgressoTreino(estadoAtual);
          if (!estadoAtual.em_andamento) {
            clearInterval(intervalo);
            if (!estadoAtual.erro && aoConcluirTreinamento) aoConcluirTreinamento();
          }
        } catch {
          // Oscilação momentânea ignorada
        }
      }, 900);
    }
    return () => { if (intervalo) clearInterval(intervalo); };
  }, [progressoTreino?.em_andamento, aoConcluirTreinamento]);

  const processarEnvioCsv = async (evento) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    definirErroUploadCsv('');
    try {
      const resposta = await clienteApi.enviarArquivoCsv(arquivo);
      definirResumoCsvEnviado(resposta);
      definirModoDados('csv');
    } catch (erro) {
      definirErroUploadCsv(erro.message);
    }
  };

  const carregarCsvFicticio = async () => {
    definirErroUploadCsv('');
    try {
      const arq = await clienteApi.obterCsvTreinoFicticio();
      const resposta = await clienteApi.enviarArquivoCsv(arq);
      definirResumoCsvEnviado(resposta);
      definirModoDados('csv');
    } catch (erro) {
      definirErroUploadCsv(erro.message);
    }
  };

  const dispararTreinamento = async () => {
    definirErroTreinamento('');
    const rapido = ritmoTreino === 'rapido';
    try {
      const resposta = await clienteApi.iniciarTreinamento({
        modo: modoDados,
        modo_clima: modoClimaCsv,
        epocas: rapido ? 2 : 40,
        seeds: rapido ? [42] : [42, 123, 2026],
        config: estadoSistema?.config || {},
      });
      definirProgressoTreino(resposta.estado);
    } catch (erro) {
      definirErroTreinamento(erro.message);
    }
  };

  const cfg = estadoSistema?.config || {};

  return (
    <div className="view-stack">
      <div className="split-equal">
        <section className="card">
          <h2 className="card-title" style={{ marginBottom: 6 }}>1. Fonte dos dados</h2>
          <p className="card-subtitle" style={{ marginBottom: 16 }}>
            Usando os equipamentos da usina ativa ({formatarNumero(estadoSistema?.potencia_dc_kwp, 2)} kWp em {cfg.cidade}).
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button type="button" className={`btn ${modoDados === 'demo' ? 'btn-primary' : ''}`} onClick={() => definirModoDados('demo')}>
              Base simulada automática (120 dias)
            </button>
            <button type="button" className={`btn ${modoDados === 'csv' ? 'btn-primary' : ''}`} onClick={() => definirModoDados('csv')}>
              Arquivo CSV próprio
            </button>
          </div>

          {modoDados === 'csv' && (
            <div className="subpanel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <label htmlFor="arquivo-csv-treino" className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconeEnviarArquivo size={15} /> Selecionar CSV completo
                </label>
                <a className="btn btn-sm" href={clienteApi.urlModeloCsvReal} download>
                  <IconeBaixarArquivo size={14} /> Modelo CSV
                </a>
              </div>
              <input id="arquivo-csv-treino" type="file" accept=".csv" className="input" onChange={processarEnvioCsv} />
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={carregarCsvFicticio}>
                  Gerar CSV de teste (30 dias)
                </button>
                <select aria-label="Origem do clima" className="select" style={{ minHeight: 36, fontSize: 12 }} value={modoClimaCsv} onChange={(e) => definirModoClimaCsv(e.target.value)}>
                  <option value="previsao">Clima previsto</option>
                  <option value="historico">Clima observado</option>
                </select>
              </div>
            </div>
          )}

          {resumoCsvEnviado && (
            <div className="notice-banner teal" style={{ marginTop: 12 }}>
              <IconeSucesso size={17} color="var(--neural-teal)" />
              <div><strong>{resumoCsvEnviado.nome_arquivo}</strong> ({resumoCsvEnviado.horas_completas_sem_nan}h válidas)</div>
            </div>
          )}

          {erroUploadCsv && (
            <div className="notice-banner danger" style={{ marginTop: 12 }}>
              <IconeErro size={17} />
              <div>{erroUploadCsv}</div>
            </div>
          )}
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: 6 }}>2. Executar calibração</h2>
            <p className="card-subtitle" style={{ marginBottom: 16 }}>Escolha a velocidade e inicie o ajuste das redes neurais.</p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              <button type="button" className={`btn ${ritmoTreino === 'rapido' ? 'btn-primary' : ''}`} onClick={() => definirRitmoTreino('rapido')}>
                Rápida (~3 segundos)
              </button>
              <button type="button" className={`btn ${ritmoTreino === 'completo' ? 'btn-primary' : ''}`} onClick={() => definirRitmoTreino('completo')}>
                Completa (40 épocas)
              </button>
            </div>
          </div>

          <div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px 18px', fontSize: 14 }}
              disabled={progressoTreino?.em_andamento}
              onClick={dispararTreinamento}
            >
              <IconeExecutar size={16} />
              {progressoTreino?.em_andamento ? 'Calibrando IA…' : 'Iniciar calibração da IA'}
            </button>

            {erroTreinamento && (
              <div className="notice-banner danger" style={{ marginTop: 12 }}>
                <IconeErro size={17} />
                <div>{erroTreinamento}</div>
              </div>
            )}

            {progressoTreino && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }} className="mono">
                  <span>{progressoTreino.mensagem}</span>
                  <span>{progressoTreino.progresso_pct}%</span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={progressoTreino.progresso_pct || 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-fill" style={{ width: `${progressoTreino.progresso_pct || 0}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
