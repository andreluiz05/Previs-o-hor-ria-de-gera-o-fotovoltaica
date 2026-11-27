import React from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

export const PASSOS_PRINCIPAIS = [
  { numero: 1, id: 'usina', curto: 'Usina e local' },
  { numero: 2, id: 'monitoramento', curto: 'Tempo real' },
  { numero: 3, id: 'operacional', curto: 'Previsão 24h' },
  { numero: 4, id: 'consulta', curto: 'Histórico e saúde' },
];

export default function TrilhaGuiada({ abaAtiva, aoNavegar }) {
  const indiceAtual = PASSOS_PRINCIPAIS.findIndex((p) => p.id === abaAtiva);
  if (indiceAtual === -1) return null;

  return (
    <nav className="guided-stepper" aria-label="Etapas principais">
      <div className="stepper-track">
        {PASSOS_PRINCIPAIS.map((passo, idx) => {
          const ativo = passo.id === abaAtiva;
          const concluido = indiceAtual > idx;
          return (
            <button
              key={passo.id}
              type="button"
              className={`stepper-item ${ativo ? 'is-active' : ''} ${concluido ? 'is-done' : ''}`}
              aria-current={ativo ? 'step' : undefined}
              onClick={() => aoNavegar(passo.id)}
            >
              <span className="stepper-badge">
                {concluido ? <Check size={13} strokeWidth={2.6} aria-hidden="true" /> : passo.numero}
              </span>
              <strong>{passo.curto}</strong>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function BarraProximoPasso({ passoAtualNumero, aoNavegar }) {
  const anterior = PASSOS_PRINCIPAIS.find((p) => p.numero === passoAtualNumero - 1);
  const proximo = PASSOS_PRINCIPAIS.find((p) => p.numero === passoAtualNumero + 1);

  return (
    <nav className="next-step-bar" aria-label="Navegação entre etapas">
      <div>
        {anterior && (
          <button type="button" className="btn" onClick={() => aoNavegar(anterior.id)}>
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar: {anterior.curto}
          </button>
        )}
      </div>

      <div>
        {proximo && (
          <button type="button" className="btn btn-primary next-step-cta" onClick={() => aoNavegar(proximo.id)}>
            <span>Próximo: {proximo.curto}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </nav>
  );
}
