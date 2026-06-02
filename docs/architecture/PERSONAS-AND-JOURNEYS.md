# LISION — Personas & User Journeys

> **Author:** @analyst (Atlas)
> **Date:** 2026-06-01
> **Status:** DEFINITIVE — Input direto para @ux-design-expert (Phase 2)
> **Base:** `PHASE1-GAP-ANALYSIS.md` + Pesquisa de contexto têxtil brasileiro
> **Sources:** CAGED/MTE, ABIT, salario.com.br, pesquisa de campo (Liserie pilot)

---

## 1. CONTEXTO OPERACIONAL REAL

### 1.1 Como funciona uma confecção têxtil no Brasil

Uma confecção média brasileira (como a Liserie) opera com 20-80 funcionários diretos e 3-15 facções terceirizadas. O processo produtivo segue uma cadeia linear com bifurcações:

```
MATÉRIA-PRIMA → CORTE → PREPARAÇÃO/AVIAMENTOS → COSTURA → TRAVETE
                                                      ↓
                                               [FACÇÃO EXTERNA]
                                                      ↓
                    LIMPEZA ← CONFERÊNCIA ← RETORNO DA FACÇÃO
                       ↓
                   EMBALAGEM → ESTOQUE → EXPEDIÇÃO
```

**Dados do setor:**
- Brasil: 1,34 milhão de empregados no setor têxtil, faturamento R$ 220+ bilhões
- Confecções são majoritariamente PMEs (< 100 funcionários)
- Margem líquida média: 3-8% — cada peça perdida impacta diretamente o resultado
- Perda média sem rastreamento: 2-5% da produção mensal (R$ 6-12k em confecções de médio porte)

### 1.2 Ambiente físico do chão de fábrica

| Fator | Realidade |
|-------|-----------|
| **Ruído** | 75-85 dB (máquinas de costura industriais, corte, prensas) — conversas difíceis |
| **Iluminação** | Forte nas bancadas de costura (tarefa visual), irregular nos corredores |
| **Temperatura** | 25-35°C (depende da região, climatização rara em PMEs) |
| **Poeira/resíduos** | Fiapos, retalhos de tecido, linhas soltas por toda parte |
| **Mãos dos operadores** | Frequentemente com linhas, sujas de óleo de máquina, usando luvas no corte |
| **Espaço** | Apertado entre bancadas; tablets fixados em suportes ou compartilhados |
| **Conectividade** | Wi-Fi instável (paredes de concreto, interferência de maquinário metálico) |

### 1.3 Turno de trabalho típico

| Turno | Horário | Características |
|-------|---------|----------------|
| **Manhã** | 07:00 - 11:30 | Maior produtividade, operadores descansados |
| **Almoço** | 11:30 - 13:00 | Pausa, equipamentos desligados |
| **Tarde** | 13:00 - 17:48 | Produtividade cai 15-20% em relação à manhã |
| **Hora extra** | 17:48 - 19:00 | Opcional, picos de demanda |

CLT: 44h semanais (8h48 de segunda a sexta, ou 8h + sábado)

---

## 2. PERSONAS DETALHADAS

### PERSONA 1: Maria do Carmo — OPERADOR(A)

| Atributo | Detalhe |
|----------|---------|
| **Nome fictício** | Maria do Carmo Souza |
| **Idade** | 32 anos |
| **Escolaridade** | Ensino médio completo |
| **Salário** | R$ 1.800 - 2.200/mês (piso CBO 763125 + hora extra) |
| **Experiência** | 6 anos em confecção, 2 na Liserie |
| **Turno** | 07:00 - 17:48 (segunda a sexta) |
| **Setor** | Costura industrial (máquina reta e overloque) |
| **Dispositivo** | Tablet compartilhado (1 por bancada de 4-6 operadoras), Android 11, tela 10" |
| **Letramento digital** | Básico — usa WhatsApp e Instagram diariamente, não usa email |
| **Contexto físico** | Mãos frequentemente com fiapos/linha, ambiente ruidoso, pressa por meta |

**Motivações:**
- Ganhar hora extra e bonificação por produtividade
- Não ser responsabilizada por peças perdidas que não foram dela
- Terminar o turno no horário

**Frustrações atuais (sem LISION):**
- "Cadê o lote que eu passei pra conferência? Ninguém sabe."
- Anotações em papel que se perdem ou ficam ilegíveis
- Ser culpada por defeitos que vieram do corte ou da facção
- Parar produção para recontar peças manualmente

