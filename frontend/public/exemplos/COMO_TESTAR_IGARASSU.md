# Guia rápido de teste em casa — sem placas solares e sem inversor

Você não precisa possuir placas solares nem inversor físico para explorar todos os recursos do **Helionta**. Todo o painel aceita valores fictícios direto pela tela.

## 1. Abrir e encerrar o sistema

- **Para ligar:** dê dois cliques em `iniciar_apresentacao.bat` na pasta principal do projeto (ele abre `http://127.0.0.1:8000` automaticamente).
- **Para desligar quando terminar:** dê dois cliques em `parar_helionta.bat`.

## 2. Simular a usina da sua casa (`Minha usina`)

1. Abra a aba **Minha usina**.
2. Clique em um dos botões rápidos no topo (*Casa Compacta*, *Residência Padrão*, *Casa Grande* ou *Teste de Clipping*) ou invente qualquer combinação de placas, potência (Wp), inversor (kW), direção do telhado e tarifa (`R$/kWh`).
3. Pesquise sua cidade (ex.: `Igarassu`, `Recife`, `Fortaleza`, `São Paulo`) ou digite o nome do seu bairro.
4. Clique em **Salvar configuração**.

## 3. Ver a previsão das próximas 24h (`Visão geral`)

1. Vá em **Visão geral** e confira a energia prevista (kWh) e a economia bruta e líquida estimada (Lei 14.300) usando o clima real da Open-Meteo para a sua localização.
2. Se quiser testar o envio de histórico recente sem inversor, abra **Ajustar previsão** e clique em **Preencher 24h fictícias**.

## 4. Digitar valores fictícios hora a hora direto no painel (`Real × previsto`)

1. Vá em **Real × previsto** e clique em **Digitar valores fictícios no painel** (não precisa usar Excel!).
2. Teste os botões **Dia normal**, **Placas sujas (−38%)** ou **Queda 11h–14h**, ou digite manualmente qualquer valor em `kWh` nas caixas das `06:00` às `18:00`.
3. Clique em **Comparar valores digitados** para ver o gráfico comparativo e os alertas automáticos de subgeração/sombreamento.

## 5. Simular telemetria ao vivo (`Monitoramento`) e IA (`Treinamento da IA`)

- Em **Monitoramento**, a aba **Simulador (sua usina fictícia)** já abre selecionada: escolha *Sol forte*, *Céu nublado* ou *Dia chuvoso* e clique em **Iniciar simulação**.
- Em **Ferramentas avançadas > Treinamento da IA**, você pode treinar no **Modo Demo (120 Dias Sintéticos)** em ~3 segundos (*Treino Rápido Ao Vivo*) ou testar o **Modo CSV Medido** clicando em **Gerar e carregar 30 dias fictícios para teste**.
