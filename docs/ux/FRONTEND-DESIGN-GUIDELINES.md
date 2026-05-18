# LISION Frontend Design Guidelines

> **Status:** Aprovado — Este documento e lei. Todo frontend deve seguir estas diretrizes.
> **Fonte:** Extraido diretamente do design aprovado em `src/components/dashboard/Dashboard.tsx`, `globals.css`, `AppSidebar.tsx`, `AppShell.tsx` e componentes shadcn/ui customizados.
> **Regra:** O design atual NAO pode ser alterado. Novas telas devem se integrar visualmente ao que ja existe.

---

## 1. Identidade Visual

### 1.1 Filosofia
LISION e um sistema de rastreamento textil industrial. O design e **dark-first, monochrome, data-dense** — projetado para operadores de chao de fabrica e gestores que precisam absorver informacoes rapidamente.

### 1.2 Paleta de Cores — OKLCH Monochrome

**REGRA ABSOLUTA:** A interface e 100% monocromatica (preto/branco/cinza). Cor aparece APENAS para indicadores semanticos de status.

```
BACKGROUNDS
  --background:       oklch(0.07 0 0)   // fundo principal (quase preto)
  --surface:          oklch(0.10 0 0)   // superficie elevada
  --surface-elevated: oklch(0.13 0 0)   // superficie mais elevada
  --card:             oklch(0.10 0 0)   // fundo de cards
  --secondary:        oklch(0.18 0 0)   // botoes secundarios, bg hover
  --accent:           oklch(0.20 0 0)   // destaque sutil

FOREGROUNDS
  --foreground:          oklch(0.98 0 0)   // texto principal (quase branco)
  --muted-foreground:    oklch(0.62 0 0)   // texto secundario/labels
  --primary:             oklch(0.98 0 0)   // botao primario = branco
  --primary-foreground:  oklch(0.07 0 0)   // texto no botao primario = preto

BORDERS
  --border: oklch(0.20 0 0)              // bordas sutis
  --input:  oklch(0.20 0 0)              // borda de inputs

SEMANTICOS (UNICO USO DE COR)
  --success:     oklch(0.75 0.16 145)    // verde — status OK, positivo
  --warning:     oklch(0.80 0.15 75)     // amarelo — atencao
  --destructive: oklch(0.65 0.20 25)     // vermelho — critico, erro
```

### 1.3 Quando Usar Cores Semanticas

| Cor | Uso Permitido | Uso Proibido |
|-----|---------------|--------------|
| `text-success` / `bg-success/10` | Status OK, trend positivo, meta atingida, badge ativo | Decoracao, fundos de secao, icones gerais |
| `text-warning` / `bg-warning/10` | Alerta, atencao necessaria, meta parcial | Informacao neutra |
| `text-destructive` / `bg-destructive/10` | Erro critico, atraso, falha, exclusao | Qualquer destaque que nao seja negativo |

**Padrao de status badge:**
```tsx
// CORRETO — badge com borda + fundo translucido
<span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-success/10 text-success border-success/20">
  EM DIA
</span>

// Para warning:
<span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-warning/10 text-warning border-warning/20">
  ATENCAO
</span>

// Para destructive:
<span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-destructive/10 text-destructive border-destructive/20">
  ATRASO
</span>
```

---

## 2. Tipografia

### 2.1 Familias

| Uso | Familia | Classe CSS | Aplicacao |
|-----|---------|------------|-----------|
| **Display/titulos** | Inter Tight | `.font-display` | Titulos de secao, numeros grandes, KPIs, branding |
| **Corpo** | Inter | `.font-sans` (default) | Texto corrido, labels, botoes, descricoes |
| **Dados/numeros** | JetBrains Mono | `.font-mono` | Codigos, timestamps, valores numericos, tabular data |

### 2.2 Escala Tipografica do Dashboard (REFERENCIA)

