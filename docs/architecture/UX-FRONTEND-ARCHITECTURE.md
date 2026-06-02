# LISION — UX Frontend Architecture

> **Author:** @ux-design-expert (Uma)
> **Date:** 2026-06-01
> **Status:** DEFINITIVE — Base para criacao de stories de implementacao
> **Inputs:** `PHASE1-GAP-ANALYSIS.md`, `PERSONAS-AND-JOURNEYS.md`, codebase audit
> **Design System:** OKLCH monochrome (IMUTAVEL) — layout, interacao e composicao PODEM mudar

---

## PRINCIPIO ARQUITETURAL: CONTEXTO SOBRE ROLE

A UX do LISION nao e projetada por role (admin, gerente, operador). Ela e projetada por **contexto de uso**. O mesmo gerente precisa de interfaces diferentes quando esta no escritorio (desktop, informacao densa) versus quando caminha pela fabrica (tablet, blocos visuais).

| Contexto | Dispositivo | Densidade | Touch Target | Feedback Primario |
|----------|-------------|-----------|--------------|-------------------|
| **Chao de fabrica** | Tablet fixo 10" | MINIMA (2-3 elementos) | 48px+ | Audio (beep) + flash visual |
| **Escritorio** | Desktop/laptop | ALTA (8-12 elementos) | 32px | Visual (toast, inline) |
| **Mobilidade fabrica** | Tablet na mao | MEDIA (4-6 elementos) | 44px+ | Visual (cards grandes) |
| **Celular faccao** | Samsung A14 6.6" | ESSENCIAL (1 acao/tela) | 44px+ | Tatil (vibrate) + visual |
| **TV kiosk** | Monitor/TV | DISTANCIA (3m+) | N/A (sem toque) | Visual (auto-refresh) |

**Justificativa:** Maria (operadora) com luvas e fiapos nos dedos em ambiente de 80dB nao pode usar a mesma interface que Gabriel (admin) em desktop ultrawide. Dona Terezinha com Samsung A14 e ensino fundamental nao pode ver a mesma tela que Fabinho no escritorio.

---

## 1. INTERACTION MODELS POR MODULO

### 1.1 Quality (`/quality`)

**Personas primarias:** Fabinho (GERENTE), Gabriel (ADMIN)
**Contexto:** Escritorio, desktop, analise semanal
**Dados:** `GET /api/quality/overview`, `/by-type`, `/by-stage`, `/by-op`, `/by-faction`, `/trend`

#### Modelo de Navegacao: Single Page com Scroll Sections

**Decisao:** NAO usar tabs ou sub-paginas. Qualidade e um modulo de **analise visual** onde o gerente faz scroll vertical para explorar os dados progressivamente. Tabs escondem informacao e forcam cliques extras — Fabinho quer ver tudo em um fluxo vertical.

```
/quality
├── [PageHeader] eyebrow="Qualidade" title="Analise de Defeitos"
│   └── [right] DateRangeFilter (global para toda a pagina)
│
├── [Section 1] KPI Row — 4 MetricBox
│   ├── Total Defeitos (numero + trend)
│   ├── Taxa de Defeito (% + trend)
│   ├── Defeitos Criticos (numero)
│   └── Taxa de Resolucao (% + trend)
│
├── [Section 2] Pareto Chart — DefectPareto
│   └── Bar chart horizontal, sorted desc, top 8 tipos
│   └── Cada barra clicavel → expande detalhes inline (accordion)
│
├── [Section 3] Trend Chart — DefectTrend
│   └── Area chart, periodo selecione pelo DateRangeFilter
│   └── Hover mostra tooltip com valor exato + data
│
├── [Section 4] Heatmap — StageHeatmap
│   └── Grid: etapas (Y) x tipos de defeito (X)
│   └── Intensidade por cor (opacity do --destructive)
│   └── Hover mostra contagem exata
│
└── [Section 5] Faccoes — FactionQuality (se permissao factions:view)
    └── Tabela: faccao, defeitos, taxa contestacao, rating
    └── Linha clicavel → navega para /factions/[id]
```

**Interacao do DateRangeFilter:**
- Presets: "Hoje", "7 dias", "30 dias", "Este mes"
- Custom: date picker de/ate
- Ao mudar, TODOS os charts atualizam (single hook `useQualityData(dateRange)`)
- Loading state: opacity-60 nos charts, skeleton nos KPIs

**Mobile (< 768px):**
- KPIs: grid 2x2
- Charts: full-width, height reduzida (200px → 160px)
- Heatmap: scroll horizontal com indicador visual de scroll
- Tabela faccoes: vira cards empilhados

---

### 1.2 Team (`/team`)

**Personas primarias:** Gabriel (ADMIN)
**Contexto:** Escritorio, desktop, operacao esporadica (onboarding + manutencao)
**Dados:** `GET/POST/PATCH /api/team/members`, `/deactivate`, `/reset-pin`

#### Modelo de Navegacao: Master-Detail com Sheet

**Decisao:** Lista de membros como view principal. Criar/editar abre em **Sheet lateral** (drawer direito, 480px) — nao em pagina separada. Motivo: Gabriel precisa ver a lista enquanto edita (contexto visual), e a operacao e rapida o suficiente para nao justificar navegacao.

