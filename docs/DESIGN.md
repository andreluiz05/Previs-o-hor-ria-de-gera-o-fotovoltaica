# Helionta — console solar editorial

Redesign dos seis módulos existentes, com React 18, CSS e Recharts. A interface mantém os contratos de `src/api/clienteApi.js` e a modelagem do backend.

## Direção visual

O dashboard prioriza prever energia, acompanhar economia, comparar resultados e configurar a instalação. A referência conceitual é um instrumento de operação solar com hierarquia editorial: navegação verde profunda, superfície neutra e âmbar reservado ao contexto solar.

**DFII: 15** — impacto 4 + adequação 5 + viabilidade 5 + desempenho 4 − risco de consistência 3. A curva solar contínua, o traçado físico em âmbar e a escala dos números formam a assinatura visual. A identidade vem da relação entre os dados de energia, a tipografia e a navegação.

## Sistema de design

- **Space Grotesk:** títulos e valores, com unidades menores para facilitar a leitura.
- **Plus Jakarta Sans:** interface, rótulos e explicações.
- **JetBrains Mono:** tabelas e valores técnicos.
- **Cores:** variáveis semânticas em `src/estilos/tema.css`, incluindo séries dos gráficos. Verde profundo `--sidebar-bg`, verde operacional `--action-bg`, âmbar `--solar-amber` e superfícies `--bg-*`. Os temas claro e escuro têm mapeamentos próprios.
- **Espaçamento:** base de 4 px; componentes com intervalos de 8, 12, 16, 24 e 32 px.
- **Movimento:** entrada breve de conteúdo e feedback de interação. `prefers-reduced-motion` remove animações CSS. A curva principal não usa animação de dados.
- **Gráficos:** legenda, tooltip, tabela equivalente e traçado físico descontínuo. O estado de cache meteorológico é explícito.

As fontes continuam usando a integração Google Fonts existente, com fallback local. A consulta externa pode depender da rede do usuário.

## Organização

- Visão geral abre a previsão, três indicadores principais e a curva horária. A referência física fica nos detalhes.
- Localização, horizonte de 12/24h, arquivo de telemetria e contingência ficam em uma seção recolhível.
- Minha usina prioriza o formulário. A jornada e os guias de exportação dos inversores são recolhíveis.
- A operação aparece no menu principal; a análise científica fica em “Ferramentas avançadas”.
- Links `#operacional`, `#usina`, `#consulta`, `#benchmark`, `#fisica` e `#treino` permitem acesso direto e histórico do navegador.
- Tema persistido em `localStorage`, menu móvel com Escape e retorno de foco, link para pular ao conteúdo, rótulos associados aos campos e estados de carregamento/erro.
- Painéis são carregados sob demanda com `React.lazy` e `Suspense`.

O cadastro, a comparação, as importações, as exportações, o benchmark, o simulador e o treinamento continuam disponíveis. O motor físico, os modelos e as configurações reais da instalação foram preservados. O título da API foi atualizado para Helionta.

## Verificação

`npm run build` concluiu sem avisos de tamanho de chunk. O pacote principal tem aproximadamente 169 kB antes de gzip; os gráficos ficam em um chunk compartilhado separado, e os módulos carregam sob demanda. O resultado compilado está em `dist` e é servido pelo FastAPI na porta 8000, inclusive no modo de apresentação.

Os scripts de navegador usam o protocolo do Chrome e módulos nativos do Node, sem adicionar dependências ao aplicativo:

```powershell
# Dentro de frontend, com os servidores iniciados:
node scripts/verify-dashboard.mjs
node scripts/verify-actions.mjs

# Para verificar a compilação servida pelo FastAPI:
$env:TECALLI_UI_URL = 'http://127.0.0.1:8000'
node scripts/verify-dashboard.mjs
node scripts/verify-actions.mjs
```

Requer Node com `fetch` e `WebSocket` globais, como a versão 24 usada na validação. No Windows, localiza Chrome/Edge nos caminhos padrão. `TECALLI_BROWSER` permite indicar outro executável. A automação usa perfil temporário próprio, que é removido ao terminar; não acessa o perfil pessoal do navegador.

**53 verificações da interface:** seis módulos em 375, 768, 1024 e 1440 px, ausência de rolagem horizontal da página, controles dos gráficos, consulta por modelo, simulador, tema persistente, rótulos, menu móvel, Escape, exportação ZIP no celular e movimento reduzido. Nenhuma exceção JavaScript ou resposta HTTP de erro durante esse percurso.

**9 verificações de ações:** dados dos CSVs exportados, erro de importação inválida via API real, payload de salvamento e seu feedback, navegação após salvar, predefinição de treino e atualização do progresso. Salvamento e treinamento usam respostas HTTP simuladas para preservar os arquivos e os modelos existentes. Não houve execução de novo treinamento. As previsões, consultas e simulações usaram o backend real.

**Contraste:** 14 pares centrais de texto/fundo medidos, todos com razão mínima 4,5:1 nos dois temas. Isso é uma verificação dos tokens principais, não uma declaração de auditoria completa de acessibilidade.

Resultados e capturas em `artifacts/validation.json`, `artifacts/actions-validation.json`, `artifacts/contrast-validation.json` e `artifacts/*-desktop.png` / `*-mobile.png`.


## Marca e uso por leigos

A identidade do produto é **Helionta**, desenvolvido pela **Tecalli Tecnologia**. Logos e apresentações: `../assets/brand/README.md`. Avaliação de prontidão, limites e melhorias de orientação: `USABILIDADE.md`. O guia inicial é opcional; a base de demonstração é explícita; a navegação avançada fica recolhida. Os parâmetros do modelo e os dados climáticos detalhados continuam disponíveis.