| Elemento | Classes | Exemplo |
|----------|---------|---------|
| Hero title | `font-display text-[36px] lg:text-[44px] font-semibold tracking-tight leading-none` | "Bom dia, Jonatas." |
| KPI grande | `font-display text-[56px] font-semibold leading-none tabular-nums` | Score 87 (health gauge) |
| KPI medio | `font-display text-[34px] font-semibold tabular-nums` | Goals row numbers |
| KPI card | `font-display text-[22px] font-semibold tabular-nums` | Metric cards |
| Card title | `text-[15px] font-semibold tracking-tight` | Card headers |
| Eyebrow | `text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium` | Acima dos titulos de card |
| Body text | `text-[13px]` | Linhas de tabela, conteudo |
| Small text | `text-[12px]` | Texto auxiliar |
| Tiny label | `text-[10px] uppercase tracking-wider text-muted-foreground` | Labels de metricas, footer |
| Micro label | `text-[10px] uppercase tracking-[0.22em] text-muted-foreground` | Branding subtitulo |
| Trend | `text-[11px] font-mono font-medium` | Indicadores +/-% |
| Mono value | `font-mono text-sm tabular-nums` | Relogio, valores inline |
| Mono small | `font-mono text-[11px] tabular-nums text-muted-foreground` | IDs, codigos de lote |

### 2.3 Regras Tipograficas

1. **Numeros SEMPRE em `tabular-nums`** — alinhamento visual em colunas
2. **IDs e codigos SEMPRE em `font-mono`** — OP-4821, LT-2841, timestamps
3. **Titulos de secao SEMPRE em `font-display`** — tracking negativo para impacto
4. **Labels SEMPRE em `uppercase tracking-wider text-[10px]`** — micro-tipografia industrial
5. **Font feature settings:** `"cv11", "ss01", "ss03"` ja aplicado globalmente

---

## 3. Layout e Espacamento

### 3.1 Grid Principal

```
Sidebar (280px expanded / 64px collapsed) + Content Area
Content: max-w-[1600px] mx-auto
Padding: px-6 lg:px-10 py-6 lg:py-8
Grid: grid-cols-1 lg:grid-cols-12 gap-4
```

### 3.2 Espacamento Padrao

| Contexto | Valor |
|----------|-------|
| Gap entre cards | `gap-4` (16px) |
| Padding interno de card | `p-5` (20px) |
| Padding interno hero | `p-6 lg:p-8` |
| Margem abaixo de CardHeader | `mb-4` |
| Margem entre secoes | `mt-5` |
| Gap entre items em lista | `space-y-2.5` |
| Padding de topbar | `px-6 lg:px-10 h-16` |
| Padding de ticker | `px-6 lg:px-10 h-10` |
| Footer margin | `mt-10 pt-6` |

### 3.3 Span Grid (12 colunas)

Os cards do dashboard usam estas proporcoes — use como referencia para novas telas:

| Card | Span |
|------|------|
| Hero health | `lg:col-span-7` |
| Projection | `lg:col-span-5` |
| Goals row | `lg:col-span-12` (3 items em `md:grid-cols-3`) |
| Chart area | `lg:col-span-8` |
| Pie/small | `lg:col-span-4` |
| Stages pipeline | `lg:col-span-7` |
| Defects | `lg:col-span-5` |
| Table orders | `lg:col-span-8` |
| Stalled | `lg:col-span-4` |

**Regra:** Cards devem somar 12 colunas por linha. Proporcoess 7+5, 8+4, 12, ou 3x(4) sao os padroes aprovados.

---

## 4. Componentes de UI — Padroes Aprovados

### 4.1 Card Pattern (Padrao LISION)

```tsx
// Card com gradient, border-gradient e shadow elegante
<div className="relative rounded-2xl bg-card-gradient border border-border/60 border-gradient shadow-elegant overflow-hidden p-5">
  {children}
</div>
```

**Caracteristicas:**
- `rounded-2xl` — cantos generosos
- `bg-card-gradient` — gradiente sutil de cima pra baixo
- `border border-border/60` — borda sutil
- `border-gradient` — pseudo-element com gradiente luminoso no topo (brilho sutil)
- `shadow-elegant` — sombra profunda com inset top glow
- `overflow-hidden` — conteudo respeita cantos arredondados

### 4.2 CardHeader Pattern

```tsx
<div className="flex items-start justify-between mb-4">
  <div>
    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
      {eyebrow}
    </div>
    <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
  </div>
  {rightAction}
</div>
```

### 4.3 Metric Box Pattern

```tsx
// Normal
<div className="rounded-xl border border-border/40 p-3 bg-secondary/30">
  <div className="text-[10px] uppercase tracking-wider mb-1 text-muted-foreground">{label}</div>
  <div className="font-display text-[22px] font-semibold tabular-nums leading-none">{value}</div>
</div>

// Accent (destaque)
<div className="rounded-xl border border-border/40 p-3 bg-foreground text-background">
  <div className="text-[10px] uppercase tracking-wider mb-1 text-background/70">{label}</div>
  <div className="font-display text-[22px] font-semibold tabular-nums leading-none">{value}</div>
</div>
```

