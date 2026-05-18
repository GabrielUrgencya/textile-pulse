# LISION — Revisao Arquitetural v2.1

> **Documento de revisao e correcoes sobre ARCHITECTURE.md v2.0**
> Arquiteta: Aria | Data: 2026-05-17 | Status: APROVADO
> Decisoes tomadas em sessao com Gabriel (owner)

---

## RESUMO EXECUTIVO

19 itens identificados na revisao do ARCHITECTURE.md v2.0.
- 9 bloqueadores (impedem deploy)
- 10 alta prioridade (corrigir na Fase 1)
- 2 ja estavam corretos no codigo (documentacao desatualizada)

Todas as decisoes foram tomadas e registradas abaixo.

---

## DECISOES ARQUITETURAIS TOMADAS

### MUDANCA ESTRUTURAL: Frontend separado

**Decisao:** Frontend sera desenvolvido no Lovable (Vite/React) e integrado ao Next.js.
O Next.js serve como backend (API Routes) + host do frontend migrado.
Frontend ja migrado com sucesso: dashboard com design system OKLCH monochrome,
48 componentes shadcn/ui, Tailwind v4.

**ADR-002 atualizado:** Next.js 14 mantido como backend + host. Frontend Vite do Lovable
convertido para Next.js App Router. Decisao pragmatica — reescrever o backend por purismo
tecnico nao justifica o custo.

### MUDANCA DE ESCOPO: Fase 1 = Backend-first

**Decisao:** Fase 1 (1 semana) foca exclusivamente no backend.
Frontend do Lovable ja esta integrado com dados mock.
Integracao frontend-backend vem na sequencia.

---

## ITENS BLOQUEADORES (1-9) — Decisoes

### Item 1: RLS `scan_insert` sem validacao de tenant
- **Severidade:** CRITICO
- **Status:** PENDENTE IMPLEMENTACAO
- **Decisao:** Reescrever policy com validacao de cadeia completa:
```sql
CREATE POLICY "scan_insert" ON scan_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = lot_id
        AND po.tenant_id = auth_tenant_id()
    )
    AND user_id = auth.uid()
  );
```
- **Acao adicional:** Auditar e criar RLS para: defect_records, aduana_validations,
  ops_clock, notifications, faction_shipments. Delegar DDL detalhado ao @data-engineer.

### Item 2: PIN em texto plano
- **Severidade:** MEDIO (documentacao)
- **Status:** JA CORRETO NO CODIGO
- **Evidencia:** `prisma/seed.ts:32-33` usa `bcrypt.hash("1234", 10)`
- **Decisao:** Manter bcrypt. NAO migrar para argon2id — custo/beneficio nao justifica.
  Atualizar ARCHITECTURE.md para documentar que pin_code armazena hash bcrypt.

### Item 3: PIN sem rate limiting
- **Severidade:** CRITICO
- **Status:** PENDENTE IMPLEMENTACAO
- **Decisao:** Endpoint `/api/auth/pin`:
  - 5 tentativas por combinacao IP + tenant em janela de 15 minutos
  - Apos 5 falhas: bloqueio 15 min, HTTP 429
  - Fase 1: rate limiting em memoria (`Map<string, {count, expiry}>`)
  - Fase 2+: migrar para Upstash Redis se necessario
  - Header `X-RateLimit-Remaining` nas respostas

### Item 4: Dupla camada Prisma + Supabase
- **Severidade:** CRITICO
- **Status:** PENDENTE IMPLEMENTACAO
- **Decisao:** Camada unica de acesso ao banco:
  - API Routes: Supabase client autenticado (`createServerClient()` do `@supabase/ssr`)
  - Prisma: EXCLUSIVAMENTE para `prisma generate` (tipos) e `prisma migrate` (migrations)
  - NUNCA usar Prisma em runtime para queries
  - Remover `src/lib/prisma.ts` do runtime da aplicacao
  - ADR-003 atualizado

