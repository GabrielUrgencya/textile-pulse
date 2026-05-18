# LISION — Arquitetura Completa do Sistema v2.1

> **Sistema de Rastreamento e Gestao de Producao em Lotes**
> Produto SaaS para industria textil
> Socios: Gabriel Avelino + Fabinho (Liserie)
> Arquiteta: Aria | Data: 2026-05-17 | Versao: 2.1
> Revisao: docs/architecture/ARCHITECTURE-REVIEW-v2.1.md

---

## INDICE

1. [Visao Estrategica](#1-visao-estrategica)
2. [Stack Tecnologica](#2-stack-tecnologica)
3. [Arquitetura de Sistema](#3-arquitetura-de-sistema)
4. [Modelagem de Dados](#4-modelagem-de-dados)
5. [Modulos do Sistema](#5-modulos-do-sistema)
6. [Hardware Integration](#6-hardware-integration)
7. [TV Dashboard (Kiosk Mode)](#7-tv-dashboard-kiosk-mode)
8. [Sistema de Metas e Pagamentos](#8-sistema-de-metas-e-pagamentos)
9. [Seguranca e Multi-Tenancy](#9-seguranca-e-multi-tenancy)
10. [Offline-First](#10-offline-first)
11. [API Design](#11-api-design)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Deploy e Infraestrutura](#13-deploy-e-infraestrutura)
14. [Roadmap Tecnico Faseado](#14-roadmap-tecnico-faseado)
15. [Decisoes Arquiteturais (ADRs)](#15-decisoes-arquiteturais-adrs)
16. [Riscos e Mitigacoes](#16-riscos-e-mitigacoes)

---

## 1. VISAO ESTRATEGICA

### 1.1 O que e o LISION

LISION nao e um projeto para um cliente. E um **produto SaaS** que voces estao construindo juntos como socios. A Liserie (fabrica do Fabinho) e o **piloto** — a primeira fabrica que usa e valida o sistema. O objetivo final e vender para outras fabricas texteis.

```
VISAO DO PRODUTO:
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Fase 1 (Piloto)     Fase 2 (Expansao)    Fase 3      │
│   Liserie             + Faccoes            SaaS         │
│                       + Inspeccao                       │
│   ┌──────────┐        ┌──────────┐        ┌─────────┐  │
│   │Rastreio  │        │Terceiros │        │ERP      │  │
│   │Producao  │───────►│Inspeccao │───────►│Completo │  │
│   │Dashboard │        │Allowance │        │Multi-   │  │
│   │Etiquetas │        │Pagamento │        │Tenant   │  │
│   └──────────┘        └──────────┘        └─────────┘  │
│                                                         │
│   1 fabrica            1 fabrica           N fabricas   │
│   10 usuarios          35 usuarios         ilimitado    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Problema que Resolve

| Dor | Impacto | Como LISION resolve |
|-----|---------|---------------------|
| Pecas somem no processo | R$6.000-12.000/mes de perda | Bipagem por lote em cada etapa |
| ERP (Hunter) trava OP por defeitos | Producao para | Sub-lotes + entrada parcial |
| Sem visibilidade da producao | Decisoes cegas | Dashboard real-time na TV |
| Faccoes atrasam sem alerta | Perda de vendas | Alertas automaticos + cores |
| Nao sabe quem e responsavel | Sem accountability | Audit trail por usuario |
| Hunter dificil de integrar/inflexivel | Dependencia de terceiro | **Substituir o Hunter por completo** |
| Pagamento de terceiros impreciso | Calculo manual | Sistema de metas + deducao por defeito |

### 1.3 O que LISION NAO e (ainda)

Na Fase 1, LISION **nao substitui** o ERP (Hunter/Bling). Ele complementa.
A substituicao vem na Fase 3, quando o sistema ja estiver maduro e validado.

```
FASE 1 (agora):     LISION + Hunter + Bling (coexistem)
FASE 2 (30-60d):    LISION + Bling (Hunter eliminado)
FASE 3 (futuro):    LISION como ERP unico (Bling eliminado)
```

### 1.4 Principios Arquiteturais

| Principio | Por que |
|-----------|---------|
| **SaaS-First** | Multi-tenant desde dia 1. Cada fabrica = 1 tenant isolado |
| **Offline-First** | Fabrica pode ter Wi-Fi instavel. Bipagem NUNCA para |
| **Event-Sourced** | Cada bipagem e imutavel. Historico completo para auditoria |
| **Mobile-Responsive** | Tablet no chao de fabrica, TV no centro, notebook no escritorio |
| **Progressive** | Fase 1 em 1 semana (piloto). Complexidade adicionada em fases |
| **Barcode por Lote** | Cada LOTE recebe etiqueta. NAO cada peca individual |
| **Substituicao Gradual** | Hunter sai antes. Bling depois. Zero big-bang migration |

---

## 2. STACK TECNOLOGICA

### 2.1 Stack Definida

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LISION STACK v2                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FRONTEND                   BACKEND (BaaS)         INFRA            │
│  ┌────────────────┐         ┌──────────────┐      ┌─────────────┐  │
│  │ Next.js 14     │         │ Supabase     │      │ Vercel       │  │
│  │ TypeScript     │ ◄─────► │  - Auth      │      │ (Frontend +  │  │
│  │ Tailwind CSS   │         │  - PostgreSQL│      │  API Routes) │  │
│  │ Prisma ORM     │         │  - Realtime  │      ├─────────────┤  │
│  │ Framer Motion  │         │  - Edge Fn   │      │ Supabase     │  │
│  │ TanStack Query │         │  - Storage   │      │ Cloud        │  │
│  │ Zustand        │         │  - RLS       │      │ (Database +  │  │
│  │ Recharts       │         │  - pg_cron   │      │  Realtime)   │  │
│  └────────────────┘         └──────────────┘      └─────────────┘  │
│                                                                     │
│  HARDWARE                   IMPRESSAO              OFFLINE          │
│  ┌────────────────┐         ┌──────────────┐      ┌─────────────┐  │
│  │ Tomate USB     │         │ Zebra GC420t │      │ Service      │  │
│  │ Barcode Reader │         │ ZPL Protocol │      │ Worker       │  │
│  │ (HID Keyboard  │         │ 203 DPI      │      │ IndexedDB    │  │
│  │  Wedge Mode)   │         │ USB + Serial │      │ (Dexie.js)   │  │
│  ├────────────────┤         └──────────────┘      │ Background   │  │
│  │ TV Display     │                                │ Sync         │  │
│  │ (HDMI/Browser  │                                └─────────────┘  │
│  │  Kiosk Mode)   │                                                 │
│  └────────────────┘                                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Justificativas

| Tecnologia | Por que? |
|------------|----------|
| **Next.js 14** | SSR para marketing pages (futuro SaaS). API Routes para logica server-side. Middleware para auth. App Router com layouts |
| **TypeScript** | Tipagem forte. Menos bugs. Autocomplete. Supabase gera types |
| **Prisma** | Type-safe DB access. Migrations versionadas. Funciona com Supabase PostgreSQL. Schema-first |
| **Tailwind CSS** | Produtividade. Design system consistente. Responsivo nativo |
| **Framer Motion** | Animacoes fluidas no dashboard (progresso, transicoes de tela). Impacto visual na TV |
| **Supabase** | Auth + DB + Realtime + Edge Functions. Free tier para piloto. PostgreSQL portavel |
| **TanStack Query** | Cache inteligente, retry, offline mutations, background refetch |
| **Zustand** | Estado UI leve (sidebar, modais, tema). Mais simples que Redux |
| **Recharts** | Graficos para dashboard. React-native. Customizavel |
| **Dexie.js** | IndexedDB wrapper para offline queue. API simples e tipada |

### 2.3 Por que Next.js e nao Vite + React?

| Fator | Next.js 14 | Vite + React |
|-------|-----------|-------------|
| API Routes (server-side) | Nativo | Precisa de backend separado |
| SSR/SSG (landing page SaaS) | Nativo | Nao tem |
| Middleware (auth, redirect) | Nativo | Manual |
| Image optimization | Nativo | Manual |
| Prisma integration | Nativo (API Routes) | Precisa de Express/serverless |
| Deploy Vercel | First-class | Funciona mas sem otimizacoes |
| **SaaS-ready** | **Sim** | **Precisa de muito mais trabalho** |

---

## 3. ARQUITETURA DE SISTEMA

### 3.1 Visao Geral

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USUARIOS                                    │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────┐  ┌──────────┐  │
│  │ Fabinho │  │ Karen   │  │ Rodrigo  │  │Faccao│  │ TV       │  │
│  │ Admin   │  │ Gerente │  │ Operador │  │Extern│  │ Kiosk    │  │
│  │ Notebook│  │ Tablet  │  │ Tablet+  │  │ App  │  │ Browser  │  │
│  │         │  │         │  │ Tomate   │  │      │  │ FullScr  │  │
│  └────┬────┘  └────┬────┘  └────┬─────┘  └──┬───┘  └────┬─────┘  │
│       │            │            │            │            │         │
│       └────────────┴────────────┴──────┬─────┴────────────┘         │
│                                        │                            │
│                                   HTTPS / WSS                       │
│                                        │                            │
│  ┌─────────────────────────────────────▼─────────────────────────┐  │
│  │                     VERCEL (Edge Network)                      │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │ Next.js 14 Application                                   │ │  │
│  │  │                                                          │ │  │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐  │ │  │
│  │  │  │ Pages (SSR)  │ │ API Routes   │ │ Middleware       │  │ │  │
│  │  │  │ - Dashboard  │ │ - /api/scan  │ │ - Auth check     │  │ │  │
│  │  │  │ - Producao   │ │ - /api/lots  │ │ - Role check     │  │ │  │
│  │  │  │ - Faccoes    │ │ - /api/print │ │ - Tenant check   │  │ │  │
│  │  │  │ - Aduana     │ │ - /api/sync  │ │ - Rate limit     │  │ │  │
│  │  │  │ - TV Mode    │ │ - /api/erp   │ │                  │  │ │  │
│  │  │  │ - Settings   │ │ - /api/pay   │ │                  │  │ │  │
│  │  │  └──────────────┘ └──────┬───────┘ └─────────────────┘  │ │  │
│  │  └──────────────────────────┼───────────────────────────────┘ │  │
│  └─────────────────────────────┼─────────────────────────────────┘  │
│                                │                                    │
│  ┌─────────────────────────────▼─────────────────────────────────┐  │
│  │                     SUPABASE CLOUD                             │  │
│  │                                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │ Auth     │  │PostgreSQL│  │ Realtime │  │ Edge Funct.  │  │  │
│  │  │ - Email  │  │ - 30+    │  │ - Channels│ │ - Cron jobs  │  │  │
│  │  │ - Magic  │  │   tables │  │ - Broadc. │ │ - Overdue    │  │  │
│  │  │   Link   │  │ - RLS    │  │ - Presence│ │   check      │  │  │
│  │  │ - MFA    │  │ - Prisma │  │           │ │ - Metrics    │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │  │
│  │                                                                │  │
│  │  ┌──────────┐  ┌──────────────────────────────────────────┐   │  │
│  │  │ Storage  │  │ Database Functions (PL/pgSQL)            │   │  │
│  │  │ - Fotos  │  │ - validate_scan()                        │   │  │
│  │  │ - PDFs   │  │ - calculate_allowance()                  │   │  │
│  │  │ - Labels │  │ - calculate_payment()                    │   │  │
│  │  └──────────┘  │ - check_faction_deadlines()              │   │  │
│  │                │ - generate_daily_metrics()                │   │  │
│  │                └──────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ FUTURO (Fase 3) - Integracoes                                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │  │
│  │  │ Bling API│  │ Shopee   │  │ ML       │  │ NF-e         │ │  │
│  │  │ (temp)   │  │ (market) │  │ (market) │  │ (fiscal)     │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Fluxo de Bipagem (Lote)

```
Operador bipa LOTE no Tomate USB (conectado ao tablet/notebook)
         │
         ▼
┌──────────────────────┐
│  Next.js Client      │
│  Input field captura  │
│  barcode via HID      │
│  (keyboard wedge)     │
└──────────┬───────────┘
           │
     ┌─────▼──────┐
     │  Online?   │
     │            │
     │  SIM ──────┼───────────────────────┐
     │  NAO ──┐   │                       │
     └────────┼───┘                       │
              │                           │
   ┌──────────▼──────────┐      ┌─────────▼──────────┐
   │  IndexedDB          │      │  API Route          │
   │  Fila Offline       │      │  POST /api/scan     │
   │  {barcode, stage,   │      │                     │
   │   user, timestamp}  │      │  1. Valida barcode  │
   └──────────┬──────────┘      │  2. Verifica stage  │
              │                 │  3. Insert evento   │
       Sync quando              │  4. Atualiza lote   │
       voltar online            │  5. Broadcast RT    │
              │                 └─────────┬───────────┘
              └───────────────────────────┤
                                          │
                              ┌────────────▼────────────┐
                              │  Supabase Realtime      │
                              │  Broadcast para:        │
                              │  - TV Dashboard         │
                              │  - Admin Dashboard      │
                              │  - Alertas de faccao    │
                              └─────────────────────────┘
```

---

## 4. MODELAGEM DE DADOS

### 4.1 Mudanca Fundamental: Barcode por LOTE

Na v1 da arquitetura, cada PECA tinha um barcode. Agora, **cada LOTE tem um barcode**.

```
ANTES (v1):                          AGORA (v2):
OP1234-L001-001  (peca 1)           OP1234-L001  (lote inteiro, 150 pecas)
OP1234-L001-002  (peca 2)           OP1234-L002  (lote inteiro, 150 pecas)
OP1234-L001-003  (peca 3)           OP1234-L003  (lote inteiro, 200 pecas)
...                                  ...
OP1234-L001-150  (peca 150)

Impacto:
- Menos etiquetas impressas (1 por lote vs 1 por peca)
- Scan mais rapido (1 bip por lote, nao 150)
- Rastreio por lote, nao por peca individual
- Defeitos registrados com quantidade (ex: "3 pecas com defeito no lote L001")
- Mais simples de operar para os 35 usuarios
```

### 4.2 Diagrama ER

```
┌──────────────────┐
│  tenants         │  (Multi-tenant: cada fabrica = 1 tenant)
├──────────────────┤
│  id (PK)         │
│  name            │  -- "Liserie", "Fabrica X"...
│  slug            │  -- "liserie" (URL: liserie.lision.app)
│  settings (JSONB)│  -- configs gerais
│  allowance_target│  -- 0.0020 (0.20%)
│  created_at      │
└────────┬─────────┘
         │ 1:N
         │
┌────────▼─────────┐    ┌────────────────────┐
│  profiles        │    │  roles_permissions │
├──────────────────┤    ├────────────────────┤
│  id (PK = auth)  │    │  role             │
│  tenant_id (FK)  │    │  can_view_dashboard│
│  full_name       │    │  can_create_op     │
│  phone           │    │  can_scan          │
│  role            │    │  can_manage_factions│
│  sector          │    │  can_approve_discard│
│  hourly_rate     │    │  can_manage_users  │
│  is_active       │    │  can_view_reports  │
│  pin_code        │    │  can_view_payments │
└──────────────────┘    └────────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ production_orders│    │  lots            │    │ scan_events      │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ id (PK)          │◄───│ po_id (FK)       │◄───│ lot_id (FK)      │
│ tenant_id (FK)   │    │ barcode (UNIQUE) │    │ stage_id (FK)    │
│ op_number        │    │ lot_number       │    │ user_id (FK)     │
│ product_name     │    │ quantity         │    │ event_type       │
│ reference        │    │ current_stage_id │    │ scanned_at       │
│ total_qty        │    │ status           │    │ quantity_ok      │
│ meta_coefficient │    │ destination      │    │ quantity_defect  │
│ status           │    │ created_at       │    │ metadata (JSONB) │
│ erp_ref          │    └──────────────────┘    │ is_offline_sync  │
│ created_at       │                            │ created_at       │
└──────────────────┘                            └──────────────────┘

┌──────────────────┐    ┌──────────────────────┐
│ stages           │    │ faction_shipments    │
├──────────────────┤    ├──────────────────────┤
│ id (PK)          │    │ id (PK)              │
│ tenant_id (FK)   │    │ faction_id (FK)      │
│ name             │    │ lot_id (FK)          │
│ display_name     │    │ driver_id (FK)       │
│ order_index      │    │ quantity_sent        │
│ type             │    │ quantity_returned    │
│ is_external      │    │ quantity_defective   │
│ expected_hours   │    │ sent_at              │
└──────────────────┘    │ expected_return_at   │
                        │ actual_return_at     │
┌──────────────────┐    │ status               │
│ factions         │    │ payment_value        │
├──────────────────┤    │ deduction_value      │
│ id (PK)          │    └──────────────────────┘
│ tenant_id (FK)   │
│ name             │    ┌──────────────────────┐
│ type             │    │ defect_records       │
│ contact_name     │    ├──────────────────────┤
│ contact_phone    │    │ id (PK)              │
│ price_per_piece  │    │ lot_id (FK)          │
│ rating           │    │ quantity             │
│ is_active        │    │ defect_type          │
└──────────────────┘    │ severity             │
                        │ description          │
┌──────────────────┐    │ detected_by (FK)     │
│ drivers          │    │ photo_url            │
├──────────────────┤    │ resolution           │
│ id (PK)          │    │ resolved_quantity    │
│ tenant_id (FK)   │    │ status               │
│ name             │    └──────────────────────┘
│ phone            │
│ vehicle_plate    │    ┌──────────────────────┐
└──────────────────┘    │ payment_periods      │
                        ├──────────────────────┤
┌──────────────────┐    │ id (PK)              │
│ daily_metrics    │    │ tenant_id (FK)       │
├──────────────────┤    │ user_id (FK)         │
│ id (PK)          │    │ period_start         │
│ tenant_id (FK)   │    │ period_end           │
│ date             │    │ target_quantity      │
│ total_produced   │    │ actual_quantity      │
│ total_stocked    │    │ target_percentage    │
│ total_defects    │    │ base_payment         │
│ total_lost       │    │ deductions           │
│ allowance_rate   │    │ final_payment        │
│ target_met (%)   │    │ status               │
│ top_producers    │    └──────────────────────┘
│ stage_times      │
│ faction_summary  │    ┌──────────────────────┐
└──────────────────┘    │ audit_log            │
                        ├──────────────────────┤
┌──────────────────┐    │ id (PK)              │
│ notifications    │    │ tenant_id (FK)       │
├──────────────────┤    │ user_id (FK)         │
│ id (PK)          │    │ action               │
│ tenant_id (FK)   │    │ entity_type          │
│ user_id (FK)     │    │ entity_id            │
│ target_role      │    │ details (JSONB)      │
│ type             │    │ ip_address           │
│ title            │    │ created_at           │
│ message          │    └──────────────────────┘
│ severity         │
│ read_at          │    ┌──────────────────────┐
│ created_at       │    │ ops_clock            │
└──────────────────┘    ├──────────────────────┤
                        │ id (PK)              │
                        │ driver_id (FK)       │
                        │ arrived_at           │
                        │ loading_started_at   │
                        │ loading_ended_at     │
                        │ departed_at          │
                        └──────────────────────┘
```

### 4.3 Formato do Barcode (por Lote)

```
Formato: {OP_NUMBER}-{LOT_SEQ}
Exemplo: OP1234-L001

Onde:
  OP1234  = Numero da OP Mae
  L001    = Lote sequencial

Tipo: Code128 (alta densidade, alfanumerico)

Etiqueta (Zebra GC420t — 40mm x 30mm):
┌────────────────────────────┐
│  OP1234-L001               │
│  |||||||||||||||||||||||||  │  ← Code128
│  Conj. Renda Preta CR-001  │
│  Lote 001 | 150 pecas      │
│  Corte: 10/03 | Rodrigo    │
└────────────────────────────┘
```

### 4.4 Schema SQL (Tabelas Criticas)

```sql
-- ===== ENUMS =====
CREATE TYPE lot_status AS ENUM (
  'CREATED', 'IN_CUT', 'IN_TRIMS',
  'IN_PRODUCTION', 'AT_FACTION',
  'IN_FINISHING', 'IN_CLEANING',
  'IN_QUALITY', 'IN_PACKING',
  'IN_STOCK', 'PARTIALLY_STOCKED'
);

CREATE TYPE scan_event_type AS ENUM (
  'STAGE_IN', 'STAGE_OUT',
  'FACTION_SEND', 'FACTION_RECEIVE', 'FACTION_RETURN',
  'DEFECT_DETECTED', 'REWORK_COMPLETE',
  'ADUANA_CHECK', 'STOCK_ENTRY', 'DISCARD'
);

CREATE TYPE user_role AS ENUM (
  'ADMIN', 'GERENTE', 'COORDENADOR', 'OPERADOR', 'FACCAO'
);

CREATE TYPE alert_color AS ENUM ('GREEN', 'AMBER', 'RED');
CREATE TYPE defect_type AS ENUM ('COSTURA', 'TECIDO', 'AVIAMENTO', 'OUTRO');
CREATE TYPE defect_severity AS ENUM ('LEVE', 'MEDIO', 'GRAVE');
CREATE TYPE shipment_status AS ENUM (
  'PREPARING', 'SENT', 'RECEIVED_BY_FACTION',
  'PARTIALLY_RETURNED', 'RETURNED', 'OVERDUE'
);

-- ===== CORE TABLES =====

-- Multi-tenant: cada fabrica
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE, -- liserie.lision.app
  logo_url TEXT,
  settings JSONB DEFAULT '{
    "allowance_target": 0.0020,
    "daily_target": 500,
    "weekly_target": 2500,
    "monthly_target": 20000,
    "currency": "BRL",
    "timezone": "America/Sao_Paulo",
    "work_hours_per_day": 8,
    "work_days_per_week": 5.5
  }',
  subscription_plan TEXT DEFAULT 'pilot', -- pilot | starter | pro | enterprise
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role user_role NOT NULL DEFAULT 'OPERADOR',
  sector TEXT, -- 'CORTE', 'COSTURA', 'QUALIDADE', etc
  pin_code TEXT, -- bcrypt hash do PIN de 4 digitos (NUNCA texto plano)
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Etapas configuraveis por tenant
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  name TEXT NOT NULL, -- identificador interno
  display_name TEXT NOT NULL, -- nome visivel
  order_index INTEGER NOT NULL,
  type TEXT NOT NULL, -- INTERNAL | EXTERNAL | QUALITY | PACKING | STOCK
  is_mandatory BOOLEAN DEFAULT true,
  expected_duration_hours DECIMAL(6,2),
  color TEXT, -- cor no dashboard
  icon TEXT, -- icone no dashboard
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, order_index)
);

-- Etapas DEFAULT para Liserie (seed):
-- 1. Corte → 2. Aviamentos → 3. Producao/Faccao → 4. Travete
-- → 5. Limpeza → 6. Conferencia → 7. Embalagem → 8. Estoque

-- Ordens de Producao (OP Mae)
CREATE TABLE production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  op_number TEXT NOT NULL,
  product_name TEXT NOT NULL,
  reference TEXT, -- REF 1002, CR-001, etc
  description TEXT,
  total_quantity INTEGER NOT NULL,
  produced_quantity INTEGER DEFAULT 0, -- somatoria dos lotes
  stocked_quantity INTEGER DEFAULT 0,
  defect_quantity INTEGER DEFAULT 0,
  discarded_quantity INTEGER DEFAULT 0,
  meta_coefficient DECIMAL(4,2) DEFAULT 1.0, -- REF 1002=1.2, REF 1027=2.0
  status TEXT DEFAULT 'OPEN', -- OPEN | IN_PRODUCTION | COMPLETED | CLOSED
  erp_reference TEXT,
  priority INTEGER DEFAULT 0, -- 0=normal, 1=urgente, 2=critico
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, op_number)
);

-- Lotes (subdivisao da OP Mae — ENTIDADE CENTRAL DE RASTREIO)
CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES production_orders(id) NOT NULL,
  barcode TEXT NOT NULL UNIQUE, -- OP1234-L001
  lot_number TEXT NOT NULL, -- L001
  quantity INTEGER NOT NULL, -- pecas neste lote
  quantity_ok INTEGER DEFAULT 0, -- pecas sem defeito
  quantity_defect INTEGER DEFAULT 0, -- pecas com defeito
  quantity_stocked INTEGER DEFAULT 0, -- ja no estoque
  quantity_discarded INTEGER DEFAULT 0, -- descartadas
  current_stage_id UUID REFERENCES stages(id),
  status lot_status DEFAULT 'CREATED',
  destination TEXT, -- 'INTERNAL' | nome da faccao
  current_holder_id UUID REFERENCES profiles(id),
  entered_current_stage_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(po_id, lot_number)
);

CREATE INDEX idx_lots_barcode ON lots(barcode);
CREATE INDEX idx_lots_status ON lots(status);
CREATE INDEX idx_lots_stage ON lots(current_stage_id);

-- Scan Events (APPEND-ONLY — cada bipagem e um evento imutavel)
CREATE TABLE scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES lots(id) NOT NULL,
  stage_id UUID REFERENCES stages(id),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  event_type scan_event_type NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity_scanned INTEGER, -- pecas neste scan
  quantity_ok INTEGER,
  quantity_defect INTEGER,
  device_info TEXT, -- info do dispositivo
  metadata JSONB DEFAULT '{}', -- notas, observacoes
  is_offline_sync BOOLEAN DEFAULT false,
  offline_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scans_lot ON scan_events(lot_id);
CREATE INDEX idx_scans_date ON scan_events(scanned_at);
CREATE INDEX idx_scans_user ON scan_events(user_id);
CREATE INDEX idx_scans_type ON scan_events(event_type);

-- Faccoes
CREATE TABLE factions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- COSTURA | LIMPEZA | ACABAMENTO | TRAVETE
  contact_name TEXT,
  contact_phone TEXT,
  address TEXT,
  price_per_piece DECIMAL(10,2), -- valor pago por peca
  avg_delivery_days INTEGER DEFAULT 7,
  total_pieces_sent INTEGER DEFAULT 0,
  total_pieces_returned INTEGER DEFAULT 0,
  total_defects INTEGER DEFAULT 0,
  defect_rate DECIMAL(6,4) DEFAULT 0,
  rating DECIMAL(3,1) DEFAULT 5.0, -- 1.0 a 5.0
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Envios para Faccao
CREATE TABLE faction_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faction_id UUID REFERENCES factions(id) NOT NULL,
  lot_id UUID REFERENCES lots(id) NOT NULL,
  driver_id UUID REFERENCES drivers(id),
  quantity_sent INTEGER NOT NULL,
  quantity_returned INTEGER DEFAULT 0,
  quantity_defective INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT now(),
  expected_return_at TIMESTAMPTZ NOT NULL,
  actual_return_at TIMESTAMPTZ,
  sent_by UUID REFERENCES profiles(id),
  received_by UUID REFERENCES profiles(id),
  status shipment_status DEFAULT 'PREPARING',
  payment_value DECIMAL(10,2), -- valor a pagar (qty * price_per_piece)
  deduction_value DECIMAL(10,2) DEFAULT 0, -- deducao por defeitos
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Defeitos (registrados por lote)
CREATE TABLE defect_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES lots(id) NOT NULL,
  shipment_id UUID REFERENCES faction_shipments(id), -- se veio de faccao
  quantity INTEGER NOT NULL DEFAULT 1,
  defect_type defect_type NOT NULL,
  severity defect_severity NOT NULL,
  description TEXT,
  photo_url TEXT,
  detected_by UUID REFERENCES profiles(id) NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolved_quantity INTEGER DEFAULT 0,
  discarded_quantity INTEGER DEFAULT 0,
  resolution TEXT, -- CONSERTADO | DESCARTADO | PARCIAL
  status TEXT DEFAULT 'PENDING', -- PENDING | IN_PROGRESS | RESOLVED
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Motoristas
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_plate TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Aduana Validations
CREATE TABLE aduana_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES lots(id) NOT NULL,
  shipment_id UUID REFERENCES faction_shipments(id),
  driver_id UUID REFERENCES drivers(id),
  scanned_by UUID REFERENCES profiles(id) NOT NULL,
  alert_color alert_color NOT NULL,
  alert_reason TEXT,
  alert_ignored BOOLEAN DEFAULT false,
  ignore_reason TEXT,
  scanned_at TIMESTAMPTZ DEFAULT now()
);

-- OpsClock
CREATE TABLE ops_clock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  shipment_id UUID REFERENCES faction_shipments(id),
  arrived_at TIMESTAMPTZ NOT NULL,
  loading_started_at TIMESTAMPTZ,
  loading_ended_at TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== SISTEMA DE METAS E PAGAMENTOS =====

-- Tabela de metas por referencia
CREATE TABLE reference_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  reference TEXT NOT NULL, -- REF 1002
  meta_coefficient DECIMAL(4,2) NOT NULL, -- 1.2
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, reference)
);

-- Periodos de pagamento (mensal)
CREATE TABLE payment_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  user_id UUID REFERENCES profiles(id), -- NULL = faccao
  faction_id UUID REFERENCES factions(id), -- NULL = funcionario
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_quantity INTEGER,
  actual_quantity INTEGER DEFAULT 0,
  target_percentage DECIMAL(5,2) DEFAULT 0, -- ex: 77.4%
  base_payment DECIMAL(10,2), -- valor base (100% da meta)
  deductions DECIMAL(10,2) DEFAULT 0, -- deducoes por defeito
  bonuses DECIMAL(10,2) DEFAULT 0, -- bonus por performance
  final_payment DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'OPEN', -- OPEN | CALCULATED | APPROVED | PAID
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Regras de pagamento por faixa de meta
CREATE TABLE payment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  min_percentage DECIMAL(5,2) NOT NULL, -- 75.00
  max_percentage DECIMAL(5,2) NOT NULL, -- 99.99
  payment_value DECIMAL(10,2) NOT NULL, -- R$ 150.00
  description TEXT, -- "75% da meta"
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed para Liserie:
-- 100% meta = R$ 200
-- 75% meta = R$ 150
-- 50% meta = R$ 100
-- < 50%    = R$ 0

-- ===== METRICAS E AUDITORIA =====

-- Metricas diarias (rollup pre-calculado)
CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  date DATE NOT NULL,
  total_produced INTEGER DEFAULT 0,
  total_stocked INTEGER DEFAULT 0,
  total_in_rework INTEGER DEFAULT 0,
  total_lost INTEGER DEFAULT 0,
  allowance_rate DECIMAL(6,4) DEFAULT 0,
  daily_target INTEGER,
  target_percentage DECIMAL(5,2),
  avg_time_per_stage JSONB DEFAULT '{}',
  top_producers JSONB DEFAULT '[]',
  faction_summary JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, date)
);

-- Audit log (APPEND-ONLY)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);

-- Notificacoes
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  user_id UUID REFERENCES profiles(id),
  target_role user_role,
  type TEXT NOT NULL, -- FACTION_OVERDUE | DEFECT_FOUND | ALLOWANCE_EXCEEDED | META_UPDATE
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'INFO', -- INFO | WARNING | CRITICAL
  entity_type TEXT,
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. MODULOS DO SISTEMA

### 5.1 Mapa de Modulos por Fase

```
FASE 1 (Piloto - 1 semana)
├── M1: Ordens de Producao (OP Mae + Sub-Lotes)
├── M2: Dashboard de Producao (real-time)
├── M3: TV Dashboard (Kiosk Mode)
├── M4: Bipagem por Lote (Tomate USB)
├── M5: Impressao de Etiquetas (Zebra GC420t / ZPL)
├── M6: Controle de Acesso (perfis hierarquicos + PIN)
└── M7: Gestao de Retrabalho (defeitos por lote)

FASE 2 (30-60 dias)
├── M8: Gestao de Faccoes/Terceirizados
├── M9: App do Terceirizado (acesso limitado)
├── M10: Inspeccao Visual (verde/laranja/vermelho)
├── M11: Allowance (taxa de perda)
├── M12: Rastreio completo da cadeia
├── M13: Sistema de Metas e Pagamentos
├── M14: Notificacoes (defeitos para terceirizados)
└── M15: Aduana + OpsClock

FASE 3 (Longo prazo)
├── M16: ERP Basico (cadastro produtos, estoque, compras)
├── M17: Financeiro (contas a pagar/receber)
├── M18: Integracao Bling (temporaria)
├── M19: Integracao Marketplaces (Shopee, ML)
├── M20: NF-e / Fiscal
├── M21: Multi-tenant Admin (painel SaaS)
├── M22: Onboarding self-service
└── M23: Billing/Assinatura
```

### 5.2 Telas por Modulo (Fase 1)

```
/login                    -- Login com email/senha ou PIN rapido
/dashboard               -- Dashboard principal (admin/gerente)
/tv                      -- TV Dashboard (kiosk mode, auto-refresh)
/producao                -- Lista de OPs
/producao/[op_id]        -- Detalhe da OP + lotes
/producao/novo           -- Criar nova OP
/scan                    -- Tela de bipagem (operador)
/scan/lote/[barcode]     -- Detalhe pos-bipagem
/retrabalho              -- Fila de retrabalho
/configuracoes           -- Configuracoes gerais
/configuracoes/usuarios  -- Gestao de usuarios
/configuracoes/etapas    -- Configurar etapas
/configuracoes/metas     -- Configurar metas e coeficientes
```

---

## 6. HARDWARE INTEGRATION

### 6.1 Tomate USB Barcode Reader

```
Tipo: Leitor 1D/2D USB
Modo: HID Keyboard Wedge (padrao de fabrica)
Conexao: USB no tablet/notebook
Comportamento: Age como teclado — ao bipar, "digita" o codigo e pressiona Enter

Como funciona no sistema:
1. Tela de bipagem aberta no tablet/notebook
2. Cursor no input field (auto-focus)
3. Operador aponta o Tomate para a etiqueta do lote
4. Tomate le o barcode e "digita" OP1234-L001 + Enter
5. Sistema processa o scan automaticamente
6. Feedback visual: verde (OK) ou vermelho (erro)
7. Som de confirmacao (beep)
```

```typescript
// Hook para capturar leitura do Tomate USB (Keyboard Wedge)
export function useTomate(onScan: (barcode: string) => void) {
  const bufferRef = useRef('');
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Prevenir que o scan va para outros inputs
      if (e.target instanceof HTMLInputElement &&
          e.target.id !== 'scan-input') return;

      if (timerRef.current) clearTimeout(timerRef.current);

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 4) { // barcode minimo
          e.preventDefault();
          onScan(bufferRef.current);
          bufferRef.current = '';
        }
        return;
      }

      // Caractere imprimivel
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }

      // Tomate envia tudo em < 50ms.
      // Se demorar > 80ms, e digitacao humana — resetar
      timerRef.current = setTimeout(() => {
        bufferRef.current = '';
      }, 80);
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onScan]);
}
```

### 6.2 Zebra GC420t — Impressao ZPL

```
Modelo: Zebra GC420t
Resolucao: 203 DPI
Conexao: USB (+ opcao Serial/Ethernet com acessorio)
Linguagem: ZPL (Zebra Programming Language)
Largura etiqueta: 40-100mm
```

```typescript
// Gerar ZPL para etiqueta de lote
function generateLotLabel(lot: {
  barcode: string;
  productName: string;
  reference: string;
  quantity: number;
  lotNumber: string;
  cutDate: string;
  operator: string;
}): string {
  return `
^XA
^FO20,20^A0N,28,28^FD${lot.barcode}^FS
^FO20,55^BY2,2.5,60^BCN,,Y,N^FD${lot.barcode}^FS
^FO20,130^A0N,22,22^FD${lot.productName}^FS
^FO20,155^A0N,18,18^FDRef: ${lot.reference} | ${lot.quantity} pcs^FS
^FO20,178^A0N,16,16^FD${lot.lotNumber} | Corte: ${lot.cutDate} | ${lot.operator}^FS
^XZ
  `.trim();
}

// API Route para enviar ZPL para a impressora
// A impressora Zebra aceita ZPL via:
// 1. Raw TCP (porta 9100) — se estiver em rede
// 2. USB via driver Zebra — browser envia para driver local
// 3. Zebra Browser Print (SDK JS oficial)
//
// Recomendacao para Fase 1: Zebra Browser Print
// https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html
```

```
Fluxo de impressao:
1. Admin cria lote no sistema
2. Sistema gera ZPL com barcode Code128
3. Zebra Browser Print SDK envia ZPL para impressora local
4. Zebra GC420t imprime etiqueta
5. Operador cola etiqueta no lote fisico
```

### 6.3 TV Display (Kiosk Mode)

```
Setup:
- TV conectada via HDMI a um computador/mini-PC/Chromecast
- Browser em modo kiosk (fullscreen, sem barra de enderecos)
- URL: https://liserie.lision.app/tv
- Auto-refresh a cada 30 segundos
- Layout otimizado para tela grande (fonts 3-4x maiores)

Opcoes de setup:
1. Mini PC (Windows/Linux) + Chrome kiosk mode   ← Mais robusto
2. Amazon Fire TV Stick + Silk Browser            ← Mais barato
3. Chromecast + Cast do notebook                  ← Mais simples
4. Smart TV + Browser nativo                      ← Depende da TV
```

---

## 7. TV DASHBOARD (Kiosk Mode)

### 7.1 Layout da TV

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LISION — PRODUCAO LISERIE                         12/03/2025  14:35   │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                        │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌───────────────┐  │
│  │  META DIARIA        │  │  META SEMANAL        │  │  ALLOWANCE    │  │
│  │                     │  │                      │  │               │  │
│  │   387 / 500         │  │   1.840 / 2.500      │  │   0.14%       │  │
│  │   ████████░░ 77%    │  │   ████████████░░ 74% │  │   Meta: 0.20% │  │
│  │                     │  │                      │  │   ✅ OK       │  │
│  │  Faltam: 113 pecas  │  │                      │  │               │  │
│  └─────────────────────┘  └─────────────────────┘  └───────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────┐  ┌───────────────────────────┐  │
│  │  OPS EM ANDAMENTO               │  │  FACCOES                  │  │
│  │                                  │  │                           │  │
│  │  OP 1234  ████████░░ 45%        │  │  Faccao A  🟢 No prazo   │  │
│  │  OP 1230  ████████████░ 78%     │  │  Faccao B  🟡 Atencao    │  │
│  │  OP 1228  ████████████████ 100% │  │  Faccao C  🔴 5d atraso  │  │
│  │                                  │  │                           │  │
│  └──────────────────────────────────┘  └───────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  TOP PRODUTIVIDADE HOJE                                          │  │
│  │  1. Maria Clara (Travete) — 89 pcs   3. Rodrigo (Corte) — 78   │  │
│  │  2. Valquiria (Qualidade) — 82 pcs   4. Karen (Embalagem) — 76 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  RETRABALHO: 12 pecas na fila  │  TEMPO MEDIO: Corte→Costura 4.2h    │
└─────────────────────────────────────────────────────────────────────────┘

Rotacao automatica a cada 30s entre:
- Tela 1: Visao geral (acima)
- Tela 2: Detalhes por OP
- Tela 3: Ranking completo de produtividade
- Tela 4: Status das faccoes
```

### 7.2 Implementacao Tecnica

```typescript
// app/tv/page.tsx — Pagina dedicada para TV
export default function TVDashboard() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [OverviewSlide, OPDetailSlide, RankingSlide, FactionSlide];

  // Auto-rotacao a cada 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % slides.length);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Realtime updates
  useRealtimeDashboard();

  // Auto-refresh dados a cada 60s
  const { data: kpis } = useQuery({
    queryKey: ['tv-kpis'],
    queryFn: fetchDashboardKPIs,
    refetchInterval: 60_000,
  });

  const CurrentSlide = slides[currentSlide];

  return (
    <div className="tv-mode bg-bg-base text-tx-1 h-screen w-screen overflow-hidden p-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
        >
          <CurrentSlide kpis={kpis} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// CSS para modo TV (fontes grandes, alto contraste)
// .tv-mode aplicado via Tailwind
// Fontes: 2-4x maiores que desktop
// Cores: alto contraste para visibilidade a distancia
// Sem interacao: apenas visualizacao
```

---

## 8. SISTEMA DE METAS E PAGAMENTOS

### 8.1 Metas por Referencia (Producao Interna)

```
Cada referencia de produto tem um COEFICIENTE de dificuldade:

REF 1002 = 1.2  (facil de produzir)
REF 1027 = 2.0  (mais complexo)
REF 1003 = 1.0  (padrao)
REF 2000 = 0.25 (muito complexo)

Meta calculada:
Se meta diaria = 500 pecas "equivalentes"
E operador produz: 100 pecas REF 1002 + 50 pecas REF 1027

Score = (100 * 1.2) + (50 * 2.0) = 120 + 100 = 220 pontos
Percentual = 220 / 500 = 44%
```

### 8.2 Pagamento por Faixa

```
┌──────────────────────────────────────────┐
│  REGRA DE PAGAMENTO (configuravel)       │
├────────────┬─────────────────────────────┤
│  % da Meta │  Valor do Pagamento         │
├────────────┼─────────────────────────────┤
│  100%+     │  R$ 200,00 + bonus          │
│  75-99%    │  R$ 150,00                  │
│  50-74%    │  R$ 100,00                  │
│  < 50%     │  R$ 0,00                    │
└────────────┴─────────────────────────────┘

Dashboard do operador mostra em tempo real:
- "Voce produziu 380 pontos (76% da meta)"
- "Pagamento atual: R$ 150,00"
- "Faltam 120 pontos para R$ 200,00"
```

### 8.3 Pagamento de Terceirizados (Faccoes)

```
Faccao A: R$ 2,50 por peca

Envio: 200 pecas × R$ 2,50 = R$ 500,00 (valor bruto)

Retorno:
- 195 pecas OK
- 5 pecas com defeito

Deducao: 5 × R$ 2,50 = R$ 12,50

Pagamento final: R$ 500,00 - R$ 12,50 = R$ 487,50

Notificacao automatica para faccao:
"Conferencia do Lote OP1234-L003: 5 pecas com defeito de costura.
 Deducao: R$ 12,50. Saldo atualizado: R$ 487,50"
```

---

## 9. SEGURANCA E MULTI-TENANCY

### 9.1 Multi-Tenant Architecture

```
Modelo: Shared Database + Row Level Security (RLS)

Todas as tabelas tem tenant_id.
RLS garante que Fabrica A NUNCA ve dados da Fabrica B.

Vantagens:
- Custo baixo (1 database para todos)
- Deploy simples (1 instancia)
- Migrations unificadas

URL por tenant: {slug}.lision.app
Ex: liserie.lision.app, fabricax.lision.app
```

### 9.2 RLS (Row Level Security)

```sql
-- Helper: tenant do usuario logado
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Todas as tabelas seguem esse padrao:
CREATE POLICY "tenant_isolation" ON production_orders
  FOR ALL USING (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_isolation" ON lots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM production_orders po
      WHERE po.id = lots.po_id AND po.tenant_id = auth_tenant_id()
    )
  );

-- Scan events: validacao de tenant via cadeia lot→po→tenant
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

-- RLS para demais tabelas (todas seguem tenant_isolation)
-- Ver: docs/architecture/ARCHITECTURE-REVIEW-v2.1.md (Item 1)
CREATE POLICY "tenant_isolation" ON defect_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = defect_records.lot_id AND po.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "tenant_isolation" ON aduana_validations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = aduana_validations.lot_id AND po.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "tenant_isolation" ON notifications
  FOR ALL USING (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_isolation" ON ops_clock
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = ops_clock.driver_id AND d.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "tenant_isolation" ON faction_shipments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM factions f
      WHERE f.id = faction_shipments.faction_id AND f.tenant_id = auth_tenant_id()
    )
  );
```

### 9.3 Hierarquia de Acesso (5 Niveis)

| Nivel | Role | Quem | O que pode |
|-------|------|------|-----------|
| 1 | ADMIN | Fabinho, Erica | Tudo. Config, usuarios, dashboards, auditoria |
| 2 | GERENTE | Karen, Luana | Dashboards, criar OPs, gestao faccoes, aprovar descartes |
| 3 | COORDENADOR | Beatriz, Valquiria | Dashboard do setor, bipar, registrar defeitos, historico |
| 4 | OPERADOR | Rodrigo, Maria Clara, Janaina, Belinha | So bipar + ver info da peca/lote bipado |
| 5 | FACCAO | Faccao A, B, C | Confirmar recebimento/retorno. Ver seus envios. Ver deducoes |

### 9.4 Login Rapido por PIN

```
Para operadores no chao de fabrica, login por email/senha e lento.
Alternativa: PIN de 4 digitos.

Fluxo:
1. Tablet fica com sessao "da estacao" (ligado ao setor)
2. Operador digita PIN de 4 digitos
3. Sistema valida e identifica o operador
4. Operador bipa
5. Apos 5 min de inatividade, volta para tela de PIN

Isso e ALEM do login normal por email/senha (para admins/gerentes).
```

---

## 10. OFFLINE-FIRST

### 10.1 Estrategia

```
Bipagem NUNCA pode parar por falta de internet.

Fluxo offline:
1. Operador bipa no tablet (sem internet)
2. Scan vai para IndexedDB local (Dexie.js)
3. Feedback visual: "Salvo offline (sincroniza quando reconectar)"
4. Quando internet voltar, Service Worker sincroniza em background
5. Conflitos (raro): timestamp original preservado
```

### 10.2 O que funciona offline vs online

| Feature | Offline | Online |
|---------|---------|--------|
| Bipagem de lotes | SIM (fila local) | SIM (direto) |
| Ver info do lote bipado | SIM (cache) | SIM |
| Dashboard real-time | NAO | SIM |
| TV Dashboard | NAO (mostra "offline") | SIM |
| Criar OP/Lote | NAO | SIM |
| Imprimir etiqueta | SIM (se impressora local) | SIM |
| Registrar defeito | SIM (fila local) | SIM |

---

## 11. API DESIGN

### 11.1 Next.js API Routes

```
app/api/
├── auth/
│   ├── login/route.ts          -- Email/senha
│   ├── pin/route.ts            -- Login por PIN
│   └── me/route.ts             -- Perfil atual
│
├── production/
│   ├── orders/route.ts         -- CRUD de OPs
│   ├── orders/[id]/route.ts    -- Detalhe da OP
│   ├── lots/route.ts           -- CRUD de lotes
│   └── lots/[barcode]/route.ts -- Busca por barcode
│
├── scan/
│   ├── route.ts                -- POST: registrar bipagem
│   ├── validate/route.ts       -- Validar barcode antes de processar
│   └── sync/route.ts           -- POST: sync batch offline
│
├── factions/
│   ├── route.ts                -- CRUD faccoes
│   ├── shipments/route.ts      -- Envios
│   └── overdue/route.ts        -- Faccoes atrasadas
│
├── rework/
│   ├── route.ts                -- Fila de retrabalho
│   └── resolve/route.ts        -- Resolver defeito
│
├── dashboard/
│   ├── kpis/route.ts           -- KPIs agregados
│   ├── tv/route.ts             -- Dados para TV mode
│   └── realtime/route.ts       -- SSE/Websocket endpoint
│
├── print/
│   └── label/route.ts          -- Gerar ZPL para Zebra
│
├── payments/
│   ├── calculate/route.ts      -- Calcular pagamentos do periodo
│   └── periods/route.ts        -- Periodos de pagamento
│
└── reports/
    ├── allowance/route.ts      -- Relatorio allowance
    ├── productivity/route.ts   -- Produtividade
    └── export/route.ts         -- Export PDF/Excel
```

### 11.2 Supabase Realtime

```typescript
// Canais realtime para dashboard e TV

// Canal do Dashboard — updates em tempo real
// Canal QUALIFICADO por tenant (v2.1 — Item 7)
const channel = supabase.channel(`production-updates:${tenantId}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'scan_events' },
    handleNewScan
  )
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'faction_shipments' },
    handleFactionUpdate
  )
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'defect_records' },
    handleNewDefect
  )
  .subscribe();
// NOTA: RLS do Supabase Realtime filtra automaticamente por tenant
// quando o client esta autenticado. O nome do canal qualificado
// evita broadcast cross-tenant.
```

---

## 12. FRONTEND ARCHITECTURE

### 12.1 Estrutura do Projeto

```
lision/
├── app/                          -- Next.js App Router
│   ├── (auth)/                   -- Grupo: paginas sem auth
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (app)/                    -- Grupo: paginas com auth
│   │   ├── layout.tsx            -- Sidebar + TopBar + Auth guard
│   │   ├── dashboard/page.tsx
│   │   ├── producao/
│   │   │   ├── page.tsx          -- Lista OPs
│   │   │   ├── [id]/page.tsx     -- Detalhe OP
│   │   │   └── novo/page.tsx     -- Criar OP
│   │   ├── scan/page.tsx         -- Tela de bipagem
│   │   ├── faccoes/page.tsx
│   │   ├── retrabalho/page.tsx
│   │   ├── aduana/page.tsx
│   │   ├── relatorios/page.tsx
│   │   └── configuracoes/
│   │       ├── page.tsx
│   │       ├── usuarios/page.tsx
│   │       ├── etapas/page.tsx
│   │       └── metas/page.tsx
│   ├── tv/page.tsx               -- TV Dashboard (sem sidebar)
│   ├── api/                      -- API Routes (server-side)
│   │   └── ... (ver secao 11.1)
│   ├── layout.tsx                -- Root layout
│   └── globals.css
│
├── components/                    -- Componentes compartilhados
│   ├── ui/                       -- Design system (Badge, Button, Card, etc)
│   ├── layout/                   -- Sidebar, TopBar, PageHeader
│   ├── dashboard/                -- KPICard, ProgressBar, Charts
│   ├── scan/                     -- ScanInterface, BarcodeReader, ScanResult
│   ├── production/               -- OPCard, LotCard, Timeline
│   ├── factions/                 -- FactionCard, ShipmentForm
│   └── tv/                       -- TVSlide, TVKPICard (fontes grandes)
│
├── hooks/                         -- Custom hooks
│   ├── use-tomate.ts             -- Leitor Tomate USB
│   ├── use-scan.ts               -- Logica de bipagem
│   ├── use-offline-sync.ts       -- Fila offline
│   ├── use-realtime.ts           -- Supabase Realtime
│   ├── use-auth.ts               -- Auth + roles
│   └── use-print.ts              -- Impressao Zebra
│
├── lib/                           -- Utilitarios
│   ├── supabase/
│   │   ├── client.ts             -- Browser client
│   │   ├── server.ts             -- Server client (API Routes)
│   │   └── middleware.ts         -- Auth middleware
│   ├── prisma/
│   │   ├── client.ts             -- Prisma client
│   │   └── schema.prisma         -- Schema definition
│   ├── offline-db.ts             -- Dexie.js config
│   ├── zpl.ts                    -- Gerador de ZPL
│   ├── barcode.ts                -- Utilitarios de barcode
│   └── utils.ts                  -- Helpers gerais
│
├── types/                         -- TypeScript types
│   ├── database.ts               -- Generated from Prisma/Supabase
│   ├── enums.ts
│   └── index.ts
│
├── prisma/
│   ├── schema.prisma             -- Schema do banco
│   ├── migrations/               -- Migrations versionadas
│   └── seed.ts                   -- Dados iniciais (Liserie)
│
├── public/
│   ├── manifest.json             -- PWA manifest
│   ├── sw.js                     -- Service Worker
│   ├── icons/                    -- App icons
│   └── sounds/
│       ├── scan-ok.mp3           -- Beep de sucesso
│       └── scan-error.mp3        -- Beep de erro
│
├── .env.local                     -- Supabase keys
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 13. DEPLOY E INFRAESTRUTURA

### 13.1 Ambientes

```
DEVELOPMENT:
  Frontend: next dev (localhost:3000)
  Database: Supabase CLI local (Docker)
  Prisma: npx prisma studio (admin DB)

STAGING:
  Frontend: Vercel Preview (branch: develop)
  Database: Supabase Project (staging)
  URL: staging.lision.app

PRODUCTION:
  Frontend: Vercel (branch: main)
  Database: Supabase Project (production)
  URL: liserie.lision.app (primeiro tenant)
       app.lision.app (SaaS landing page)
```

### 13.2 Custos de Infra

| Servico | Fase 1 (Piloto) | Fase 2-3 (Producao) |
|---------|-----------------|---------------------|
| Supabase | Free | Pro ($25/mo = ~R$125) |
| Vercel | Pro ($20/mo = ~R$100) | Pro ($20/mo = ~R$100) |
| Sentry | Free (5k events) | Free (5k events) |
| UptimeRobot | Free | Free |
| Dominio | ~R$60/ano | ~R$60/ano |
| **Total** | **~R$105/mes** | **~R$230/mes** |

---

## 14. ROADMAP TECNICO FASEADO

### Fase 1: Piloto Liserie (1 semana agressiva / 2 semanas realista)

```
Dia 1-2: Fundacao
├── npx create-next-app@14 lision --typescript --tailwind
├── Setup Supabase project + Prisma
├── Schema do banco (migrations)
├── Auth basico (email/senha + PIN)
├── Layout base (Sidebar + TopBar)
├── Design tokens (dark theme do prototipo HTML)
└── Middleware de auth + tenant

Dia 3-4: Core
├── CRUD Production Orders
├── Criacao de Lotes (formulario)
├── Hook do Tomate USB (useTomate)
├── Tela de Bipagem (ScanPage)
├── Processamento de scan (API Route)
├── Feedback visual pos-scan
└── Impressao de etiqueta (ZPL + Zebra Browser Print)

Dia 5-6: Dashboard + TV
├── Dashboard principal (KPIs, progresso OPs, faccoes)
├── TV Dashboard (kiosk mode, auto-rotacao)
├── Realtime updates (Supabase channels)
├── Gestao de retrabalho (defeitos por lote)
└── Controle de acesso (roles + permissions)

Dia 7: Polish + Deploy
├── Testes com dados reais da Liserie
├── Seed com etapas, usuarios, OPs de teste
├── Deploy staging → producao
├── Setup Zebra + Tomate no local
└── Treinamento basico com equipe
```

### Fase 2: Expansao (30-60 dias)

```
├── Gestao completa de faccoes
├── Inspeccao visual (verde/laranja/vermelho)
├── Aduana + OpsClock
├── Allowance dashboard
├── Sistema de metas e pagamentos
├── Notificacoes para terceirizados
├── Portal da faccao (acesso externo limitado)
├── Relatorios exportaveis (PDF/Excel)
└── Offline-first robusto (Service Worker + IndexedDB)
```

### Fase 3: ERP + SaaS (Longo prazo)

```
├── Cadastro de produtos (substituir Hunter)
├── Gestao de estoque completa
├── Compras e fornecedores
├── Financeiro basico (contas a pagar/receber)
├── Integracao temporaria com Bling
├── NF-e / emissao fiscal
├── Multi-tenant admin panel
├── Onboarding self-service para novas fabricas
├── Billing e assinaturas (Stripe)
├── Landing page SaaS (app.lision.app)
└── Integracoes marketplace (Shopee, ML)
```

---

## 15. DECISOES ARQUITETURAIS (ADRs)

### ADR-001: Barcode por LOTE (nao por peca)
- **Decisao:** Cada lote recebe 1 etiqueta com barcode. Pecas individuais nao sao rastreadas
- **Contexto:** 20.000 pecas/mes = 20.000 etiquetas. Por lote (~150 lotes/mes) = muito mais viavel
- **Trade-off:** Perde-se rastreabilidade individual. Compensa com rastreabilidade por lote + quantidade
- **Reversivel:** Se no futuro precisar por peca, basta adicionar tabela `pieces` vinculada a `lots`

### ADR-002: Next.js 14 (nao Vite+React)
- **Decisao:** Next.js 14 com App Router
- **Contexto:** Produto SaaS precisa de SSR (landing page), API Routes (server logic), Middleware (auth)
- **Consequencias:** Mais complexo que Vite, mas muito mais poderoso para SaaS

### ADR-003: Supabase client unico + Prisma para tipos (v2.1)
- **Decisao:** Supabase client autenticado como UNICA camada de acesso ao banco em runtime.
  Prisma usado EXCLUSIVAMENTE para `prisma generate` (tipos TypeScript) e `prisma migrate` (migrations).
  Prisma NUNCA usado em runtime para queries — bypassa RLS conectando como postgres.
- **Contexto:** Prisma conecta como role `postgres`, ignorando todas as policies de RLS.
  Isso invalida o isolamento multi-tenant. Supabase client respeita RLS nativamente.
- **Consequencias:** Uma unica forma de acessar o banco em runtime. Seguranca garantida por RLS.
  Trade-off: perde-se o query builder type-safe do Prisma nas API Routes.

### ADR-004: Tenant por Subdomain
- **Decisao:** Cada fabrica acessa via {slug}.lision.app
- **Contexto:** SaaS multi-tenant precisa de isolamento visual e tecnico
- **Consequencias:** Next.js middleware resolve subdomain → tenant_id

### ADR-005: Tomate USB como Keyboard Wedge
- **Decisao:** Leitor Tomate USB opera em modo HID (teclado). Zero config especial
- **Contexto:** Mais simples, mais barato, mais confiavel que Bluetooth ou camera
- **Consequencias:** Input field precisa estar focado. Timeout de 80ms diferencia bip de digitacao

### ADR-006: Zebra GC420t via Browser Print
- **Decisao:** Usar Zebra Browser Print SDK (JS) para enviar ZPL direto do browser
- **Contexto:** Impressora USB. Browser Print e o SDK oficial da Zebra para web
- **Consequencias:** Precisa instalar Zebra Browser Print no computador da estacao

### ADR-007: TV como Browser em Kiosk
- **Decisao:** TV exibe pagina /tv do sistema em browser fullscreen
- **Contexto:** Fabinho ja comprou a TV. Mais simples e barato que app dedicado
- **Consequencias:** Precisa de mini-PC ou stick conectado via HDMI

### ADR-008: ERP Replacement Gradual
- **Decisao:** Fase 1-2 coexiste com Hunter/Bling. Fase 3 substitui
- **Contexto:** Fabinho quer sair do Hunter (dificil integrar). Bling pode ficar mais tempo
- **Consequencias:** Dados duplicados temporariamente. Manual sync na Fase 1-2

---

## 16. RISCOS E MITIGACOES

| Risco | Prob. | Impacto | Mitigacao |
|-------|-------|---------|-----------|
| Fase 1 em 1 semana e muito agressivo | Alta | Alto | Priorizar: bipagem + dashboard + etiqueta. Resto na semana 2 |
| Tomate USB incompativel com tablet | Media | Alto | Testar ANTES. Tomate e HID, deve funcionar. Ter camera como fallback |
| Zebra GC420t nao aceita ZPL via browser | Baixa | Medio | Browser Print SDK oficial suporta. Alternativa: driver Windows direto |
| Wi-Fi da fabrica instavel | Media | Alto | Offline-first resolve. Recomendar roteador dedicado para producao |
| 35 usuarios simultaneos sobrecarregam | Baixa | Medio | Supabase Pro suporta facilmente. Vercel Edge Cache ajuda |
| Operadores resistem a mudanca | Media | Alto | UI ultra-simples (operador so ve tela de bipar + PIN). Gamificacao |
| Hunter nao tem API para integrar | Alta | Medio | NAO integrar. Input manual na Fase 1-2. Substituir na Fase 3 |
| Faccoes nao usam o portal | Media | Medio | Comecam com recebimento/retorno. Beatriz registra se faccao nao usar |

---

## CONCLUSAO

O LISION v2 e um produto SaaS de rastreabilidade textil por lotes, construido para escalar de 1 fabrica (Liserie) para N fabricas. A arquitetura foi concebida para:

- **Velocidade:** Fase 1 funcional em 1-2 semanas
- **Simplicidade:** Operador so bipa. Gerente so ve dashboard. TV mostra tudo
- **Resiliencia:** Offline-first. Nunca para por falta de internet
- **Escalabilidade:** Multi-tenant desde dia 1. De 35 para milhares de usuarios
- **Substituicao:** Gradualmente elimina Hunter e Bling ate LISION ser o ERP unico
- **Monetizacao:** SaaS por assinatura para outras fabricas texteis

Hardware confirmado e integrado:
- Tomate USB (bipagem)
- Zebra GC420t (etiquetas ZPL)
- TV (dashboard kiosk)
- Notebook/Tablet (estacoes de trabalho)

---

---

## CHANGELOG

| Data | Versao | Mudanca |
|------|--------|---------|
| 2026-03-04 | v2.0 | Documento original |
| 2026-05-17 | v2.1 | Revisao arquitetural completa — ver docs/architecture/ARCHITECTURE-REVIEW-v2.1.md |

*— Aria, arquitetando o futuro*