### 4.4 Progress Bar Pattern

```tsx
<div className="relative h-2.5 rounded-full bg-secondary overflow-hidden">
  <motion.div
    className="absolute inset-y-0 left-0 bg-foreground rounded-full"
    initial={{ width: 0 }}
    animate={{ width: `${percentage}%` }}
    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
  />
  {/* Opcional: shimmer */}
  <div className="absolute inset-0 animate-shimmer rounded-full" />
</div>
```

**Variacoes de altura:** `h-1.5` (slim), `h-2.5` (normal), `h-7` (pipeline/stages)

### 4.5 Table/List Pattern (sem <table>, usando grid)

```tsx
// Header
<div className="grid grid-cols-12 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-secondary/20">
  <div className="col-span-3">Coluna</div>
  ...
</div>

// Row
<motion.div
  initial={{ opacity: 0, x: -4 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay: 0.05 * index }}
  className="grid grid-cols-12 items-center px-5 py-3.5 text-[13px] border-b border-border/30 last:border-0 hover:bg-secondary/20 transition"
>
  ...
</motion.div>
```

**Nota:** O dashboard usa `grid-cols-12` com divs em vez de `<table>` HTML. Para telas com dados tabulares mais complexos (sorting, pagination), usar o componente shadcn `Table` com as mesmas classes visuais.

### 4.6 List Item Pattern (objetos interativos)

```tsx
<div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/40 hover:border-foreground/40 transition">
  <div className="size-9 rounded-md bg-foreground text-background grid place-items-center font-mono text-[10px] font-bold shrink-0">
    {avatar}
  </div>
  <div className="flex-1 min-w-0">
    <div className="font-mono text-[12px] font-medium">{title}</div>
    <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
  </div>
  <div className="font-mono text-[10px] text-muted-foreground">{meta}</div>
</div>
```

### 4.7 TopBar Pattern

```tsx
<header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
  <div className="flex items-center gap-6 px-6 lg:px-10 h-16">
    {/* SidebarTrigger (mobile only) */}
    {/* Branding */}
    {/* Search bar (lg only) */}
    {/* Clock (md only) */}
    {/* Action buttons */}
    {/* Avatar */}
  </div>
  {/* Ticker bar - metricas em tempo real */}
  <div className="flex items-center gap-8 px-6 lg:px-10 h-10 border-t border-border/60 overflow-x-auto text-[12px]">
    ...
  </div>
</header>
```

### 4.8 Icon Buttons (action bar)

```tsx
<button className="size-9 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition">
  <Icon className="size-4" />
</button>
```

### 4.9 Avatar Pattern

```tsx
// User avatar
<div className="size-9 rounded-lg bg-foreground text-background grid place-items-center font-semibold text-sm">
  JM
</div>

// Entity avatar (faccao, etc.)
<div className="size-7 rounded-md bg-secondary border border-border/60 grid place-items-center text-[10px] font-mono font-bold">
  AC
</div>
```

### 4.10 Search Bar Pattern

```tsx
<div className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-lg bg-secondary/60 border border-border/60 text-sm text-muted-foreground w-72">
  <Search className="size-4" />
  <span className="flex-1">Pesquisar lotes, OPs, operadores...</span>
  <kbd className="text-[10px] font-mono bg-background/60 border border-border px-1.5 py-0.5 rounded">CMD+K</kbd>
</div>
```

---

## 5. Animacoes e Motion

### 5.1 Biblioteca: Framer Motion (`motion/react`)

**OBRIGATORIO:** Todas as animacoes de entrada e transicoes de dados usam `motion`.

### 5.2 Easing Padrao

```
transition-smooth: cubic-bezier(0.22, 1, 0.36, 1)
```

Usar em TODOS os `motion.div` transitions:
```tsx
transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
```

### 5.3 Padroes de Animacao

| Tipo | Pattern |
|------|---------|
| **Entrada de card** | `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}` |
| **Entrada de row** | `initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}` |
| **Progress bar** | `initial={{ width: 0 }} animate={{ width: percent }}` duration 1-1.2s |
| **Staggered items** | `transition={{ delay: i * 0.07 }}` ou `i * 0.08` |
| **Alert items** | `initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.08 }}` |
| **SVG stroke** | `initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}` |

### 5.4 Animacoes CSS (para loops infinitos)

```
animate-pulse-dot   → 1.8s ease-in-out infinite (status indicator)
animate-shimmer     → 2.5s linear infinite (loading overlay em progress bars)
```

