# Avaliação de uso do Helionta

## Conclusão

O uso pretendido é **uma pessoa, em casa, acompanhando a própria instalação**. Para esse cenário local e individual, contas separadas e isolamento entre clientes não são requisitos. O projeto permite cadastrar os equipamentos e a localização e obter uma referência estimada de geração, mesmo sem importar histórico. A precisão para a instalação específica ainda precisa ser conferida contra medições reais; testes de interface não comprovam essa precisão.

## O que já é personalizado

Nome da instalação, cidade/coordenadas, quantidade e potência das placas, modelo, inversor, inclinação, direção, eficiência, perdas, parâmetros térmicos e tarifa. A previsão operacional usa a configuração ativa. O motor físico recalcula a referência e o modelo residual adapta sua escala à potência cadastrada.

Essa adaptação não é um treinamento automático para cada proprietário. O treinamento é uma operação explícita e depende do histórico usado no pipeline. A base atual indica dados fictícios de teste de software; os indicadores do benchmark não comprovam a precisão em uma instalação real.

## Limites confirmados no código

| Área | Situação atual | Consequência |
| --- | --- | --- |
| Contas | Não há autenticação nem associação de dados a contas | Pessoas acessando a mesma instância compartilham a configuração |
| Configuração | `config_usuario_ativa.json` armazena uma configuração ativa | Não existe carteira de instalações isoladas por cliente |
| Equipamentos | O validador atende sistemas on-grid sem bateria | Não oferecer como simulador de qualquer tipo de sistema solar |
| Inversores | Importação por CSV | Não há conexão automática implementada com o aplicativo ou a nuvem do inversor |
| Histórico | A consulta lê a base do último benchmark | O histórico de demonstração precisa ser distinguido dos dados enviados pelo proprietário |
| Treinamento | Modelo de referência, treino explícito e adaptação de escala | Precisão para cada instalação precisa ser avaliada com dados próprios |
| Meteorologia | Consulta online com fallback para dados salvos | O modo de fallback pode não representar o clima atual |
| Operação | Backend local, arquivos compartilhados e interface web | Implantação comercial exige autenticação, isolamento de dados e operação apropriada |

Referências locais: `backend/main.py` (rotas e estado compartilhado), `backend/solar_engine.py` (`validate_config`, `salvar_config_ativa`, `consultar_historico_comparativo`, `previsao_operacional`).

## Melhorias realizadas nesta etapa

- Helionta como produto e Tecalli Tecnologia como desenvolvedora.
- Guia inicial opcional com três ações e possibilidade de reabrir em “Como começar”.
- Navegação cotidiana com três módulos; ferramentas técnicas recolhidas e acessíveis por link direto.
- Explicação dos equipamentos e das unidades, com orientação sobre onde encontrar os dados.
- Cidade escolhida pela busca para atualizar nome e coordenadas juntos; coordenadas manuais disponíveis separadamente.
- Três indicadores principais; referência física, clima detalhado e parâmetros do modelo em seção recolhível.
- Avisos sobre base sintética, modelo adaptado, clima salvo e diferença entre economia estimada e conta final.
- Logos com transparência real, favicon próprio e apresentações visuais das duas identidades.

## Validação para o uso doméstico individual

1. Validar a jornada com proprietários leigos usando seus equipamentos e seus arquivos reais.
2. Avaliar o modelo com histórico real, documentando precisão e limites em instalações diferentes.
3. Conferir o processo de exportação do inversor usado pela pessoa, incluindo unidade, período e significado dos registros.
4. Garantir que a pessoa reconheça quando está vendo histórico de exemplo, meteorologia salva e uma estimativa.

Contas, autorização e isolamento de dados passam a ser requisitos se houver uma futura versão compartilhada por clientes independentes. Não bloqueiam o cenário doméstico individual especificado.

## Verificação desta etapa

53 verificações de interface e responsividade, 9 de ações e 10 de marca/primeiro acesso. Telas em 375, 768, 1024 e 1440 px. As ações de salvar e treinar tiveram respostas HTTP simuladas; a configuração ativa e os modelos reais foram preservados. Previsões, consultas, simulações e erro de importação inválida usaram o backend real.

Os testes e as capturas estão em `frontend/scripts/` e `frontend/artifacts/`. Nenhum teste com pessoas leigas foi realizado nesta sessão.


## Caminho dos dados do proprietário

1. **Cadastro:** cidade/coordenadas e equipamentos vêm da proposta de instalação ou das etiquetas. A tarifa vem da conta de luz.
2. **Previsão sem arquivo:** os equipamentos alimentam o modelo físico e o modelo de referência adaptado. O clima é consultado automaticamente. Sem medições, as 24h anteriores são estimadas fisicamente.
3. **Comparação:** o CSV do aplicativo do inversor entra em “Real × previsto”. São necessárias pelo menos seis horas válidas, com `data_hora` e `energia_kwh`. Cada valor representa energia gerada no intervalo; potência instantânea em kW e acumulados diários não são equivalentes a essa coluna.
4. **Histórico recente na previsão:** o envio opcional em “Ajustar previsão” deve cobrir as 24h anteriores completas exigidas pelo cálculo, incluindo as horas noturnas com zero. O arquivo entra no histórico de inferência; enviar um CSV para comparação não o aplica automaticamente nessa previsão.
5. **Retreinamento:** é uma operação separada, disponível nas ferramentas avançadas. Importar um histórico com pelo menos 240 horas válidas também pode preparar uma base para treino, mas não dispara o treinamento por conta própria.


## Monitoramento automático simulado

Foi acrescentado o módulo Monitoramento com uma fonte de leituras fictícias, histórico persistente, atualização da tela e controles de pausa. O coletor continua com o navegador fechado e o servidor ligado. Isso permite experimentar a jornada automática, mas não conecta um equipamento físico. Os dados de simulação ficam separados do treinamento e da importação manual. Detalhes em `../MONITORAMENTO.md`.
