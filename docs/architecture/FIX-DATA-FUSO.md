# Pendência 1 — Bug de data (off-by-one de fuso) — spec para @dev

## Raiz (comprovada)
`<input type="date">` produz `"2026-07-18"`. A API grava essa string CRUA numa coluna
`timestamptz` (`expected_return_at`). Postgres/JS interpretam data-only como **meia-noite UTC**
→ `2026-07-18T00:00:00Z` = **17/07 21:00 BRT**. A tela formata com `new Date(...).toLocaleDateString("pt-BR")`
no fuso do runtime → exibe **17/07**. Confirmado no E2E (escolhi 18/07, gravou/exibiu 17/07; TV "faltam 56h48" = até 18/07 00:00 UTC).

## Correção — 2 lados

### A) Persistência: data-only → timestamp no fuso do TENANT
Onde uma coluna `timestamptz` recebe uma data escolhida pelo usuário, converter para o fim do dia
no fuso do tenant com `localDayEnd(date)` (de `@/lib/tz`, retorna `${date}T23:59:59.999-03:00`).
Um prazo é "o dia inteiro" → fim do dia local é o limite correto.
- `src/app/api/shipments/route.ts:166-167`:
  - `expected_return_at: localDayEnd(body.expectedReturn)` (era a string crua).
  - `expected_return`: verificar o TIPO da coluna. Se for `date`, manter a string crua (data pura, sem shift). Se `timestamptz`, aplicar `localDayEnd` também.
- `src/app/api/shipments/[id]/deadline/route.ts:51`: mesma correção no `expected_return_at`.
- **Confirmar tipos** (Dara/@dev): `expected_return_at` (esperado timestamptz), `expected_return`, `plan_date` (esperado `date` → seguro), e qualquer outra coluna que receba `type="date"`.

### B) Exibição: formatar SEMPRE no fuso do tenant
Todo `toLocaleDateString`/`toLocaleString`/`toLocaleTimeString` que exibe uma data vinda de `timestamptz`
deve passar `{ timeZone: "America/Sao_Paulo" }` (usar `TENANT_TZ` de `@/lib/tz`) — senão o Vercel (runtime UTC)
exibe o dia errado mesmo com o dado certo.
- `src/app/api/shipments/route.ts:217` (mensagem de notificação `prazo`): formatar no fuso do tenant.
- Auditar os componentes que exibem prazos/datas: `ShipmentCreate`, `ShipmentDrawer`, `FactionDetail`,
  `ShipmentTimeline`, portal (`shipments/[id]`, `returns`), TV (`computeFactionStatus`/card), relatório.
  Grep sugerido: `grep -rn "toLocaleDateString\|toLocaleString\|toLocaleTimeString" src | grep -v "timeZone"`.

## Auditoria completa dos inputs de data (Gabriel pediu TODOS)
UI com `type="date"`: `ShipmentCreate`, `ShipmentDrawer`, `ExportModal`, `ReportDownloadCard`,
`production/daily-plan`, `rework`, portal `returns`, portal `shipments/[id]`.
- Filtros de RELATÓRIO (from/to) já usam `localDayStart/localDayEnd` no motor — confirmar (provável OK).
- Para cada input, seguir o dado até a coluna: se `timestamptz`, aplicar A; se `date`, seguro.

## Prova (QA, na tela)
Criar/alterar uma remessa escolhendo **18/07**, e confirmar **18/07** em: (1) criação, (2) FactionDetail,
(3) TV "Status da Facção" (prazo/horas coerentes com fim do dia 18/07 BRT), (4) relatório se aplicável.
Repetir com uma data de VIRADA (ex.: escolher um dia e conferir que não vira para o anterior perto da meia-noite).

## Regras
tsc+lint limpos; sem commit/push; não buildar com dev ativo. Migrations no padrão se precisar mexer em tipo de coluna (não deve).
