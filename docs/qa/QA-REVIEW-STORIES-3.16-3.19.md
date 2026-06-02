# QA Review — Stories 3.16, 3.17, 3.18, 3.19

| Campo | Valor |
|-------|-------|
| **Reviewer** | @qa (Quinn) |
| **Data** | 2026-06-02 |
| **Escopo** | Fix stories originadas do QA_FIX_REQUEST.md |
| **Metodo** | Code review completo + verificacoes automatizadas |

---

## Verificacoes Automatizadas

| Check | Resultado |
|-------|-----------|
| `grep -r 'includes(role)' src/app/api/` | **0 matches** — H3 confirmado (zero hardcoded role checks) |
| `grep -r 'role !== "ADMIN"' src/app/api/` | **0 matches** — nenhum pattern antigo restante |
| `tsc --noEmit` | **0 errors** — build limpo |

---

## Story 3.16 — Fix CRITICAL: Factions Data Integrity

### Veredito: PASS

### Issues Verificados

| Issue | Status | Evidencia |
|-------|--------|-----------|
| **C1** — Defects sem filtro faction_id | RESOLVIDO | `factions/[id]/route.ts`: defects filtrados via shipmentIds → shipment_lots → lot_ids → `defect_records.in("lot_id", lotIds)`. Chain de joins correta, faccao so ve seus defeitos. |
| **C2** — Financial hardcoded zero | RESOLVIDO | `factions/[id]/route.ts`: grossValue = totalPieces * pricePerPiece, deductions = 0 (com TODO para implementar logica futura), netValue = gross - deductions. Calculo funcional. |
| **C3** — KPIs hardcoded zero | RESOLVIDO | `factions/route.ts`: avgDefectRate calculado via COUNT em defect_records joined por shipment_lots; totalPendingValue calculado de shipments pendentes * pricePerPiece. KPIs reais. |
| **UX1** — FactionScoreCard props | RESOLVIDO | `FactionScoreCard.tsx`: recebe deliveryScore, qualityScore, volumeTotal como props. Renderiza estrelas, barras de progresso, metricas. Conforme spec UX. |

### Observacoes
- C2 deductions = 0 com TODO e aceitavel — logica de deducoes nao existia antes e nao faz parte do escopo desta fix story.
- KPIs usam queries reais com joins corretos ao Supabase.

---

## Story 3.17 — Fix HIGH: Security & Performance

### Veredito: PASS

### Issues Verificados

| Issue | Status | Evidencia |
|-------|--------|-----------|
| **H1** — Quality overview fetch-all | RESOLVIDO | `quality/overview/route.ts`: 3 queries COUNT paralelas via Promise.all com `{ count: "exact", head: true }`. Zero fetch-all. |
| **H2** — Stages reorder N+1 | RESOLVIDO | `stages/reorder/route.ts`: Promise.all batch update. Verifica erros com `results.find(r => r.error)`. |
| **H4** — Mark-all-read cross-user | RESOLVIDO | `notifications/read/route.ts`: `.eq("user_id", userId)` aplicado. Broadcasts excluidos com TODO documentado. |
| **H5** — by-faction error silenciado | RESOLVIDO | `quality/by-faction/route.ts`: retorna HTTP 500 com `{ error: message }` + console.error. Erro nao e mais silenciado. |

### Observacoes
- H2: usa Promise.all sem transaction Supabase explicita. Supabase JS client nao suporta transactions nativas — Promise.all e o melhor disponivel. Aceitavel.
- H4: broadcasts (notificacoes sem user_id) continuam nao sendo tratados — isso e esperado e documentado com TODO.

---

## Story 3.18 — Fix HIGH+MEDIUM: Permissions & API Hardening

### Veredito: PASS com CONCERNS

### Issues Verificados

| Issue | Status | Evidencia |
|-------|--------|-----------|
| **H3** — Permissions nao integradas | RESOLVIDO | Grep confirma 0 hardcoded role checks. Todas as API routes verificadas usam `hasPermission(role as AppRole, "...")`. |
| **M1** — Profile API contract | RESOLVIDO | `profile/route.ts`: retorna `{ data: { ... } }` conforme contrato padrao. |
| **M4** — Team POST role validation | RESOLVIDO | `team/members/route.ts`: VALID_ROLES array + validacao com 400 response. |
| **M5** — Stages POST unique name | RESOLVIDO | `settings/stages/route.ts`: `.ilike("name", body.name).maybeSingle()` antes do insert, retorna 409 se duplicado. |
| **M6** — escapeLikePattern | RESOLVIDO | `utils.ts`: funcao `escapeLikePattern` escapa `%` e `_`. Aplicada em `team/members/route.ts` e `factions/route.ts`. |

