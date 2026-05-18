# LISION — Especificacao UX/UI Completa

> **Autora:** Uma (UX/UI Designer & Design System Architect)
> **Data:** 2026-05-18 | **Versao:** 1.0
> **Baseline:** Dashboard Lovable (OKLCH monochrome dark theme)
> **Status:** Draft para validacao

---

## 1. PRINCIPIOS DE DESIGN

### 1.1 Filosofia

O LISION e um sistema de rastreamento de producao textil por lotes. O design deve comunicar:
- **Precisao industrial** — dados em tempo real, monospace para numeros, tabular-nums
- **Elegancia monochrome** — OKLCH sem saturacao, hierarquia por luminosidade
- **Clareza operacional** — operadores no chao de fabrica precisam bipar em <3 segundos
- **Inteligencia visual** — insights automaticos, alertas contextuais, tendencias

### 1.2 Principios Fundamentais

| # | Principio | Aplicacao |
|---|-----------|-----------|
| P1 | **Data density over decoration** | Maximizar informacao util por pixel |
| P2 | **Monochrome with semantic color** | Cor APENAS para status (success/warning/destructive) |
| P3 | **Motion with purpose** | Animacoes APENAS para indicar mudanca de estado |
| P4 | **Mobile-first for operators** | Telas de scan/bipagem priorizadas para mobile |
| P5 | **Glanceable for managers** | Dashboard legivel em <5 segundos |
| P6 | **Accessible by default** | WCAG AA minimo, contraste 4.5:1+ |

---

## 2. DESIGN SYSTEM — FORMALIZACAO

### 2.1 Cores (OKLCH Monochrome)

```
CORE PALETTE (sem saturacao):
--background:       oklch(0.07 0 0)    // #0d0d0d — fundo principal
--foreground:       oklch(0.98 0 0)    // #fafafa — texto principal
--card:             oklch(0.09 0 0)    // #151515 — fundo de cards
--secondary:        oklch(0.14 0 0)    // #222222 — backgrounds secundarios
--muted-foreground: oklch(0.62 0 0)    // #999999 — texto secundario
--border:           oklch(0.22 0 0)    // #333333 — bordas

SEMANTIC COLORS (UNICA excecao ao monochrome):
--success:     oklch(0.75 0.16 145)   // verde — operacional, em dia, positivo
--warning:     oklch(0.80 0.15 80)    // amarelo — atencao, alerta
--destructive: oklch(0.65 0.20 25)    // vermelho — erro, atraso, critico
```

**REGRA:** Cores semanticas sao usadas EXCLUSIVAMENTE para:
- Status badges (EM DIA / ATENCAO / ATRASO)
- Trends (positivo/negativo)
- Alertas e notificacoes
- Indicadores de saude (pulse dots)

### 2.2 Tipografia

| Token | Fonte | Uso |
|-------|-------|-----|
| `font-display` | Inter Tight | Titulos, headings, numeros hero |
| `font-sans` | Inter | Corpo de texto, labels, descricoes |
| `font-mono` | JetBrains Mono | Dados numericos, codigos, IDs, timestamps |

**Escala tipografica:**
- Hero numbers: `text-[56px]` font-display (score de saude)
- Section title: `text-[36px]-[44px]` font-display
- Card metric: `text-[22px]-[34px]` font-display tabular-nums
- Card title: `text-[15px]` font-semibold
- Body: `text-[13px]`
- Eyebrow/label: `text-[10px]-[11px]` uppercase tracking-[0.18em]-[0.22em]
- Micro: `text-[10px]` font-mono

### 2.3 Espacamento e Grid

- **Grid principal:** 12 colunas com `gap-4` (16px)
- **Container max:** `max-w-[1600px]` centralizado
- **Padding lateral:** `px-6` mobile, `lg:px-10` desktop
- **Padding vertical:** `py-6` mobile, `lg:py-8` desktop
- **Card padding:** `p-5` (20px) padrao

### 2.4 Cards e Superficies

```
Card padrao:
- rounded-2xl (16px border radius)
- bg-card-gradient (gradiente sutil oklch(0.09) -> oklch(0.085))
- border border-border/60
- shadow-elegant (multi-layer shadow)
- overflow-hidden

Card hover (interativo):
- hover:border-foreground/40 transition

Card invertido (accent):
- bg-foreground text-background (branco sobre preto)
```

### 2.5 Animacoes e Motion

| Tipo | Curva | Duracao | Uso |
|------|-------|---------|-----|
| Entry | `[0.22, 1, 0.36, 1]` | 1.2-1.6s | Barras de progresso, gauges |
| Stagger | delay `i * 0.04-0.08` | — | Listas, tabelas animadas |
| Fade in | `opacity: 0→1, y: 6→0` | 0.3s | Cards aparecendo |
| Pulse | `animate-pulse-dot` | infinite | Indicadores "ao vivo" |
| Shimmer | `animate-shimmer` | infinite | Barras de progresso ativas |

