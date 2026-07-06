# Auditoria — Épico Robustez do Fluxo de Remessas e Portal da Facção

**Autora:** Dara (@data-engineer) · **Data:** 2026-07-05 · **Fase:** diagnóstico (F1 + F2a + F4a)
**Regra do épico:** nenhuma correção às cegas — este documento é a base para o @dev.

---

## F1 — OPs canceladas vazando para remessas (CRÍTICO)

### Status reais de `production_orders` no banco
| Status | Qtde | Elegível para remessa? |
|---|---|---|
| `OPEN` | 2 | ✅ |
| `IN_PROGRESS` | 4 | ✅ |
| `COMPLETED` | 9 | ❌ |
| `CANCELLED` | 36 | ❌ |

**Conjunto elegível: `OPEN` + `IN_PROGRESS`** (constante única compartilhada, ex. `ELIGIBLE_PO_STATUSES`).

### Causa raiz (dupla)
1. **Listagem** — `GET /api/production/lots?available=true` ([route.ts:60-63](../../src/app/api/production/lots/route.ts)): busca `production_orders` **apenas por tenant, sem filtro de status**. Lotes de OPs canceladas entram na lista do ShipmentCreate.
2. **Criação** — `POST /api/shipments` ([route.ts:101-104](../../src/app/api/shipments/route.ts)): revalida apenas tenant, **não o status da OP**. Sem barreira server-side → API aceita lote de OP cancelada (422 esperado, hoje 201).

### Bug lateral descoberto (mesma rota, direção oposta)
`GET /api/production/lots?available=true` exclui lotes "ocupados" com `.neq("status","RECEIVED")` — **"RECEIVED" não existe no enum** `ShipmentStatus`. Efeito: TODAS as remessas (inclusive `RETURNED`) marcam o lote como ocupado para sempre → **lote devolvido nunca volta a ficar disponível**. Correção: ocupado = remessa em status de posse ativa (`PREPARING, SENT, RECEIVED_BY_FACTION, RETURN_DECLARED, PARTIALLY_RETURNED, OVERDUE`); `RETURNED`/`CLOSED` liberam o lote.

---

## F2a — Mapa de estados da remessa

### Enum `ShipmentStatus` (pós-migration desta auditoria)
`PREPARING → SENT → RECEIVED_BY_FACTION → RETURN_DECLARED → PARTIALLY_RETURNED | RETURNED → CLOSED` (+ `OVERDUE` transversal). **`CLOSED` adicionado agora** (migration `20260705100000_shipment_closure`, aplicada + smoke OK).

Em uso no banco hoje: `SENT` (2), `RECEIVED_BY_FACTION` (1), `PARTIALLY_RETURNED` (4).

### Transições existentes no código
| Rota | Transição |
|---|---|
| `POST /api/shipments` | cria com `SENT` |
| `PATCH /api/faction/shipments/[id]/confirm` | `SENT → RECEIVED_BY_FACTION` |
| declare-return (portal) | `→ RETURN_DECLARED` |
| `POST /api/shipments/[id]/receive` | `→ RETURNED \| PARTIALLY_RETURNED` + reconciliação + ledger |
| payment (admin) | não muda status (só payment_status/ledger) |

### Onde o fluxo "não termina"
- Portal: `GET /api/faction/shipments` filtra ativas com `.neq("status","RETURNED")` → **`PARTIALLY_RETURNED` fica em "Ativas" para sempre**.
- Admin: `GET /api/shipments` não tem conceito de ativas/histórico no servidor (filtro por `?status=` pontual); o toggle é do cliente.
- Não existe transição para estado final nem coluna de encerramento. **Confirmado: o fluxo não tem fim definido.**

### Estado final implementado (fundação pronta para o @dev)
- **`CLOSED`** no enum + colunas `closed_at TIMESTAMPTZ`, `closed_by TEXT`, `status_before_close TEXT` (para reabertura com log).
- **Critérios de encerramento** (validar no endpoint, todos obrigatórios):
  1. Devolução recebida: `status IN (RETURNED, PARTIALLY_RETURNED)`
  2. Conferência feita: `reconciliation_status IS NOT NULL`
  3. Financeiro lançado: `payment_status != 'PENDING'`
  4. Ação explícita do admin (endpoint de encerramento). *Auto-close por tempo: documentado como cron futuro, fora de escopo agora.*
