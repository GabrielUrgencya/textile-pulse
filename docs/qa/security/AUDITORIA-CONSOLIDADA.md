# Auditoria de Segurança CONSOLIDADA — LISION (pré-deploy)

**Data:** 2026-07-15 · **Banco:** Dara (@data-engineer) · **App-surface:** Aria (@architect) · **Método:** revisão + exploit real + correção + re-teste. liserie INTOCADA (54 OPs, PIN da Luana intocado).

## VEREDITO: **2 achados (1 CRÍTICO + 1 ALTO) — ambos FECHADOS e re-testados. Deploy liberável após OK do Gabriel.** (sem "100% seguro"; itens LOW/operacionais listados)

---

## 🔴 CRÍTICO (FECHADO) — RLS: `auth_tenant_id()` confiava em `user_metadata`
- **Vetor:** `COALESCE(app_metadata.tenant_id, user_metadata.tenant_id)`. `user_metadata` é gravável pelo usuário → um usuário sem `app_metadata.tenant_id` podia se auto-atribuir tenant e vazar dados.
- **Prova:** exploit leu **54 OPs da liserie** a partir de claims com user_metadata forjado.
- **Fix:** migration `20260715150000_auth_tenant_id_no_user_metadata_fallback` — lê só `app_metadata`. **Re-teste: exploit → 0 linhas.** Detalhe em `AUDITORIA-RLS-ISOLAMENTO.md`.

## 🟠 ALTO (FECHADO) — reset-pin sem escopo de tenant (account takeover cross-tenant)
- **Vetor:** `PATCH /api/team/members/[id]/reset-pin` usava service_role e `.eq("id", id)` **sem `tenant_id`** → um admin do tenant A podia resetar o PIN de um usuário do tenant B e logar como ele.
- **Fix:** `.eq("tenant_id", callerTenant)` + `.select()` → 404 se não for do tenant. **Re-teste: FT admin resetando PIN da liserie → 404, PIN intocado.** ✅

---

## ✅ Áreas auditadas e APROVADAS (com evidência)

| Área | Resultado |
|---|---|
| **Cobertura RLS** | 34/34 tabelas com RLS + policies (só `_prisma_migrations` interna) |
| **Isolamento RLS** | policies escopam por tenant (direto ou via pai); provado positivo+negativo por impersonação |
| **Rotas service_role — portal facção** (`/api/faction/*`) | `validateFactionSession` deriva faction/tenant do TOKEN no banco (não do cookie); toda query `.eq("faction_id", session.factionId)`; rotas `[id]` conferem ownership (confirm/declare-return/respond/estimate/financial) |
| **Rotas service_role — cron** | 3 gated por `CRON_SECRET` (401 sem); processam por tenant; não disparáveis por terceiros |
| **Rotas service_role — kiosk** (sem auth) | `validateKioskToken`→tenant; toda query `.eq("tenant_id")`; expõe só KPIs de produção + status de facção (nome+prazo) — **sem faturamento/PII** |
| **Rotas service_role — admin/team** | exigem papel (`users:manage`/`factions:manage`) + tenant; `deactivate` usa cliente de SESSÃO (RLS protege) |
| **`?userId=` (my-plan)** | exige `settings:manage` (operador → 403) E usa cliente de SESSÃO (RLS) → admin não lê outro tenant |
| **Criação de usuário** | `createUser({app_metadata:{tenant_id}})` + profile.tenant_id → **todo novo usuário nasce com tenant no app_metadata** |
| **Funções SECURITY DEFINER** | `auth_tenant_id` (corrigida), `auth_user_role` (só app_metadata), `faction_ledger_apply` (trigger sobre id já validado) |
| **Segredos (git)** | `.env` no gitignore + não rastreado; **zero JWT/connection-string/chave real em todo o histórico**; `.env.example` só placeholders |
| **Injeção** | Supabase client parametrizado (sem string-concat); `ilike` usa `escapeLikePattern` |
| **Bug de data (fuso)** | corrigido e validado (18/07 grava/exibe 18/07) — ver `PENDENCIAS-PRE-DEPLOY.md` |

## 🟡 Itens LOW / recomendações (não bloqueiam)
- **Rate-limit de PIN (5/15min):** mitiga brute-force (PIN 6 díg = 1M combos; 5/15min). É in-memory por instância (serverless) → recomendado migrar para limiter em DB/Redis para garantia global. LOW.
- **Cookie de sessão da facção:** carrega `tokenId` (UUID secreto) em cookie HttpOnly; modelo bearer — depende do token não vazar. Aceitável; considerar assinar o cookie. LOW.

## ⚙️ DECISÕES OPERACIONAIS DO GABRIEL (2) — RESOLVIDAS
1. **Conta `gabrielurgencya@gmail.com` — MANTER FAIL-CLOSED (decisão do Gabriel, 2026-07-15).** O Gabriel NÃO opera por essa conta; ela não precisa de acesso a nenhum tenant. **NÃO definir `app_metadata.tenant_id` nela** — o comportamento seguro (não vê nada) é o desejado e INTENCIONAL. NUNCA usar user_metadata (foi o vetor do exploit).
2. Novos usuários já recebem tenant no app_metadata (confirmado no `team/members` POST) — nenhuma ação necessária.

## 🚀 Estado para deploy (2026-07-15)
- Migration `auth_tenant_id` (fix crítico) **já aplicada no banco de PRODUÇÃO** (Supabase único; via DIRECT_URL na auditoria) — ATIVA. O arquivo da migration vai no commit para histórico.
- Fix `reset-pin` (código) vai no deploy (Vercel).
- **Melhorias PÓS-DEPLOY (LOW, registradas — não bloqueiam):** (a) rate-limit de PIN in-memory → migrar para DB/Redis (garantia global entre instâncias serverless); (b) cookie de sessão da facção (bearer/tokenId) → considerar assinar.

## Migrations / mudanças (sem commit/push)
- `prisma/migrations/20260715150000_auth_tenant_id_no_user_metadata_fallback/` (aplicada + re-testada).
- `src/app/api/team/members/[id]/reset-pin/route.ts` (escopo de tenant + 404).
- Pendência 1 (data): tz.ts + shipments routes + displays.