### 2.6 Icones

- **Biblioteca:** Lucide React (ja em uso)
- **Tamanho padrao:** `size-4` (16px) para UI, `size-3` (12px) para inline
- **Stroke:** `strokeWidth={2.2}` para icones hero

---

## 3. PROBLEMAS IDENTIFICADOS NO DASHBOARD ATUAL

### 3.1 Problemas Criticos

| # | Problema | Impacto | Solucao |
|---|----------|---------|---------|
| D1 | **Nome "Trama" no header** — deveria ser "LISION" | Branding errado | Substituir por logo LISION + nome |
| D2 | **"Bom dia, Jonatas" hardcoded** | Nao personalizado | Usar `profile.full_name` do usuario logado |
| D3 | **Icone Factory no lugar do logo** | Sem identidade visual | Criar/usar logo LISION (SVG) |
| D4 | **Iniciais "JM" hardcoded** no avatar | Nao personalizado | Extrair iniciais do `profile.full_name` |
| D5 | **Footer "Trama Production Intelligence"** | Branding errado | "LISION — Rastreamento Textil" |
| D6 | **Footer "v2.4" hardcoded** | Versao incorreta | Usar variavel de ambiente ou package.json |
| D7 | **Todos os dados sao mock** | Nada funciona | Integrar com APIs do backend (Stories 5.4-5.7) |
| D8 | **"Turno A" hardcoded** | Sem configuracao de turnos | Derivar do horario atual + config do tenant |
| D9 | **Busca (Cmd+K) nao funciona** | Decorativo | Implementar Command Palette (Fase 2) |
| D10 | **Botoes Bell/Settings decorativos** | Nao clicaveis | Ligar a Notificacoes e Settings |
| D11 | **Filtros "Hoje/Semana/Mes" decorativos** | Nao funcionais | Implementar filtro de periodo real |
| D12 | **"ver todas" em OPs decorativo** | Link morto | Navegar para /production/orders |
| D13 | **Nav "Dashboard" unico item** | Sem navegacao | Implementar sidebar com todos os modulos |

### 3.2 Melhorias Recomendadas

| # | Melhoria | Justificativa |
|---|----------|---------------|
| M1 | Adicionar sidebar colapsavel | Navegacao para todos os modulos |
| M2 | Breadcrumbs em paginas internas | Orientacao espacial |
| M3 | Toast notifications (Sonner) | Feedback de acoes |
| M4 | Command Palette (Cmd+K) | Busca rapida de lotes, OPs, operadores |
| M5 | Skeleton loading states | Feedback visual durante carregamento |
| M6 | Empty states ilustrados | Quando nao ha dados |
| M7 | Error boundaries com retry | Tratamento de erros elegante |

---

## 4. ARQUITETURA DE NAVEGACAO

### 4.1 Estrutura de Modulos

```
LISION
├── Dashboard (/)                        — Visao geral (JA EXISTE)
├── Producao (/production)
│   ├── Ordens de Producao (/production/orders)
│   ├── Lotes (/production/lots)
│   └── Etapas (/production/stages)
├── Scan (/scan)                         — Mobile-first
│   ├── Bipagem Rapida (/scan/quick)
│   └── Historico de Scans (/scan/history)
├── Qualidade (/quality)
│   ├── Defeitos (/quality/defects)
│   └── Retrabalho (/quality/rework)
├── Faccoes (/factions)
│   ├── Painel de Faccoes (/factions)
│   ├── Envios (/factions/shipments)
│   └── Aduana (/factions/customs)
├── Equipe (/team)
│   ├── Operadores (/team/operators)
│   └── Ranking (/team/ranking)
├── Configuracoes (/settings)
│   ├── Fabrica (/settings/factory)
│   ├── Etapas (/settings/stages)
│   ├── Usuarios (/settings/users)
│   └── Kiosk/TV (/settings/kiosk)
└── TV Dashboard (/tv?token=<uuid>)      — Kiosk mode (JA EXISTE)
```

### 4.2 Sidebar

A sidebar substitui o header-only navigation atual. Design baseado no componente `sidebar` shadcn/ui (ja instalado com 12 sub-componentes).

```
SIDEBAR (colapsavel):
┌──────────────────────┐
│ [LOGO LISION]        │
│  Rastreamento Textil │
├──────────────────────┤
│ ▸ Dashboard          │  (icon: LayoutDashboard)
│ ▸ Producao       [3] │  (icon: Factory)      — badge: OPs ativas
│ ▸ Scan               │  (icon: ScanLine)
│ ▸ Qualidade      [!] │  (icon: ShieldCheck)  — badge: defeitos pendentes
│ ▸ Faccoes        [2] │  (icon: Truck)        — badge: atrasos
│ ▸ Equipe             │  (icon: Users)
├──────────────────────┤
│ ▸ Configuracoes      │  (icon: Settings)
├──────────────────────┤
│ [avatar] Nome User   │
│ Cargo · Setor        │
│ [Sair]               │
└──────────────────────┘
```

