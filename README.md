# Helionta · Previsão Horária e Acompanhamento de Geração Fotovoltaica

Desenvolvido pela **Tecalli Tecnologia** (`FastAPI + React + PyTorch/Scikit-Learn`).

> **Aviso de uso:** o Helionta é uma **ferramenta complementar de apoio** baseada em dados meteorológicos e modelos matemáticos/IA — **não substitui** o medidor oficial da concessionária, o software do fabricante do inversor nem a vistoria presencial de um técnico habilitado. A integração pré-configurada **SolarNetwork** destina-se exclusivamente a **teste técnico de código** e não reflete a geração real da sua usina.

---

## Estrutura de Pastas do Projeto

```text
├── assets/         # Logotipos, ícones e banners da identidade visual Helionta / Tecalli
├── backend/        # Servidor FastAPI, motor físico solar, AccuWeather/METAR, SQLite e testes
│   └── tests/      # Suíte com 43 testes unitários automatizados
├── docs/           # Roteiros de apresentação, design, usabilidade e especificações técnicas
├── frontend/       # Aplicação web em React + Vite
├── notebooks/      # Notebook científico original (solar_v3_jupyter.ipynb)
├── scripts/        # Atalhos de execução (Iniciar Helionta.bat, Parar Helionta.bat, iniciar_dev.bat)
└── README.md       # Guia rápido do repositório
```

---

## Como Executar

### Opção 1 — Uso Rápido em 1 Clique (`http://127.0.0.1:8000`)
Abra a pasta [`scripts/`](scripts/) e dê duplo clique em:
- **`scripts\Iniciar Helionta.bat`** — inicia o servidor local e abre o navegador em `http://127.0.0.1:8000`.
- **`scripts\Parar Helionta.bat`** — encerra o servidor em segundo plano.

Ou pelo terminal:
```powershell
cd backend
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Opção 2 — Modo Desenvolvimento (Backend `:8000` + Vite `:5173`)
Execute **`scripts\iniciar_dev.bat`** (ou rode `npm run dev` em `frontend/` junto ao `uvicorn --reload` em `backend/`).

---

## Principais Recursos

1. **1. Usina e local:** configuração de porte (residencial, comercial, rural/industrial ou usina), **Google Maps (`Mapa` / `Satélite`)**, busca por rua/bairro/CEP/cidade, modo **`API de Clima + Manual`** integrado à **AccuWeather API / Estação Meteorológica Terrestre Real** e conectores HTTP/Webhook.
2. **2. Tempo real:** estimativa minuto a minuto da potência solar agora (`kW`), irradiação nas placas (`W/m²`), acumulado do dia (`kWh` e `R$`) e restante até o pôr do sol, mesmo sem API de inversor conectada.
3. **3. Previsão 24h:** projeção hora a hora de geração e economia estimada (incluindo referência líquida pela Lei 14.300).
4. **4. Histórico e saúde:** diário persistente em SQLite (total do dia, hora a hora ou CSV) com triagem complementar aproximada de sujeira nas placas, sombreamento parcial ou possível queda elétrica.
5. **5. APIs e conexões:** central limpa de integrações nativas e personalizadas com teste de latência e extração JSON.

Documentação detalhada disponível na pasta [`docs/`](docs/).
