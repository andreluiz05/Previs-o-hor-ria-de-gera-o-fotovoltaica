# Monitoramento automático simulado — Helionta

O módulo simula leituras de um inversor para experimentar a coleta automática sem equipamento físico. Todos os registros, gráficos e CSVs identificam a fonte como simulação. Não existe conexão com hardware neste módulo.

## Usar

Abra `http://127.0.0.1:8000/#monitoramento`.

Escolha **Simulador** para os controles descritos abaixo. A mesma página também oferece **Fonte pública online**, documentada em [FONTE_PUBLICA.md](FONTE_PUBLICA.md), com coleta externa independente.

- **Iniciar / Retomar:** habilita a coleta no backend.
- **Pausar:** interrompe novas leituras.
- **Nova simulação:** começa outra sessão, conservando as anteriores.
- **Teste rápido:** a cada 2 segundos reais, o relógio simulado avança 15 minutos. Uma hora simulada leva aproximadamente 8 segundos, conforme a disponibilidade do processo.
- **Relógio real:** os registros usam o horário UTC−3 e são coletados a cada 2 segundos. À noite, a potência simulada pode ser zero.
- **Clima artificial:** sol forte, nublado ou chuva. Não usa a previsão meteorológica externa.
- **Histórico:** permite consultar sessões anteriores e exportar os intervalos em CSV.

O servidor do Helionta precisa permanecer ligado. O navegador pode ser fechado. O próximo acesso recupera as leituras salvas. A interface deixa de consultar enquanto a aba está oculta e retoma ao voltar; isso não interrompe o coletor.

## Armazenamento e integridade

`backend/monitoramento/telemetria.sqlite3` contém as sessões, as leituras e os agregados horários em SQLite. A configuração de cada sessão é preservada no momento em que ela começa. Ao alterar a instalação em Minha usina, inicie uma nova simulação para usar os novos equipamentos.

Os dados de treinamento, os pesos LSTM, a base de benchmark e o CSV importado não são usados nem sobrescritos pela coleta. O simulador não dispara treinamento.

A potência artificial respeita a potência do inversor e a geometria solar do local cadastrado. É uma curva de teste, não uma previsão validada nem uma medição de energia.

A energia em kWh é integrada da potência em kW entre leituras e repartida nos limites horários. Horas parciais mostram a cobertura coletada. Horas sem dados permanecem sem valor, em vez de receber zero. Uma lacuna longa no relógio real não é preenchida com energia inventada. O modo acelerado pausa seu próprio relógio quando a coleta é pausada.

O estado da coleta persiste. Se o backend for reiniciado com a simulação ativa, a sessão é retomada. No relógio real, uma ausência de coleta continua sendo uma lacuna. O relógio acelerado retoma da última posição.

Use uma única instância/processo do coletor para esse aplicativo local. O lançamento padrão do projeto já usa um processo. Coordenação entre vários workers ou servidores não faz parte desta implementação.

## Código

- `backend/monitoramento.py`: fonte simulada, coleta, energia horária, SQLite e histórico.
- `backend/main.py`: ciclo de vida do coletor e rotas HTTP.
- `frontend/src/componentes/PainelMonitoramento.jsx`: controles, atualização automática, indicadores, gráfico e tabela.

Rotas:

- `GET /api/monitoramento/status?sessao_id=...`
- `POST /api/monitoramento/iniciar`: `modo`, `cenario`, `nova_sessao`.
- `POST /api/monitoramento/pausar`.
- `GET /api/monitoramento/exportar?sessao_id=...`.

O CSV usa `fonte=SIMULADOR_FICTICIO`, informa a qualidade de cada hora e mantém lacunas vazias. A interface mostra as últimas 48 horas simuladas; o banco conserva o histórico da sessão.

## Verificação

Na pasta backend:

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
.venv\Scripts\python.exe tests/verify_monitoramento_http.py
```

Na pasta frontend, com o servidor iniciado e uma sessão simulada ativa:

```powershell
node scripts/verify-monitoramento.mjs
```

Foram verificados 14 testes de cálculo/persistência, 11 verificações HTTP e 16 de navegador, incluindo pausa, retomada, histórico, desconexão da página, exportação e layouts de 375 a 1440 px. A retomada após reiniciar o servidor foi testada separadamente. Os 53 testes dos módulos existentes e as 9 verificações de ações também passaram. Nas verificações de ações, salvamento e treinamento continuam simulados para preservar os modelos existentes.

Resultados e capturas: `frontend/artifacts/monitoramento-*.json` e `monitoramento-*.png`.

## Conector para um inversor real

A fonte simulada está separada do armazenamento e da interface. Um conector real ainda deverá implementar autenticação e leitura compatíveis com o fabricante/modelo, normalizar potência e energia acumulada, tratar reinícios do contador e classificar a origem como medição real. Os dados fictícios devem continuar separados dos reais. Nenhuma API de fabricante ou comunicação Modbus foi implementada nesta etapa.