**Comportamento:**
- Desktop (>1024px): sidebar expandida, 280px de largura
- Tablet (768-1024px): sidebar colapsada (icones only, 64px)
- Mobile (<768px): sidebar hidden, hamburger menu abre sheet overlay
- Tecla `[` toggle collapse no desktop
- Active state: `bg-foreground text-background` (consistente com dashboard)

### 4.3 TopBar (Revisado)

O TopBar atual do dashboard e mantido como padrao global, com ajustes:

```
┌──────────────────────────────────────────────────────────┐
│ [≡]  LISION            [Pesquisar... ⌘K]  🔔 ⚙️  [AV]  │
│ ticker: Pecas/h 218 ↑6.2% | OEE 87% | Allowance 1.8%   │
└──────────────────────────────────────────────────────────┘
```

**Mudancas:**
- `[≡]` hamburger visivel apenas em mobile/tablet
- Logo LISION substitui "Trama" + Factory icon
- Nome do usuario real + avatar real
- Ticker strip: dados reais via API `/api/dashboard/kpis`
- Bell: abre dropdown de notificacoes
- Settings: navega para `/settings`

---

## 5. ESPECIFICACAO POR MODULO

### 5.1 Dashboard (/) — Revisao

**Status:** Existe, precisa de integracao + fixes.

**Layout:** Grid 12 colunas (manter).

**Widgets a manter (design baseline):**
1. **HealthHero** — Score de saude da fabrica (gauge circular)
2. **ProjectionCard** — Ritmo do turno + projecao
3. **GoalsRow** — 3 cards de metas (Hoje/Semana/Mes)
4. **HourlyChart** — Grafico de area (bipagens por hora)
5. **AllowanceCard** — Donut chart (taxa de perda)
6. **StagesCard** — Barras horizontais (pecas por etapa)
7. **DefectsCard** — Metricas + barras por tipo de defeito
8. **OrdersCard** — Tabela de OPs em andamento
9. **StalledCard** — Lotes parados (alertas)
10. **RankingCard** — Top operadores
11. **FactionsCard** — Tabela de faccoes externas
12. **ActivityCard** — Live feed de eventos
13. **HealthSummary** — KPIs resumidos + insight automatico

**Integracao com backend:**
- `factoryHealth` → computar de `/api/dashboard/kpis` (score = OEE arredondado)
- `goals` → computar de scans (total produzido hoje/semana/mes vs settings.targets)
- `projection` → calcular taxa das ultimas 2h, projetar para fim do turno
- `hourlyProduction` → `/api/dashboard/production-chart?from=hoje&to=hoje`
- `stages` → `/api/dashboard/kpis` campo `lots_by_stage`
- `productionOrders` → `/api/production/orders?status=OPEN,IN_PROGRESS`
- `ranking` → `/api/dashboard/kpis` campo `top_producers`
- `factions` → computar de `faction_shipments` via API
- `activity` → ultimos 20 `scan_events` via Realtime
- `stalledBatches` → lotes com `entered_current_stage_at` > threshold
- `allowance` → defects / total_scanned
- `tickers` → subset dos KPIs

**Auto-refresh:** A cada 30s via polling (Fase 1). Realtime via Supabase channel na Fase 2.

### 5.2 Producao — Ordens de Producao (/production/orders)

**Proposito:** CRUD de OPs com visibilidade do progresso.

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Ordens de Producao                          [+ Nova OP]  │
│ [Todas] [Em andamento] [Concluidas] [Atrasadas]          │
│ Pesquisar por OP, produto...                    Filtros ▾│
├──────────────────────────────────────────────────────────┤
│ TABELA:                                                  │
│ OP       | Produto         | Progresso   | Prazo | Status│
│ OP-4821  | Camisa Linho    | ████░ 90%   | 20Mai | EM DIA│
│ OP-4818  | Vestido Midi    | ██░░░ 51%   | 22Mai | ATENC.│
│ OP-4815  | Calca Alfaiat.  | ████░ 82%   | 18Mai |ATRASO │
├──────────────────────────────────────────────────────────┤
│ Mostrando 1-10 de 23                  ‹ 1  2  3 ›       │
└──────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- **Listagem:** Tabela paginada com ordenacao por colunas
- **Filtros:** Status, periodo de criacao, prioridade
- **Busca:** Por `op_number` ou `product_name`
- **Criar OP:** Modal/drawer com form (produto, quantidade, referencia, prioridade, notas)
- **Detalhes da OP:** Pagina `/production/orders/[id]` com:
  - Header com dados da OP
  - Lista de lotes vinculados (com status de cada um)
  - Timeline de progresso
  - Metricas: total produzido vs meta, taxa defeito, tempo medio por etapa
