/* ============================================================================
 * PROJETO SOLAR V3 — CONFIGURAÇÃO DO EMPACOTADOR VITE E PROXY DE DESENVOLVIMENTO
 * ============================================================================
 * Encaminha automaticamente chamadas `/api/*` da porta 5173 (React) para a
 * porta 8000 (FastAPI) durante o desenvolvimento local.
 * ============================================================================ */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