**O que ela espera do LISION:**
- Bipar rápido (< 2 segundos), sem digitação
- Feedback claro e imediato (som + visual) — "deu certo" ou "deu erro"
- Não precisar navegar menus — tela dedicada para bipagem
- Reportar defeito sem complicação (2-3 toques no máximo)

**Restrições de UX:**
- Não vai ler textos longos
- Alvos de toque devem ter no mínimo 48px (dedos com luva/sujos)
- Feedback auditivo é mais confiável que visual (ela pode não estar olhando)
- Interface deve funcionar em Wi-Fi instável (queue + retry)

---

### PERSONA 2: Rodrigo — COORDENADOR(A)

| Atributo | Detalhe |
|----------|---------|
| **Nome fictício** | Rodrigo de Almeida |
| **Idade** | 38 anos |
| **Escolaridade** | Técnico em produção de vestuário |
| **Salário** | R$ 3.500 - 4.500/mês |
| **Experiência** | 12 anos em confecção, 5 como coordenador |
| **Turno** | 06:45 - 18:00 (chega antes, sai depois) |
| **Setor** | Supervisão do chão de fábrica (percorre todos os setores) |
| **Dispositivo** | Tablet próprio da empresa, Android 13, tela 10" + acesso a desktop no escritório |
| **Letramento digital** | Intermediário — usa planilhas básicas, WhatsApp Business |

**Motivações:**
- Manter a produção fluindo sem gargalos
- Identificar rapidamente onde lotes estão parados
- Garantir que metas diárias sejam atingidas
- Resolver problemas antes que cheguem ao gerente

**Frustrações atuais (sem LISION):**
- Andar pela fábrica perguntando "onde está o lote tal?"
- Descobrir no fim do dia que uma etapa atrasou 3 horas
- Não saber em tempo real quantas peças cada operador produziu
- Imprimir etiquetas é um processo manual e demorado

**O que ele espera do LISION:**
- Dashboard rápido de ver no tablet enquanto caminha pela fábrica
- Alertas de lotes parados (sem precisar consultar ativamente)
- Criar OP e imprimir etiquetas sem depender do escritório
- Ver ranking de produtividade para redistribuir carga

**Restrições de UX:**
- Usa o sistema em movimento (tablet na mão, andando)
- Precisa de informação em blocos visuais grandes (não tabelas densas)
- Cores devem ter contraste alto (iluminação variável na fábrica)
- Transições entre telas devem ser instantâneas

---

### PERSONA 3: Fabinho — GERENTE

| Atributo | Detalhe |
|----------|---------|
| **Nome fictício** | Fábio "Fabinho" Mendes |
| **Idade** | 45 anos |
| **Escolaridade** | Superior em Administração |
| **Salário** | Sócio-proprietário |
| **Experiência** | 20+ anos na indústria têxtil, fundou a Liserie |
| **Turno** | 08:00 - 18:00 (presencial) + monitoramento remoto à noite |
| **Setor** | Escritório + visitas ao chão de fábrica |
| **Dispositivo** | Desktop (Windows), MacBook pessoal, iPhone 14 |
| **Letramento digital** | Alto — usa ERP, planilhas, dashboards |

**Motivações:**
- Reduzir perda de peças (impacto direto no lucro)
- Ter visibilidade total da produção sem depender de terceiros
- Controlar facções (prazos, qualidade, pagamentos)
- Tomar decisões rápidas com dados reais
- Substituir o sistema Hunter (lento, caro, inflexível)

**Frustrações atuais:**
- "Sei que estou perdendo R$8-10k por mês em peças, mas não consigo provar onde"
- Facções atrasam e não há como cobrar com dados objetivos
- Hunter ERP bloqueia a OP inteira quando há defeito em um sub-lote
- Relatórios mensais são feitos manualmente em Excel
- Não consegue ver a produção em tempo real de casa

**O que ele espera do LISION:**
- Dashboard executivo: KPIs do dia em um olhar
- Comparativos (hoje vs ontem, esta semana vs anterior)
- Controle financeiro de facções (quanto devo, quanto desconto)
- Relatórios exportáveis para reuniões com equipe
- Módulo de qualidade para identificar padrões de defeito
- TV no chão de fábrica mostrando metas e progresso

**Restrições de UX:**
- Quer densidade de informação (múltiplos KPIs visíveis simultaneamente)
- Mas também quer drill-down (clicar no KPI para ver detalhes)
- Usa desktop 80% do tempo, celular 20%
- Valoriza estética profissional ("não pode parecer sistema de governo")