- **Acoes:** Editar, Finalizar, Cancelar (com confirmacao)

**Barra de progresso:** Mesmo estilo do dashboard (`bg-foreground rounded-full` sobre `bg-secondary`).

**Status badges:** Reutilizar o padrao do dashboard:
- `bg-success/10 text-success border-success/20` → EM DIA
- `bg-warning/10 text-warning border-warning/20` → ATENCAO
- `bg-destructive/10 text-destructive border-destructive/20` → ATRASO

### 5.3 Producao — Lotes (/production/lots)

**Proposito:** Visibilidade e rastreio de todos os lotes.

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Lotes                                     [Kanban] [Lista]│
│ Pesquisar por barcode, lote...              Filtros ▾    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  VIEW KANBAN (default):                                  │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│  │Corte│ │Cost.A│ │Cost.B│ │Acab.│ │Insp.│ │Emb. │      │
│  │ 14  │ │  22  │ │  19  │ │  11 │ │   8 │ │   6 │      │
│  ├─────┤ ├─────┤ ├─────┤ ├─────┤ ├─────┤ ├─────┤      │
│  │LT-xx│ │LT-xx│ │LT-xx│ │LT-xx│ │LT-xx│ │LT-xx│      │
│  │LT-xx│ │LT-xx│ │LT-xx│ │     │ │     │ │     │      │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      │
└──────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- **Kanban View (default):** Colunas = etapas (stages), cards = lotes
  - Card de lote mostra: barcode, OP, quantidade, tempo na etapa, holder
  - Cards com `entered_current_stage_at` acima do threshold: borda vermelha
  - Drag-and-drop NAO permitido (movimentacao apenas via scan)
- **Lista View:** Tabela com colunas: Barcode, OP, Produto, Etapa, Status, Tempo, Holder
- **Detalhes do Lote:** Drawer lateral com:
  - Dados do lote (barcode grande com icone de copiar)
  - Timeline de scans (todos os eventos cronologicos)
  - Defeitos associados
  - Historico de faccao (se enviado/retornado)
- **Filtros:** Por etapa, status, OP, holder

### 5.4 Producao — Etapas (/production/stages)

**Proposito:** Visualizacao do fluxo produtivo e configuracao das etapas.

**Layout:** Pipeline horizontal mostrando as etapas em sequencia (order_index).

```
┌──────────────────────────────────────────────────────────┐
│ Fluxo de Producao                                        │
│                                                          │
│  [1.Corte] → [2.Costura A] → [3.Costura B] → [4.Acab.] │
│    14 lotes    22 lotes        19 lotes        11 lotes  │
│    ~2h10       ~4h05 ⚠        ~5h20 ⚠         ~1h45     │
│                                                          │
│  → [5.Inspecao] → [6.Embalagem] → [Estoque]             │
│      8 lotes        6 lotes                              │
│      ~0h55          ~0h38                                │
└──────────────────────────────────────────────────────────┘
```

- Cada etapa mostra: nome, contagem de lotes, tempo medio atual vs esperado
- Etapas acima do tempo esperado: highlight com `text-destructive`
- Clique na etapa: abre lista de lotes naquela etapa

### 5.5 Scan — Bipagem Rapida (/scan/quick)

**Proposito:** Interface principal para operadores no chao de fabrica. **MOBILE-FIRST.**

**Este e o modulo mais critico para usabilidade.** Operadores usam celular na fabrica, com maos muitas vezes sujas/ocupadas. A interface deve ser:
- Targets grandes (min 48px)
- Feedback imediato (haptic + visual + sonoro)
- Fluxo em <3 toques

**Layout Mobile:**

```
┌──────────────────────┐
│     LISION Scan      │
│                      │
│  ┌────────────────┐  │
│  │                │  │
│  │   [CAMERA]     │  │
│  │   viewfinder   │  │
│  │                │  │
│  └────────────────┘  │
│                      │
│  ── ou ──            │
│                      │
│  ┌────────────────┐  │
│  │ Digite barcode │  │
│  └────────────────┘  │
│                      │
│  Ultimo scan:        │
│  ┌────────────────┐  │
│  │ ✓ LT-2843      │  │
│  │ Costura A → B  │  │
│  │ 14:32          │  │
│  └────────────────┘  │
│                      │
│  [BIPAR]             │  ← botao grande, full-width, 56px altura
│                      │
└──────────────────────┘
```

**Fluxo de bipagem:**
1. Operador abre camera OU digita barcode
2. Sistema identifica lote → mostra info resumida (OP, etapa atual, quantidade)
3. Operador confirma bipagem → seleciona tipo de evento:
   - **Entrada na etapa** (STAGE_IN) — mais comum, botao principal
   - **Saida da etapa** (STAGE_OUT)
   - **Registrar defeito** (DEFECT_DETECTED) — abre sub-form
