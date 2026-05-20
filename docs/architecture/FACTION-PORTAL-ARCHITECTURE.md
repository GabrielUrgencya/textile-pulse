# LISION — Arquitetura do Portal da Faccao

> **Arquiteta:** Aria | **Data:** 2026-05-18 | **Status:** Aprovado
> **Revisao:** Regras de negocio R1-R3 incorporadas por decisao do owner (Gabriel)
> **Dependencias:** ARCHITECTURE-REVIEW-v2.1.md, Schema Prisma v1.0

---

## 1. VISAO GERAL

O Portal da Faccao e um **espelho transparente** — a faccao ve exatamente o que a Liserie ve sobre ela, eliminando assimetria de informacao. E um portal de **leitura e confirmacao**, nao de gestao.

**Principios:**
- A faccao nao cria nada, nao edita nada. Confirma, responde e acompanha.
- Acesso por link unico + PIN de 6 digitos, sem cadastro.
- Mobile-first — abre no celular como qualquer site, instalavel como PWA.
- Zero impacto no sistema existente — namespace completamente isolado.

**O que a faccao NUNCA ve:**
- Dados de outras faccoes
- Informacoes financeiras da Liserie
- OPs que nao passaram por ela
- Configuracoes do sistema
- Dados de operadores/funcionarios

---

## 2. MODELO DE AUTENTICACAO

### 2.1 Padrao Reutilizado

Baseado no `kiosk_tokens` (Story 5.8), adaptado para escrita limitada e autenticacao por PIN.

### 2.2 Nova Tabela: `faction_tokens`

```sql
CREATE TABLE faction_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  faction_id       UUID NOT NULL REFERENCES factions(id),
  token            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  pin_hash         TEXT NOT NULL,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  last_accessed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: apenas admin do tenant gerencia tokens
CREATE POLICY "faction_tokens_admin_only" ON faction_tokens
  FOR ALL USING (tenant_id = auth_tenant_id());

-- Indice para lookup por token
CREATE INDEX idx_faction_tokens_token ON faction_tokens(token) WHERE is_active = true;
```

### 2.3 Fluxo de Acesso

```
1. Admin gera link: liserie.lision.app/portal?token=<uuid>
2. Admin envia link por WhatsApp para a faccao
3. Faccao abre no celular → tela pede PIN de 6 digitos
4. POST /api/faction/auth/login { token, pin }
5. Backend: valida token → valida PIN (bcrypt.compare) → cria session cookie
6. Cookie: HttpOnly, SameSite=Strict, Secure, max-age=30 dias
7. Sessao identifica: tenant_id + faction_id + scope="faction_portal"
```

### 2.4 Middleware: `faction-middleware.ts`

Analogo ao `kiosk-middleware.ts`. Retorna `FactionSession`:

```typescript
export interface FactionSession {
  tenantId: string;
  factionId: string;
  tokenId: string;
  factionName: string;
}
```

### 2.5 Rate Limiting

5 tentativas / 15 min por combinacao IP + token (mesmo padrao de `/api/auth/pin`, Item 3 v2.1).

---

## 3. ALTERACOES NO SCHEMA

### 3.1 `faction_shipments` — 5 campos novos

```sql
ALTER TABLE faction_shipments ADD COLUMN
  faction_confirmed_at       TIMESTAMPTZ,
  faction_estimated_return   DATE,
  faction_estimated_return_at TIMESTAMPTZ,
  reschedule_count           INTEGER NOT NULL DEFAULT 0,
  last_rescheduled_at        TIMESTAMPTZ;
```

| Campo | Proposito | Quem preenche |
|-------|-----------|--------------|
| `faction_confirmed_at` | Quando a faccao confirmou recebimento | Portal da faccao |
| `faction_estimated_return` | Previsao de entrega informada pela faccao | Portal da faccao |
| `faction_estimated_return_at` | Quando informou a previsao | Sistema |
| `reschedule_count` | Contador de reagendamentos (max 2) | Sistema |
| `last_rescheduled_at` | Ultimo reagendamento | Sistema |

### 3.2 `defect_records` — 4 campos novos

```sql
ALTER TABLE defect_records ADD COLUMN
  faction_response          TEXT CHECK (faction_response IN ('CONFIRMED', 'CONTESTED')),
  faction_response_at       TIMESTAMPTZ,
  contestation_reason       TEXT,
  contestation_resolved_at  TIMESTAMPTZ;
```

