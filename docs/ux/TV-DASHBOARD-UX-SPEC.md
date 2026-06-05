# TV Dashboard — UX/UI Spec Completa

> **Autor:** Uma (UX Design Expert)
> **Base:** Arquitetura aprovada por Aria (Architect)
> **Design System:** LISION (dark-first, monochrome, OKLCH)
> **Resolucao alvo:** 1920x1080 (Full HD TV landscape)
> **Modo:** Dark mode fixo, sem interacao touch, leitura a distancia (3-10m)

---

## Avaliacao de Bibliotecas

### Veredicto: NENHUMA biblioteca extra necessaria

O stack atual ja tem tudo:

| Necessidade | Solucao existente | Lib extra? |
|---|---|---|
| Animacoes (transicao, stagger, overlay) | `motion` v12.38 (Framer Motion) | NAO |
| Icones | `lucide-react` v1.16 | NAO |
| Charts (se necessario futuro) | `recharts` v3.8 | NAO |
| CSS | Tailwind v4 + design tokens em `globals.css` | NAO |
| clipPath, brightness, letter-spacing | CSS nativo animado via `motion` | NAO |

**Por que nao adicionar nada:** Motion ja suporta `clipPath`, `filter`, `letterSpacing` como animate props nativas. A transicao cinematografica e inteiramente possivel com o que ja temos. Adicionar bibliotecas de particles, confetti ou canvas seria over-engineering e quebraria o principio monochrome do LISION.

### Questionamentos a arquitetura

1. **Header h-16 (64px) esta grande demais para TV.** Em 1080p visto de longe, o header deve ser compacto. Reduzo para `h-12` (48px) para maximizar area util de dados.

2. **Ticker no footer ocupa espaco vertical precioso.** Em vez de uma faixa fixa de 40px no bottom, integro o ticker DENTRO do header como segunda linha (mesmo padrao do TopBar do dashboard autenticado).

3. **KPIs com MetricBox text-[22px] sao pequenos para TV.** Escalo para `text-[34px]` nos KPIs e `text-[56px]` no Hero — visiveis a 10 metros.

4. **Barra de progresso h-7 no Hero pode ser maior.** Uso `h-10` para impacto visual maximo — e a peca central da tela.

5. **O podium mostra breakdown so do 1o.** Mostro mini-bars de score para todos os 3 — mais informativo visualmente.

---

## Escala Tipografica para TV (1920x1080)

A TV e vista de 3-10m. Toda a tipografia e escalada 1.5-2x vs. dashboard normal.

| Elemento | Classe | Tamanho real | Visibilidade |
|---|---|---|---|
| Hero numero grande | `font-display text-[72px] font-semibold tabular-nums leading-none` | 72px | 10m+ |
| Hero complemento | `font-display text-[28px] text-muted-foreground tabular-nums` | 28px | 5m+ |
| KPI valor | `font-display text-[34px] font-semibold tabular-nums leading-none` | 34px | 7m+ |
| KPI label | `text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 font-medium` | 11px | 2m |
| KPI sub-info | `font-mono text-[13px] tabular-nums text-muted-foreground` | 13px | 3m |
| Pipeline nome etapa | `text-[14px] font-medium` | 14px | 4m |
| Pipeline numero | `font-mono text-[16px] tabular-nums font-semibold` | 16px | 5m |
| Alerta texto | `text-[14px] font-medium` | 14px | 4m |
| Alerta tempo | `font-mono text-[13px] tabular-nums` | 13px | 3m |
| Header logo | `font-display text-[20px]` | 20px | 5m |
| Header relogio | `font-mono text-[24px] tabular-nums` | 24px | 7m |
| Ticker | `font-mono text-[12px] tabular-nums` | 12px | 2m |
| Podium nome faccao | `font-display text-[28px] font-semibold` | 28px | 7m |
| Podium score | `font-mono text-[36px] tabular-nums font-bold` | 36px | 8m |
| Podium titulo | `font-display text-[32px] font-semibold tracking-tight` | 32px | 8m |

---

## Layout Frame — Dashboard Principal

### Dimensoes fixas (1920x1080)

```
HEADER:     h-12 (48px)   — sticky top
TICKER:     h-8  (32px)   — dentro do header, segunda linha
CONTENT:    h-[1000px]    — area principal (1080 - 48 - 32)
  HERO:     h-[180px]     — meta do dia + barra
  KPIs:     h-[110px]     — 4 metric boxes
  MAIN:     h-[680px]     — pipeline + alertas (flex-1)
  PADDING:  30px total     — gaps entre secoes
```