4. Sistema registra scan_event → feedback visual (checkmark verde + contagem)
5. Tela volta ao estado inicial, pronta para proximo scan

**Feedback visual pos-scan:**
- **Sucesso:** Card verde com checkmark, lote code, etapa, timestamp. Desaparece em 3s.
- **Erro:** Card vermelho com motivo (lote invalido, etapa fora de ordem, etc.)
- **Warning:** Card amarelo (ex: lote parado ha muito tempo)

**Registrar defeito (sub-form):**
```
┌──────────────────────┐
│ Registrar Defeito     │
│                      │
│ Tipo: [Costura ▾]    │
│ Severidade: [●L ●M ●G]│
│ Qtd: [-] 1 [+]       │
│ Descricao (opcional)  │
│ [📷 Foto] (opcional)  │
│                      │
│ [REGISTRAR DEFEITO]   │
└──────────────────────┘
```

**Desktop:** Mesma funcionalidade mas layout side-by-side (scanner + historico recente).

### 5.6 Scan — Historico (/scan/history)

**Proposito:** Auditoria de scans realizados.

**Layout:** Tabela paginada com:
- Timestamp, Operador, Lote, OP, Tipo de Evento, Etapa, Quantidade
- Filtros: por operador, periodo, tipo de evento, lote, OP
- Export CSV (Fase 2)

**Estilo:** Timeline vertical no mobile, tabela no desktop. Mesmo estilo do ActivityCard do dashboard.

### 5.7 Qualidade — Defeitos (/quality/defects)

**Proposito:** Gestao de defeitos e fila de retrabalho.

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Qualidade                                                │
│                                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│  │  142   │ │   24   │ │  688   │ │ 1.8%   │            │
│  │Fila    │ │Hoje    │ │Mes     │ │Taxa    │            │
│  │Retrab. │ │        │ │        │ │Perda   │            │
│  └────────┘ └────────┘ └────────┘ └────────┘            │
│                                                          │
│  [Pendentes] [Resolvidos] [Descartados]                  │
├──────────────────────────────────────────────────────────┤
│ TABELA:                                                  │
│ Lote    | Tipo      | Sev. | Qtd | Detectado | Status   │
│ LT-2839 | Costura   | GRAVE| 3   | R.Tavares | PENDING  │
│ LT-2834 | Tecido    | MEDIO| 1   | S.Camargo | RESOLVED │
└──────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- **KPI cards** no topo (mesmos dados do DefectsCard do dashboard)
- **Tabela** de defeitos com filtros (tipo, severidade, status, periodo)
- **Detalhes do defeito:** Drawer com foto (se houver), historico de resolucao
- **Resolver defeito:** Form com quantidade resolvida, descartada, descricao da resolucao
- **Grafico** de defeitos por tipo (barras horizontais, estilo dashboard)

### 5.8 Qualidade — Retrabalho (/quality/rework)

**Proposito:** Fila de retrabalho com prioridade visual.

**Layout:** Cards empilhados por prioridade, estilo StalledCard do dashboard.
- **Vermelho:** Defeitos GRAVE (prioritarios)
- **Amarelo:** Defeitos MEDIO
- **Normal:** Defeitos LEVE

Cada card mostra: lote, tipo defeito, quantidade, operador que detectou, tempo na fila.

### 5.9 Faccoes (/factions)

**Proposito:** Gestao de faccoes externas (outsourcing textil).

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Faccoes                                    [+ Nova Faccao]│
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │ TABELA (estilo FactionsCard do dashboard):      │     │
│  │ Faccao          | Pecas  | Lotes | Defeito | Prazo│   │
│  │ Aurora Confec.   | 1.840  |   7   |  2.1%  | 2d ⚠│   │
│  │ Norte Textil     |   920  |   4   |  1.4%  | em 3d│   │
│  │ Atelier Belem    | 1.240  |   5   |  0.9%  | em 5d│   │
│  └─────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

**Detalhes da faccao (/factions/[id]):**
- Header: nome, contato, telefone, endereco, preco/peca, rating
- KPIs: total enviado, total retornado, taxa defeito historica, media dias entrega
- Tabela de envios (shipments) ativos e historicos
- Grafico de performance ao longo do tempo

### 5.10 Faccoes — Envios (/factions/shipments)

**Proposito:** Criar e rastrear envios para faccoes.

**Funcionalidades:**
- **Novo envio:** Wizard 3 etapas:
  1. Selecionar faccao
  2. Selecionar lotes (multi-select com barcode scanner ou lista)
  3. Confirmar: motorista, data prevista retorno, notas
- **Rastrear envio:** Timeline (PREPARING → SENT → RECEIVED → RETURNED)
- **Receber retorno:** Form com quantidade retornada, defeituosa, inspecao

### 5.11 Faccoes — Aduana (/factions/customs)

