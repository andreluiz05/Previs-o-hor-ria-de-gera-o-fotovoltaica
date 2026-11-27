# Helionta — roteiro para apresentar e testar

## Abrir

Clique duas vezes em **iniciar_apresentacao.bat**. O navegador abrirá em **http://127.0.0.1:8000**. O inicializador reutiliza o servidor se ele já estiver funcionando. Não é necessário abrir dois terminais.

## 1. Colocar as informações

Entre em **Minha usina**. Já há uma instalação fictícia de Igarassu/PE: 10 placas de 550 Wp, inversor de 5 kW, inclinação de 10°, orientação Norte e tarifa de R$ 0,92/kWh. Você não precisa possuir placas para testar.

Mude, por exemplo, a quantidade para 8 placas e clique em **Salvar configuração**. Volte a **Visão geral**: os cálculos passam a usar o cadastro salvo. Wp é a potência de cada placa; kW é a capacidade do inversor; kWh é a energia produzida em um intervalo.

## 2. Mostrar o clima e a previsão

Em **Visão geral**, clique em **Atualizar previsão**. O cartão de clima mostra a origem, o horário da consulta, a temperatura, as nuvens e a chuva previstas para as próximas horas. Esses dados são previsão meteorológica regional da Open-Meteo, não sensores instalados em casa.

- **Clima atualizado · Open-Meteo**: consulta à API concluída e todas as horas necessárias recebidas.
- **Clima salvo**: a API falhou, mas há um arquivo da mesma localização, com menos de seis horas e cobertura de todo o período.
- **Clima de demonstração**: cenário ilustrativo calculado localmente. Não é a previsão do tempo atual.

Para demonstrar sem internet, abra **Ajustar previsão** e alterne **Consultar clima online** para **Modo demonstração**. Clique novamente para voltar à API. Os horários sempre correspondem às próximas horas; arquivos vencidos ou de outra cidade não são reaproveitados.

O gráfico estima a geração por hora e a economia pela tarifa cadastrada. O modelo atual foi treinado com dados sintéticos; não há precisão comprovada para uma instalação real. A economia é uma estimativa bruta, não o valor final da conta de luz.

## 3. Digitar uma geração de exemplo

Entre em **Real × previsto** e clique em **Testar com exemplo de 24h**. O sistema prepara um dia recente de geração fictícia e calcula a comparação, sem precisar escolher arquivo.

Para usar seus próprios números:

1. Clique em **Baixar CSV de exemplo**.
2. Abra no Excel, LibreOffice Calc ou Bloco de Notas.
3. Mude somente os valores da coluna `energia_kwh`. Aceita ponto ou vírgula decimal em CSV separado por ponto e vírgula.
4. Cada linha é a energia de uma hora, não o valor acumulado do dia. `09:00` representa o intervalo que termina às 9h. Use zero à noite.
5. Salve como CSV. Mantenha **Meu CSV contém valores fictícios de teste** marcado.
6. Clique em **Importar CSV do inversor**, selecione o arquivo e confira o resultado. São necessárias pelo menos seis horas válidas.

Essa comparação não treina a IA. Exemplos fictícios não são salvos como base de medições reais. O histórico de demonstração abaixo do importador é outra consulta, separada do arquivo que você acabou de enviar.

Na comparação de CSV, as primeiras 24 horas usam a referência física: falta uma janela anterior completa para executar a IA. Arquivos mais longos podem usar a estimativa híbrida a partir da 25ª hora. A tela informa o método utilizado.

## 4. Mostrar dados chegando automaticamente

Entre em **Monitoramento > Fonte pública online** para mostrar a coleta de uma instalação externa da SolarNetwork. Use **Conectar API** e **Desconectar API** para demonstrar o controle da conexão. Ao desconectar, o histórico permanece salvo e a previsão com os dados cadastrados continua disponível. Use **Configurar minha usina** para preencher os equipamentos e depois abrir a previsão. As medições têm origem, horário e identificação de atraso; consulte [FONTE_PUBLICA.md](FONTE_PUBLICA.md) para detalhes.

Para simular os equipamentos cadastrados de Igarassu, escolha **Simulador**, o modo **Acelerado** e o cenário desejado. Clique em **Nova simulação** para começar um histórico vazio, depois use iniciar/pausar conforme os controles da tela. A cada dois segundos, o simulador avança quinze minutos e registra a potência e a energia. As sessões ficam salvas e podem ser exportadas.

Esse monitoramento usa um cenário solar fictício independente do clima da Open-Meteo. Não há inversor físico conectado. A conexão com equipamento real exige um adaptador para a marca/modelo e as credenciais ou o acesso local correspondentes.

## 5. Treinamento opcional

Para a apresentação normal, o modelo já está carregado: você pode cadastrar, prever, comparar e simular sem treinar novamente. Se quiser demonstrar treinamento, siga [o guia de Igarassu](frontend/public/exemplos/COMO_TESTAR_IGARASSU.md). O treinamento substitui os modelos anteriores; exporte os relatórios antes se quiser preservá-los.

O projeto está preparado para demonstração acadêmica e testes individuais locais, incluindo a coleta de uma fonte pública externa. A validação da IA com geração medida e a conexão ao inversor da própria residência continuam sendo etapas futuras.