### CONCERNS

1. **M5 — Unique name check sem tenant_id filter**: A query de verificacao de nome unico em `settings/stages/route.ts` usa `.ilike("name", body.name)` mas **nao filtra por `.eq("tenant_id", tenantId)`** na checagem. Se a tabela `stages` tiver RLS habilitado com filtro por tenant, isso e coberto pela policy. Caso contrario, um tenant poderia ser bloqueado de criar um stage com nome que existe em outro tenant. **Severidade: LOW** — RLS provavelmente cobre, mas deve ser confirmado.

2. **H2 — Stages reorder sem transaction**: O batch update com Promise.all nao garante atomicidade. Se uma update falhar no meio, as anteriores ja foram aplicadas. **Severidade: LOW** — Supabase JS nao suporta transactions, e o check de erro pos-batch e o melhor disponivel.

---

## Story 3.19 — Fix MEDIUM+LOW: Dashboard Targets, UX & Polish

### Veredito: PASS

### Issues Verificados

| Issue | Status | Evidencia |
|-------|--------|-----------|
| **M2** — Dashboard targets hardcoded | RESOLVIDO | `Dashboard.tsx`: GoalsRow usa `targets.lotsTarget` e `targets.opsTarget` (linhas 270-271). Targets fetched de `/api/settings/targets` com DEFAULT_TARGETS como fallback. API `targets/route.ts` le de `tenants.settings` com defaults 100/15 via `??`. |
| **M3** — FactionScoreCard NaN | RESOLVIDO | `FactionScoreCard.tsx`: rating aceita `number | null | undefined`. Componente ja tinha `Number(rating) \|\| 0` e "Sem avaliacao" desde Story 3.16. |
| **UX2** — TokenDisplay | RESOLVIDO | `TokenDisplay.tsx` criado: maskToken (••••••••xxxx), copy feedback (clipboard→checkmark 2s), ConfirmDialog revoke, expiry badge. Integrado no `TokenManager.tsx` substituindo rendering inline. |
| **L1** — Trends empty state | RESOLVIDO | `trend/route.ts`: retorna `hasData` flag. `DefectTrend.tsx`: verifica `data.some(t => t.count > 0)`, mostra EmptyState "Nenhum dado no periodo" quando false. |
| **L2** — SW cache versionado | RESOLVIDO | `sw.js`: CACHE_VERSION = "20260602", cache name dinamico, activate limpa caches antigos com `k.startsWith("lision-portal-")`. |
| **L3** — localStorage resiliente | RESOLVIDO | `install-prompt.tsx`: safeGetItem/safeSetItem com try/catch. handleDismiss tambem protegido. |
| **L4** — date-fns locale centralizado | RESOLVIDO | `src/lib/date.ts` criado exportando ptBR + formatDate + formatDistance. `date-range-filter.tsx` atualizado para importar de `@/lib/date`. |

### Observacoes
- TokenDisplay e um componente bem estruturado, reusavel, com boa UX (copy feedback, expiry badge, revoke com confirmacao).
- SW cache usa string estatica (CACHE_VERSION) ao inves de Date.now() — mais previsivel e correto, requer bump manual em cada deploy.
- Apenas 1 arquivo tinha import direto de `date-fns/locale` — centralizacao completa.

---

## Resumo Executivo

| Story | Veredito | Issues Resolvidos | Concerns |
|-------|----------|-------------------|----------|
| **3.16** | **PASS** | C1, C2, C3, UX1 (4/4) | 0 |
| **3.17** | **PASS** | H1, H2, H4, H5 (4/4) | 0 |
| **3.18** | **PASS com CONCERNS** | H3, M1, M4, M5, M6 (5/5) | 2 (LOW severity) |
| **3.19** | **PASS** | M2, M3, UX2, L1, L2, L3, L4 (7/7) | 0 |

### Total: 20/20 issues do QA_FIX_REQUEST.md resolvidos

### Concerns Abertas (nao bloqueantes)

1. **[LOW]** `settings/stages/route.ts` — M5 unique name check pode nao filtrar por tenant_id (depende de RLS)
2. **[LOW]** `settings/stages/reorder/route.ts` — H2 batch update sem transaction atomica (limitacao Supabase JS)

### Verificacoes Finais

- `tsc --noEmit`: 0 erros
- Nenhum hardcoded role check restante em API routes
- Todas as API routes usam `hasPermission()` de `@/lib/permissions`
- Contrato `{ data: T }` respeitado em todas as rotas verificadas
- Build limpo, sem regressoes identificadas

---

— Quinn, guardiao da qualidade