### Item 5: Campos desnormalizados sem triggers
- **Severidade:** CRITICO
- **Status:** PENDENTE IMPLEMENTACAO
- **Decisao do owner:** OPCAO A — Eliminar campos e computar via query
  - Remover: `produced_quantity`, `stocked_quantity`, `defect_quantity`,
    `discarded_quantity` de `production_orders`
  - Remover: `total_pieces_sent`, `total_pieces_returned`, `total_defects`,
    `defect_rate` de `factions`
  - Computar sempre via query sobre scan_events/defect_records/faction_shipments
  - Performance OK para volume do piloto (<500 lotes/mes)
  - Revisitar na Fase 2+ se volume justificar cache (triggers)

### Item 6: `payment_periods` polimorfismo ambiguo
- **Severidade:** ALTO
- **Status:** PENDENTE IMPLEMENTACAO
- **Decisao:** CHECK constraint imediata (nao separar em duas tabelas):
```sql
ALTER TABLE payment_periods
ADD CONSTRAINT chk_payment_target
CHECK (
  (user_id IS NOT NULL AND faction_id IS NULL) OR
  (user_id IS NULL AND faction_id IS NOT NULL)
);
```

### Item 7: Canal Realtime sem qualificacao de tenant
- **Severidade:** CRITICO
- **Status:** PENDENTE IMPLEMENTACAO
- **Decisao:** Qualificar canal por tenant:
  `supabase.channel('production-updates:{tenantId}')`
  com filtro RLS no Realtime.

### Item 8: TV Dashboard sem autenticacao
- **Severidade:** CRITICO
- **Status:** PENDENTE IMPLEMENTACAO
- **Decisao:** Token de kiosk por tenant:
  - Nova tabela `kiosk_tokens`: `{id, tenant_id, token (UUID), name, scope, is_active}`
  - URL: `liserie.lision.app/tv?token=<uuid>`
  - Middleware valida token, extrai tenant_id, sessao read-only
  - Token gerado pelo ADMIN em configuracoes
  - Sem expiracao automatica, mas revogavel

### Item 9: Vercel Hobby viola ToS comercial
- **Severidade:** CRITICO
- **Status:** PENDENTE DEPLOY
- **Decisao:** Vercel Pro ($20/mes) desde o primeiro deploy.
  Custo irrelevante vs risco de suspensao.

---

## ITENS ALTA PRIORIDADE (10-19) — Decisoes

### Item 10: `lot_status` ENUM hardcoded
- **Decisao:** Manter ENUM para Fase 1 (estagios fixos da Liserie).
  Para SaaS multi-tenant (Fase 2+), derivar status de `current_stage_id` + `stage.type`.

### Item 11: `hourly_rate` em profiles
- **Status:** JA CORRETO NO CODIGO
- **Evidencia:** Campo NAO existe no schema.prisma implementado.
  Existe apenas no diagrama ER do ARCHITECTURE.md.
- **Decisao:** Remover do diagrama ER. Quando necessario, criar tabela
  `employee_compensation` com RLS restrita.

### Item 12: Formato barcode sem validacao
- **Decisao:** Adicionar CHECK constraint:
```sql
ALTER TABLE lots ADD CONSTRAINT chk_barcode_format
CHECK (barcode ~ '^OP-[0-9]{8}-[0-9]{3}-L[0-9]{3}$');
```
  UUID parcial desnecessario — `op_number` ja e unico por tenant.

### Item 13: `meta_coefficient` em dois lugares
- **Decisao:** Fonte da verdade = `reference_targets.meta_coefficient`.
  Na criacao da OP, snapshot para `production_orders.meta_coefficient`.
  Documentar comportamento no endpoint de criacao de OP.

### Item 14: JSONB para `top_producers` e `faction_summary`
- **Decisao:** Fase 1: manter JSONB (rollup de leitura para dashboard).
  ANTES de calculos de pagamento (Fase 2): normalizar em
  `daily_producer_metrics` e `daily_faction_metrics`.

### Item 15: Conflitos de sync offline
- **Decisao:** `scan_events` e append-only, nao ha conflito de evento.
  Conflito real: atualizacao de `lot.status` com scans offline fora de ordem.
  - Server-side: ordenar sync batch por `offline_scanned_at`
  - Flag `conflict_flag = true` no scan_event se status ja avancou
  - Notificacao para coordenador resolver