### 3.3 `notifications` — 1 campo novo

```sql
ALTER TABLE notifications ADD COLUMN
  faction_id UUID REFERENCES factions(id);
```

Permite direcionar notificacoes a uma faccao especifica (nullable, nao quebra existente).

### 3.4 Prisma Schema (modelos atualizados)

```prisma
model FactionToken {
  id             String    @id @default(uuid()) @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  factionId      String    @map("faction_id") @db.Uuid
  token          String    @unique @default(uuid()) @db.Uuid
  pinHash        String    @map("pin_hash")
  name           String
  isActive       Boolean   @default(true) @map("is_active")
  lastAccessedAt DateTime? @map("last_accessed_at") @db.Timestamptz
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  faction Faction @relation(fields: [factionId], references: [id])

  @@map("faction_tokens")
}
```

Adicionar nas relations de `Tenant` e `Faction`:
- `Tenant`: `factionTokens FactionToken[]`
- `Faction`: `tokens FactionToken[]`

Adicionar nos modelos existentes:
- `FactionShipment`: campos `factionConfirmedAt`, `factionEstimatedReturn`, `factionEstimatedReturnAt`, `rescheduleCount`, `lastRescheduledAt`
- `DefectRecord`: campos `factionResponse`, `factionResponseAt`, `contestationReason`, `contestationResolvedAt`
- `Notification`: campo `factionId` + relation `faction Faction?`

---

## 4. REGRAS DE NEGOCIO

### R1 — Contestacao de Defeito: Prazo e Vencimento

**Regra:** O gerente tem **3 dias uteis** para resolver uma contestacao. Se o prazo vencer sem resposta:

1. A contestacao e encerrada **automaticamente a favor da faccao**
2. O defeito permanece no historico (auditoria/qualidade)
3. A deducao financeira e cancelada (`deduction_value` zerado no shipment)
4. `contestation_resolved_at` preenchido automaticamente pelo sistema
5. Gerente recebe notificacao informando vencimento

**Fluxo de status do defeito:**
```
PENDING
  → (faccao confirma)  → status permanece, faction_response = 'CONFIRMED'
  → (faccao contesta)  → faction_response = 'CONTESTED'
      → (gerente resolve em 3 dias uteis) → contestation_resolved_at preenchido
      → (prazo vence)                     → auto-resolvido a favor da faccao
```

**Job de vencimento:**

```sql
-- Rodar diariamente via pg_cron ou Supabase Edge Function agendada
-- Identifica contestacoes vencidas (>3 dias uteis sem resolucao)
SELECT dr.id, dr.lot_id, fs.id as shipment_id, fs.deduction_value
FROM defect_records dr
JOIN faction_shipments fs ON fs.id = dr.shipment_id
WHERE dr.faction_response = 'CONTESTED'
  AND dr.contestation_resolved_at IS NULL
  AND dr.faction_response_at <= now() - interval '3 days'
  -- Nota: calculo de dias uteis deve excluir sabados, domingos e feriados
  -- Implementar funcao business_days_ago(date, days) no backend
```

**Acoes do job:**
1. Zerar `deduction_value` no `faction_shipment`
2. Preencher `contestation_resolved_at = now()` no `defect_record`
3. Criar notificacao para gerente: type=`CONTESTATION_EXPIRED`, severity=`CRITICAL`

**Implementacao do calculo de dias uteis:** Funcao TypeScript em `src/lib/business-days.ts`. Para o piloto, considerar apenas sabados e domingos. Feriados configuráveis por tenant na Fase 2.

### R2 — Notificacao ao Gerente Quando Faccao Contesta

**Trigger:** `PATCH /api/faction/defects/[id]/respond` com `faction_response = 'CONTESTED'`

**3 canais simultaneos:**

#### Canal 1: Notificacao Interna (Fase 1 — obrigatorio)

```typescript
// INSERT em notifications
{
  tenant_id: session.tenantId,
  user_id: gerenteId,  // profile com role GERENTE ou ADMIN
  type: 'DEFECT_CONTESTED',
  title: `Contestacao de Defeito — ${factionName}`,
  message: `A faccao ${factionName} contestou o defeito do lote ${barcode}. Valor em disputa: R$ ${deductionValue}. Prazo para resolver: 3 dias uteis.`,
  severity: 'CRITICAL',
  faction_id: session.factionId
}
```

