# QA Fix Request — Stories 7.2 & 7.3 (TV Dashboard)

> **Emitido por:** Aria (Architect) com base no diagnóstico de Uma (UX)
> **Para:** @dev (Dex)
> **Prioridade:** P0 — Bloqueia release
> **Referência autoritativa:** `docs/ux/TV-DASHBOARD-UX-SPEC.md` (690 linhas)

---

## REGRAS OBRIGATÓRIAS PARA ESTA CORREÇÃO

Estas regras existem porque a implementação original divergiu da spec em 33 pontos. O dev DEVE seguir estas regras durante toda a correção.

### REGRA 1: O UX SPEC É LEI

O arquivo `docs/ux/TV-DASHBOARD-UX-SPEC.md` é a **fonte autoritativa** para TODOS os valores visuais. Se a story diz uma coisa e o UX spec diz outra, **o UX spec vence**. O dev deve ter o UX spec aberto e consultá-lo para CADA valor de `text-[]`, `size-[]`, `border-[]`, `bg-[]`, classe, e dimensão.

### REGRA 2: COPIAR, NÃO INVENTAR

Para cada classe CSS/Tailwind que o dev aplica, deve existir uma correspondência EXATA no UX spec. Se o spec diz `text-[28px]`, o código deve ter `text-[28px]` — não `text-[16px]`, não `text-[22px]`, não um cálculo dinâmico. **Zero improviso em valores visuais.**

### REGRA 3: DIFERENCIAÇÃO POR POSIÇÃO

Onde o UX spec define valores DIFERENTES para 1o lugar vs 2o/3o lugar, o código DEVE implementar essa diferenciação. Usar o mesmo valor para todas as posições é uma violação. O dev deve verificar CADA propriedade do podium contra a tabela "Dados por facção" do spec (linhas 521-527).

### REGRA 4: CHECKLIST VISUAL OBRIGATÓRIO

Após cada arquivo modificado, o dev deve comparar MANUALMENTE o código contra a seção correspondente do UX spec e listar no Completion Notes quais valores foram verificados. Formato: `✓ Logo overlay: text-[48px] (spec linha 417)`.

### REGRA 5: NÃO MARCAR [x] SEM VERIFICAÇÃO CRUZADA

Uma task só pode ser marcada [x] se TODOS os valores do código correspondem ao UX spec. Se houver divergência intencional, deve ser documentada com justificativa.

---

## CORREÇÕES — Ordem de Prioridade

### BLOCO 1: TVPodium.tsx (6 CRITICAL + 3 HIGH)

#### FIX-PD1 [CRITICAL]: Nomes das facções com tamanhos diferenciados

**Atual:** `text-[16px]` para TODAS as posições (linha 121)
**Spec (linhas 523-525):**
- 1o lugar: `font-display text-[28px] font-semibold mt-3`
- 2o/3o lugar: `font-display text-[20px] font-semibold mt-2`

**Ação:** Substituir a classe uniforme por classes condicionais baseadas em `isFirst`.

#### FIX-PD2 [CRITICAL]: Scores com tamanhos diferenciados

**Atual:** `font-mono text-[22px] tabular-nums font-bold text-foreground/90` para TODOS (linha 126)
**Spec (linha 526):**
- 1o lugar: `font-mono text-[36px] tabular-nums font-bold text-foreground`
- 2o/3o lugar: `font-mono text-[24px] tabular-nums font-semibold text-muted-foreground`

**Ação:** Diferenciar tamanho, peso e cor por posição.

#### FIX-PD3 [CRITICAL]: Sufixo "pts" com tamanhos diferenciados

**Spec (linha 527):**
- 1o lugar: `text-[14px] text-muted-foreground ml-1`
- 2o/3o lugar: `text-[11px] text-muted-foreground ml-1`

**Ação:** Separar "pts" do número e aplicar classe diferenciada.

#### FIX-PD4 [HIGH]: Iniciais com tamanhos do spec

**Atual:** `fontSize: avatarSize * 0.35` (cálculo dinâmico, linha 112)
**Spec (linha 519):**
- 1o lugar: `font-display text-[28px]`
- 2o/3o lugar: `font-display text-[20px]`

**Ação:** Usar os valores fixos do spec, não cálculo proporcional.