```
/team
├── [PageHeader] eyebrow="Equipe" title="Gerenciamento"
│   └── [right] Button "Novo Membro" (abre Sheet)
│
├── [FilterBar]
│   ├── SearchInput (busca por nome)
│   ├── RoleFilter (dropdown: Todos, Admin, Gerente, Coordenador, Operador)
│   └── StatusFilter (toggle: Ativos / Inativos)
│
├── [Content] MembersList
│   └── DataTable (desktop) / CardList (mobile)
│   └── Colunas: Avatar+Nome, Role (StatusBadge), Setor, Status, Acoes
│   └── Acoes por linha: Editar (abre Sheet), Reset PIN, Desativar
│
└── [Sheet] MemberForm (lateral direito, 480px)
    ├── Modo: Criar / Editar (detectado por presenca de ID)
    ├── Campos: Nome*, Email (se role != OPERADOR), Telefone, Role*, Setor*
    ├── Se Operador: campo PIN (4-6 digitos) com botao "Gerar PIN aleatorio"
    ├── Validacao inline (campo a campo, nao submit-only)
    └── Botao: "Salvar" / "Criar Membro"
```

**Protecao contra operacoes destrutivas:**

1. **Desativar membro:** AlertDialog com:
   - Titulo: "Desativar {nome}?"
   - Corpo: "Esta pessoa perdera acesso ao sistema imediatamente. Dados historicos serao preservados."
   - Botoes: "Cancelar" (secondary) | "Desativar" (destructive)
   - Nao permite desativar a si mesmo (botao hidden)

2. **Reset PIN:** Confirmation inline (popover, nao modal):
   - "Novo PIN sera gerado. Anote e entregue ao operador."
   - Botao "Confirmar Reset" → mostra novo PIN por 30 segundos em destaque
   - Apos 30s, PIN escondido (so pode ser resetado novamente)

**Mobile (< 768px):**
- Tabela → cards verticais
- Sheet → full-screen sheet (bottom)
- Acoes → menu dropdown (3 dots)

---

### 1.3 Settings (`/settings`)

**Personas primarias:** Gabriel (ADMIN)
**Contexto:** Escritorio, desktop, onboarding de cliente e manutencao
**Dados:** `/api/settings/tenant`, `/stages`, `/targets`, `/api/admin/*-tokens`, `/api/profile`

#### Modelo de Navegacao: Vertical Tabs (sidebar esquerdo)

**Decisao:** Tabs verticais no lado esquerdo (nao horizontais no topo). Motivo: Settings tem 5 secoes com profundidade variavel. Tabs horizontais em topo ficam apertadas em mobile e nao escalam. Tabs verticais permitem scroll independente no conteudo direito.

```
/settings
├── [PageHeader] eyebrow="Sistema" title="Configuracoes"
│
├── [Layout] 2 colunas: NavTabs (240px) + Content (flex-1)
│
├── [NavTabs] — sidebar esquerdo fixo
│   ├── Perfil (icone User)
│   ├── Empresa (icone Building)
│   ├── Etapas de Producao (icone Layers)
│   ├── Metas (icone Target)
│   └── Tokens de Acesso (icone Key)
│
├── [Tab: Perfil] ProfileEdit
│   ├── Avatar (futuro: upload) + Nome + Telefone
│   ├── Email (readonly, vem do Supabase Auth)
│   ├── Role (readonly, badge)
│   └── Botao "Salvar Alteracoes"
│
├── [Tab: Empresa] TenantSettings
│   ├── Nome da empresa + Logo (upload)
│   ├── Timezone (dropdown: America/Sao_Paulo default)
│   ├── Moeda (BRL fixo por enquanto)
│   └── Botao "Salvar"
│
├── [Tab: Etapas] StageManager ★ MAIS COMPLEXO
│   ├── Lista sortable (drag-and-drop via @dnd-kit/sortable)
│   │   └── Cada item: [drag handle] [numero] [nome editavel] [cor picker] [delete]
│   ├── Botao "+ Adicionar Etapa" (inline no fim da lista)
│   ├── Salvar reorder: PATCH /api/settings/stages/reorder (batch)
│   ├── Delete etapa: AlertDialog com checagem de uso
│   │   └── "Esta etapa possui X bipagens. Nao pode ser removida."
│   │   └── OU "Remover etapa? Dados de lotes nesta etapa serao preservados."
│   └── Feedback: toast "Etapas atualizadas" apos save
│
├── [Tab: Metas] TargetsConfig
│   ├── Meta diaria de pecas (input numerico)
│   ├── Meta de produtividade (% input)
│   ├── Tolerancia de defeitos (% input)
│   ├── Horario do turno: Inicio (time picker) + Fim (time picker)
│   └── Botao "Salvar Metas"
│   └── Info: "Estas metas serao usadas no dashboard e no kiosk TV"
│
└── [Tab: Tokens] TokenManager
    ├── [Sub-section] Tokens Kiosk
    │   ├── Tabela: Nome, Token (masked ****-****-XXXX), Status, Criado em, [Revogar]
    │   ├── Botao "+ Novo Token Kiosk"
    │   │   └── Dialog: Nome do kiosk → gera token → mostra URL copiavel
    │   └── Revogar: AlertDialog "Token sera invalidado imediatamente"
    │
    └── [Sub-section] Tokens Faccao
        ├── Tabela: Nome, Faccao, PIN (masked), Status, [Revogar]
        ├── Botao "+ Novo Token Faccao"
        │   └── Dialog: Selecionar faccao → gera token + PIN → mostra para copiar
        └── Revogar: AlertDialog com consequencias
```

**Drag-and-drop (StageManager):**
- Biblioteca: `@dnd-kit/sortable` (ja existe no ecossistema React)
- Visual: item levantado ganha `shadow-glow` + `scale(1.02)` + `opacity(0.9)` no placeholder
- Ao soltar: animacao de reorder (200ms) + auto-save (debounced 1s)
- Feedback: borda pulsante no item reordenado + toast "Ordem salva"

**Mobile (< 768px):**
- Vertical tabs → accordion ou tab bar horizontal (scroll)
- StageManager: drag-and-drop com long-press (300ms hold)
- Tabelas de tokens → cards empilhados

---

### 1.4 Factions (`/factions`)

