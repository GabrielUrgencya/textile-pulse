# Correções pré-E2E definitivo (decisões do Gabriel)

## Correção 1 — Relatório usa META EFETIVA (com déficit) — `src/lib/report-data.ts`
**Problema (Quinn):** o atingimento do relatório usa a meta BASE do período (`base × dias úteis`), enquanto TV/dashboard usam a meta EFETIVA (base + déficit acumulado). Mesmo setor, % diferente por tela (Travete 81% no relatório vs 54% na TV).

**Decisão:** um só conceito de "% de atingimento" no sistema — TODOS contra a **meta efetiva** (com déficit).

**Implementação (report-data.ts):**
- Importar `accumulatedGoal` de `@/lib/goal-deficits` (já importa getActiveDeficits/getActiveSectorDeficit).
- **Setores** (loop `setores`): `const metaEfetiva = accumulatedGoal(meta, persisted.daily);` (meta = base×businessDays). Expor `meta: metaEfetiva` e `atingimento: realizado / metaEfetiva`. Manter `deficit` (breakdown).
- **Operadores** (loop `operadores`): idem — `const metaEfetiva = accumulatedGoal(meta, persisted.daily);` `meta: metaEfetiva`, `atingimento: realizado / metaEfetiva`.
- **Resumo:** `meta_pct = realizadoTotal / (metaTotal + deficitTotal)` (efetivo). `totais.meta` = Σ metaEfetiva.
- **Prova:** relatório de 1 dia (from=to=hoje) para Travete → meta 1.200, atingimento 0,542 (= TV). Para operador ANA → meta 1.400, atingimento 0,429 (= dashboard dela). Sem déficit, inalterado (Corte 120%, DORA 50%).
- Nota multi-período: para janela >1 dia, meta efetiva = (base×dias) + déficit corrente. Aceitável (o déficit é a dívida vigente). Documentar no header da função.
- xlsx/pdf: o rótulo da coluna de meta deve indicar que inclui o déficit (ex.: "Meta (c/ déficit)" ou manter "Meta" + coluna "Déficit"). @ux refina o rótulo.

## Correção 2 — Dashboard geral mostra DOIS números — `src/lib/kpi-queries.ts` + card da dashboard
**Problema:** "Produção do dia" só conta o que chegou ao ESTOQUE (throughput final) → fica 0 enquanto os setores produzem (parece quebrado).

**Decisão:** mostrar DOIS números rotulados na dashboard geral:
- **"Produzido hoje"** = Σ produção de TODOS os setores (STAGE_OUT ponderado por etapa, dedupe por lote POR etapa) — sobe junto com a bipagem.
- **"Foi pro estoque"** = o throughput atual (peças que entraram no ESTOQUE) — métrica que já existe (`produced_today`), agora rotulada.

**Implementação:**
- `kpi-queries.ts` / `KpiResult`: adicionar `produced_today_sectors: number` = Σ, sobre todas as stages do tenant, da produção ponderada STAGE_OUT no período (mesma técnica de `report-data.stageWeightedProduction`, dedupe por lote por etapa, CANCELLED fora). Popular em `computeKpis`.
- Rota `/api/dashboard/all` (e `/api/dashboard/kpis`) expõem o novo campo.
- Card da dashboard geral (localizar em `src/app/(app)/dashboard/*` / componente do KPI de produção): renderizar os DOIS valores com rótulos claros — **"Produzido hoje"** (produced_today_sectors) e **"Foi pro estoque"** (produced_today). @ux ajusta layout/rótulos.
- **Prova:** ao bipar produção nos setores, "Produzido hoje" sobe (no cenário E2E: 1200+600+650+250 = 2.700); "Foi pro estoque" só sobe quando um lote chega ao ESTOQUE (0 no cenário atual).

## Regras
- tsc + lint limpos. Sem commit/push. Não buildar com dev ativo.
- Depois das duas correções: re-provar coerência (Correção 1: 4 telas com o MESMO %) e a dashboard geral (Correção 2: dois números) — no E2E físico refeito.