### Grid System

```
Padding horizontal: px-8 (32px cada lado)
Area util: 1920 - 64 = 1856px
Grid: 12 colunas com gap-4 (16px)
```

---

## Secao 1 — HEADER (h-12 + h-8 ticker)

### Linha 1 (h-12, 48px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ px-8                                                                    │
│                                                                         │
│ LISION                    Turno 07:00–17:00     ● AO VIVO     14:32:07 │
│ Rastreamento Textil                                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

| Elemento | Classes | Posicao |
|---|---|---|
| Logo "LISION" | `font-display text-[20px]` | left |
| Subtitulo | `text-[10px] uppercase tracking-[0.22em] text-muted-foreground -mt-0.5` | left, abaixo do logo |
| Token name | `text-[12px] text-muted-foreground` | left, apos separador `·` |
| Turno | `font-mono text-[13px] tabular-nums text-muted-foreground` | right area |
| Indicador AO VIVO | `size-2 rounded-full bg-success animate-pulse-dot` + `text-[10px] uppercase tracking-wider text-success` | right area |
| Relogio | `font-mono text-[24px] tabular-nums font-medium` | right extremo |

**Estilo:** `backdrop-blur-xl bg-background/70 border-b border-border/60`

### Linha 2 — Ticker (h-8, 32px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← L001 → Conferencia por Rodrigo 14:32 · L003 → Corte por Fabinho ... │
└─────────────────────────────────────────────────────────────────────────┘
```

| Propriedade | Valor |
|---|---|
| Background | `border-t border-border/40 bg-background/50` |
| Animacao | CSS `@keyframes ticker-scroll` — scroll infinito da direita para esquerda |
| Velocidade | 60px/s (percorre 1920px em ~32s) |
| Formato item | `font-mono text-[12px] tabular-nums text-muted-foreground/70` |
| Separador | `·` com `mx-6 text-border` |
| Texto por item | `{barcode} → {stage_name} por {operator} {hora}` |

**CSS para ticker infinito:**
```css
@keyframes ticker-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
```
Duplicar o conteudo para loop seamless. `animation: ticker-scroll Xs linear infinite` onde X = contentWidth / 60.

---

## Secao 2 — HERO: Meta do Dia (LisionCard)

### Layout interno

```
┌─────────────────────────────────────────────────────────────────────┐
│  p-6                                                                │
│                                                                     │
│  PRODUCAO HOJE                   eyebrow (10px uppercase)           │
│                                                                     │
│  347 / 500                       font-display 72px / 28px muted     │
│  pecas                           text-[14px] muted                  │
│                                                                     │
│  ████████████████████████████░░░░░░░░░░░░  69%    h-10 progress    │
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│  │ Projecao    │ │ Ritmo Atual │ │ Pico do Dia │                  │
│  │ ~480 pc     │ │ 43/h        │ │ 52/h        │                  │
│  └─────────────┘ └─────────────┘ └─────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Especificacoes

| Elemento | Classes |
|---|---|
| Card | `LisionCard` com `p-6` |
| Eyebrow | `text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 font-medium mb-2` |
| Numero produzido | `font-display text-[72px] font-semibold tabular-nums leading-none` |
| Numero meta | `font-display text-[28px] text-muted-foreground/60 tabular-nums ml-2` — inline com produzido, separado por ` / ` |
| Label "pecas" | `text-[14px] text-muted-foreground mt-1` |
| Barra de progresso | Container: `h-10 rounded-full bg-secondary/40 overflow-hidden mt-4` |
| Barra fill | `motion.div` com `h-full rounded-full` + shimmer overlay |
| Barra cor | `bg-success` se >=80%, `bg-warning` se 50-79%, `bg-destructive` se <50% |
| Barra animacao | `initial={{ width: 0 }} animate={{ width: percent% }}` com `transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}` |
| Percentual | `font-mono text-[18px] tabular-nums font-semibold ml-4` — inline right da barra |
| Sub-metricas row | `flex gap-6 mt-4` |
| Sub-metrica item | `SubMetric` padrao — label 10px uppercase + valor `font-mono text-[15px]` |

### Animacao de entrada

```typescript
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
>
```

---

## Secao 3 — KPIs Secundarios (grid 4 colunas)