**Personas primarias:** Fabinho (GERENTE), Gabriel (ADMIN)
**Contexto:** Escritorio, desktop, gestao de relacionamento com faccoes
**Dados:** `GET/POST/PATCH/DELETE /api/factions`, `/api/factions/[id]/shipments`, `/api/shipments`

#### Modelo de Navegacao: List → Detail (paginas separadas)

**Decisao:** Faccoes usa navegacao de paginas separadas (nao sheet). Motivo: o detail de uma faccao e rico demais para um sheet (historico de remessas, defeitos, financeiro, rating). Cada faccao e quase um "micro-dashboard".

```
/factions (LISTA)
├── [PageHeader] eyebrow="Terceirizados" title="Faccoes"
│   └── [right] Button "Nova Faccao" (abre Dialog, nao Sheet)
│
├── [KPI Row] — 4 MetricBox
│   ├── Total Faccoes (ativas)
│   ├── Remessas em Andamento
│   ├── Taxa Media de Defeito (%)
│   └── Valor Total Pendente (R$)
│
├── [Content] FactionsList
│   └── DataTable / CardList
│   └── Colunas: Nome, Tipo, Remessas Ativas, Rating (stars), Status, Acoes
│   └── Linha clicavel → navega para /factions/[id]
│   └── Acoes: Editar (Dialog), Nova Remessa, Desativar
│
└── [Dialog] FactionForm (modal centered, 520px)
    ├── Nome*, Tipo (Costura/Acabamento/Outro)*, Contato*, Telefone*
    ├── Endereco, Preco por peca (R$), Prazo medio (dias)
    └── Botao "Criar Faccao" / "Salvar"

/factions/[id] (DETALHE)
├── [PageHeader] eyebrow="Faccao" title="{nome}"
│   └── [right] Actions: "Editar" | "Nova Remessa" | "Desativar"
│
├── [KPI Row] — FactionScoreCard + 3 MetricBox
│   ├── ScoreCard: Rating (1-5 estrelas), baseado em prazo + qualidade + volume
│   ├── Remessas Ativas
│   ├── Taxa de Defeito (%)
│   └── Valor Pendente (R$)
│
├── [Section] Informacoes de Contato
│   └── LisionCard: Nome, Tipo, Telefone, Endereco, Preco/peca
│
├── [Section] Remessas (tabs: Ativas | Historico)
│   └── Tabela: Data envio, Lotes, Pecas, Prazo, Status, Acoes
│   └── Status: ENVIADA | RECEBIDA | DEVOLVIDA | ATRASADA
│   └── Acao "Receber Devolucao" → Dialog ShipmentReceive
│
├── [Section] Historico de Defeitos
│   └── Tabela: Data, Tipo, Severidade, Qtd, Status Contestacao
│
└── [Section] Resumo Financeiro
    └── Periodo atual: Valor bruto, deducoes, valor liquido
    └── Grafico simples: valores por mes (ultimos 6 meses)
```

**Criar Remessa (ShipmentCreate):**
- Abre como Dialog full (640px) ou pagina separada se complexidade justificar
- Fluxo: Selecionar lotes disponiveis (checkboxes) → Definir prazo → Informar motorista (opcional) → Confirmar
- Selecao de lotes: tabela com checkbox, filtro por OP, mostra qtd pecas
- Confirmacao: resumo antes de enviar (lotes selecionados, total pecas, prazo)

**Receber Devolucao (ShipmentReceive):**
- Dialog: quantidade devolvida, observacoes
- Se quantidade < enviada: alerta de diferenca
- Apos confirmar: lotes voltam ao fluxo produtivo

---

### 1.5 Dashboard (`/dashboard`) — Refinamentos

**Personas:** Fabinho (GERENTE), Rodrigo (COORDENADOR)
**Contexto:** Escritorio + fabrica, desktop + tablet

#### Refinamentos Especificos

**1. Metas Dinamicas:**
- KPIs de meta DEVEM ler de `tenants.settings` via `GET /api/settings/targets`
- Hook `useDashboardData` ja recebe targets como parte do fetch
- Barra de progresso: `pecas_bipadas / meta_diaria * 100`
- Projecao de fim de turno: `(pecas_bipadas / horas_trabalhadas) * horas_restantes`
- Visual: progresso abaixo de 80% da projecao = barra `warning`, acima = `success`

**2. Notification Bell:**
```
[Bell Icon] + Badge com contagem (unread)
│
└── onClick → Popover (320px, max-height 400px, scroll)
    ├── Header: "Notificacoes" + "Marcar todas como lidas"
    ├── Lista de notificacoes (agrupadas por tipo)
    │   ├── Lote parado > 2h (destructive dot)
    │   ├── Defeito registrado (warning dot)
    │   ├── Remessa recebida pela faccao (success dot)
    │   └── Faccao contestou defeito (warning dot)
    └── Footer: "Ver todas" (futuro)
```
- Dados: `GET /api/notifications` (poll a cada 60s)
- Mark read: `PATCH /api/notifications/read` (batch)
- Dot colorido por severidade: destructive (urgente), warning (atencao), neutral (info)

**3. Activity Feed:**
- Formato atual: strings brutas de eventos
- Formato necessario: frases humanas em portugues
- Mapeamento:
  - `STAGE_IN` → "{operador} bipou lote {barcode} em {etapa}"
  - `DEFECT_REPORTED` → "{operador} reportou defeito em {barcode}"
  - `REWORK_RESOLVED` → "{operador} resolveu retrabalho de {barcode}"
  - `ORDER_CREATED` → "Nova OP {op_number} criada por {usuario}"
- Timestamp: relativo ("ha 3 min", "ha 1h") ate 24h, absoluto apos

**4. Search Bar (escopo reduzido):**
- Para v1: search local nas OPs visiveis (filtrar tabela de OPs ativas)
- Search global (OPs, lotes, barcodes) fica como enhancement futuro
- Input com debounce 300ms, resultados inline