---

### PERSONA 4: Gabriel — ADMIN

| Atributo | Detalhe |
|----------|---------|
| **Nome fictício** | Gabriel Avelino |
| **Idade** | 28 anos |
| **Escolaridade** | Tecnólogo em desenvolvimento de software |
| **Papel** | Co-fundador do LISION, administrador do sistema |
| **Turno** | Remoto, horário flexível |
| **Dispositivo** | Desktop Windows (ultrawide), MacBook, iPhone |
| **Letramento digital** | Expert — desenvolvedor do sistema |

**Motivações:**
- Configurar o sistema corretamente para cada novo cliente
- Garantir que as etapas produtivas reflitam a realidade de cada confecção
- Gerenciar usuários, permissões e tokens
- Manter o sistema saudável e seguro

**O que ele espera do LISION:**
- Settings completo e funcional (etapas, metas, tokens)
- Gestão de equipe (adicionar/remover/editar membros)
- Visão do sistema como um todo (saúde, uso, erros)
- Configuração flexível que atende diferentes confecções

**Restrições de UX:**
- Aceita complexidade maior (power user)
- Mas configurações devem ser intuitivas para onboarding de clientes
- Formulários devem ter validação clara e feedback imediato
- Erros destrutivos (deletar etapa, desativar membro) devem ter confirmação rigorosa

---

### PERSONA 5: Dona Terezinha — FACÇÃO

