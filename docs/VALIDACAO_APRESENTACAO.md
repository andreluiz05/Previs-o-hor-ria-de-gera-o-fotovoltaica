# Verificação para a apresentação — 27/11/2026

O cenário residencial fictício de Igarassu/PE foi preservado: 10 placas de 550 Wp e inversor de 5 kW. Não foi iniciado treinamento nem alterado o modelo salvo.

| Verificação | Resultado |
| --- | --- |
| Open-Meteo consultada pelo próprio servidor, com as oito variáveis horárias | API respondeu; previsão atual de 24 horas recebida |
| Cadastro alterado para 8 placas e tarifa de R$ 1,10, depois restaurado | Dados persistem e modificam a previsão e a economia |
| CSV de exemplo e CSV manual com vírgula decimal | Importados; soma manual de 1,50 kWh conferida |
| Cache meteorológico vencido, incompleto, corrompido ou de outra localização | Recusado; demonstração identificada sem reutilizar datas antigas |
| Monitoramento automático | Coleta, pausa, retomada, histórico, exportação e reconexão verificados |
| Interface | Navegação, formulários, exportação, temas claro/escuro e tamanhos de celular/tablet/computador verificados |
| Compilação da interface | Concluída com sucesso |

Foram aprovados 21 testes de backend e 120 verificações de fluxos HTTP e de navegador. A interação de treinamento foi verificada com resposta HTTP simulada para preservar os modelos; os testes de cadastro, clima, importação, previsão e monitoramento usaram a API local em execução.

Relatórios detalhados em `frontend/artifacts/apresentacao-http.json`, `pronto-uso-browser.json`, `validation.json`, `actions-validation.json` e `monitoramento-ui-validation.json`.

Esses testes verificam o funcionamento do software. Não demonstram precisão da IA em uma instalação real. O modelo foi treinado com dados sintéticos e o monitoramento continua sendo um simulador. O acesso à Open-Meteo depende da conexão à internet disponível no momento da apresentação.

Roteiro de uso: [APRESENTACAO.md](APRESENTACAO.md).

## Integração com fonte pública online

Foi adicionada coleta somente de leitura da SolarNetwork, nó 1000, fonte `/0145/S1/G1/INV/2`, publicada como inversor. O teste real recebeu potência, contador e energia em 42 dos 48 intervalos consultados; os demais ficaram sem leitura. A API respondeu, mas a última medição estava atrasada, situação identificada no painel.

Foram aprovados os 35 testes atuais de backend, 18 verificações HTTP da conexão externa, 25 verificações do painel online e 16 verificações do simulador. A compilação passou. O servidor foi reiniciado de fato, mantendo a coleta ativada, o histórico e os arquivos de cadastro/modelos intactos.

Os testes de falha de rede, repetição de amostras, unidades, contador inconsistente e origem inválida usam respostas controladas em banco temporário. A conexão e a nova consulta automática também foram verificadas com a API externa real. A falha apresentada no teste visual foi simulada na resposta de status, sem alterar o coletor.

## Controles de conexão e demonstração da previsão

O Monitoramento agora oferece **Conectar API**, **Desconectar API**, **Configurar minha usina** e **Ver minha previsão**. Os endpoints explícitos de conectar/desconectar preservam as rotas anteriores. A opção desconectada mantém o histórico e o estado ao recarregar.

O roteiro real no navegador passou em 13 verificações: desconexão pela interface, persistência ao recarregar, alteração e salvamento de placas/tarifa no formulário e cálculo das próximas 24 horas com a fonte pública desconectada. A previsão utilizou os valores cadastrados e não reativou nem consultou a SolarNetwork. A reconexão pelos botões também foi verificada. O cadastro e a ativação originais foram restaurados ao final do teste.

Os 14 testes do coletor público passaram novamente e a interface compilou. Relatório do roteiro: `frontend/artifacts/conexao-previsao-browser.json`.

Relatórios: `frontend/artifacts/fonte-publica-http.json`, `fonte-publica-browser.json`, `fonte-publica-reinicio.json` e `monitoramento-ui-validation.json`. Instruções e limites em [FONTE_PUBLICA.md](FONTE_PUBLICA.md).