- **Definição de "Ativas"** (usar nos dois lados): `status NOT IN ('RETURNED','CLOSED')` — na verdade recomendo: ativas = `NOT IN ('CLOSED')` no admin (RETURNED aguardando encerramento ainda é acionável) e portal = `NOT IN ('RETURNED','CLOSED')` como hoje +CLOSED. Decisão final com @architect/@dev na F2.

### Tabela `shipment_events` (timeline F3 — criada agora)
`id, tenant_id FK, shipment_id FK CASCADE, event_type VARCHAR(32), actor_type ADMIN|FACTION|SYSTEM (CHECK), actor_name, visible_to_faction BOOL default true, payload JSONB, created_at` + índices `(shipment_id, created_at)` e `(tenant_id)` + RLS tenant-scoped (padrão goal_deficits). **Observações = `event_type='NOTE'`** com `visible_to_faction` controlando exposição no portal (decisão: 1 tabela só, sem shipment_notes separada). Tipos previstos: `CREATED, SENT, CONFIRMED, RETURN_DECLARED, RECEIVED, RECONCILED, PAYMENT, NOTE, DEADLINE_CHANGED, CLOSED, REOPENED`.

---

## F4a — Auditoria das métricas do portal (`/api/faction/summary`)

| Métrica | Fórmula atual | Problema | Fórmula correta |
|---|---|---|---|
| **Peças com você** | `Σ(sent − returned)` sobre `status != RETURNED` | Não desconta defeituosas retidas? (`quantity_returned` inclui defeituosas? conferir no receive); não excluirá `CLOSED`; inclui `PREPARING` (ainda na fábrica) | `Σ(quantity_sent − quantity_returned − quantity_defective?)` sobre `status IN (SENT, RECEIVED_BY_FACTION, RETURN_DECLARED, PARTIALLY_RETURNED, OVERDUE)`; exibir 0 quando vazio (nunca esconder o card) |
| **pendingReturns** | `status IN (SENT, 'PENDING')` | **`PENDING` não existe no enum** (código morto); ignora `RECEIVED_BY_FACTION`/`RETURN_DECLARED` | `status IN (SENT, RECEIVED_BY_FACTION, OVERDUE)` (aguardando devolução) |
| **Devoluções (nº)** | não existe como métrica | — | count de remessas com `actual_return_at IS NOT NULL` (ou `status IN (RETURNED, PARTIALLY_RETURNED, CLOSED)`) |
| **Defeitos pendentes** | `defect_records` com `faction_response IS NULL` | OK em conceito; conferir se deve limitar a remessas não encerradas | manter; ao encerrar (CLOSED) avaliar se defeitos pendentes bloqueiam encerramento (recomendo: bloqueiam critério 2) |
| **Pagamentos** | `factions.current_balance` (ledger) | ✅ correto (épico anterior) — revalidado | manter |
| **Remessas ativas (toggle portal)** | `.neq("status","RETURNED")` | `PARTIALLY_RETURNED` nunca sai; `CLOSED` entraria como ativa | ativas = `status NOT IN ('RETURNED','CLOSED')`; histórico = `IN ('RETURNED','CLOSED')` |

### Sugestão de cards para F4c (validar com @ux)
1. **Remessas Devolvidas** — count `status IN (RETURNED, PARTIALLY_RETURNED, CLOSED)` + subtítulo "Σ quantity_returned peças devolvidas".
2. **Taxa de Aprovação** — `Σ(returned − defective) / Σ returned` das devolvidas (qualidade da facção — motivador).
3. **Remessas Concluídas** — count `CLOSED` (após F2 entrar em produção).

---

## Migrations aplicadas nesta fase
- `20260705100000_shipment_closure` — `ALTER TYPE "ShipmentStatus" ADD VALUE 'CLOSED'`; colunas `closed_at/closed_by/status_before_close`; tabela `shipment_events` + índices + RLS. **Aplicada ("Script executed successfully") + `migrate resolve` + smoke test: colunas OK, enum CLOSED aceito em UPDATE (revertido), insert/delete de evento OK.** Prisma schema atualizado e `prisma validate` ✓.