### Layout

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ OPS ATIVAS   │ │ LOTES ATIVOS │ │ TAXA DEFEITO │ │ BIPAGENS     │
│              │ │              │ │              │ │              │
│    5         │ │    23        │ │   2.1%       │ │   347        │
│ meta: 8      │ │ meta: 100    │ │ tol: 3%  ✓  │ │ ▲ +12%       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Especificacoes por MetricBox

| Elemento | Classes |
|---|---|
| Container | `rounded-xl border border-border/40 p-4 bg-secondary/30` (normal) ou `bg-foreground text-background` (accent) |
| Label | `text-[11px] uppercase tracking-wider mb-2 text-muted-foreground` |
| Valor | `font-display text-[34px] font-semibold tabular-nums leading-none` |
| Comparacao | `font-mono text-[13px] tabular-nums text-muted-foreground mt-2` |
| Trend positivo | `text-success` com `ArrowUpRight size-3.5` |
| Trend negativo | `text-destructive` com `ArrowDownRight size-3.5` |
| Indicador meta OK | `text-success` badge inline |
| Indicador meta ruim | `text-destructive` badge inline |

### Regra de accent

- Taxa de defeitos ABAIXO da tolerancia = **accent** (invertido, bg-foreground)
- KPI que ultrapassa meta = **accent**

### Animacao de entrada

```typescript
// Stagger: cada box com delay incremental
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6, delay: 0.05 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
>
```

---

## Secao 4 — Pipeline de Etapas (LisionCard, col-span-7)

### Layout

```
┌────────────────────────────────────────────────────┐
│  DISTRIBUICAO                eyebrow               │
│  Pipeline de Etapas          title                 │
│                                                    │
│  Corte         ████████████████████████  6          │
│  Aviamentos    ████████████  3                      │
│  Producao      ████████████████████████████████  8  │  ← maior = gargalo
│  Travete       ████████  2                          │
│  Limpeza       ████████████████  4                  │
│  Conferencia   ████  1                              │
│  Embalagem     ████  1                              │
│  Estoque       ████████████  3                      │
│                                                    │
│  Total: 28 lotes em producao                       │
└────────────────────────────────────────────────────┘
```

### Especificacoes

| Elemento | Classes |
|---|---|
| Card | `LisionCard p-5` |
| Header | `LisionCardHeader` eyebrow="Distribuicao" title="Pipeline de Etapas" |
| Row container | `flex items-center gap-3 h-[38px]` por etapa |
| Stage name | `text-[14px] font-medium w-[120px] shrink-0` |
| Bar container | `flex-1 h-7 rounded-lg bg-secondary/30 overflow-hidden` |
| Bar fill | `motion.div h-full rounded-lg` |
| Bar gradient | `background: linear-gradient(90deg, oklch(0.98 0 0 / 0.8), oklch(0.98 0 0 / 0.2))` |
| Bar width | `width: (count / maxCount) * 100%` — relativo ao maior |
| Count number | `font-mono text-[16px] tabular-nums font-semibold w-[36px] text-right shrink-0` |
| Shimmer overlay | `.animate-shimmer` no bar fill (sutil, indica "ao vivo") |
| Total footer | `text-[12px] text-muted-foreground mt-3 pt-3 border-t border-border/40` |

### Destaque de gargalo

A etapa com mais lotes recebe destaque visual:
- Bar fill com `bg-foreground` (branco puro, ao inves do gradient)
- Count com `text-foreground font-bold`
- Sutil `shadow-glow` no container da barra

### Animacao

```typescript
// Barra cresce da esquerda
<motion.div
  initial={{ width: 0 }}
  animate={{ width: `${barPercent}%` }}
  transition={{ duration: 1.0, delay: 0.3 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
/>
```

---

## Secao 5 — Alertas (LisionCard, col-span-5)

### Layout — Com alertas

```
┌──────────────────────────────────────────┐
│  OPERACAO                  eyebrow       │
│  Acao Necessaria           title         │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ ● L002 parado em Travete        │    │  ← vermelho, pulsante
│  │   4h 12min — OP-20260309-001    │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ ● L005 parado em Producao       │    │  ← amarelo
│  │   2h 30min — OP-20260309-003    │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ ● Faccao Rosa — retorno atrasado│    │  ← amarelo
│  │   previsto: 02/06                │    │
│  └──────────────────────────────────┘    │
│                                          │
└──────────────────────────────────────────┘
```

### Layout — Sem alertas