**Proposito:** Validacao de lotes na entrada/saida da fabrica (ponto de controle).

**Layout Mobile-first:**
```
┌──────────────────────┐
│    ADUANA             │
│                      │
│  [SCANNER CAMERA]     │
│                      │
│  Status do Lote:     │
│  ┌────────────────┐  │
│  │ 🟢 VERDE       │  │  ← ou 🟡 AMARELO ou 🔴 VERMELHO
│  │ LT-2843        │  │
│  │ OP-4821        │  │
│  │ Origem: Cost.A │  │
│  │ Destino: Insp. │  │
│  └────────────────┘  │
│                      │
│  [✓ LIBERAR]         │
└──────────────────────┘
```

**Cores de alerta (AlertColor):**
- **GREEN:** Lote em conformidade, liberacao automatica
- **AMBER:** Atencao — lote parado demais, faccao atrasada. Liberacao com confirmacao.
- **RED:** Bloqueio — divergencia de quantidade, defeito nao resolvido. Requer justificativa.

### 5.12 Equipe — Operadores (/team/operators)

**Proposito:** Gestao de operadores e seus perfis.

**Layout:**
- Tabela com: nome, setor, cargo, status (ativo/inativo), scans hoje, meta %
- Filtros: por setor, cargo, status
- **Criar operador:** Form com nome, email, telefone, setor, cargo, PIN
- **Detalhes:** Performance historica, scans por dia, ranking, setor

### 5.13 Equipe — Ranking (/team/ranking)

**Proposito:** Ranking de produtividade (gamificacao leve).

**Layout:** Reutilizar o RankingCard do dashboard em versao expandida.
- Podio visual para top 3 (estilo competicao)
- Tabela completa com todos os operadores
- Filtros: por periodo (hoje, semana, mes), por setor
- Metricas: scans realizados, pecas processadas, % da meta

### 5.14 Configuracoes — Fabrica (/settings/factory)

**Proposito:** Configuracoes gerais do tenant.

**Sections:**
- **Dados da fabrica:** Nome, slug, logo (upload)
- **Metas de producao:** daily_target, weekly_target, monthly_target
- **Allowance:** allowance_target (% aceitavel de perda)
- **Horarios:** work_hours_per_day, work_days_per_week, timezone
- **Moeda:** currency (BRL padrao)

### 5.15 Configuracoes — Etapas (/settings/stages)

**Proposito:** Configurar etapas do fluxo produtivo.

**Layout:** Lista reordenavel (drag-and-drop) das etapas.
- Cada etapa mostra: nome, display_name, tipo, duracao esperada, cor, icone
- Adicionar etapa, editar, desativar (nao deletar se ha lotes vinculados)

### 5.16 Configuracoes — Usuarios (/settings/users)

**Proposito:** CRUD de usuarios (somente ADMIN).

**Layout:** Tabela com: nome, email, cargo (role), setor, status
- Convidar usuario: email + role
- Editar: alterar role, setor, resetar PIN
- Desativar: soft delete (deleted_at)

### 5.17 Configuracoes — Kiosk/TV (/settings/kiosk)

**Proposito:** Gerenciar tokens de kiosk para TVs na fabrica.

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ Tokens de Kiosk                           [+ Novo Token] │
├──────────────────────────────────────────────────────────┤
│ Nome           | Token (UUID)                  | Status  │
│ TV Producao    | a1b2c3d4-...                  | Ativo   │
│ TV Qualidade   | e5f6g7h8-...                  | Ativo   │
│ TV Recepcao    | i9j0k1l2-...                  | Revogado│
├──────────────────────────────────────────────────────────┤
│ URL de acesso: liserie.lision.app/tv?token=<uuid>        │
│ [Copiar URL] [QR Code]                                   │
└──────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Criar token: nome + scope (dashboard)
- Copiar URL com token
- Gerar QR Code para facilitar setup da TV
- Revogar token (soft delete, is_active=false)

### 5.18 TV Dashboard (/tv?token=<uuid>) — Kiosk Mode

**Status:** Existe basico, precisa de evolucao.

**Layout:** Full-screen, otimizado para TV 1920x1080. Sem controles interativos.