---

### 1.6 Portal — Faccoes (`/portal`)

**Persona:** Dona Terezinha (FACCAO)
**Contexto:** Samsung Galaxy A14, tela 6.6", dados moveis 4G, letramento digital basico
**Dados:** `/api/faction/*` (todos endpoints existentes)

#### Modelo de Navegacao: Bottom Tab Bar (5 tabs)

**Decisao:** Bottom tab bar fixo, 5 icones. Motivo: Dona Terezinha esta acostumada com WhatsApp e app do banco — ambos usam bottom navigation. Sidebar ou hamburger menu sao padroes que ela nao reconhece.

```
[BOTTOM TAB BAR — fixo, 60px height, bg-surface]
├── 🏠 Inicio      → /portal/dashboard
├── 📦 Remessas    → /portal/shipments
├── ⚠️ Defeitos    → /portal/defects
├── 💰 Financeiro  → /portal/financial
└── 🔔 Avisos      → /portal/notifications (com badge de unread)
```

**Regras de UX para o Portal:**
1. **Uma acao principal por tela** — botao CTA unico, grande (48px height, full-width)
2. **Vocabulario simplificado** — ver mapeamento em PERSONAS-AND-JOURNEYS.md Section 6.4
3. **Textos grandes** — body 16px minimo, titulos 20px+, labels 14px
4. **Cores semanticas exageradas** — verde = bom, vermelho = atencao, amarelo = prazo
5. **Sem tabelas** — tudo em cards empilhados com informacao essencial
6. **Carregamento leve** — target < 200KB por pagina, lazy load imagens
7. **Feedback tatil** — `navigator.vibrate(50)` em acoes de confirmacao

**Dashboard do Portal:**
```
┌─────────────────────────────────┐
│  Ola, Terezinha                 │  ← nome da faccao
│                                 │
│  ┌─────────────────────────┐    │
│  │  Pecas com voce          │    │
│  │  350                    │    │  ← numero GRANDE, font-display 36px
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Voce vai receber        │    │  ← A INFORMACAO #1 DELA
│  │  R$ 2.362,50            │    │  ← font-display 32px, text-success
│  │  dia 10/07              │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌──────────┐ ┌──────────┐     │
│  │Devolucoes│ │ Prazo    │     │
│  │  1       │ │ 15/06    │     │
│  └──────────┘ └──────────┘     │
│                                 │
│  [Nova remessa recebida!]       │  ← banner se houver remessa nao confirmada
│  [Confirmar Recebimento →]      │  ← CTA direto no dashboard
│                                 │
└─────────────────────────────────┘
```

**Shipment Detail Page (COMPLETAR):**
- Card por lote: numero do lote, qtd pecas, OP de origem
- Timeline vertical: Enviado → Recebido → Devolvido (status badges)
- Botao "Confirmar Recebimento" (verde, full-width, 48px)
- Botao "Informar Atraso" (warning, outline, full-width)

---

## 2. COMPONENT SPECIFICATIONS

### 2.1 Novos Atoms (componentes base reutilizaveis)

#### `DateRangeFilter`
```typescript
interface DateRangeFilterProps {
  value: DateRange;                    // { from: Date, to: Date }
  onChange: (range: DateRange) => void;
  presets?: DatePreset[];              // default: ["Hoje","7d","30d","Mes"]
  className?: string;
}
```
- **API:** Nenhuma (componente de UI puro)
- **Estados:** Normal, open (popover com calendar), custom selecionado
- **Responsivo:** Desktop = inline com botoes de preset + calendar popover. Mobile = full-width, presets empilhados
- **Design:** Usa `Popover` + `Calendar` (shadcn/ui existentes). Presets como `Button variant="ghost"` com tamanho `sm`

#### `EmptyState`
```typescript
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```
- **Uso:** Tabelas/listas vazias em todos os modulos
- **Design:** Centered, icon size-12 com opacity-30, titulo text-[15px], descricao text-[13px] muted
- **Responsivo:** Identico em todos os breakpoints

#### `ConfirmDialog`
```typescript
interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  consequences?: string[];     // lista de consequencias exibidas
  confirmLabel?: string;       // default "Confirmar"
  variant?: "destructive" | "warning" | "default";
  loading?: boolean;
}
```
- **Uso:** Todas operacoes destrutivas (desativar membro, revogar token, deletar etapa)
- **Design:** AlertDialog (shadcn), botao confirm com variant destructive
- **Mobile:** Full-width buttons, sheet bottom

#### `DataTable` (responsive)
```typescript
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  emptyState?: EmptyStateProps;
  onRowClick?: (row: T) => void;
  mobileCard?: (row: T) => React.ReactNode;  // render alternativo mobile
}
```
- **API:** Nenhuma (recebe data via props)
- **Estados:** Loading (skeleton rows), Empty (EmptyState), Data, Error
- **Responsivo:** `>= md` = tabela completa. `< md` = renderiza `mobileCard()` como cards empilhados
- **Design:** Usa `Table` (shadcn), linhas com `hover:bg-secondary/30`, borda `border-border/20`

#### `TableSkeleton`
```typescript
interface TableSkeletonProps {
  rows?: number;     // default 5
  columns?: number;  // default 4
}
```
- **Design:** Skeleton (shadcn) com shapes retangulares, animacao shimmer
- **Mobile:** 3 card skeletons empilhados

### 2.2 Novas Molecules (composicoes)

#### `FilterBar`
```typescript
interface FilterBarProps {
  children: React.ReactNode;  // filtros compostos dentro
  className?: string;
}
```
- **Uso:** Wrapper padrao para barra de filtros abaixo do PageHeader
- **Design:** `flex items-center gap-3 flex-wrap`, padding inline
- **Mobile:** Stack vertical, cada filtro full-width