### 5.5 Regra: Motion com Proposito

- Animacoes de ENTRADA: sempre (cards, rows, progress)
- Animacoes de LOOP: apenas para indicadores "live" (pulse-dot, shimmer)
- Animacoes decorativas sem funcao: PROIBIDO
- Duracoes: 0.5s-1.6s (nunca acima de 2s)

---

## 6. Backgrounds e Efeitos Visuais

### 6.1 Grid Pattern

```tsx
// Background grid sutil sobre toda a pagina
<div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
```

O grid e um padrao de linhas 48x48px com `oklch(1 0 0 / 0.025)`.

### 6.2 Radial Gradient (hero sections)

```tsx
<div className="absolute inset-0 bg-radial pointer-events-none" />
```

Usado dentro de cards hero para criar profundidade visual.

### 6.3 Border Gradient

A classe `.border-gradient` cria uma borda luminosa no topo do card usando pseudo-element:
- Gradiente: branco 12% opacity no topo → 0% no bottom
- Aplicado automaticamente em todos os cards LISION

### 6.4 Shadow Elegant

```
--shadow-elegant: 0 30px 60px -20px oklch(0 0 0 / 0.6), 0 1px 0 0 oklch(1 0 0 / 0.04) inset;
```

Sombra profunda + glow sutil no topo. Usado em todos os cards.

---

## 7. Sidebar e Navegacao

### 7.1 Estrutura

```
AppShell (SidebarProvider)
  ├── AppSidebar (280px / 64px collapsed)
  │   ├── SidebarHeader (logo + branding)
  │   ├── SidebarContent (main nav + settings)
  │   └── SidebarFooter (user info + logout)
  └── main (content area)
```

### 7.2 Rotas do Sidebar

| Item | URL | Icone |
|------|-----|-------|
| Dashboard | `/dashboard` | LayoutDashboard |
| Producao | `/production/orders` | Factory |
| Scan | `/scan` | ScanLine |
| Qualidade | `/quality` | ShieldCheck |
| Faccoes | `/factions` | Truck |
| Equipe | `/team` | Users |
| Configuracoes | `/settings` | Settings |

### 7.3 Nav Item Ativo

```tsx
// Ativo: fundo branco, texto preto
"bg-foreground text-background font-medium"

// Inativo: texto cinza, hover sutil
"text-muted-foreground hover:text-foreground hover:bg-secondary/60"
```

### 7.4 Mobile

- Sidebar hidden por padrao em mobile
- `SidebarTrigger` visivel em `md:hidden`
- Trigger button: `size-9 rounded-lg bg-secondary/60 border border-border/60`

---

## 8. Page Structure — Template Para Novas Telas

### 8.1 Estrutura Padrao de Pagina

Toda nova pagina DEVE seguir esta estrutura:

```tsx
export default function ModulePage() {
  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Grid background */}
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />

      {/* TopBar com ticker */}
      <TopBar />

      {/* Content */}
      <main className="relative px-6 lg:px-10 py-6 lg:py-8 max-w-[1600px] mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-between mb-6"
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              {eyebrow}
            </div>
            <h1 className="font-display text-[36px] lg:text-[44px] font-semibold tracking-tight leading-none">
              {title}
            </h1>
          </div>
          {/* Actions/filters */}
        </motion.div>

        {/* Grid de cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Cards... */}
        </div>

        {/* Footer */}
        <footer className="mt-10 pt-6 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
          ...
        </footer>
      </main>
    </div>
  );
}
```

### 8.2 TopBar — Reutilizar ou Recriar

O TopBar atual esta inline no Dashboard.tsx. Para novas telas:
- Extrair o TopBar como componente compartilhado em `src/components/layout/TopBar.tsx`
- Manter: branding, search bar, clock, action buttons, avatar
- Adaptar: ticker items devem refletir o contexto do modulo

### 8.3 Padrao de Filtros/Periodo

```tsx
<div className="hidden md:flex items-center gap-2">
  {["Hoje", "Semana", "Mes", "Trimestre"].map((p, i) => (
    <button
      key={p}
      className={`px-3 py-1.5 rounded-md text-[12px] transition ${
        isActive ? "bg-foreground text-background font-medium"
                 : "text-muted-foreground hover:text-foreground border border-border/40"
      }`}
    >
      {p}
    </button>
  ))}
</div>
```

---

## 9. Estados de Interface

### 9.1 Loading — Skeleton Pattern

