# Helionta · Previsão de energia solar

Desenvolvido pela **Tecalli Tecnologia**. React JS + FastAPI.

**Para testar e apresentar na faculdade:** abra `iniciar_apresentacao.bat` e siga o [roteiro de apresentação](APRESENTACAO.md). A instalação fictícia de Igarassu/PE já está cadastrada. Em **Real × previsto**, o botão **Testar com exemplo de 24h** permite experimentar sem possuir placas nem preparar arquivos.

O cartão de clima informa se a Open-Meteo respondeu, quando foi consultada e quando há contingência. Sem internet, usa apenas cache recente da mesma localização ou um cenário claramente identificado como demonstração. O modelo atual usa uma base sintética; a previsão de geração ainda não foi validada com uma instalação real.

Plataforma completa para **personalização de usinas fotovoltaicas**, **previsão horária das próximas 24h (Open-Meteo + IA Híbrida LSTM)**, **importação simplificada de dados reais de inversores** e **benchmark científico V3**.

---

## 1. Como Rodar o Projeto na Sua Máquina (Comandos CMD / Terminal)

> **Importante**: Como o Python da sua máquina está gerenciado em ambiente isolado (`backend\.venv`), use sempre o executável `.venv\Scripts\python.exe` abaixo (não use apenas `python`, que abre o atalho da Microsoft Store).

### Opção A — Mais Fácil para a Apresentação (1 Clique · Tudo na Porta 8000)
Basta dar **duplo clique** no arquivo:
- **`iniciar_apresentacao.bat`**

Ou rodar este único comando no **CMD (Prompt de Comando)**:
```cmd
cd /d "C:\Users\vania\OneDrive\Desktop\Previsão horária de geração fotovoltaica\backend"
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```
Depois abra no navegador: **`http://127.0.0.1:8000`** *(ele já serve tanto o Backend quanto o Frontend React compilado!)*.

---

### Opção B — Rodar Backend e Frontend Separados (2 Terminais)

**Terminal 1 — Comando para rodar o Backend (FastAPI na porta 8000):**
```cmd
cd /d "C:\Users\vania\OneDrive\Desktop\Previsão horária de geração fotovoltaica\backend"
.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — Comando para rodar o Frontend React (Vite na porta 5173):**
```cmd
cd /d "C:\Users\vania\OneDrive\Desktop\Previsão horária de geração fotovoltaica\frontend"
npm run dev
```
Depois acesse: **`http://localhost:5173`** *(ou basta clicar duas vezes em `iniciar_dev.bat` que abre os dois terminais automaticamente)*.

---

## 2. Jornada do Usuário Final na Plataforma

1. **Aba 01 — Minha Usina & Guia de Uso (`PainelMinhaUsina.jsx`)**
   - Pesquisa o nome da cidade (ex: *Recife, Petrolina, Olinda, São Paulo*) e preenche Latitude e Longitude sozinho.
   - Permite informar **quantidade de placas**, **potência da placa (Wp)**, **modelo**, **potência do inversor (kW)**, **inclinação do telhado**, **orientação (Norte, Leste, Oeste...)** e **tarifa em R$/kWh**.
   - Ao clicar em **Salvar Configuração da Minha Usina**, toda a plataforma passa a calcular energia e retorno financeiro para o sistema real do cliente.
   - Traz um guia explicando como exportar dados reais dos aplicativos **Growatt (ShinePhone)**, **Deye/Hoymiles (Solarman)**, **Huawei (FusionSolar)**, **Fronius (Solar.web)** e **WEG/Sungrow**.

2. **Aba 02 — Previsão 24h em Tempo Real (`PainelPrevisaoOperacional.jsx`)**
   - Consulta a API meteorológica **Open-Meteo** para a localização da usina do cliente e estima hora a hora os **kWh gerados** e a **Economia em R$** nas próximas 24 horas (com contingência offline automática caso falte internet na sala).

3. **Aba 03 — Consulta & Real × Previsto (`PainelConsultaComparacao.jsx`)**
   - **Importação Simples do Inversor (2 Colunas)**: O cliente envia apenas `data_hora;energia_kwh` exportado do inversor; o backend une o clima automaticamente, compara **Real Medido × Previsão IA** e emite um **Diagnóstico Automático** (alertando possível sujidade nos módulos, sombreamento ou falha caso a geração caia além do esperado para o clima do dia).
   - **Consulta Filtrável**: Permite filtrar histórico por datas, condição climática (*Céu Limpo*, *Nublado*, *Chuva*), turno e exportar relatórios CSV.

4. **Abas 04, 05 e 06 — Rigor Científico V3**
   - Comparativo completo dos 7 modelos (`LSTM_Huber`, `LSTM_residual_fisico`, `RandomForest`, `RNN`, `Referencia_fisica`, `Persistencia_1h/24h`), simulador interativo de *clipping* AC, 7 testes físicos automatizados e retreinamento da IA ao vivo.


## Monitoramento automático de teste

**Integração online disponível:** em **Monitoramento > Fonte pública online**, o Helionta consulta uma fonte publicada como inversor na SolarNetwork, armazena leituras e exibe energia horária com origem e atrasos. Não exige equipamento próprio nem credenciais para esta fonte pública. Instruções e limites em [FONTE_PUBLICA.md](FONTE_PUBLICA.md). Os dados pertencem a uma instalação externa e não representam a casa de Igarassu.

O Helionta também inclui um simulador de inversor com coleta automática, histórico persistente e gráfico por hora. Abra `http://127.0.0.1:8000/#monitoramento` e escolha **Simulador**. Há modos acelerado e de relógio real, controles de pausa/retomada e exportação. Nesse modo, os dados são fictícios e não há conexão com equipamento físico. Instruções e testes em [MONITORAMENTO.md](MONITORAMENTO.md).