Visibilidade: badge vermelho no sino + destaque na tela `/quality/defects`.

#### Canal 2: E-mail Transacional (Fase 1 — importante)

**Provedor:** Resend (compatibilidade nativa com Next.js, SDK oficial `resend`).

```typescript
// Destinatario: profiles.email WHERE role IN ('GERENTE', 'ADMIN') AND tenant_id = tenantId
{
  to: gerenteEmail,
  subject: `[LISION] Contestacao de defeito — ${factionName}`,
  // Conteudo:
  // - Nome da faccao
  // - Lote (barcode)
  // - Tipo e severidade do defeito
  // - Motivo da contestacao (contestation_reason)
  // - Foto do defeito (photo_url, se existir)
  // - Valor em disputa
  // - Prazo: 3 dias uteis
  // - Link: liserie.lision.app/quality/defects/[id]
}
```

**Env var:** `RESEND_API_KEY`

#### Canal 3: WhatsApp (Fase 2 — pode atrasar)

**Provedor:** Evolution API (decisao do owner — 2026-05-18).

```
Destinatario: profiles.phone WHERE role IN ('GERENTE', 'ADMIN')
Mensagem: "[LISION] Faccao {nome} contestou o defeito do lote {barcode}
— R$ {valor} em disputa. Voce tem 3 dias uteis para resolver.
Acesse: liserie.lision.app/quality/defects/{id}"
```

**Regra critica:** Se o envio de WhatsApp falhar, NAO bloquear o fluxo. Logar erro no Sentry e seguir. A notificacao interna e o e-mail ja garantem a entrega.

**Env vars:** `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`

#### Modulo de Notificacao

Criar `src/lib/notification-service.ts` com funcao unificada:

```typescript
interface NotificationPayload {
  tenantId: string;
  type: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  factionId?: string;
  channels: ('internal' | 'email' | 'whatsapp')[];
  recipientRoles: ('ADMIN' | 'GERENTE')[];
  metadata?: {
    linkPath?: string;
    photoUrl?: string;
    disputeValue?: number;
  };
}

export async function sendNotification(payload: NotificationPayload): Promise<void>
```

### R3 — Limite de Reagendamentos de Devolucao

**Regra:** Cada `faction_shipment` permite **no maximo 2 reagendamentos** via portal.

#### Primeiro reagendamento (`reschedule_count` 0 → 1)

- Aceita nova data
- Atualiza `expected_return_at` e `faction_estimated_return`
- Incrementa `reschedule_count = 1`
- Registra `last_rescheduled_at = now()`
- Notificacao interna para gerente: severity=`WARNING`
- Mensagem: "Faccao {nome} reagendou a devolucao do lote {barcode} para {nova data}."

#### Segundo reagendamento (`reschedule_count` 1 → 2)

- Aceita nova data
- Atualiza campos acima
- Incrementa `reschedule_count = 2`
- Notificacao interna: severity=`CRITICAL`
- Dispara e-mail E WhatsApp para gerente (mesmo fluxo da R2)
- Mensagem: "ATENCAO — Segunda alteracao de prazo pela Faccao {nome} no lote {barcode}. Devolucao agora prevista para {nova data}."
- Lote entra automaticamente em status `OVERDUE` no dashboard da Liserie

#### Tentativa de terceiro reagendamento (`reschedule_count` >= 2)

- `PATCH /api/faction/returns/[id]/estimate` retorna **HTTP 403**:
  ```json
  { "error": "RESCHEDULE_LIMIT_REACHED", "message": "Limite de reagendamentos atingido. Entre em contato com a Liserie." }
  ```
- No portal: campo de nova data **desaparece**, substituido por texto informativo
- Notificacao critica imediata para gerente: "Faccao {nome} tentou terceiro reagendamento no lote {barcode}. Acao bloqueada. Intervencao manual necessaria."
- Lote permanece visivel no portal como pendente, sem opcao de acao

---

## 5. API ENDPOINTS

Todos sob `/api/faction/*`, autenticados pelo `faction-middleware.ts`.

### 5.1 Autenticacao

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| `POST` | `/api/faction/auth/login` | Valida token + PIN, cria session |
| `POST` | `/api/faction/auth/logout` | Destroi session |

### 5.2 Leitura (GET)