Usar o componente `Skeleton` do shadcn/ui com as cores do sistema:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

// Dentro de um card LISION
<Card>
  <Skeleton className="h-4 w-32 bg-secondary" />
  <Skeleton className="h-8 w-20 bg-secondary mt-2" />
</Card>
```

### 9.2 Empty State

```tsx
<div className="flex flex-col items-center justify-center text-center py-16">
  <Icon className="size-12 text-foreground opacity-10 mb-4" strokeWidth={1.5} />
  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
    {category}
  </div>
  <h3 className="font-display text-[22px] font-semibold tracking-tight mb-2">
    {title}
  </h3>
  <p className="text-muted-foreground text-[13px] max-w-sm">
    {description}
  </p>
  <Button className="mt-6">{actionLabel}</Button>
</div>
```

### 9.3 Error State

```tsx
<div className="flex items-start gap-2.5 text-[12px] py-1.5 px-3 rounded-md bg-destructive/10 border border-destructive/20">
  <AlertTriangle className="size-3.5 mt-0.5 text-destructive shrink-0" />
  <span className="text-foreground/80">{message}</span>
</div>
```

### 9.4 Toasts — Sonner

Usar `sonner` (ja instalado). Configurar com tema dark:
```tsx
<Toaster theme="dark" />
```

---

## 10. Iconografia

### 10.1 Biblioteca: Lucide React

**EXCLUSIVAMENTE Lucide.** Nenhuma outra biblioteca de icones.

### 10.2 Tamanhos

| Contexto | Classe | Uso |
|----------|--------|-----|
| Inline com texto | `size-3` ou `size-3.5` | Trends, alerts, labels |
| Botao/acao | `size-4` | Nav items, action buttons, card headers |
| Placeholder/hero | `size-12` a `size-16` | Empty states, module placeholders |

### 10.3 Icones do Sistema

| Modulo | Icone |
|--------|-------|
| Dashboard | `LayoutDashboard` |
| Producao | `Factory` |
| Scan | `ScanLine` |
| Qualidade | `ShieldCheck` |
| Faccoes | `Truck` |
| Equipe | `Users` |
| Configuracoes | `Settings` |
| Notificacoes | `Bell` |
| Busca | `Search` |
| Trends | `ArrowUpRight` / `ArrowDownRight` |
| Status | `CircleDot` |
| Alerta | `AlertTriangle` |
| Tempo | `Clock` |
| Insight | `Sparkles` |

---

## 11. Charts e Graficos

### 11.1 Biblioteca: Recharts

Usar `recharts` com `ResponsiveContainer`. Nao usar chart.js, nivo, ou outros.

### 11.2 Estilo Visual

```tsx
// Area chart gradient
<defs>
  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="oklch(0.98 0 0)" stopOpacity={0.25} />
    <stop offset="100%" stopColor="oklch(0.98 0 0)" stopOpacity={0} />
  </linearGradient>
</defs>

// Grid lines
<CartesianGrid stroke="oklch(0.18 0 0)" vertical={false} />

// Axis
<XAxis tick={{ fill: "oklch(0.62 0 0)", fontSize: 11 }} axisLine={false} tickLine={false} />

// Tooltip
contentStyle={{
  background: "oklch(0.10 0 0)",
  border: "1px solid oklch(0.22 0 0)",
  borderRadius: 8,
  fontSize: 12,
}}