```
┌──────────────────────────────────────────┐
│  OPERACAO                                │
│  Acao Necessaria                         │
│                                          │
│          ✓                               │
│    Nenhum alerta ativo                   │
│    Producao fluindo normalmente          │
│                                          │
└──────────────────────────────────────────┘
```

### Especificacoes

| Elemento | Classes |
|---|---|
| Card | `LisionCard p-5` |
| Alerta item critical | `rounded-xl border border-destructive/30 bg-destructive/5 p-3.5` |
| Alerta item warning | `rounded-xl border border-warning/30 bg-warning/5 p-3.5` |
| Dot critical | `size-2 rounded-full bg-destructive animate-pulse-dot` |
| Dot warning | `size-2 rounded-full bg-warning` (sem pulse) |
| Titulo alerta | `text-[14px] font-medium` (branco) |
| Detalhe alerta | `font-mono text-[12px] tabular-nums text-muted-foreground mt-1` |
| Gap entre alertas | `space-y-3` |
| Empty state icon | `CheckCircle2 size-10 text-success/30 mb-3` |
| Empty state text | `text-[14px] text-muted-foreground` |
| Empty state sub | `text-[12px] text-muted-foreground/60 mt-1` |

### Animacao de alertas

```typescript
<motion.div
  initial={{ opacity: 0, x: 8 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.4, delay: 0.5 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
>
```

---

## Secao 7 — RANKING DE FACCOES (Overlay Cinematografico)

### State Machine

```
IDLE (dashboard) → ENTERING (2.5s) → SHOWING (10s) → EXITING (2s) → IDLE
         ↑                                                    │
         └────────────────────────────────────────────────────┘
                        ciclo a cada 120s
```

### Frame-by-Frame — Entrada

#### Frame 0ms — Estado inicial
- Dashboard visivel normalmente
- Overlay invisivel (`opacity: 0, pointerEvents: "none"`)

#### Frame 0-800ms — CORTINA (Wipe)
```typescript
// Overlay que cobre a tela
<motion.div
  className="fixed inset-0 z-50 bg-background"
  initial={{ clipPath: "inset(50% 0 50% 0)" }}   // invisivel (fechado no centro)
  animate={{ clipPath: "inset(0% 0 0% 0)" }}      // abre cobrindo tudo
  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
/>
```
- Efeito: duas "laminas" se expandem do centro vertical (topo e base) ate cobrir a tela inteira
- Background: `bg-background` (oklch 0.07) — escuro total
- Grid pattern ativo por tras: `bg-grid opacity-30`

#### Frame 800-1500ms — LOGO HIT
```
                    ┌─────────────────┐
                    │                 │
                    │     LISION      │   font-display text-[48px]
                    │                 │
                    │ ────────────────│   linha h-[1px] bg-foreground/30
                    │                 │
                    │ RANKING DE      │   text-[14px] uppercase
                    │ FACCOES         │   tracking-[0.3em] → tracking-[0.18em]
                    │                 │
                    └─────────────────┘
```

```typescript
// Logo
<motion.div
  initial={{ opacity: 0, scale: 0.8, filter: "brightness(2)" }}
  animate={{ opacity: 1, scale: 1, filter: "brightness(1)" }}
  transition={{ duration: 0.5, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
>
  <span className="font-display text-[48px] font-semibold">LISION</span>
</motion.div>

// Linha horizontal
<motion.div
  className="h-[1px] bg-gradient-line mx-auto mt-4"
  initial={{ width: 0 }}
  animate={{ width: 280 }}
  transition={{ duration: 0.5, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
/>

// Titulo "RANKING DE FACCOES"
<motion.div
  initial={{ opacity: 0, letterSpacing: "0.5em" }}
  animate={{ opacity: 1, letterSpacing: "0.18em" }}
  transition={{ duration: 0.6, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
>
  <span className="text-[14px] uppercase font-medium text-muted-foreground">
    Ranking de Faccoes
  </span>
</motion.div>
```

**Flash luminoso:** O `filter: brightness(2)` no logo cria um flash branco sutil que se dissipa. Sem glow extra necessario.

#### Frame 1500-2500ms — REVELACAO DO PODIUM

O bloco logo+titulo sobe e o podium aparece por baixo.

```typescript
// Logo block sobe
<motion.div
  animate={{ y: -120, opacity: 0.6, scale: 0.7 }}
  transition={{ duration: 0.6, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
/>

// Podium container aparece
<motion.div
  initial={{ opacity: 0, y: 40 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, delay: 1.7, ease: [0.22, 1, 0.36, 1] }}
/>
```

