/* ============================================================================
 * PROJETO SOLAR V3 — PONTO DE ENTRADA DA INTERFACE REACT
 * ============================================================================
 * Inicializa a árvore principal de componentes em português (`AplicacaoSolarV3`)
 * e aplica o sistema de tokens visuais (`estilos/tema.css`).
 * ============================================================================ */

import React from 'react';
import ReactDOM from 'react-dom/client';
import AplicacaoSolarV3 from './App.jsx';
import './estilos/tema.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AplicacaoSolarV3 />
  </React.StrictMode>
);