// Area fill
stroke="oklch(0.98 0 0)" strokeWidth={2} fill="url(#chartGrad)"
```

### 11.3 Pie/Donut

```tsx
<Cell fill="oklch(0.98 0 0)" />  // valor principal
<Cell fill="oklch(0.20 0 0)" />  // restante
```

**Regra:** Graficos sao monocromaticos (branco + cinza). Cor semantica apenas se representar status.

---

## 12. Responsividade

### 12.1 Breakpoints

| Breakpoint | Comportamento |
|------------|---------------|
| Default (<640px) | `grid-cols-1`, sidebar hidden, ticker horizontal scroll |
| `md` (768px) | Grid 2-3 cols, sidebar toggle, clock visivel |
| `lg` (1024px) | `grid-cols-12`, sidebar expandida, search bar visivel |

### 12.2 Mobile-First Rules

- Cards em `grid-cols-1` no mobile, `lg:grid-cols-12` no desktop
- TopBar: branding + sidebar trigger apenas no mobile
- Tabelas: `overflow-x-auto` com `whitespace-nowrap` em mobile
- Numeros grandes: manter `font-display text-[34px]` mesmo no mobile (sao glanceable)

---

## 13. Scrollbar Customizada

```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: oklch(0.22 0 0); border-radius: 999px; border: 2px solid var(--color-background); }
::-webkit-scrollbar-thumb:hover { background: oklch(0.30 0 0); }
```

---

## 14. Componentes shadcn/ui Disponiveis

46 componentes instalados. Usar DIRETAMENTE — nao reinventar:

**Layout:** sidebar, separator, resizable, scroll-area, sheet, drawer
**Forms:** button, input, input-otp, label, checkbox, radio-group, select, slider, switch, textarea, form, calendar
**Data display:** table, badge, avatar, card, progress, skeleton, chart
**Feedback:** alert, alert-dialog, dialog, popover, hover-card, tooltip, sonner (toast)
**Navigation:** breadcrumb, command, context-menu, dropdown-menu, menubar, navigation-menu, pagination, tabs, toggle, toggle-group
**Advanced:** accordion, aspect-ratio, carousel, collapsible

---

## 15. Regras de Implementacao Para Stories

### 15.1 Obrigatorios

1. **USAR o Card LISION** (rounded-2xl, bg-card-gradient, border-gradient, shadow-elegant) — NAO o Card shadcn padrao
2. **USAR font-display** para titulos e KPIs
3. **USAR font-mono** para valores numericos, IDs, timestamps
4. **USAR motion** para animacoes de entrada
5. **USAR cores semanticas APENAS para status** — nunca para decoracao
6. **USAR a estrutura de pagina** da secao 8.1
7. **USAR grid-cols-12** para layout de cards
8. **USAR eyebrow + title** no header de cards
9. **MANTER padding e spacing** conforme secao 3.2
10. **MANTER a hierarquia tipografica** conforme secao 2.2

### 15.2 Proibidos

1. **NAO usar cores** fora das semanticas (success/warning/destructive)
2. **NAO criar componentes de card** diferentes do padrao LISION
3. **NAO usar fontes** alem de Inter Tight / Inter / JetBrains Mono
4. **NAO usar animacoes** sem proposito funcional
5. **NAO usar <table> HTML** para dados simples (usar grid-cols-12 pattern)
6. **NAO alterar** a sidebar, topbar ou estrutura de navegacao
7. **NAO usar icons** de outra biblioteca alem de Lucide
8. **NAO usar chart libraries** alem de Recharts
9. **NAO usar background colors** nos cards (usar gradientes do sistema)
10. **NAO usar rounded menores que rounded-lg** em cards (padrao e rounded-2xl)

### 15.3 Recomendados

1. Extrair TopBar como componente compartilhado antes da primeira story
2. Criar componente `LisionCard` unificado a partir do padrao do Dashboard
3. Criar componente `StatusBadge` para padronizar badges de status
4. Criar componente `MetricBox` (normal + accent variant)
5. Criar componente `PageHeader` (eyebrow + title + actions)
6. Usar `motion.div` com stagger para listas

---

## 16. Aplicacao nas Stories

### Como Usar Este Documento

Este documento DEVE ser referenciado em TODAS as stories de frontend como dependencia tecnica:

```markdown
## Notas Tecnicas
- **Design Guidelines:** `docs/ux/FRONTEND-DESIGN-GUIDELINES.md` — SEGUIR OBRIGATORIAMENTE
```

O @dev deve:
1. Ler este documento ANTES de implementar qualquer tela
2. Usar os padroes da secao 4 (componentes) como base
3. Seguir a estrutura da secao 8 (page template) para cada nova pagina
4. Respeitar a secao 15 (regras) sem excecao

### Checklist Pre-Implementacao

Antes de marcar uma story de frontend como "Ready for Review":

- [ ] Cards usam padrao LISION (gradient + border-gradient + shadow-elegant)?
- [ ] Tipografia segue a hierarquia (font-display, font-mono, escalas)?
- [ ] Cores semanticas usadas APENAS para status?
- [ ] Animacoes de entrada com motion?
- [ ] Grid de 12 colunas respeitado?
- [ ] Layout responsivo (mobile-first)?
- [ ] Icones exclusivamente Lucide?
- [ ] Numeros em tabular-nums + font-mono?

---

> **Documento gerado por @ux-design-expert (Uma) em 2026-05-18**
> Fonte: analise direta do codigo frontend aprovado do LISION.
> Este documento e a referencia final para design UI/UX de todas as stories.