Posicoes aparecem com stagger (como premiacao real):
- **2o lugar** aparece primeiro (delay: 1.8s)
- **3o lugar** aparece segundo (delay: 2.0s)
- **1o lugar** aparece por ultimo com mais dramaticidade (delay: 2.3s, scale 0.5→1)

### Frame 2500-12500ms — PODIUM VISIVEL

```
         RANKING DE FACCOES          titulo (agora no topo, menor)
         Ultimos 30 dias             sub-label

                  ┌──────────┐
                  │  👑       │
                  │  ┌────┐  │
                  │  │ FR │  │       96px circulo, border-2 border-warning
                  │  └────┘  │
                  │  Faccao  │       font-display text-[28px]
                  │   Rosa   │
                  │  94.7    │       font-mono text-[36px] font-bold
                  │          │
       ┌──────────┤          ├──────────┐
       │  ┌────┐  │          │  ┌────┐  │
       │  │ FS │  │          │  │ SS │  │    72px circulo
       │  └────┘  │          │  └────┘  │
       │  Faccao  │          │  Faccao  │
       │  Silva   │          │  Santos  │
       │  89.2    │          │  85.1    │
       │          │          │          │
       └──────────┘          └──────────┘
            2o                    3o

    ┌──────────────────────────────────────────────┐
    │  PONTUALIDADE      QUALIDADE       VOLUME    │
    │     96%              99%            82%      │    ← breakdown do 1o
    │  ███████████       ██████████      ████████  │    ← mini progress bars
    └──────────────────────────────────────────────┘
```

### Especificacoes do Podium

#### Plataformas

| Posicao | Altura plataforma | Cor topo plataforma |
|---|---|---|
| 1o (centro) | 200px | `bg-secondary/60` com `border-t-2 border-warning` |
| 2o (esquerda) | 150px | `bg-secondary/40` com `border-t-2 border-muted-foreground/60` |
| 3o (direita) | 120px | `bg-secondary/30` com `border-t-2 border-warning/40` |

#### Avatar/Escudo

| Posicao | Tamanho | Borda | Badge |
|---|---|---|---|
| 1o | `size-24` (96px) | `border-3 border-warning` | Crown icon (`lucide Crown`) size-6 acima |
| 2o | `size-18` (72px) | `border-2 border-muted-foreground/60` | Numero "2" em `text-[12px]` |
| 3o | `size-18` (72px) | `border-2 border-warning/40` | Numero "3" em `text-[12px]` |

Avatar interno: `rounded-full bg-secondary flex items-center justify-center`
- Se tem `avatar_url`: `<img>` com `object-cover rounded-full`
- Se nao: iniciais em `font-display text-[28px]` (1o) ou `text-[20px]` (2o/3o)

#### Dados por faccao

| Elemento | 1o lugar | 2o/3o lugar |
|---|---|---|
| Nome | `font-display text-[28px] font-semibold mt-3` | `font-display text-[20px] font-semibold mt-2` |
| Score | `font-mono text-[36px] tabular-nums font-bold text-foreground` | `font-mono text-[24px] tabular-nums font-semibold text-muted-foreground` |
| Score sufixo | `text-[14px] text-muted-foreground ml-1` "pts" | `text-[11px] text-muted-foreground ml-1` "pts" |

#### Breakdown Bar (abaixo do podium)

```
┌───────────────┬───────────────┬───────────────┐
│ PONTUALIDADE  │  QUALIDADE    │  VOLUME       │
│ 96%           │  99%          │  82%          │
│ ████████████  │  ████████████ │  █████████    │
└───────────────┴───────────────┴───────────────┘
```

| Elemento | Classes |
|---|---|
| Container | `mt-8 rounded-xl border border-border/40 bg-secondary/20 p-4 grid grid-cols-3 gap-6` |
| Label | `text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1` |
| Valor | `font-mono text-[18px] tabular-nums font-semibold mb-2` |
| Mini bar container | `h-2 rounded-full bg-secondary/40` |
| Mini bar fill | `h-full rounded-full bg-foreground/70` animado com width |

#### Footer do ranking

```
LISION · Atualizado as 14:32
```
`text-[11px] text-muted-foreground/50 mt-6 font-mono tabular-nums`

### Frame 12500-14500ms — SAIDA