```
┌──────────────────────────────────────────────────────────┐
│ LISION                            14:32:18  18 Mai 2026  │
│ ─────────────────────────────────────────────────────────│
│                                                          │
│  ┌─────────────────────┐  ┌──────────────────────────┐   │
│  │    SAUDE: 87        │  │  Producao Hoje           │   │
│  │    ◐ gauge          │  │  1.842 / 2.100 (87.7%)   │   │
│  │    OPERATIONAL      │  │  ████████████░░ 87.7%    │   │
│  └─────────────────────┘  └──────────────────────────┘   │
│                                                          │
│  ┌─────────────────────┐  ┌──────────────────────────┐   │
│  │  Lotes por Etapa    │  │  Ranking Top 5           │   │
│  │  Corte:      412    │  │  1. Sofia Camargo  142   │   │
│  │  Costura A:  638    │  │  2. Julio Bastos   138   │   │
│  │  Costura B:  524 ⚠  │  │  3. Leticia Moraes 129  │   │
│  │  Acabamento: 287    │  │  4. Eduardo Pires  121   │   │
│  │  Inspecao:   196    │  │  5. Marina Rocha   118   │   │
│  └─────────────────────┘  └──────────────────────────┘   │
│                                                          │
│  LIVE: LT-2843 bipado por M.Andrade em Costura A  14:32 │
│  ─────────────────── auto-refresh: 30s ──────────────── │
└──────────────────────────────────────────────────────────┘
```

**Requisitos:**
- Numeros GRANDES (legibilidade a 3-5m de distancia)
- Font-size minimo 24px para metricas
- Auto-refresh a cada 30s (ja implementado)
- Sem scroll, sem interacao
- Live ticker na parte inferior com ultimos eventos
- Tema escuro (ja implementado) — ideal para TVs

---

## 6. PADROES DE COMPORTAMENTO

### 6.1 Loading States

```
SKELETON (padrao para dados):
┌──────────────────────┐
│ ██████░░░░░░         │  ← skeleton pulse animation
│ ████░░░░░░░░░        │
│ ████████░░░░         │
└──────────────────────┘

Usar componente Skeleton do shadcn/ui (ja instalado).
Cada card do dashboard tem skeleton shape propria.
```

### 6.2 Empty States

```
┌──────────────────────┐
│                      │
│    [ilustracao]      │  ← icone Lucide grande (size-16, opacity-20)
│                      │
│  Nenhum lote ativo   │  ← text-[15px] font-medium
│  Crie uma OP e gere  │  ← text-[13px] text-muted-foreground
│  seus primeiros      │
│  lotes               │
│                      │
│  [+ Criar OP]        │  ← botao principal
└──────────────────────┘
```

### 6.3 Error States

```
┌──────────────────────┐
│                      │
│    [AlertTriangle]   │  ← text-destructive, size-12
│                      │
│  Erro ao carregar    │
│  dados               │
│                      │
│  [Tentar novamente]  │  ← botao outline
└──────────────────────┘
```

### 6.4 Toast Notifications (Sonner)

| Tipo | Estilo | Exemplo |
|------|--------|---------|
| Success | `bg-success/10 border-success/20` | "Lote LT-2843 bipado com sucesso" |
| Error | `bg-destructive/10 border-destructive/20` | "Erro ao registrar scan" |
| Warning | `bg-warning/10 border-warning/20` | "Lote LT-2841 parado ha 3h" |
| Info | `bg-secondary border-border` | "OP-4821 atualizada" |

**Posicao:** Bottom-right no desktop, top-center no mobile.
**Duracao:** 4s (success), 6s (error), 5s (warning).

### 6.5 Modais e Drawers

- **Modal:** Para acoes destrutivas (deletar, revogar, cancelar). Sempre com confirmacao.
- **Drawer (Sheet):** Para detalhes e formularios (criar OP, detalhes do lote, registrar defeito).
  - Desktop: abre pela direita, largura 480px
  - Mobile: abre por baixo (bottom sheet), full-width

Usar componentes `Dialog` e `Sheet` do shadcn/ui (ja instalados).

### 6.6 Tabelas

Padrao visual consistente com OrdersCard do dashboard:
- Header: `text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/20`
- Rows: `text-[13px] border-b border-border/30 hover:bg-secondary/20 transition`
- Numeros: `font-mono tabular-nums`
- Status: badges coloridos (padrao section 5.2)
- Paginacao: `text-[12px]` bottom-right

### 6.7 Formularios

- Labels: `text-[12px] font-medium` acima do input
- Inputs: `h-10 rounded-lg bg-secondary/60 border border-border/60`
- Focus: `ring-2 ring-foreground/20`
- Erro: `border-destructive text-destructive text-[11px]` abaixo do input
- Botao submit: `bg-foreground text-background` (padrao invertido)
- Botao cancelar: `bg-secondary border border-border`

### 6.8 Responsividade

| Breakpoint | Comportamento |
|-----------|---------------|
| Mobile (<768px) | 1 coluna, sidebar hidden, bottom nav para scan |
| Tablet (768-1024px) | 2 colunas, sidebar collapsed |
| Desktop (1024-1600px) | 12 colunas, sidebar expanded |
| Wide (>1600px) | max-w-[1600px] centralizado |

### 6.9 Permissoes por Role (UI)

