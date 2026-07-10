# Teste E2E — Tenant "Fábrica Teste" (validação visual do épico de métricas)

**Objetivo:** provar, no sandbox do Gabriel (tenant `fabrica-teste-31ykr`, isolado da liserie),
que meta configurada, produção real, dashboard, TV, meta individual e acúmulo TODOS refletem
corretamente do zero. Cada número abaixo é escolhido e rastreável.

**Data do teste:** hoje = **2026-07-10** (sexta) · ontem útil = **2026-07-09** (quinta).

## Estrutura criada (tenant Fábrica Teste)

Etapas reaproveitadas (já existiam): CORTE, AVIAMENTOS, PRODUCAO (Produção/Facção), TRAVETE,
LIMPEZA, CONFERENCIA, EMBALAGEM, ESTOQUE.

### Operadores (auth users reais + PIN)

| Nome | Setor | Etapa resolvida | Meta diária | PIN | Prova |
|---|---|---|---|---|---|
| GESTOR TESTE | — (ADMIN) | — | — | 9999 | login admin p/ dashboard |
| COSTUREIRA ANA | COSTURA | PRODUCAO (via user_targets) | **1.000** | 1111 | setor≠etapa + **acúmulo** |
| CORTADOR BRUNO | CORTE | CORTE (via fallback de setor) | **2.000** | 2222 | fallback escopado + **mudança de meta** + **CANCELLED** |
| TRAVETADOR CARLOS | TRAVETE | TRAVETE (via user_targets) | **3.000** | 3333 | meta alta exata + **fuso** |
| EXPEDIÇÃO DORA | EXPEDICAO | — (nenhuma) | — | 4444 | **empty state** |

Login: `/login?tenant=fabrica-teste-31ykr` + PIN. TV: `/tv?token=141eb884-12d8-4f9d-9cca-5f6583e66b5c`.

## Produção bipada (STAGE_OUT, ref 1000, coef 1 → 1 peça = 1 ponto)

| Operador | Dia | Lotes | Total | Observação |
|---|---|---|---|---|
| BRUNO (CORTE) | hoje 10/07 | 4×500 | **2.000** | bate a meta → 100% |
| BRUNO (CORTE) | hoje 10/07 | 1×500 | (500) | OP **CANCELLED** → deve ser IGNORADO |
| ANA (PRODUCAO) | ontem 09/07 | 2×200 | 400 | ontem produziu 400 de 1.000 → déficit 600 |
| ANA (PRODUCAO) | hoje 10/07 | 3×200 | **600** | meta efetiva hoje = 1.000+600 = **1.600** → 37,5% |
| CARLOS (TRAVETE) | hoje 10/07 | 3×500 | **1.500** | 50% de 3.000 |
| CARLOS (TRAVETE) | 09/07 22:00 SP | 1×100 | (100) | **virada do dia**: local=dia 09; UTC(bug)=dia 10 |
| ESTOQUE (GESTOR) | hoje 10/07 | 2×400 | **800** | "Produção do dia" do dashboard/TV |

### Fechamentos de ontem persistidos (goal_deficits, o que o cron gera)

| Operador | period_reference | base | produzido | deficit | carried_to |
|---|---|---|---|---|---|
| ANA | 2026-07-09 | 1000 | 400 | **600** | 2026-07-10 |
| BRUNO | 2026-07-09 | 2000 | 2000 | 0 | 2026-07-10 |
| CARLOS | 2026-07-09 | 3000 | 3000 | 0 | 2026-07-10 |

## Números esperados (a validação central)

| Tela / medida | Valor esperado | Prova |
|---|---|---|
| ANA meta individual | meta **1.600** (1000+600), progresso 600, **37,5%**, déficit 600 | acúmulo ao vivo |
| BRUNO meta individual | meta **2.000**, progresso **2.000** (não 2.500), **100%** | CANCELLED ignorado |
| CARLOS meta individual | meta **3.000**, progresso **1.500** (não 1.600), **50%** | fuso: virada fica no dia 09 |
| DORA meta individual | "Nenhuma meta configurada" | empty state, sem meta fantasma |
| Dashboard "Produção do dia" | **800** | lotes no ESTOQUE hoje |
| TV "Produção do dia" | **800** | = dashboard (mesma fonte, mesmo fuso) |
| Mudança de meta BRUNO 2000→2500 | meta **2.500**, **80%** | recálculo reflete |

Isolamento: todos os dados acima vivem no tenant `fabrica-teste-31ykr`. A liserie não é tocada.
