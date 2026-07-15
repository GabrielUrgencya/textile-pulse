# Story — Metas acumulativas por SETOR (unificar TV ao motor persistido)

**Status:** Draft (aprovada pelo Gabriel — 2026-07-13)
**Autor:** Aria (@architect)
**Depende de:** épico "divergência de métricas" (branch `fix/metricas-divergencia`, já commitado)

## Problema

A "META DO MOMENTO" da TV de setor usa o **rollover dinâmico** (`effectiveDailyTarget`, Story 9.3):
recalcula na hora olhando os **últimos 30 dias**. Isso (a) **esquece** déficit mais antigo que 30
dias — contradizendo a regra "acumula até quitar"; e (b) usa um **motor diferente** da meta
individual (que já migrou para o déficit **persistido** em `goal_deficits`). Resultado real na
liserie: Produção/Facção mostrando meta do momento = **2.519,6** (base 200 + 2.319 de backlog de 30d),
sem coerência com a tela do operador.

## Decisão do Gabriel

Aplicar na TV de setor **a mesma lógica da tela do operador**, tratando o **setor como "um funcionário
grandão"**:
- meta diária = `sector_targets.daily_target` (ex.: Produção = 200/dia);
- produção = Σ da produção de **todos** os operadores daquele stage (já é o que `computeSectorKpis` faz);
- **dívida persistida, sem teto**: acumula perpetuamente; só diminui quando o setor **produz acima da
  meta** (abate, piso 0 — excedente não vira crédito);
- **começa zerado**: sem migração de dívida histórica; o livro do setor nasce vazio e passa a acumular
  a partir da 1ª madrugada.

## Escopo técnico (o que muda)

### 1. Schema — `goal_deficits` ganha escopo SETOR (@data-engineer)
Hoje é só por usuário (`user_id` NOT NULL, UNIQUE `(user_id, period_type, period_reference)`).
Adicionar closure de setor:
- `stage_id uuid NULL` (setor); `user_id` passa a ser NULL para linhas de setor.
- `scope varchar(8) NOT NULL DEFAULT 'USER'` (`USER` | `SECTOR`).
- CHECK: `scope='USER' → user_id NOT NULL, stage_id NULL` e `scope='SECTOR' → stage_id NOT NULL, user_id NULL`.
- Índice único parcial p/ setor: `(tenant_id, stage_id, period_type, period_reference) WHERE scope='SECTOR'`
  (mantém o único de usuário existente como parcial `WHERE scope='USER'`).
- Migração no padrão do projeto (idempotente, com rollback). Sem dados históricos de setor → nada a semear.

### 2. Helper de leitura — `goal-deficits.ts` (@dev)
`getActiveSectorDeficit(supabase, tenantId, stageId, today)` — espelho de `getActiveDeficits`, mas
buscando `scope='SECTOR'` por `stage_id` no `period_reference = prevBusinessDay/prevWeekStart/prevMonthStart`.

### 3. Cálculo da TV — `sector-kpis.ts` (@dev)
Trocar o `effectiveDailyTarget` (dinâmico 30d) por **déficit persistido**:
`effectiveTarget = accumulatedGoal(base, getActiveSectorDeficit(...).daily)`.
**Sem fallback dinâmico** (é o que garante "começa zerado" e "não esquece"). `distance`/`percent` sobre a
meta efetiva. Remover a leitura de `rolloverScans`/`producedByDay` do caminho do setor.

### 4. Fechamento noturno — `cron/goal-closures` (@dev + @data-engineer)
Além do loop por usuário, adicionar loop por **stage com `sector_targets`**: computar produção do dia
fechado via a mesma métrica de `computeSectorKpis` (STAGE_OUT ponderado, CANCELLED fora, fuso local),
`base_goal = meta efetiva do dia` (base + déficit anterior do setor), `deficit = max(0, base − produzido)`,
gravar linha `scope='SECTOR'`. Idempotente (upsert ignoreDuplicates no novo único parcial).

### 5. (Nota, fora de escopo agora) operador ainda tem fallback dinâmico
`user-meta.ts` mantém o fallback dinâmico "de transição". Como o cron roda toda noite, após a 1ª
madrugada ambos usam persistido. Avaliar remover o fallback do operador numa story futura para simetria total.

## Prova (QA, com dados reais)
- Exemplo controlado (tenant Fábrica Teste): setor com meta 200; dias abaixo → dívida sobe; dia acima → abate a 0.
- Rodar o cron manualmente e verificar linha `scope='SECTOR'` gravada; TV lê a mesma e bate com o passo a passo.
- Coerência TV(setor) ↔ operador: mesmo motor persistido, sem divergência de mecanismo.
- Liserie: após deploy, Produção/Facção parte da base (200), não mais 2.519.

## Fora de escopo
- Não mexe nas 7 correções já commitadas. Não altera dados da liserie (só passa a calcular diferente).