| Modulo | ADMIN | GERENTE | COORDENADOR | OPERADOR |
|--------|-------|---------|-------------|----------|
| Dashboard | Full | Full | Read | Basico |
| Producao | CRUD | CRUD | Read | — |
| Scan | Full | Full | Full | Full |
| Qualidade | Full | Full | Full | Registrar |
| Faccoes | Full | Full | Read | — |
| Equipe | Full | Read | — | — |
| Settings | Full | — | — | — |
| Kiosk | Full | — | — | — |

**OPERADOR ve:** Dashboard simplificado + Scan + registrar defeito.
Sidebar reduzida, apenas modulos acessiveis.

---

## 7. COMPONENTES REUTILIZAVEIS (Design Tokens)

### 7.1 Componentes a Criar

| Componente | Tipo | Descricao |
|----------|------|-----------|
| `StatCard` | Atom | Card com label + valor grande + trend |
| `StatusBadge` | Atom | Badge colorido (EM DIA/ATENCAO/ATRASO) |
| `ProgressBar` | Atom | Barra de progresso animada |
| `DataTable` | Organism | Tabela com paginacao, ordenacao, filtros |
| `KanbanBoard` | Organism | Board de colunas para lotes por etapa |
| `Timeline` | Molecule | Lista cronologica de eventos |
| `ScannerView` | Organism | Camera viewfinder + input manual |
| `DrawerForm` | Template | Drawer lateral com form padronizado |
| `EmptyState` | Molecule | Ilustracao + texto + CTA |
| `MetricGrid` | Molecule | Grid de 3-4 metricas (estilo GoalsRow) |

### 7.2 Componentes Existentes (shadcn/ui — 47 instalados)

Aproveitar: Button, Card, Dialog, Sheet, Input, Select, Table, Tabs, Badge, Avatar, Skeleton, Toast (Sonner), Tooltip, DropdownMenu, Command (para Cmd+K), Separator, ScrollArea.

---

## 8. ROADMAP DE IMPLEMENTACAO UX

### Fase 1: Integracao Backend + Fixes (Prioritario)
1. Corrigir branding: LISION no header, footer, logo
2. Substituir dados mock por chamadas API reais
3. Implementar sidebar de navegacao
4. Conectar filtros de periodo do dashboard
5. Implementar user info dinamico (nome, avatar)

### Fase 2: Modulos Core
1. Scan — Bipagem Rapida (mobile-first)
2. Producao — Ordens de Producao (CRUD)
3. Producao — Lotes (Kanban + Lista)
4. Qualidade — Defeitos

### Fase 3: Modulos Complementares
1. Faccoes (gestao + envios)
2. Equipe (operadores + ranking)
3. Configuracoes (fabrica, etapas, usuarios, kiosk)

### Fase 4: Polish
1. Command Palette (Cmd+K)
2. Notificacoes real-time
3. TV Dashboard evoluido
4. Aduana (ponto de controle)
5. Empty states ilustrados
6. Onboarding flow

---

## 9. NOTAS PARA IMPLEMENTACAO (LOVABLE)

### 9.1 Diretrizes para prompts ao Lovable

1. **NAO alterar o design system** — OKLCH monochrome, Inter/Inter Tight/JetBrains Mono, gradientes, shadows. Tudo que existe no dashboard deve ser o baseline.
2. **Reutilizar os "atoms"** ja criados: Card, CardHeader, Trend, Metric, SubMetric, StatusBadge patterns.
3. **Novas paginas seguem o mesmo grid** 12 colunas, max-w-[1600px], gap-4.
4. **Tabelas seguem o padrao OrdersCard** — header uppercase, rows com hover, mono para IDs.
5. **Formularios em Drawer/Sheet** — nunca pagina inteira para forms simples.
6. **Mobile-first para Scan** — este modulo deve ser projetado primeiro em 375px.
7. **Animacoes com Motion** — stagger entries, barras animadas, fade-in de cards.
8. **Nenhum cor fora do palette** — usar APENAS as variaveis CSS definidas em globals.css.

### 9.2 Prioridade de UX

```
CRITICAL PATH (operacional):
  Scan > Dashboard (integrado) > OPs > Lotes

BUSINESS PATH (gestao):
  Dashboard > Faccoes > Qualidade > Equipe

ADMIN PATH (configuracao):
  Settings > Kiosk > Usuarios
```

---

## 10. METRICAS DE SUCESSO UX

| Metrica | Target | Como Medir |
|---------|--------|------------|
| Tempo de bipagem | < 3s (scan to confirmation) | Analytics no scan flow |
| Dashboard glanceability | < 5s para entender status | User testing |
| Task completion rate | > 95% (criar OP, registrar defeito) | Analytics |
| Error rate em forms | < 2% | Error logging |
| Mobile usability (SUS) | > 80/100 | System Usability Scale |
| Time to first action | < 10s apos login | Analytics |

---

*Documento gerado por Uma (UX/UI Designer & Design System Architect)*
*Baseline: Dashboard Lovable OKLCH Monochrome*
*Data: 2026-05-18*
