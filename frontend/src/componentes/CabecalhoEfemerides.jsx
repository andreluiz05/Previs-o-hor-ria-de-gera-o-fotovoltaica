import React from 'react';
import { Sun, Moon } from 'lucide-react';

export default function CabecalhoEfemerides({ temaAtual, aoAlternarTema, aba }) {
  const IconeAba = aba?.Icone || Sun;
  return (
    <header className="page-header compact-header">
      <div className="page-heading-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="page-title-icon" aria-hidden="true">
            <IconeAba size={22} strokeWidth={1.9} />
          </span>
          <div>
            <h1>{aba.titulo}<span className="heading-dot">.</span></h1>
            <p className="page-description">{aba.descricao}</p>
          </div>
        </div>

        <div className="page-actions">
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={aoAlternarTema}
            aria-label={`Ativar tema ${temaAtual === 'dark' ? 'claro' : 'escuro'}`}
            title={`Alternar tema ${temaAtual === 'dark' ? 'claro' : 'escuro'}`}
          >
            {temaAtual === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </div>
    </header>
  );
}
