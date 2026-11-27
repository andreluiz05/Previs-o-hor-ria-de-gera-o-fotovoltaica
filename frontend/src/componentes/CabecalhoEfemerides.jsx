import React from 'react';
import { Sun, Moon } from 'lucide-react';

export default function CabecalhoEfemerides({ temaAtual, aoAlternarTema, aba }) {
  return (
    <header className="page-header compact-header">
      <div className="page-heading-row">
        <div>
          <h1>{aba.titulo}<span className="heading-dot">.</span></h1>
          <p className="page-description">{aba.descricao}</p>
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