#### FIX-PD5 [HIGH]: Borda avatar 1o lugar mais grossa

**Atual:** `border-2` para TODOS (linha 94)
**Spec (linhas 513-515):**
- 1o lugar: `border-3 border-warning`
- 2o/3o lugar: `border-2`

**Ação:** Adicionar `border-3` ao 1o lugar. Se `border-3` não existe em Tailwind, usar `border-[3px]`.

#### FIX-PD6 [HIGH]: Plataformas com backgrounds diferenciados

**Atual:** `bg-secondary/30` para TODAS (linha 132)
**Spec (linhas 505-507):**
- 1o lugar: `bg-secondary/60`
- 2o lugar: `bg-secondary/40`
- 3o lugar: `bg-secondary/30`

**Ação:** Adicionar `bgClass` diferenciado por posição no array POSITIONS (já existe o campo mas com valores errados na implementação atual — verificar).

#### FIX-PD7 [HIGH]: Breakdown container com borda e fundo

**Atual:** `flex gap-8 justify-center mt-6` (linha 162-163)
**Spec (linha 541):** `mt-8 rounded-xl border border-border/40 bg-secondary/20 p-4 grid grid-cols-3 gap-6`

**Ação:** Trocar `flex gap-8 mt-6` por `mt-8 rounded-xl border border-border/40 bg-secondary/20 p-4 grid grid-cols-3 gap-6`.

#### FIX-PD8 [MEDIUM]: Breakdown valor com tamanho do spec

**Atual:** `font-mono text-[14px]` (linha 181)
**Spec (linha 543):** `font-mono text-[18px] tabular-nums font-semibold mb-2`

**Ação:** Atualizar para `text-[18px]`.

#### FIX-PD9 [MEDIUM]: Breakdown bar height

**Atual:** `h-3` (linha 173)
**Spec (linha 544):** `h-2 rounded-full bg-secondary/40`

**Ação:** Trocar `h-3` por `h-2`, e `bg-secondary/30` por `bg-secondary/40`.

---

### BLOCO 2: TVRankingOverlay.tsx (2 CRITICAL + 3 HIGH)

#### FIX-R1 [CRITICAL]: Logo "LISION" no overlay

**Atual:** `text-[36px]` (linha 116-117)
**Spec (linha 417):** `font-display text-[48px] font-semibold`

**Ação:** Trocar `text-[36px]` por `text-[48px]`.

#### FIX-R2 [CRITICAL]: Título "Ranking de Facções"

**Atual:** `font-display text-[22px] font-semibold` (linha 137)
**Spec (linhas 433-436):** `text-[14px] uppercase font-medium text-muted-foreground`

**Ação:** Trocar `text-[22px] font-semibold` por `text-[14px] font-medium`. O `uppercase` já está presente.

#### FIX-R3 [HIGH]: Grid pattern no overlay

**Atual:** `bg-background/98` sem grid (linha 95)
**Spec (linha 394):** `bg-background` + `bg-grid opacity-30`

**Ação:** Trocar `bg-background/98` por `bg-background`. Adicionar elemento com `bg-grid opacity-30` como pseudo-layer.

#### FIX-R4 [HIGH]: Footer do ranking

**Spec (linhas 549-552):**
```
LISION · Atualizado às 14:32
text-[11px] text-muted-foreground/50 mt-6 font-mono tabular-nums
```

**Atual:** AUSENTE

**Ação:** Adicionar `<div>` com footer após o breakdown, mostrando timestamp.

#### FIX-R5 [HIGH]: Linha horizontal com gradient

**Atual:** `h-px bg-foreground/20` (linha 122-123)
**Spec (linha 422):** `h-[1px] bg-gradient-line mx-auto mt-4`

**Ação:** Verificar se `bg-gradient-line` existe nos tokens. Se sim, usar. Se não, `bg-foreground/30` é aceitável com `mt-4` (atual é `my-3`).

---

### BLOCO 3: TVHeader.tsx (3 HIGH)

#### FIX-H1 [HIGH]: Header height

**Atual:** `h-16` (64px) (linha 53)
**Spec (linha 70):** `h-12` (48px)

**Ação:** Trocar `h-16` por `h-12`.

#### FIX-H2 [HIGH]: Logo size