| Endpoint | Tela | Retorno |
|----------|------|---------|
| `/api/faction/summary` | 1 — Inicio | Pecas com voce, prazo, valor a receber, status geral |
| `/api/faction/shipments` | 2 — Lotes | Lotes na faccao (status != RETURNED) |
| `/api/faction/shipments/[id]` | 2 — Detalhe | Detalhes do lote + servico + valor |
| `/api/faction/returns` | 3 — Devolucoes | Pendentes por urgencia |
| `/api/faction/defects` | 4 — Defeitos | Defeitos desta faccao |
| `/api/faction/financial` | 5 — Financeiro | Periodo aberto + historico |
| `/api/faction/financial/[period]` | 5 — Detalhe | Detalhes de um periodo |
| `/api/faction/notifications` | 6 — Notificacoes | Notificacoes da faccao |

### 5.3 Escrita Limitada (PATCH)

| Endpoint | Acao | Validacao |
|----------|------|----------|
| `/api/faction/shipments/[id]/confirm` | Confirmar recebimento | Shipment pertence a faccao, status=SENT |
| `/api/faction/returns/[id]/estimate` | Informar previsao | `reschedule_count < 2`, data futura |
| `/api/faction/defects/[id]/respond` | Confirmar ou contestar | Defeito do shipment desta faccao, sem resposta anterior |
| `/api/faction/notifications/read` | Marcar como lida | IDs pertencem a esta faccao |

### 5.4 Admin (Liserie)

| Endpoint | Acao |
|----------|------|
| `POST /api/admin/faction-tokens` | Gerar token + PIN para faccao |
| `GET /api/admin/faction-tokens` | Listar tokens do tenant |
| `DELETE /api/admin/faction-tokens/[id]` | Revogar token |

---

## 6. SEGURANCA

| Preocupacao | Solucao |
|-------------|---------|
| Isolamento de dados | Queries filtram por `faction_id` da sessao |
| Escrita limitada | Apenas 4 endpoints PATCH, sem POST/DELETE |
| PIN bruteforce | 5 tentativas / 15 min por IP + token |
| Token revogacao | Admin revoga via endpoint (is_active=false) |
| Dados de outros | `WHERE faction_id = session.factionId` em toda query |
| HTTPS | Automatico na Vercel |
| Session | Cookie HttpOnly, SameSite=Strict, Secure, max-age=30 dias |
| CSRF | SameSite=Strict previne |
| XSS | HttpOnly previne roubo de session |

---

## 7. FRONTEND — ROTAS E LAYOUT

### 7.1 Estrutura de Rotas

```
/portal                    — Login (token + PIN)
/portal/                   — Tela 1: Inicio (summary)
/portal/shipments          — Tela 2: Lotes com voce
/portal/shipments/[id]     — Detalhe do lote
/portal/returns            — Tela 3: Devolucoes pendentes
/portal/defects            — Tela 4: Defeitos registrados
/portal/financial          — Tela 5: Financeiro
/portal/notifications      — Tela 6: Notificacoes
```

### 7.2 Layout Group

```
src/app/(portal)/
  layout.tsx              — Layout proprio, sem sidebar da Liserie
  page.tsx                — Login
  (authenticated)/
    layout.tsx            — Layout pos-login com nav bottom mobile
    page.tsx              — Tela 1: Summary
    shipments/
      page.tsx            — Tela 2
      [id]/page.tsx       — Detalhe
    returns/page.tsx      — Tela 3
    defects/page.tsx      — Tela 4
    financial/page.tsx    — Tela 5
    notifications/page.tsx — Tela 6
```

### 7.3 Design

- Mesmo design system OKLCH monochrome do LISION
- Layout simplificado para mobile (sem sidebar, navegacao bottom tabs)
- Numeros grandes na Tela 1 (glanceable em 5 segundos)
- Indicador de status: verde/amarelo/vermelho

### 7.4 PWA

```json
// public/manifest.json
{
  "name": "LISION Portal",
  "short_name": "LISION",
  "display": "standalone",
  "start_url": "/portal",
  "theme_color": "#0d0d0d",
  "background_color": "#0d0d0d"
}
```

### 7.5 Middleware

Adicionar ao `isPublicRoute()`:
```typescript
path.startsWith("/api/faction/") ||
path.startsWith("/portal")
```

---

## 8. INFRAESTRUTURA ADICIONAL

### 8.1 E-mail Transacional

| Item | Decisao |
|------|---------|
| Provedor | **Resend** — SDK nativo para Next.js |
| Pacote | `resend` (npm) |
| Env var | `RESEND_API_KEY` |
| Fase | Fase 1 |