#### `FactionScoreCard`
```typescript
interface FactionScoreCardProps {
  rating: number;          // 1.0 - 5.0
  deliveryScore: number;   // % pontualidade
  qualityScore: number;    // % sem defeito
  volumeTotal: number;     // pecas processadas
}
```
- **API:** Calculado no backend via `GET /api/factions/[id]`
- **Design:** LisionCard com rating como 5 estrelas (preenchimento parcial), 3 SubMetric abaixo
- **Responsivo:** Identico, compacta SubMetrics em 2 linhas no mobile

#### `TokenDisplay`
```typescript
interface TokenDisplayProps {
  token: string;
  pin?: string;
  expiresAt?: Date;
  onCopy: () => void;
}
```
- **Uso:** Apos gerar token de kiosk ou faccao, mostra token + PIN de forma copiavel
- **Design:** bg-secondary rounded-xl, token em font-mono, botao "Copiar" com icone Clipboard
- **Estado:** Visivel por 60 segundos, depois "Token oculto. Gere um novo se necessario."

### 2.3 Novos Organisms (paginas compostas)

#### `QualityOverview`
- **API:** `GET /api/quality/overview`
- **Composicao:** 4x MetricBox + tendencia (Trend component existente)
- **Skeleton:** 4 MetricBox skeleton (retangulos com shimmer)

#### `DefectPareto`
- **API:** `GET /api/quality/by-type`
- **Composicao:** LisionCard + Recharts BarChart (horizontal)
- **Design:** Barras em foreground/40, hover foreground/60, label a esquerda
- **Empty:** "Nenhum defeito no periodo selecionado"
- **Skeleton:** Retangulos horizontais de tamanhos variados com shimmer

#### `DefectTrend`
- **API:** `GET /api/quality/trend`
- **Composicao:** LisionCard + Recharts AreaChart (identico ao do dashboard)
- **Design:** Area fill foreground/10, stroke foreground/40, dots no hover
- **Skeleton:** Area retangular com shimmer

#### `StageHeatmap`
- **API:** `GET /api/quality/by-stage`
- **Composicao:** LisionCard + grid customizado (nao chart library)
- **Design:** Celulas com bg-destructive/[opacity], onde opacity = count/maxCount
- **Hover:** Tooltip com "COSTURA x FURO: 23 ocorrencias"
- **Mobile:** Scroll horizontal com `overflow-x-auto`, sombra interna indicando scroll

#### `MembersList`
- **API:** `GET /api/team/members`
- **Composicao:** DataTable com mobileCard customizado
- **Desktop columns:** Avatar+Nome, Role (StatusBadge), Setor, Status (badge), Acoes (dropdown)
- **Mobile card:** Avatar + Nome + Role badge + Status indicator
- **Acoes mobile:** Bottom sheet com opcoes

#### `StageManager`
- **API:** `GET/POST/PATCH/DELETE /api/settings/stages`, `PATCH /api/settings/stages/reorder`
- **Composicao:** Lista sortable com @dnd-kit
- **Cada item:** [GripVertical handle] [circulo cor] [input nome] [color picker] [Trash2 icon]
- **Add:** Botao ghost "+ Adicionar etapa" no fim da lista
- **Save:** Auto-save com debounce 1.5s apos qualquer mudanca
- **Delete gate:** Se etapa tem scans, mostra contagem e bloqueia delete

#### `TargetsConfig`
- **API:** `GET/PATCH /api/settings/targets`
- **Composicao:** LisionCard com form fields
- **Campos:** Inputs numericos com labels claras + texto auxiliar
- **Save:** Botao explícito "Salvar Metas" (nao auto-save — metas sao criticas)

---

## 3. MOBILE ADAPTATION STRATEGY

### 3.1 Breakpoints

| Token | Valor | Uso |
|-------|-------|-----|
| `sm` | 640px | Smartphone (portal faccao) |
| `md` | 768px | Tablet portrait, breakpoint de tabela→card |
| `lg` | 1024px | Tablet landscape, desktop pequeno |
| `xl` | 1280px | Desktop padrao |
| `2xl` | 1536px | Ultrawide |

### 3.2 Tabela → Card Pattern

Regra universal: **abaixo de `md` (768px), toda DataTable renderiza como cards empilhados**.

**Implementacao:** Prop `mobileCard` na DataTable:
```
Desktop (>= md):
┌────────┬──────┬───────┬────────┬───────┐
│ Nome   │ Role │ Setor │ Status │ Acoes │
├────────┼──────┼───────┼────────┼───────┤
│ Maria  │ OP   │ Cost. │ Ativo  │ ...   │
└────────┴──────┴───────┴────────┴───────┘

Mobile (< md):
┌───────────────────────────────────┐
│ [Avatar] Maria do Carmo          │
│ Operadora · Costura         [●]  │  ← badge ativo
│                           [···]  │  ← menu acoes
└───────────────────────────────────┘
```

### 3.3 Sidebar Mobile

O AppSidebar ja tem `collapsible="icon"`. Para mobile:
- `< md`: Sidebar fica como Sheet (overlay) com trigger no header
- `SidebarTrigger` ja existe no PageHeader do dashboard
- Adicionar `SidebarTrigger` em TODOS os PageHeaders de modulos novos
- Ao navegar, Sheet fecha automaticamente

### 3.4 Forms Mobile

- Campos empilham verticalmente (ja padrao com flex-col)
- Labels ficam acima do campo (nao inline)
- Botoes de acao: full-width, height 48px minimo
- Sheet/Dialog: vira full-screen sheet (componente Drawer do shadcn)
- Selects: usa componente nativo do mobile (`<select>`) para melhor UX touch

### 3.5 Portal Mobile (Dona Terezinha)

**Regras especificas para tela 6.6" com Android barato:**