| Atributo | Detalhe |
|----------|---------|
| **Nome fictício** | Terezinha Oliveira da Silva |
| **Idade** | 52 anos |
| **Escolaridade** | Ensino fundamental completo |
| **Renda** | R$ 1.500 - 3.000/mês (variável, por peça) |
| **Experiência** | 25 anos costurando, 10 como dona de facção (3 costureiras) |
| **Localização** | Bairro periférico, 12km da Liserie |
| **Dispositivo** | Samsung Galaxy A14 (tela 6.6", Android 13), dados móveis 4G (plano 15GB) |
| **Letramento digital** | Básico — WhatsApp, Facebook, PIX no banco |

**Motivações:**
- Receber o valor justo por cada peça costurada
- Não ser cobrada por defeitos que não foram dela
- Saber exatamente quando devolver os lotes
- Acompanhar quanto vai receber no fim do mês

**Frustrações atuais (sem LISION):**
- "Me cobraram por 12 peças com defeito, mas vieram com defeito de corte"
- Comunicação por WhatsApp é desorganizada — mensagens se perdem
- Não sabe quanto vai receber até a Liserie mandar planilha
- Quando atrasa, não tem como avisar formalmente — só manda zap
- Discordâncias sobre quantidade (ela conta X, Liserie conta Y)

**O que ela espera do LISION (Portal):**
- Ver os lotes que recebeu e confirmar no sistema
- Contestar defeitos com motivo claro
- Ver quanto vai receber (antes de o mês fechar)
- Avisar sobre atrasos de devolução
- Receber notificações de novas remessas

**Restrições de UX CRÍTICAS:**
- Tela de 6.6" com dados móveis limitados (15GB/mês)
- Textos devem ser grandes (problemas de visão, sem óculos para leitura)
- Vocabulário deve ser simples — não usar jargão técnico (ex: "shipment" → "remessa")
- Cada tela deve ter UMA ação principal clara
- Formulários mínimos (2-3 campos no máximo)
- Carregamento deve ser leve (< 200KB por página)
- Funcionar em 3G/4G instável
- Não pode depender de login por email (ela não usa email)
- Token + PIN numérico é ideal (ela sabe usar PIX pelo banco)

---

## 3. USER JOURNEYS

### 3.1 Jornada do Operador: Turno Completo

```
07:00 ─ CHEGADA
│  Maria chega, troca de roupa, vai para bancada
│  Liga o tablet compartilhado
│
07:05 ─ LOGIN POR PIN
│  Toca no ícone LISION → tela de PIN
│  Digita 4-6 dígitos no numpad → entrada imediata
│  ✓ CRÍTICO: Login < 5 segundos, sem teclado virtual completo
│
07:06 ─ TELA DE SCAN (permanece aqui 95% do tempo)
│  Vê: etapa selecionada (COSTURA), campo de barcode, último scan
│  Coordenador já definiu a etapa na estação
│
07:07-11:30 ─ CICLO DE BIPAGEM (repetido 80-150 vezes)
│  ┌─────────────────────────────────────────────┐
│  │ 1. Pega lote da pilha                       │
│  │ 2. Bipa código de barras com scanner USB    │
│  │    OU digita código manualmente             │
│  │ 3. BEEP de sucesso (880Hz) + flash verde    │
│  │    OU BEEP de warning (440Hz) + flash amber │
│  │    OU BEEP de erro (220Hz) + flash vermelho │
│  │ 4. Coloca lote na pilha de "bipados"        │
│  │ 5. Próximo lote                             │
│  └─────────────────────────────────────────────┘
│
│  EXCEÇÃO — DEFEITO ENCONTRADO (1-3 vezes por turno)
│  │  Maria nota costura torta no lote
│  │  Toca "Reportar Defeito" (botão grande, sempre visível)
│  │  → Modal abre com 3 campos:
│  │    [Tipo: dropdown] [Severidade: dropdown] [Qtd: número]
│  │  → Toca "Enviar" → toast "Defeito registrado"
│  │  → Lote vai para IN_REWORK automaticamente
│  │  ✓ CRÍTICO: < 15 segundos do toque até confirmação
│
│  EXCEÇÃO — BIPAGEM DUPLICADA
│  │  Maria bipa lote que já passou por COSTURA
│  │  BEEP de warning + mensagem "Lote já registrado nesta etapa"
│  │  ✓ NÃO bloqueia — avisa e permite continuar
│
11:30 ─ ALMOÇO
│  Maria não desloga — tablet entra em standby
│  Sessão permanece ativa (8h)
│
13:00-17:48 ─ CONTINUA BIPAGEM
│  Mesmo ciclo da manhã
│  Maria pode ver seu contador do dia (scans: 127)
│
17:48 ─ FIM DO TURNO
│  Maria vê resumo rápido do dia (se quiser)
│  Não precisa deslogar — sessão expira sozinha
│  ✓ SEM ação obrigatória no fim do turno
```

**Métricas de sucesso da jornada:**
- Tempo médio por bipagem: < 3 segundos
- Taxa de erro do operador: < 2%
- Defeitos reportados no mesmo turno de detecção: 100%
- Satisfação: "é mais rápido que anotar no papel"

---

### 3.2 Jornada do Gerente: Dia Completo

```
08:00 ─ CHEGADA NO ESCRITÓRIO
│  Fabinho abre o LISION no desktop
│  Dashboard carrega com dados do turno que começou às 07:00
│
08:01 ─ VERIFICAÇÃO MATINAL (Dashboard — 2 minutos)
│  ┌─────────────────────────────────────────────┐
│  │ OLHAR 1: KPIs do topo                       │
│  │   "54 peças bipadas, 3 OPs ativas, 0 def."  │
│  │   Meta do dia: 2100 — barra de progresso 2% │
│  │   (normal para 1h de produção)               │
│  │                                              │
│  │ OLHAR 2: Lotes parados (card vermelho)       │
│  │   "L003 parado em CONFERÊNCIA há 3.2h"       │
│  │   → Fabinho vai investigar pessoalmente       │
│  │                                              │
│  │ OLHAR 3: Chart de produção por hora          │
│  │   Linha ascendente — produção normal          │
│  │                                              │
│  │ OLHAR 4: Ranking de operadores               │
│  │   "Maria: 23 bipagens, Rodrigo: 18"          │
│  └─────────────────────────────────────────────┘
│
08:30 ─ CRIAR NOVA OP (quando novo pedido chega)
│  Produção > Nova OP
│  Preenche: nome produto, referência, quantidade total
│  Sistema gera sub-lotes automaticamente (ex: 500 peças → 3 lotes)
│  Imprime etiquetas (ZPL para Zebra GC420t)
│  Distribui etiquetas para as bancadas
│  ✓ CRÍTICO: Criação OP + impressão < 3 minutos
│
10:00 ─ MONITORAMENTO CONTÍNUO (olhadas rápidas)
│  Fabinho alterna entre Dashboard e módulo de Produção
│  Verifica progresso das OPs ativas
│  Se alerta de lote parado aparece → liga para coordenador
│
11:00 ─ DECISÃO SOBRE FACÇÃO
│  Facções > Detalhes da Facção "D. Terezinha"
│  Vê: 3 remessas ativas, 1 atrasada, rating 4.2
│  Cria nova remessa: seleciona lotes, define prazo
│  ✓ Precisa ver: histórico de entregas, taxa de defeito, valores
│
14:00 ─ RESOLUÇÃO DE PROBLEMAS
│  Retrabalho > Filtrar por "PENDENTE"
│  Vê: 5 defeitos pendentes (3 COSTURA, 2 TECIDO)
│  Resolve os de TECIDO (não foram culpa da produção)
│  Delega os de COSTURA para coordenador resolver
│
16:00 ─ MÓDULO QUALIDADE (verificação semanal)
│  Qualidade > Overview
│  ┌─────────────────────────────────────────────┐
│  │ "Taxa defeito esta semana: 1.8% (↓ vs 2.1%) │
│  │ Tipo mais frequente: COSTURA (67%)           │
│  │ OP mais problemática: OP-20260601-003        │
│  │ Facção com mais defeito: Oficina do Zé       │
│  │ Trend: melhorando desde semana passada"       │
│  └─────────────────────────────────────────────┘
│  → Decide: precisa conversar com facção sobre qualidade
│
17:30 ─ REVISÃO DE FIM DE DIA
│  Dashboard > Período: Hoje
│  "1.847 peças bipadas (88% da meta)"
│  "Taxa defeito: 1.2%"
│  Exporta relatório rápido para WhatsApp do sócio
│
19:00 ─ EM CASA (monitoramento remoto)
│  Abre LISION no celular → Dashboard simplificado
│  "Produção encerrou no horário, sem alertas pendentes"
│  ✓ Visão mobile deve ser resumida (não completa)
```

---

### 3.3 Jornada da Facção: Ciclo de Remessa

```
DIA 1 ─ RECEBE REMESSA
│  Motorista da Liserie chega com sacolas + nota
│  Dona Terezinha recebe os lotes fisicamente
│
│  15 minutos depois, no celular:
│  Abre portal LISION (ícone salvo na home do Android)
│  → Login: digita Token + PIN de 6 dígitos
│  ✓ CRÍTICO: PIN numérico, como PIX — ela já sabe usar
│
│  DASHBOARD DO PORTAL
│  ┌─────────────────────────────────────────────┐
│  │ "Peças com você: 350"                       │
│  │ "Valor do período: R$ 875,00"               │
│  │ "Devoluções pendentes: 1"                   │
│  │ "Prazo mais próximo: 15/06"                 │
│  └─────────────────────────────────────────────┘
│
│  CONFIRMAR RECEBIMENTO
│  Remessas > Toca na remessa nova (badge "NOVA")
│  Vê: 3 lotes, 350 peças, prazo 15/06
│  Toca "Confirmar Recebimento" (botão grande verde)
│  → "Recebimento confirmado!"
│  ✓ CRÍTICO: 1 toque para confirmar (não formulário)
│
DIAS 2-12 ─ PRODUÇÃO NA FACÇÃO
│  (Dona Terezinha costura os lotes com suas 3 costureiras)
│  Sem interação com LISION neste período
│
DIA 10 ─ NOTIFICAÇÃO DE PRAZO
│  Push notification (se PWA) ou banner ao abrir:
│  "Prazo de devolução em 5 dias: Lote OP-20260601-003"
│
│  SE VAI ATRASAR:
│  Devoluções > Toca no lote
│  "Informar previsão" → seleciona data no calendário
│  → "Previsão informada!"
│  ✓ Máximo 2 reagendamentos antes de escalação
│
DIA 13 ─ DEVOLUÇÃO
│  Entrega lotes de volta à Liserie
│  (Liserie faz conferência e registra no sistema)
│
DIA 14 ─ DEFEITO CONTESTADO
│  Abre portal → Notificação: "2 defeitos registrados no seu lote"
│  Defeitos > Vê lista:
│  │  - COSTURA, MÉDIO, 3 peças — "costura torta no decote"
│  │  - TECIDO, LEVE, 1 peça — "mancha no tecido"
│
│  ACEITAR defeito de costura (foi erro dela):
│  Toca "Confirmar" → pronto
│
│  CONTESTAR defeito de tecido (veio com mancha):
│  Toca "Contestar" → modal abre:
│  "Motivo: [textarea]"
│  Escreve: "Tecido já veio manchado, não foi defeito de costura"
│  Toca "Enviar contestação"
│  → Sistema notifica Liserie com prazo de 3 dias úteis para responder
│  ✓ CRÍTICO: Formulário mínimo — 1 campo de texto
│
FIM DO MÊS ─ FINANCEIRO
│  Financeiro > Período atual: Junho 2026
│  ┌─────────────────────────────────────────────┐
│  │ "Valor bruto: R$ 2.450,00"                  │
│  │ "Deduções (defeitos): -R$ 87,50"            │
│  │ "Valor líquido: R$ 2.362,50"                │
│  │ "8 lotes neste período"                     │
│  └─────────────────────────────────────────────┘
│  ✓ Informação que ela mais quer: "quanto vou receber?"
```

---

### 3.4 Jornada do Admin: Configuração Inicial

```
DIA 0 ─ SETUP DE NOVO CLIENTE
│
│  CONFIGURAR TENANT
│  Settings > Tenant
│  Nome: "Liserie" | Timezone: America/Sao_Paulo | Moeda: BRL
│
│  CONFIGURAR ETAPAS DE PRODUÇÃO
│  Settings > Etapas
│  ┌──────────────────────────────────────┐
│  │ 1. CORTE          [🟦 azul]         │
│  │ 2. AVIAMENTOS     [🟪 roxo]         │
│  │ 3. PRODUÇÃO       [🟩 verde]        │
│  │ 4. TRAVETE        [🟨 amarelo]      │
│  │ 5. LIMPEZA        [⬜ cinza]        │
│  │ 6. CONFERÊNCIA    [🟧 laranja]      │
│  │ 7. EMBALAGEM      [🟦 azul claro]   │
│  │ 8. ESTOQUE        [⬛ escuro]       │
│  │                                      │
│  │ [Arrastar para reordenar]            │
│  │ [+ Adicionar etapa]                  │
│  └──────────────────────────────────────┘
│  ✓ Cada confecção tem fluxo diferente — etapas DEVEM ser configuráveis
│
│  DEFINIR METAS
│  Settings > Metas
│  Meta diária: 500 peças | Meta de produtividade: 95% | Turno: 07:00-17:48
│
│  CADASTRAR EQUIPE
│  Equipe > + Novo Membro
│  Para cada operador: Nome, Setor, Role (OPERADOR), PIN (4-6 dígitos)
│  Para gerentes: Nome, Email, Role (GERENTE), Senha (email+password)
│  ✓ PINs são gerados ou definidos pelo admin
│
│  CADASTRAR FACÇÕES
│  Facções > + Nova Facção
│  Nome, Contato, Telefone, Endereço, Preço/peça, Prazo médio
│
│  GERAR TOKENS
│  Settings > Tokens Kiosk
│  Criar token para TV do chão de fábrica (nome: "TV Produção")
│  Copiar URL: lision.com/tv?token=abc123
│
│  Settings > Tokens Facção
│  Para cada facção: gerar token + PIN
│  Enviar via WhatsApp: "Acesse lision.com/portal com este token e PIN: 482917"
│
│  ✓ Setup completo < 30 minutos para um cliente novo
```

---

## 4. PAIN POINTS POR PERSONA

### 4.1 Operador(a) — Maria

| # | Pain Point | Severidade | Impacto |
|---|-----------|-----------|---------|
| O1 | Bipar é lento quando o Wi-Fi cai | ALTA | Produtividade cai, fila forma |
| O2 | Não sabe se o lote já foi bipado por outra pessoa | MÉDIA | Bipagem duplicada, confusão |
| O3 | Reportar defeito interrompe o fluxo de bipagem | MÉDIA | Evita reportar para não perder tempo |
| O4 | Não consegue ver seu próprio desempenho do dia | BAIXA | Desmotivação, sem gamificação |
| O5 | Login é necessário toda vez que o tablet reinicia | MÉDIA | Perde 30s-1min por reinício |

### 4.2 Coordenador — Rodrigo

| # | Pain Point | Severidade | Impacto |
|---|-----------|-----------|---------|
| C1 | Precisa andar pela fábrica para saber onde cada lote está | ALTA | Tempo gasto em deslocamento |
| C2 | Não recebe alerta quando lote para numa etapa | ALTA | Gargalos não detectados |
| C3 | Imprimir etiquetas requer ir ao escritório | MÉDIA | Interrupção do trabalho no chão |
| C4 | Não consegue redistribuir carga baseado em dados reais | MÉDIA | Operadores ociosos enquanto outros sobrecarregados |

### 4.3 Gerente — Fabinho

| # | Pain Point | Severidade | Impacto |
|---|-----------|-----------|---------|
| G1 | Relatórios mensais são manuais (Excel) | ALTA | 2-3 dias de trabalho/mês |
| G2 | Não sabe em tempo real quanto está produzindo | ALTA | Decisões atrasadas |
| G3 | Não consegue provar para facção que defeito foi dela | ALTA | Perda financeira |
| G4 | Meta diária é "sentimento", não dado | MÉDIA | Sem base para cobrar equipe |
| G5 | Dashboard mostra metas hardcoded, não as dele | MÉDIA | Dados não refletem realidade |

### 4.4 Admin — Gabriel

| # | Pain Point | Severidade | Impacto |
|---|-----------|-----------|---------|
| A1 | Não existe tela para gerenciar equipe | ALTA | Precisa fazer via Supabase Dashboard |
| A2 | Não consegue configurar etapas via UI | ALTA | Precisa alterar banco diretamente |
| A3 | Tokens são gerenciados por API, sem UI | MÉDIA | Onboarding de facção é manual |
| A4 | Sem visão de saúde do sistema | BAIXA | Não sabe se algo está falhando |

### 4.5 Facção — Dona Terezinha

| # | Pain Point | Severidade | Impacto |
|---|-----------|-----------|---------|
| F1 | Não sabe quanto vai receber até o fim do mês | ALTA | Ansiedade financeira |
| F2 | Contestar defeito é por WhatsApp (sem registro formal) | ALTA | Perde argumento sem prova |
| F3 | Não recebe aviso formal de novas remessas | MÉDIA | Desorganização no recebimento |
| F4 | Portal pode ser pesado no celular dela | ALTA | Dados limitados (15GB) |
| F5 | Não entende termos técnicos do sistema | MÉDIA | Confusão, medo de errar |

---

## 5. OPORTUNIDADES DE DIFERENCIAÇÃO UX

### 5.1 Princípio Central: Contexto Determina Complexidade

```
CHÃO DE FÁBRICA          ESCRITÓRIO             CELULAR FACÇÃO
(operador/coordenador)   (gerente/admin)        (facção)
─────────────────────    ─────────────────────  ─────────────────────
Informação mínima        Informação densa       Informação essencial
Ações de 1 toque         Drill-down disponível  1 ação por tela
Feedback auditivo        Feedback visual        Feedback tátil (vibrar)
Alvos de toque 48px+     Alvos padrão 32px      Alvos 44px+
Sem scroll complexo      Scroll/tabs aceitável  Scroll vertical simples
Cores de alto contraste  Paleta completa        Alto contraste
```

### 5.2 Oportunidades Específicas

| # | Oportunidade | Persona | Diferencial |
|---|-------------|---------|-------------|
| D1 | **Scan offline-first** — fila local com sync automático | Operador | Zero dependência de Wi-Fi no momento do scan |
| D2 | **Gamificação leve** — contador de scans do dia visível, badge de "meta atingida" | Operador | Motivação sem pressão, senso de progresso |
| D3 | **Mapa de fábrica visual** — onde cada lote está agora (por etapa) | Coordenador | Substitui a caminhada pela fábrica |
| D4 | **Alerta inteligente** — notifica lote parado > X horas ANTES de virar problema | Coord/Gerente | Prevenção ao invés de reação |
| D5 | **Comparativo automático** — "hoje vs ontem" e "semana vs semana" | Gerente | Decisões baseadas em tendência, não snapshot |
| D6 | **Score de facção** — rating calculado automaticamente (prazo + qualidade + volume) | Gerente | Decisão objetiva sobre com qual facção trabalhar |
| D7 | **Resumo financeiro em linguagem simples** — "Você vai receber R$ 2.362,50 dia 10" | Facção | Responde a pergunta #1 dela sem navegar |
| D8 | **Contestação guiada** — wizard com perguntas simples ao invés de textarea livre | Facção | Reduz medo de errar, padroniza argumentos |
| D9 | **Dashboard TV como motivador** — mostrar meta e progresso no chão de fábrica | Todos | Visibilidade compartilhada gera accountability |
| D10 | **Insights automáticos** — "Tipo COSTURA é 67% dos defeitos esta semana" | Gerente | Transforma dados em ação sem análise manual |

### 5.3 Anti-Patterns a Evitar

| # | Anti-Pattern | Risco |
|---|-------------|-------|
| X1 | Exigir login por email para operador | Ninguém vai usar — eles não têm email profissional |
| X2 | Formulários longos para reportar defeito | Operador vai ignorar e não reportar |
| X3 | Dashboard mobile idêntico ao desktop | Informação demais em tela pequena = nada é lido |
| X4 | Jargão técnico no portal da facção | "Shipment status: RECEIVED_BY_FACTION" = incompreensível |
| X5 | Notificações por email para facção | Dona Terezinha não lê email |
| X6 | Tabelas com 8+ colunas em mobile | Scroll horizontal = experiência destruída |
| X7 | Confirmações desnecessárias em operações frequentes | "Tem certeza que quer bipar?" = 200 cliques extras/dia |
| X8 | Loading spinners longos sem feedback | Operador acha que travou e reinicia |

---

## 6. RECOMENDAÇÕES PARA @ux-design-expert

### 6.1 Design por Contexto (não por Role)

A UX deve ser desenhada por CONTEXTO DE USO, não apenas por role:

| Contexto | Dispositivo | Densidade | Interação |
|----------|-----------|-----------|-----------|
| **Chão de fábrica** | Tablet fixo/compartilhado | MÍNIMA | Toque único, feedback sonoro |
| **Escritório** | Desktop/laptop | ALTA | Mouse, keyboard shortcuts, drill-down |
| **Mobilidade na fábrica** | Tablet na mão | MÉDIA | Toque, informação em blocos |
| **Celular pessoal** | Smartphone Android | ESSENCIAL | Toque, scroll vertical, PWA |
| **TV de fábrica** | Smart TV / monitor | DISTÂNCIA | Sem interação, auto-refresh, alto contraste |

### 6.2 Hierarquia de Informação por Persona

**Operador vê:** O que precisa fazer AGORA (scan + resultado)
**Coordenador vê:** Onde estão os problemas AGORA (alertas + gargalos)
**Gerente vê:** Como está o DIA vs a META (KPIs + tendências)
**Admin vê:** Como está o SISTEMA (configuração + equipe)
**Facção vê:** O que eu DEVO e quanto vou RECEBER (obrigações + financeiro)

### 6.3 Micro-Interações Prioritárias

1. **Scan success:** Flash verde 200ms + som 880Hz + counter incrementa com animação
2. **Scan error:** Shake horizontal + flash vermelho + som 220Hz
3. **Defeito reportado:** Checkmark animado + toast "Registrado"
4. **Meta atingida:** Confetti sutil (1s) + som especial
5. **Lote parado:** Pulse vermelho no card + badge com horas
6. **Facção confirma recebimento:** Checkmark + status muda com transição

### 6.4 Vocabulário do Sistema

| Técnico (NÃO usar) | Simples (USAR) |
|-------------------|----------------|
| Shipment | Remessa |
| Production Order | Ordem de Produção / OP |
| Lot | Lote |
| Scan Event | Bipagem |
| Defect Record | Defeito |
| Faction | Facção |
| Stage | Etapa |
| Dashboard | Painel |
| KPI | Indicador |
| Barcode | Código de barras |
| STAGE_IN | Entrada na etapa |
| IN_REWORK | Em retrabalho |
| Resolve | Resolver / Concluir |
| PENDING | Pendente |

---

*— Atlas, investigando a verdade 🔎*

**Sources:**
- [Salário Operador Polivalente Têxtil](https://www.salario.com.br/profissao/operador-polivalente-da-industria-textil-cbo-761005/)
- [Salário Auxiliar de Produção Confecção](https://www.salario.com.br/profissao/auxiliar-de-producao-na-confeccao-de-roupas-cbo-763125/)
- [PCP de Confecção](https://tatilinovacao.com.br/pcp-de-confeccao-como-parar-de-perder-dinheiro-entre-o-corte-e-o-acabamento/)
- [Etapas do Processo de Produção](https://www.sistemaparaconfeccao.com.br/etapas-do-processo-de-producao-para-confeccao/)
- [Controle de Facção](https://www.sistemaparaconfeccao.com.br/controle-de-faccao-costura-e-terceiros/)
- [Facções e Retrabalho](https://zanotti.com.br/blog/faccoes-de-costura-como-evitar-retrabalho/)
- [Problemas Comuns na Confecção](https://deltamaquinastexteis.com.br/en/common-manufacturing-problems/)
- [Tablets Industriais no Chão de Fábrica](https://blog.lri.com.br/tablets-industriais-transformando-a-eficiencia-no-chao-de-fabrica/)
- [Sistema MES Mobile](https://ega.com.br/sistema-mes-com-aplicacao-mobile-controle-de-producao-via-smartphone-ou-tablet/)