```typescript
// Podium content faz fade + scale down
<motion.div
  animate={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
/>

// Linha se recolhe
<motion.div
  animate={{ width: 0 }}
  transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
/>

// Cortina reversa — se fecha do topo/base para o centro
<motion.div
  animate={{ clipPath: "inset(50% 0 50% 0)" }}   // fecha
  transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
/>

// Apos cortina fechar, remover overlay (opacity 0)
```

**Duracao total saida:** ~2s (0.5 fade + 0.4 linha + 0.7 cortina + overlap)

---

## Micro-interacoes e Estados Vivos

### 1. Barra de progresso — Shimmer

A barra do Hero tem um shimmer overlay permanente indicando "dados ao vivo":
```css
.animate-shimmer { /* ja existe em globals.css */ }
```
Aplicar como `absolute inset-0` dentro do bar fill.

### 2. Relogio — Tick animation

A cada segundo, o relogio faz uma micro-animacao:
```typescript
<motion.span
  key={seconds}  // re-render a cada segundo
  initial={{ opacity: 0.7, y: 2 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  {time}
</motion.span>
```

### 3. Alertas criticos — Pulse

Alertas com `hours_stalled >= 4` tem o dot com `animate-pulse-dot` (ja existe no CSS).

### 4. KPI update — Flash on change

Quando um valor de KPI muda no refresh de 15s:
```typescript
<motion.div
  key={value}  // re-render quando valor muda
  initial={{ opacity: 0.5 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.6 }}
>
```
Sutil flash de opacity indica "dado atualizado".

### 5. Pipeline bars — Width transition

No refresh, se a contagem de lotes muda, as barras animam suavemente para o novo tamanho:
```typescript
<motion.div
  animate={{ width: `${newPercent}%` }}
  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
/>
```

---

## Paleta de Cores — Resumo para TV

| Uso | Cor | Token |
|---|---|---|
| Background | oklch(0.07 0 0) | `bg-background` |
| Cards | gradient oklch(0.12→0.09) | `bg-card-gradient` |
| Texto primario | oklch(0.98 0 0) | `text-foreground` |
| Texto secundario | oklch(0.62 0 0) | `text-muted-foreground` |
| Barras/dados | oklch(0.98 0 0 / 0.8) | `bg-foreground/80` |
| Borda cards | oklch(0.20 0 0 / 0.6) | `border-border/60` |
| Progresso OK | oklch(0.75 0.16 145) | `bg-success` |
| Progresso atencao | oklch(0.80 0.15 75) | `bg-warning` |
| Progresso critico | oklch(0.65 0.20 25) | `bg-destructive` |
| Grid pattern | oklch(1 0 0 / 0.025) | `bg-grid` |
| 1o lugar borda | oklch(0.80 0.15 75) | `border-warning` (dourado) |
| 2o lugar borda | oklch(0.62 0 0 / 0.6) | `border-muted-foreground/60` |
| 3o lugar borda | oklch(0.80 0.15 75 / 0.4) | `border-warning/40` (bronze) |

**NENHUMA cor fora do design system.** Os tons de "dourado", "prata" e "bronze" sao mapeados para tokens existentes.

---

## Acessibilidade (WCAG AA para display)

Mesmo sendo uma tela nao-interativa, mantenho contraste AA:

| Par | Ratio | Status |
|---|---|---|
| Foreground / Background | 19.2:1 | AAA |
| Muted-foreground / Background | 5.8:1 | AA |
| Success / Background | 7.1:1 | AA |
| Warning / Background | 9.3:1 | AAA |
| Destructive / Background | 4.8:1 | AA |

---

## Estrutura de Componentes (para @dev)

```
src/app/(kiosk)/
  layout.tsx              — Kiosk layout (viewport, fonts, dark mode)
  tv/
    page.tsx              — Orquestrador principal (state, fetch, timer)

src/components/tv/        — Componentes especificos da TV
  TVHeader.tsx            — Header + ticker
  TVHero.tsx              — Meta do dia + barra progresso
  TVKpis.tsx              — Grid 4 KPIs
  TVPipeline.tsx          — Pipeline de etapas
  TVAlerts.tsx            — Painel de alertas
  TVRankingOverlay.tsx    — Overlay completo (cortina + logo + podium)
  TVPodium.tsx            — Podium visual (3 posicoes)
```

Essa modularidade permite que @dev implemente e teste cada componente isoladamente.
