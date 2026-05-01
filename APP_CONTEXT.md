# Atlas Finance: Contexto, Escopo e Limites

## Visao geral

O Atlas Finance e um app financeiro pessoal com foco em:

- registro rapido de receitas e despesas
- leitura visual clara em desktop e mobile
- previsao de saldo e ritmo financeiro
- organizacao por categorias, cofres e recorrencias
- insights acionaveis com base no historico

A proposta do produto nao e ser um ERP financeiro completo nem um sistema contabil. Ele foi pensado como um painel pessoal de decisao, com uma experiencia visual forte e uso diario simples.

## Direcao de produto

O app foi desenhado para combinar referencias de:

- Obsidian: densidade visual, atmosfera mais editorial e foco
- Wise: clareza financeira, blocos objetivos e leitura pratica
- iOS: responsividade elegante, hierarquia suave e detalhes de interface
- Nubank, Notion e Google Sheets: mistura de simplicidade, flexibilidade e organizacao

A ideia central e permitir que uma pessoa acompanhe o proprio dinheiro sem friccao, com uma interface que incentive consulta frequente e registro rapido.

## O que o app faz hoje

### Registro financeiro

O app permite:

- criar transacoes de receita e despesa
- classificar por categoria
- adicionar nomeacao, data, hora, observacao e cofre/objetivo
- cadastrar despesas recorrentes e parcelamentos

### Visualizacao financeira

O painel mostra:

- saldo liquido atual
- media mensal de gastos
- sobra prevista
- risco estimado de saldo negativo
- progresso de cofres/metas
- distribuicao por orcamento
- resumo anual com grafico
- historico recente

### Camada de previsao

Com base nos dados registrados, o app tenta inferir:

- media recente de consumo
- impacto de despesas recorrentes no proximo ciclo
- sobra projetada
- dias ate ruptura de saldo, se houver
- alertas de estouro de categoria
- padroes como gastos noturnos, fim de semana e microgastos frequentes

### Persistencia

Hoje a persistencia funciona de duas formas:

- Supabase, quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estao configurados
- fallback local no navegador, quando o Supabase nao esta disponivel

## Estrutura funcional do sistema

O app hoje se apoia em quatro blocos principais:

### 1. Transacoes

Representam entradas e saidas individuais.

Campos principais:

- tipo
- categoria
- valor
- titulo
- data e hora
- cofre
- observacao

### 2. Recorrencias

Representam gastos fixos ou parcelamentos com duracao definida.

Campos principais:

- descricao
- categoria
- valor
- data inicial
- quantidade de meses

### 3. Orcamentos por categoria

Sao os limites planejados por area de gasto.

Exemplos:

- moradia
- alimentacao
- transporte
- saude
- lazer
- educacao

### 4. Cofres e metas

Sao agrupadores conceituais para objetivos financeiros.

Exemplos:

- reserva de liquidez
- quitacao de divida
- crescimento patrimonial

## O que ele ainda nao faz de verdade

Apesar da interface e dos calculos sugerirem uma camada analitica mais avancada, ainda existem limites claros.

### 1. Nao existe previsao estatistica real

As previsoes atuais sao heuristicas simples, baseadas em:

- media dos ultimos meses
- recorrencias ativas
- tendencia de entrada e saida

Ele nao faz:

- modelagem preditiva real
- regressao temporal
- ajuste sazonal
- inferencia por calendario, salario, feriados ou eventos externos

Ou seja: a previsao e util como sinal tatico, mas nao deve ser tratada como simulador financeiro preciso.

### 2. Nao existe consolidacao bancaria

O app nao integra com:

- Open Finance
- extratos bancarios automaticos
- cartoes
- corretoras
- PIX

Todo dado depende de insercao manual. Isso simplifica o produto, mas limita fidelidade e frequencia de uso.

### 3. Nao existe reconciliacao de dados

O sistema nao verifica:

- duplicidade de lancamentos
- erros de digitacao
- consistencia entre parcelas e despesas reais
- divergencia entre saldo informado e saldo observado

Hoje ele confia completamente no que foi registrado.

### 4. Nao existe multiusuario nem identidade

O app foi pensado para uso pessoal e sem login.

Consequencias:

- nao ha segregacao por usuario
- nao ha permissao por perfil
- nao ha trilha de auditoria robusta
- nao ha sessao autenticada

Isso reduz atrito, mas sacrifica seguranca e controle fino.

### 5. Nao existe motor de metas robusto

Os cofres funcionam hoje mais como referencia visual do que como contas independentes.

O app ainda nao faz:

- transferencia real entre cofres
- regra automatica de alocacao por meta
- estrategia de amortizacao de divida
- simulacao comparativa entre objetivos

### 6. Nao existe suporte contabil ou fiscal

O Atlas Finance nao substitui:

- controle contabil
- apuracao fiscal
- DRE formal
- fluxo de caixa empresarial auditavel

Ele e um organizador financeiro pessoal, nao uma ferramenta contabil oficial.

## Brechas e riscos atuais

### 1. Seguranca de dados