| Aspecto | Regra | Justificativa |
|---------|-------|---------------|
| Font size body | 16px minimo | Problemas de visao, sem oculos |
| Font size titulo | 20px+ | Hierarquia clara |
| Touch targets | 44px x 44px minimo | Dedos grandes, sem precisao |
| Padding horizontal | 16px | Nao desperdicar espaco |
| Espacamento entre cards | 12px | Visual claro mas compacto |
| Imagens | Nenhuma (exceto logo) | Economia de dados |
| Icones | Lucide, stroke 2px, size 20px | Visibilidade |
| Cores de status | Saturadas (success/destructive/warning) | Reconhecimento instantaneo |
| Scroll | Vertical only, sem horizontal | Simplicidade |
| Bottom tab bar | Fixo, 60px, 5 items | Pattern familiar (WhatsApp-like) |
| Loading | Skeleton por card (nao spinner) | Percepacao de velocidade |

**Performance budget Portal:**
- First Contentful Paint: < 1.5s em 4G
- Total page weight: < 200KB (JS + CSS + dados)
- API responses: < 50KB cada
- Lazy load: abas nao visiveis nao carregam dados

---

## 4. MICRO-INTERACTION DEFINITIONS

### 4.1 Motion System (Framer Motion)

**Principio:** Animacoes sao funcionais, nao decorativas. Cada animacao comunica estado, direcao ou feedback.

#### Entrance Animations (page/section load)
```typescript
// Padrao para cards/sections (stagger)
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }
  })
};

// Padrao para itens de lista
const listItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { duration: 0.3, delay: 0.03 * i, ease: [0.22, 1, 0.36, 1] }
  })
};
```

#### Feedback Animations

| Evento | Animacao | Duracao | Ease |
|--------|----------|---------|------|
| Scan success | `scale(1) → scale(1.02) → scale(1)` + flash bg-success/20 | 300ms | spring |
| Scan error | `translateX(0, -4, 4, -4, 4, 0)` shake | 400ms | linear |
| Scan warning | `opacity(0.5) → opacity(1)` pulse | 200ms | ease-out |
| Button click | `scale(0.98) → scale(1)` | 100ms | ease-out |
| Card hover | `translateY(0) → translateY(-2px)` + shadow increase | 200ms | ease-out |
| Toast enter | `translateY(16) → translateY(0)` + `opacity(0→1)` | 300ms | spring |
| Toast exit | `opacity(1→0)` + `translateX(0→100%)` | 200ms | ease-in |
| Modal enter | `scale(0.95) → scale(1)` + `opacity(0→1)` + backdrop | 200ms | ease-out |
| Modal exit | `scale(1) → scale(0.95)` + `opacity(1→0)` | 150ms | ease-in |
| Sheet enter (mobile) | `translateY(100%) → translateY(0)` | 300ms | spring |

### 4.2 Feedback Patterns por Tipo de Acao

| Tipo de Acao | Feedback | Componente |
|-------------|----------|-----------|
| Mutation sucesso (create/update) | Toast success (Sonner) "Salvo com sucesso" | Sonner toast |
| Mutation erro | Toast error "Erro ao salvar: {mensagem}" | Sonner toast |
| Delete/deactivate | ConfirmDialog antes + Toast apos | AlertDialog + Sonner |
| Validacao de campo | Inline error below field (text-destructive, 12px) | Form field |
| Bipagem (scan) | Audio beep + visual flash + counter increment | Custom (existente) |
| Acao no portal | Vibrate(50ms) + visual feedback | navigator.vibrate |
| Loading mutation | Button disabled + spinner icon | Button com Loader2 |
| Polling update | Opacity-60 flash (100ms) quando dados atualizam | CSS transition |

### 4.3 Loading States por Contexto

| Contexto | Skeleton Shape | Qtd |
|----------|---------------|-----|
| KPI row | 4 retangulos (MetricBox shape) | 4 |
| Tabela | 5 linhas retangulares com widths variaveis | 5 |
| Chart area | Retangulo grande com shimmer | 1 |
| Card list (mobile) | 3 cards com avatar + 2 linhas | 3 |
| Form (sheet) | 4 inputs retangulares + 1 botao | 5 |
| Portal dashboard | 3 cards grandes + 2 pequenos | 5 |
| Detail page | Header + 2 sections com skeleton | 3 |

**Regra:** Skeleton shapes devem CORRESPONDER a forma do conteudo final. Nao usar spinners genericos exceto em botoes de mutation.

### 4.4 Audio Feedback (Scan only)

| Evento | Frequencia | Duracao | Pattern |
|--------|-----------|---------|---------|
| Success | 880Hz | 150ms | Single beep |
| Warning (duplicate) | 440Hz | 200ms | Single lower beep |
| Error | 220Hz | 200ms x2 | Double beep (gap 50ms) |
| Meta atingida | 880Hz→1046Hz→1318Hz | 150ms x3 | Ascending chord |

**Audio so e usado na tela de Scan.** Nenhum outro modulo usa feedback sonoro. Motivo: audio e para ambiente ruidoso de fabrica onde o operador pode nao estar olhando. No escritorio, audio seria intrusivo.

---

## 5. INFORMATION DENSITY RULES

### 5.1 Regras por Contexto

#### Chao de Fabrica (Operador — `/scan`)
| Regra | Valor | Justificativa |
|-------|-------|---------------|
| KPIs visiveis | 4-5 max | Maria precisa ver contagem do dia, nao analytics |
| Font size minimo | 13px body, 22px numeros | Visibilidade a distancia de braco |
| Botoes | 48px height | Luvas, dedos sujos |
| Informacao por tela | 1 acao primaria + feedback | Foco total em bipar |
| Scrolling | Minimo (tudo above the fold) | Sem tempo para scroll |
| Cores | Alto contraste (success/destructive/warning saturados) | Iluminacao variavel |

