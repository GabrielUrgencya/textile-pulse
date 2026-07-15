# Story — Unificar a meta do OPERADOR ao motor persistido (Frente 2.5)

**Status:** Draft (aprovada pelo Gabriel — 2026-07-13) · **Autor:** Aria (@architect)

## Problema (dívida sinalizada pelo Quinn)
`computeUserMeta` (operador) ainda usa o **rollover dinâmico de 30 dias** como fallback quando
não há déficit persistido — gerando números desenfreados (ex.: base 46.000). O **setor** já foi
unificado ao motor persistido "começa zerado" (goal_deficits). O sistema está pela metade.

## Solução (igualar operador ao setor)
Em `src/lib/user-meta.ts`, trocar o bloco:
```
const persisted = await getActiveDeficits(supabase, userId, to, cal);
const dynDaily = effectiveDailyTarget(target, producedByDay, to, cal);
const effTarget = persisted.daily !== null && target != null && target > 0
  ? accumulatedGoal(target, persisted.daily) : dynDaily.effective;
const dailyDeficit = persisted.daily !== null ? persisted.daily : dynDaily.backlog;
```
por (espelho do sector-kpis):
```
const persisted = await getActiveDeficits(supabase, userId, to, cal);
const effTarget = target != null && target > 0 ? accumulatedGoal(target, persisted.daily) : target;
const dailyDeficit = persisted.daily ?? 0;
```
- **Remover** todo o bloco do rollover dinâmico: a query `rollRows`, o `producedByDay`,
  a chamada `effectiveDailyTarget`, e os imports agora não usados
  (`effectiveDailyTarget`, `rolloverStart`, `localDay` de `@/lib/rollover`).
- Se `effectiveDailyTarget`/`rolloverStart`/`localDay` ficarem sem nenhum uso no projeto,
  remover de `src/lib/rollover.ts` também (ou deixar só o que ainda é usado). Verificar com grep.
- Semana/mês já usam persistido (`accumulatedGoal(weeklyBase, persisted.weekly)`) — não mexer.

## Resultado esperado
- Operador e setor usam o MESMO motor (goal_deficits persistido), começando zerado.
- Sem fallback dinâmico → nenhum número absurdo (46.000 some; vira a base quando não há déficit).
- Acumulação segue: base + déficit persistido; percent sobre meta acumulada.

## Prova (QA — dados reais, Fábrica Teste, liserie intocada)
- Operador sem déficit persistido → meta = base (limpa), não 46.000.
- Operador com déficit persistido (seed) → meta = base + déficit (ex.: ANA 1000+600=1600).
- Coerência: operador e setor com a mesma lógica; dashboard/TV/relatório inalterados no default.
- Regressão: BRUNO 2000/100%, CARLOS 1500/50% (janela do dia), ANA 1600 — como no gate do épico.