### 8.2 WhatsApp

| Item | Decisao |
|------|---------|
| Provedor | **Evolution API** (decisao do owner) |
| Criterio de escolha | Custo, facilidade de setup, confiabilidade no Brasil |
| Env vars | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` |
| Fase | Fase 2 (pode atrasar sem impacto critico) |
| Fallback | Se falhar, logar no Sentry, nao bloquear fluxo |

### 8.3 Job de Vencimento de Contestacoes

| Item | Decisao |
|------|---------|
| Opcao A | Supabase Edge Function agendada (cron) |
| Opcao B | pg_cron diretamente no Postgres |
| Recomendacao | **Edge Function** — mais facil de debugar e monitorar |
| Frequencia | Diariamente as 08:00 (horario de Brasilia) |
| Fase | Fase 1 (obrigatorio para R1 funcionar) |

### 8.4 Modulo de Notificacao

```
src/lib/notification-service.ts     — Funcao unificada sendNotification()
src/lib/email-service.ts            — Integracao Resend
src/lib/whatsapp-service.ts         — Integracao WhatsApp (Fase 2)
src/lib/business-days.ts            — Calculo de dias uteis
```

---

## 9. IMPACTO NO SISTEMA EXISTENTE

| Componente | Alteracao | Risco |
|-----------|-----------|-------|
| Schema Prisma | 1 tabela nova, 9 campos em 3 tabelas | Baixo — aditivo |
| Middleware | +2 rotas publicas | Baixo |
| API | 17 endpoints novos sob `/api/faction/` e `/api/admin/faction-tokens` | Nenhum — namespace isolado |
| Frontend | Route group `(portal)` separado | Nenhum — nao toca no dashboard |
| Auth | Novo `faction-middleware.ts` | Baixo — padrao kiosk validado |
| RLS | +1 policy | Baixo |
| Notifications | +1 campo nullable `faction_id` | Baixo |
| Infraestrutura | +Resend, +job cron, +WhatsApp (Fase 2) | Medio — dependencias externas |

**Risco geral: BAIXO.** Namespace isolado, alteracoes aditivas.

---

## 10. STORIES SUGERIDAS

| # | Story | Complexidade | Fase | Dependencias |
|---|-------|-------------|------|-------------|
| 1 | Tabela `faction_tokens` + migration + RLS + auth endpoint + middleware | S | 1 | Schema base |
| 2 | Alteracoes schema (shipments + defects + notifications) + migration | S | 1 | Story 1 |
| 3 | Modulo de notificacao + integracao Resend + business-days | M | 1 | — |
| 4 | API endpoints de leitura (summary, shipments, returns, defects, financial, notifications) | M | 1 | Stories 1-2 |
| 5 | API endpoints de escrita (confirm, estimate, respond) + regras R1/R2/R3 | M | 1 | Stories 2-4 |
| 6 | Job de vencimento de contestacoes (Edge Function cron) | S | 1 | Stories 2-3 |
| 7 | Admin: CRUD de faction tokens (gerar, listar, revogar) | S | 1 | Story 1 |
| 8 | Frontend portal — login + layout + 6 telas | L | 1 | Stories 4-5 |
| 9 | PWA manifest + install prompt | S | 2 | Story 8 |
| 10 | Integracao WhatsApp (Evolution API) | M | 2 | Story 3 |

---

## 11. REUSO DE INFRAESTRUTURA

| O que ja existe | Como reusar |
|----------------|-------------|
| `kiosk-middleware.ts` | Padrao para `faction-middleware.ts` |
| `kiosk_tokens` RLS | Padrao para `faction_tokens` RLS |
| Rate limiting `/api/auth/pin` | Mesmo padrao para `/api/faction/auth/login` |
| Design system OKLCH | Identico no portal |
| Componentes shadcn/ui | Reusar no portal |
| `ShipmentStatus` enum | Ja cobre o fluxo |
| `DefectRecord` com `shipment_id` | Join direto para defeitos da faccao |
| `Notification` com `target_role = FACCAO` | Estender com `faction_id` |

---

*Documento produzido por Aria (Architect)*
*Baseline: ARCHITECTURE-REVIEW-v2.1.md + Schema Prisma v1.0*
*Regras de negocio R1-R3 definidas por Gabriel (owner)*
*Data: 2026-05-18*