#### Escritorio (Gerente/Admin — `/dashboard`, `/quality`, `/factions`, `/team`, `/settings`)
| Regra | Valor | Justificativa |
|-------|-------|---------------|
| KPIs por row | 4-6 | Fabinho quer densidadde |
| Colunas em tabela | 5-7 max | Sem scroll horizontal |
| Charts por secao | 2-3 visiveis sem scroll | Comparacao visual rapida |
| Font size | 10px labels, 13px body, 22px numbers, 36-44px titles | Hierarquia editorial |
| Actions per row | 2-3 (icone ou dropdown) | Acesso rapido mas nao poluido |
| Drill-down | Tudo clicavel que tenha detalhe | Fabinho quer explorar |

#### Celular Faccao (Portal — `/portal/*`)
| Regra | Valor | Justificativa |
|-------|-------|---------------|
| KPIs por tela | 2-3 max | Tela 6.6", nao sobrecarregar |
| Colunas | 0 (cards, nao tabelas) | Sem scroll horizontal |
| Font size minimo | 16px body | Dona Terezinha, problemas de visao |
| Acoes por tela | 1 CTA principal | Clareza maxima |
| Formularios | 2-3 campos max | Paciencia limitada, letramento basico |
| Texto auxiliar | Frases curtas (< 10 palavras) | Nao vai ler paragrafos |

### 5.2 Regra de Ouro: Progressive Disclosure

Informacao e revelada em camadas:

1. **Camada 1 (glance — 2s):** KPIs, status badges, alertas coloridos
2. **Camada 2 (scan — 10s):** Charts, tabelas resumidas, ranking
3. **Camada 3 (explore — 30s+):** Drill-down, filtros, detail pages

Cada camada so e acessivel por acao explicita (clique, scroll, navegacao). A Camada 1 deve comunicar "tudo esta normal" ou "algo precisa de atencao" sem nenhuma interacao.

---

## 6. DECISOES UX ESPECIFICAS

### 6.1 Scan — Ciclo de Bipagem

**Esta e a tela mais usada do LISION.** Maria bipa 80-150 lotes por turno. Cada segundo importa.

**Decisoes:**

1. **Auto-focus permanente no input:** O cursor SEMPRE volta ao campo de barcode apos cada scan. Nao ha nenhum outro campo focavel na area principal. `setTimeout(() => inputRef.current?.focus(), 50)` ja existe — manter.

2. **Sem confirmacao em scan normal:** Enter ou scanner USB submete automaticamente. O botao "Confirmar Bipagem" existe APENAS como fallback visual — o fluxo primario e scanner → auto-submit.

3. **Feedback imediato (< 200ms visual):** O feedback panel muda instantaneamente com AnimatePresence. O audio toca antes do panel renderizar (fire-and-forget).

4. **Botao "Reportar Defeito" posicional:** Aparece APENAS apos scan com sucesso, abaixo do feedback. Nao existe como botao fixo — evita toques acidentais durante bipagem rapida.

5. **Historico limitado a 20 itens:** Nao precisa de paginacao. Maria nunca consulta historico alem dos ultimos scans. O historico serve como "fita de caixa registradora" — prova visual de que biou.

6. **Stage selector persistido:** A etapa selecionada fica em `localStorage`. Maria nao precisa selecionar etapa toda vez — o coordenador configura uma vez e ela bipa.

7. **Fullscreen mode:** Para tablets fixos em suporte. Elimina barra do navegador e sidebar, maximizando area de scan.

8. **Offline queue (enhancement futuro):** Quando detectar `navigator.onLine === false`, armazenar scans em IndexedDB e sincronizar quando reconectar. Visual: badge "3 pendentes" no canto.

### 6.2 Dashboard — Metas Dinamicas

**Decisoes:**

1. **Meta vem do backend:** Dashboard.tsx chama `GET /api/settings/targets` (ou targets vem embutido no `/api/dashboard/kpis`). Se targets nao configurados, mostra "Configure metas em Configuracoes" com link direto.

2. **Projecao inteligente:** Nao mostrar projecao antes das 09:00 (dados insuficientes). Apos 09:00, calcular: `(scans_ate_agora / horas_trabalhadas) * horas_restantes_no_turno`. Exibir como linha pontilhada no chart.

3. **Comparativos automaticos:** Ao lado de cada KPI, mostrar `Trend` component (ja existe): seta para cima/baixo + percentual vs periodo anterior. "Periodo anterior" = ontem (se filtro = hoje), semana passada (se filtro = semana), mes passado (se filtro = mes).

4. **Alerta de lote parado:** Card com borda `destructive` pulsante (animation-pulse-dot). Mostra barcode, etapa e horas parado. Clicavel → navega para detalhe do lote/OP.

### 6.3 Portal — Simplicidade Maxima para Dona Terezinha

**Decisoes:**

1. **Linguagem:** Tudo em portugues simples. "Remessa" (nao "shipment"), "Defeito" (nao "defect record"), "Quanto vou receber" (nao "financial summary"). Ver tabela de vocabulario completa em PERSONAS-AND-JOURNEYS.md Section 6.4.

2. **Dashboard como resposta direta:** A primeira coisa que Dona Terezinha ve ao abrir o portal e a resposta para sua pergunta #1: "Quanto vou receber?" Valor em destaque, verde, grande. Nao esconder atras de tabs ou navegacao.

3. **Confirmar recebimento = 1 toque:** Na tela de remessas, nova remessa mostra botao verde "Confirmar Recebimento". Um toque. Sem formulario. Sem checklist. O recebimento fisico ja aconteceu — o sistema so precisa do registro.

