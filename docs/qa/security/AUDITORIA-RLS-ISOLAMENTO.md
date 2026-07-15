# Auditoria de Segurança — Isolamento entre Tenants (RLS/DB)

**Auditora:** Dara (@data-engineer) · **Data:** 2026-07-15 · **DB:** produção (Supabase) · liserie INTOCADA.
**Método:** catálogo pg (RLS/policies), inspeção de policies, impersonação de JWT (positivo+negativo), correção + re-teste.

## Veredito: **1 CRÍTICO encontrado e FECHADO; isolamento sólido.** (sem "100% seguro")

---

## 1. Cobertura RLS — ✅ PASS
Todas as **34 tabelas** de `public` com **RLS habilitada e policies** (exceto `_prisma_migrations`, interna do Prisma, sem dado de tenant — acessível só por service_role). Nenhuma tabela de dado exposta sem RLS.

## 2. Escopo das policies — ✅ PASS
- Tabelas com `tenant_id`: `tenant_id = auth_tenant_id()` (factions, profiles, production_orders, goal_deficits, sector_targets, user_targets, faction_shipments, faction_ledger, kiosk_tokens, …).
- Tabelas SEM `tenant_id` escopam via o pai:
  - `lots` → `production_orders.tenant_id = auth_tenant_id()`.
  - `scan_events` → `lots→production_orders.tenant_id`; **INSERT também exige `user_id = auth.uid()`** (operador só bipa como ele mesmo).
  - `shipment_lots` → `faction_shipments→factions.tenant_id`.
- Ledger financeiro imutável: `faction_ledger` só SELECT/INSERT (sem UPDATE/DELETE p/ user).

**Teste de impersonação (JWT claims via request.jwt.claims):**
| Cenário | production_orders visíveis | Esperado |
|---|---|---|
| user FT (app_metadata.tenant_id=FT) | 3 | 3 (só o seu) ✅ |
| user liserie (app_metadata.tenant_id=liserie) | 54 | 54 (só o seu) ✅ |
| FT vê faction_ledger da liserie | 0 (liserie tem 1) | 0 ✅ |

## 3. 🔴 CRÍTICO (FECHADO) — fallback para `user_metadata` em `auth_tenant_id()`
**Achado:** a função era
```sql
SELECT COALESCE((auth.jwt()->'app_metadata'->>'tenant_id')::uuid,
                (auth.jwt()->'user_metadata'->>'tenant_id')::uuid);
```
`app_metadata` é server-only (confiável), mas **`user_metadata` é GRAVÁVEL pelo próprio usuário** (`supabase.auth.updateUser({data:{...}})`). Um usuário sem `app_metadata.tenant_id` podia se auto-atribuir qualquer tenant e **ler/escrever dados de outra empresa via RLS**.
**Superfície real:** 28/29 usuários têm `app_metadata.tenant_id`; **1 não tem** (`gabrielurgencya@gmail.com`). Nenhum tem `user_metadata.tenant_id` hoje, mas é auto-setável.
**Exploit COMPROVADO:** claims `{app_metadata:{}, user_metadata:{tenant_id:liserie}}` → leu **54 OPs da liserie** (vazamento).
**Correção (migration `20260715150000_auth_tenant_id_no_user_metadata_fallback`):**
```sql
CREATE OR REPLACE FUNCTION public.auth_tenant_id() ... AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID;  -- só app_metadata
$$;
```
**Re-teste:** mesmo exploit → **0 linhas ✅ BLOQUEADO**. Usuários legítimos intactos (FT=3, liserie=54).

**Nota operacional (não é regressão):** após o fix, `gabrielurgencya@gmail.com` (sem app_metadata.tenant_id) passa a ter `auth_tenant_id()=NULL` → RLS não retorna nada (fail-closed, correto). Se essa conta precisar acessar um tenant, definir `app_metadata.tenant_id` **server-side** (nunca user_metadata). Decisão operacional do Gabriel.

## 4. Buscas por nome sem escopo — ✅ PASS
`my-plan` (`.eq(tenant_id).ilike(name)`), `kpi-queries`/`report-data` (ESTOQUE com `.eq(tenant_id)`), `user-meta` (`.eq(tenant_id)`), `settings/stages`, `production/orders/[id]` e `factions` (sessão → RLS por tenant). Nenhuma busca por nome cross-tenant.

## 5. Funções SECURITY DEFINER — ✅ PASS
- `auth_tenant_id` (corrigida), `auth_user_role` (lê só `app_metadata.role`, seguro).
- `faction_ledger_apply` (trigger de saldo) opera sobre `NEW.faction_id` já validado pelo RLS do INSERT → sem risco cross-tenant.

## 6. Cron por tenant (goal-closures) — ✅ PASS
Processa por tenant (loop + `?tenant=`), `closedDay` pelo calendário do tenant, upserts idempotentes por (user/stage, período) — sem colisão entre tenants (user_id global; sector key inclui tenant_id).

---

## Pendências para a parte de APP-SURFACE (arquiteta/@dev/@qa)
- Rotas com **service_role** (bypassa RLS): kiosk (`validateKioskToken`→tenant) e cron (loop por tenant) — confirmar que TODA rota service_role aplica `.eq(tenant_id)`/escopo explícito (RLS não protege service_role).
- Auth/sessão (admin e-mail, PIN, rate-limit 5/15min), autorização por papel (`?userId=` exige settings:manage — confirmar operador não burla), validação de entrada/injeção, exposição da API kiosk (só dado de TV).

**Migrations:** `prisma/migrations/20260715150000_auth_tenant_id_no_user_metadata_fallback/` (aplicada + re-testada). Sem commit/push. liserie 54=54 intocada.
