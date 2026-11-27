# Fonte solar pública online — Helionta

## Usar agora

Abra **Inversor público** no menu e clique em **Conectar API**. O primeiro cartão mostra a última potência em watts, o horário da medição em Nova York e em Pernambuco e as cinco medições distintas mais recentes disponíveis. O painel consulta o servidor a cada dez segundos enquanto estiver visível. O servidor consulta a SolarNetwork a cada minuto e continua coletando enquanto estiver ligado, mesmo com o navegador fechado. [Abrir monitor local](http://127.0.0.1:8000/#inversor-publico)

A conexão é somente de leitura. Não exige chave ou cadastro: acessa endpoints públicos da SolarNetwork. O uso pessoal é gratuito conforme as [condições do provedor](https://solarnetwork.net/legal.html); uso comercial precisa ser tratado com o provedor.

## Fonte utilizada

- Provedor: SolarNetwork.
- Nó: `1000`.
- Fonte: `/0145/S1/G1/INV/2`, identificada na plataforma como inversor 2.
- Fuso informado pelo nó: `America/New_York`. Não há localização exata, marca, modelo ou potência nominal confirmados.
- [Resposta pública de potência e contador de energia](https://data.solarnetwork.net/solarquery/api/v1/pub/datum/mostRecent?nodeId=1000&sourceId=%2F0145%2FS1%2FG1%2FINV%2F2).
- [Documentação da API SolarQuery](https://github.com/SolarNetwork/solarnetwork/wiki/SolarQuery-API).

Essa instalação é externa: não pertence ao usuário em Igarassu. Seu cadastro de placas, a previsão meteorológica de Igarassu e o modelo de IA não alteram essas medições. A origem é identificada como pública externa na tela e no CSV. O fabricante/modelo do hardware não foi verificado no local.

## O que o sistema faz

- Consulta a última leitura a cada 60 segundos; atualiza o histórico de 48 horas encerradas a cada 10 minutos.
- Preserva o horário original da leitura e o horário em que ela foi recebida.
- Guarda cada horário de medição uma vez: reconsultar uma amostra não inventa novas leituras.
- Converte potência `watts` para kW e energia `wattHours` para kWh. Não usa o campo `wh`, nem confunde potência média com energia.
- Usa a energia horária agregada pelo provedor. O contador acumulado do equipamento é exibido separadamente e não é tratado como geração diária.
- Mantém horas sem informação em branco; energia igual a zero só aparece quando a fonte realmente publicou zero.
- Recusa fonte diferente, dados não finitos, datas no futuro e energia negativa. Intervalos com queda inconsistente do contador ficam sem energia e com identificação do problema.
- Informa leituras com mais de 20 minutos como atrasadas, mesmo que a API responda. Uma conexão bem-sucedida não garante que o equipamento tenha publicado uma nova amostra.
- Em erro de rede, preserva os últimos dados e informa a falha. Não troca por simulação.
- Salva a ativação e retoma a coleta após reiniciar o servidor.

O histórico fica em `backend/monitoramento/fonte_publica.sqlite3`, separado do simulador e dos arquivos de treinamento. Nenhum dado é enviado à instalação nem usado para treinar a IA automaticamente.

## Controles e exportação

**Desconectar API** desliga as consultas automáticas e preserva o histórico. A desconexão permanece ao recarregar a página ou reiniciar o servidor. **Conectar API** reabilita a coleta. Uma requisição já enviada antes da desconexão pode terminar, mas seu resultado não é salvo se a coleta já foi desligada.

**Exportar histórico** baixa um CSV com energia, identificação da fonte, qualidade e horários. As datas do CSV incluem o fuso UTC. A tabela mostra o fuso da instalação; os horários de consulta e leitura também aparecem no horário do Brasil.

Para demonstrar a previsão preenchendo informações, use **Configurar minha usina**, informe cidade, quantidade e potência das placas, inversor e tarifa e salve. Depois clique em **Ver Previsão das Próximas 24h Agora**. O atalho **Ver minha previsão** no Monitoramento também abre a Visão geral. Esse cálculo usa o cadastro e o clima da Open-Meteo e funciona com a SolarNetwork desconectada.

Os endpoints explícitos são `POST /api/fonte-publica/conectar` e `POST /api/fonte-publica/desconectar`. As rotas anteriores de iniciar/pausar continuam disponíveis.

Para continuar os testes da casa fictícia, escolha **Simulador** na mesma página. Os dois coletores têm controles independentes e seus históricos permanecem separados.

## Limites desse piloto

A fonte pública pode ficar indisponível, atrasar ou deixar de compartilhar dados. Ela serve para exercitar uma integração externa em funcionamento; não demonstra precisão da IA nem representa uma instalação residencial do usuário. Para conectar uma casa real, será preciso configurar o acesso autorizado ao inversor ou ao serviço dessa casa.

O coletor deve rodar com apenas um processo de servidor (`uvicorn`, sem `--workers` múltiplos). Não foi implantado um serviço de hospedagem externa: o piloto roda na máquina local.