4. **Contestacao guiada:** Em vez de textarea livre (que intimida Terezinha), oferecer opcoes pre-definidas:
   - "O tecido ja veio com defeito"
   - "O defeito e da costura anterior, nao minha"
   - "A quantidade esta incorreta"
   - "Outro motivo" (ai sim abre textarea)
   Isso padroniza contestacoes E facilita para quem tem dificuldade de escrever.

5. **Bottom tab bar com badge:** Tab "Avisos" mostra badge numerico de notificacoes nao lidas. Dona Terezinha ja reconhece esse pattern do WhatsApp.

6. **Sem login por email:** Auth por Token + PIN numerico (6 digitos). Pattern identico ao PIX — ela ja sabe. Token e fixo (enviado por WhatsApp pelo admin), PIN ela memoriza.

### 6.4 Settings/Team — Protecao Destrutiva

**Principio:** Operacoes que nao podem ser desfeitas devem ter **3 niveis de protecao**:

**Nivel 1 — Operacoes reversiveis (soft):**
- Desativar membro (pode reativar)
- Revogar token (pode gerar novo)
- → ConfirmDialog simples com descricao de consequencias

**Nivel 2 — Operacoes com impacto em dados:**
- Deletar etapa de producao
- → ConfirmDialog COM verificacao de uso (mostra contagem de scans/lotes)
- → Se etapa tem dados, BLOQUEIA delete (so permite desativar/renomear)

**Nivel 3 — Operacoes irreversiveis (futuro):**
- Deletar tenant (admin only)
- → ConfirmDialog + digitar nome do tenant para confirmar (pattern GitHub)
- → Nao implementar na v1

**Regra adicional: ninguem pode se auto-prejudicar:**
- Admin nao pode desativar a si mesmo
- Admin nao pode rebaixar proprio role
- Botoes para essas acoes ficam `disabled` com tooltip explicativo

---

## 7. COMPONENTES EXISTENTES — INVENTARIO E EXTENSOES

### 7.1 Componentes que DEVEM ser reutilizados (nao recriar)

| Componente | Uso nos novos modulos |
|------------|----------------------|
| `LisionCard` | Container padrao para todas as secoes |
| `LisionCardHeader` | Header de secao com eyebrow + title + right slot |
| `PageHeader` | Header de pagina com eyebrow + title + children (actions) |
| `MetricBox` | KPIs em todos os modulos (quality, factions, dashboard) |
| `SubMetric` | Metricas secundarias dentro de cards |
| `StatusBadge` | Status em tabelas (ativo/inativo, sucesso/erro, role) |
| `Trend` (Dashboard.tsx) | Extrair para componente reutilizavel em `/ui/trend.tsx` |

### 7.2 Extensoes necessarias aos existentes

| Componente | Extensao |
|------------|----------|
| `MetricBox` | Adicionar prop `trend?: number` para mostrar seta + % inline |
| `StatusBadge` | Adicionar variante `info` (bg-foreground/10 text-foreground) |
| `PageHeader` | Garantir `SidebarTrigger` em mobile (ja existe no dashboard, replicar) |

---

## 8. DESIGN TOKENS RECAP (IMUTAVEIS)

Para referencia rapida dos implementadores:

```css
/* Background layers (escuro → claro) */
--background:       oklch(0.07 0 0);   /* pano de fundo geral */
--surface:          oklch(0.10 0 0);   /* sidebar, sections */
--surface-elevated: oklch(0.13 0 0);   /* hover, elevated */
--card:             oklch(0.10 0 0);   /* cards base */
--secondary:        oklch(0.18 0 0);   /* inputs, buttons ghost */
--accent:           oklch(0.20 0 0);   /* hover states */

/* Foreground */
--foreground:        oklch(0.98 0 0);  /* texto principal */
--muted-foreground:  oklch(0.62 0 0);  /* texto secundario */

/* Semantico */
--success:     oklch(0.75 0.16 145);   /* verde */
--warning:     oklch(0.80 0.15 75);    /* amarelo */
--destructive: oklch(0.65 0.20 25);    /* vermelho */

/* Gradientes */
--gradient-card: linear-gradient(180deg, oklch(0.12 0 0) 0%, oklch(0.09 0 0) 100%);
--shadow-elegant: 0 30px 60px -20px oklch(0 0 0 / 0.6), inset top glow;

/* Transition */
--transition-smooth: cubic-bezier(0.22, 1, 0.36, 1);  /* ease-out suave */
```

**ESTES VALORES NAO PODEM SER ALTERADOS.** Todo novo componente DEVE usar estas variaveis via Tailwind classes (`bg-card`, `text-muted-foreground`, `border-border/40`, etc).

---

## 9. ACESSIBILIDADE (WCAG AA)

### Requisitos minimos para todos os modulos novos:

| Criterio | Requisito | Como |
|----------|-----------|------|
| Contraste texto | 4.5:1 minimo | foreground oklch(0.98) sobre background oklch(0.07) = 18:1 — OK |
| Contraste interativo | 3:1 minimo | Borders e focus rings visiveis |
| Focus visible | Ring visivel em todos os interativos | `focus:ring-1 focus:ring-foreground/20` (padrao ja existe) |
| Aria labels | Em icone-only buttons | `aria-label="Revogar token"` |
| Form errors | Associados ao campo | `aria-describedby` no input ligado ao erro |
| Screen reader | Headings hierarquicos | h1 (PageHeader), h2 (secoes), h3 (cards) |
| Keyboard nav | Tab order logico | Nao usar `tabindex` positivo |
| Motion reduced | Respeitar `prefers-reduced-motion` | Framer Motion `reduceMotion` prop |

### Portal (acessibilidade adicional):
- Font scaling: respeitar `font-size` do sistema (nao usar px fixo < 16px)
- Touch targets: 44x44px minimo (WCAG 2.5.5)
- Color nao como unico indicador: badges com icone + texto, nao so cor

---

*— Uma, desenhando com empatia 💝*