**Atual:** `text-[18px]` (linha 55)
**Spec (linha 105):** `text-[20px]`

**Ação:** Trocar `text-[18px]` por `text-[20px]`.

#### FIX-H3 [HIGH]: Subtítulo "Rastreamento Têxtil"

**Spec (linha 106):** `text-[10px] uppercase tracking-[0.22em] text-muted-foreground -mt-0.5` abaixo do logo

**Atual:** AUSENTE

**Ação:** Adicionar `<span>` com "Rastreamento Têxtil" abaixo do logo LISION.

---

### BLOCO 4: Desvios MEDIUM (batch)

#### FIX-H4: Token name com separador `·` e `text-[12px]`
**Atual:** `text-[13px]` sem separador → Trocar para `text-[12px]` com `·` antes

#### FIX-H5: Reordenar AO VIVO antes do relógio
**Spec:** Turno → AO VIVO → Relógio. **Atual:** Turno → Relógio → AO VIVO

#### FIX-HR1: Sub-métricas do Hero
**Atual:** `text-[18px]` → **Spec:** `text-[15px]`

#### FIX-K2: Accent em Taxa Defeitos quando abaixo da tolerância
**Atual:** `accent: false` hardcoded → Aplicar `accent: defectRate <= defectTolerance`

#### FIX-P1: Labels do Pipeline
**Atual:** eyebrow "Pipeline", title "Etapas de Produção" → **Spec:** eyebrow "Distribuição", title "Pipeline de Etapas"

#### FIX-P3: Gradient nas barras do Pipeline
**Atual:** Cor sólida → **Spec:** `linear-gradient(90deg, oklch(0.98 0 0 / 0.8), oklch(0.98 0 0 / 0.2))`

#### FIX-A1: Labels dos Alertas
**Atual:** eyebrow "Atenção", title "Alertas" → **Spec:** eyebrow "Operação", title "Ação Necessária"

#### FIX-A2: Warning dot em vez de ícone
**Atual:** `AlertTriangle` icon → **Spec:** `size-2 rounded-full bg-warning` (dot simples)

#### FIX-A3: Texto alerta
**Atual:** `text-[13px]` → **Spec:** `text-[14px]`

#### FIX-A4: Empty state
**Atual:** `text-success/70` sem sub-texto → **Spec:** `text-success/30` + sub "Produção fluindo normalmente"

#### FIX-PG1: Padding horizontal da page
**Atual:** `px-6` → **Spec:** `px-8`

---

## Validação Final

Após TODAS as correções, o dev DEVE:

1. `npm run typecheck` — deve passar
2. `npm run lint` — deve passar
3. `npm run build` — deve passar
4. Abrir `http://localhost:3001/tv?token=<uuid>` no browser
5. Comparar VISUALMENTE cada seção contra o UX spec
6. Listar no Completion Notes: `✓ [componente]: [propriedade] = [valor] (spec linha X)` para cada CRITICAL/HIGH fix

---

## Referência Rápida — Valores do Spec

### Podium (diferenciados por posição)

| Propriedade | 1o lugar | 2o/3o lugar |
|---|---|---|
| Nome | `text-[28px] font-semibold mt-3` | `text-[20px] font-semibold mt-2` |
| Score | `text-[36px] font-bold text-foreground` | `text-[24px] font-semibold text-muted-foreground` |
| Score sufixo | `text-[14px]` "pts" | `text-[11px]` "pts" |
| Iniciais | `text-[28px]` | `text-[20px]` |
| Avatar border | `border-3 border-warning` | `border-2` |
| Plataforma bg | `bg-secondary/60` | `/40` (2o) `/30` (3o) |

### Overlay

| Propriedade | Valor correto |
|---|---|
| Logo LISION | `text-[48px] font-semibold` |
| Título | `text-[14px] uppercase font-medium` |
| Backdrop | `bg-background` (opaco) + `bg-grid opacity-30` |
| Footer | `text-[11px] text-muted-foreground/50 mt-6 font-mono` |

### Header

| Propriedade | Valor correto |
|---|---|
| Height | `h-12` (48px) |
| Logo | `text-[20px]` |
| Subtítulo | "Rastreamento Têxtil" `text-[10px] uppercase` |