Esta e a principal brecha hoje.

Como o app foi preparado sem login e com politica anonima no Supabase para facilitar uso pessoal:

- qualquer pessoa com acesso ao frontend pode potencialmente consultar e gravar dados
- o banco depende da privacidade da URL e do contexto de uso
- nao existe autenticacao para diferenciar usuario legitimo de visitante

Para uso estritamente pessoal e controlado, isso pode ser aceitavel. Para qualquer exposicao publica, nao e suficiente.

### 2. Confiabilidade das previsoes

Como os calculos sao simples:

- pouca base historica gera analises fracas
- um gasto fora da curva distorce medias rapidamente
- meses incompletos podem enviesar o comportamento previsto

### 3. Dependencia de disciplina manual

Sem integracao automatica:

- esquecer registros reduz muito o valor do app
- previsoes se degradam rapidamente
- insights podem ficar enganadores

### 4. Falta de governanca sobre dados

Hoje nao existem recursos como:

- backup versionado pelo app
- restauracao de historico
- exclusao com confirmacao forte
- importacao/exportacao estruturada em CSV/JSON
- trilha de alteracoes

### 5. Escalabilidade de frontend

Como o app nasceu simples e focado em velocidade:

- a logica esta concentrada em um unico arquivo principal
- a manutencao fica mais dificil conforme surgem novos modulos
- testes automatizados ainda nao existem

Isso nao impede evolucao, mas sugere que uma proxima fase deveria modularizar melhor a aplicacao.

## Possiveis expansoes

### Expansoes de produto

#### 1. Metas financeiras de verdade

Adicionar:

- metas com prazo
- valor alvo mensal
- simulacao de alcance
- comparativo entre estrategias
- amortizacao de dividas com juros

#### 2. Contas separadas

Permitir multiplas contas:

- carteira
- conta corrente
- cartao
- reserva
- investimento

Isso melhora muito previsao de saldo e leitura de liquidez real.

#### 3. Importacao de extrato

Possiveis formatos:

- CSV
- OFX
- planilhas

Isso reduziria atrito e aumentaria qualidade dos dados.

#### 4. Centro de insights mais avancado

Evolucoes possiveis:

- padroes por horario, dia da semana e epoca do mes
- categorias com crescimento anormal
- recomendacoes por meta
- simulacao "se continuar assim"
- classificacao automatica de lancamentos

#### 5. Calendario financeiro

Uma camada temporal com:

- vencimentos
- recorrencias futuras
- parcelas por mes
- dias de maior pressao de caixa

#### 6. Planejamento por cenarios

Exemplos:

- melhor caso
- caso conservador
- pior caso
- corte de 10% em lazer
- aumento de renda

#### 7. Dashboard de investimento

No futuro, o app pode expandir para:

- patrimonio
- alocacao
- rentabilidade
- metas de independencia financeira

### Expansoes tecnicas

#### 1. Autenticacao minima

Sem transformar o produto em um SaaS completo, ainda daria para incluir:

- PIN local
- magic link
- senha unica
- autenticacao simples do Supabase

Essa e provavelmente a evolucao mais importante se o app for realmente publicado.

#### 2. Estrutura melhor de codigo

Evolucao recomendada:

- separar UI, estado, servicos e analytics
- quebrar o arquivo principal em modulos
- introduzir testes
- criar tipagem com TypeScript

#### 3. API intermediaria

Hoje o frontend fala direto com o Supabase.

No futuro, pode valer criar:

- rotas serverless
- camada de validacao
- regras privadas
- protecao contra abuso

#### 4. Telemetria e observabilidade

Seria util ter:

- monitoramento de falhas
- logs de sincronizacao
- eventos de uso
- indicadores de qualidade dos dados

#### 5. Sincronizacao offline-first

Um caminho forte para experiencia pessoal premium seria:

- armazenamento local robusto
- fila de sincronizacao
- reconciliacao com o Supabase
- funcionamento offline com posterior envio

## O que faltaria para virar um produto realmente forte

Para sair de prototipo util e virar um produto maduro, os pilares mais importantes seriam:

### Prioridade alta

- seguranca minima de acesso
- modularizacao do codigo
- importacao de dados
- exclusao/edicao de registros
- melhor confiabilidade das previsoes

### Prioridade media

- metas mais inteligentes
- multiplas contas
- simulacao de cenario
- exportacao estruturada

### Prioridade futura

- automacao via Open Finance
- camada de IA mais avancada
- app mobile nativo
- comparativos historicos mais profundos

## Resumo honesto

O Atlas Finance ja e um bom painel pessoal para:

- registrar movimentacoes
- acompanhar gastos
- enxergar risco e sobra
- organizar objetivos
- ter uma leitura visual forte e agradavel

Mas ele ainda nao cobre bem:

- seguranca real para deploy publico
- automacao bancaria
- previsoes sofisticadas
- governanca forte de dados
- fluxo contabilempresarial

Em outras palavras:

Ele ja funciona como um cockpit financeiro pessoal enxuto e bonito.
Ainda nao funciona como infraestrutura financeira completa.