### Item 16: Calculos de pagamento em PL/pgSQL
- **Decisao:** Mover logica financeira para API Routes em TypeScript.
  `calculate_payment()` e `calculate_allowance()` serao funcoes puras
  em `lib/payments/` com testes unitarios.
  Stored procedures apenas para triggers de contadores (se migrar para Opcao B futuro).

### Item 17: LGPD — soft delete e retencao
- **Decisao:**
  - Fase 1: `deleted_at TIMESTAMPTZ` em `profiles` e `tenants`
  - Fase 2: endpoint `/api/admin/data-export`, politica de retencao
  - Dados operacionais: 5 anos. Dados pessoais: 30 dias apos solicitacao.

### Item 18: Observabilidade zero
- **Decisao:** Antes do go-live:
  - Sentry (`@sentry/nextjs`): error tracking + performance
  - Vercel Analytics (incluso no Pro): Web Vitals
  - UptimeRobot (free tier): monitoramento uptime
  - Axiom para logs estruturados: Fase 2

### Item 19: Roadmap Fase 1
- **Decisao do owner:** Manter prazo de 1 semana.
  Escopo revisado: backend-only (frontend ja integrado do Lovable).
  Foco: auth + scan + dashboard API + etiquetas + RLS auditada.
  Pagamentos, faccoes, aduana, offline robusto → Fase 2.

---

## STACK ATUALIZADA (v2.1)

```
FRONTEND (integrado do Lovable)        BACKEND (Next.js API Routes)
┌────────────────────┐                 ┌──────────────────┐
│ Next.js 14 App     │                 │ Supabase Client  │
│ React 18           │  ──────────►    │ (autenticado)    │
│ Tailwind v4        │  API calls      │ RLS ativo        │
│ shadcn/ui (48)     │                 │ Rate limiting    │
│ Recharts + Motion  │                 ├──────────────────┤
│ Design: OKLCH mono │                 │ Prisma           │
└────────────────────┘                 │ (APENAS tipos +  │
                                       │  migrations)     │
                                       └──────────────────┘
```

| Camada | Tecnologia | Uso |
|--------|-----------|-----|
| Frontend | Next.js 14 + React 18 + Tailwind v4 | UI do Lovable migrada |
| API | Next.js API Routes | Logica server-side |
| Auth | Supabase Auth + PIN bcrypt | Email/senha + PIN rapido |
| DB Access | Supabase client autenticado | UNICA camada de acesso runtime |
| DB Types | Prisma generate | Geracao de tipos TypeScript |
| Migrations | Prisma migrate | Schema versionado |
| Realtime | Supabase Realtime | Canais qualificados por tenant |
| Deploy | Vercel Pro | Frontend + API Routes |
| DB | Supabase Cloud | PostgreSQL + RLS + Auth |
| Monitoring | Sentry + Vercel Analytics | Error tracking + performance |
| Uptime | UptimeRobot | Monitoramento |

---

## CRONOGRAMA FASE 1 — BACKEND ONLY (1 semana)

| Dia | Entrega |
|-----|---------|
| 1-2 | Schema corrigido (itens 1-6, 12, 17), migrations Supabase, RLS completa em todas as tabelas, auth (email + PIN + rate limiting) |
| 3-4 | API Routes: `/api/scan`, `/api/production/orders`, `/api/production/lots`, `/api/print/label`, `/api/dashboard/kpis`, kiosk token |
| 5 | Sentry, testes dos endpoints, deploy Vercel Pro |

**Fora do escopo Fase 1:** Pagamentos, faccoes, aduana, offline-first robusto, relatorios.

---

## CHANGELOG

| Data | Versao | Mudanca |
|------|--------|---------|
| 2026-03-04 | v2.0 | Documento original |
| 2026-05-17 | v2.1 | Revisao arquitetural: 19 itens corrigidos, stack atualizada, frontend Lovable integrado, Prisma removido do runtime, camada unica Supabase client |

---

*— Aria, arquitetando o futuro*
