# LISION — Phase 1: Gap Analysis, Information Architecture & Data Flow

> **Author:** @architect (Aria)
> **Date:** 2026-06-01
> **Status:** DEFINITIVE — Base document for all subsequent phases
> **Scope:** Complete system audit, gap identification, architecture for frontend rebuild

---

## 1. EXECUTIVE SUMMARY

LISION is a production tracking SaaS for textile factories. The backend is **85% complete** with 45+ endpoints across 10 domains. The frontend is **55% complete** — 4 modules are empty placeholders, the faction portal needs navigation, and critical operational features are missing.

This document maps **every gap** between what exists and what must exist for production readiness. It serves as the single source of truth for UX design (Phase 2), story creation (Phase 3), and implementation (Phase 4).

### Design Constraint (IMMUTABLE)
- **Color system:** OKLCH monochrome (background: `oklch(0.07 0 0)`, foreground: `oklch(0.98 0 0)`)
- **Semantic colors:** Success `oklch(0.75 0.16 145)`, Warning `oklch(0.80 0.15 75)`, Destructive `oklch(0.65 0.20 25)`
- **Fonts:** Inter (display), JetBrains Mono (mono)
- **Gradients, shadows, animations:** All preserved as-is from `globals.css`
- **Component style:** Card-gradient, border-gradient, shadow-elegant patterns — KEEP
- **What CAN change:** Layout, navigation, component composition, interaction patterns, responsiveness, micro-interactions

---

## 2. USER ROLES & PERSONAS

### 2.1 Internal Users (Supabase Auth)

| Role | Level | Primary Tasks | Context |
|------|-------|---------------|---------|
| **ADMIN** | 40 | Full system management, user CRUD, settings, tokens | Office, desktop |
| **GERENTE** | 30 | OP creation, dashboard monitoring, rework resolution, reports | Office + floor, desktop + tablet |
| **COORDENADOR** | 20 | OP creation, scan oversight, label printing, rework resolution | Floor, tablet |
| **OPERADOR** | 10 | Scan execution, defect reporting | Floor, mobile/tablet, gloves, noisy environment |

### 2.2 External Users (Token Auth)

| Role | Auth Method | Primary Tasks | Context |
|------|------------|---------------|---------|
| **FACCAO** | Token + PIN (6 digits) | View shipments, confirm receipt, contest defects, view financial | Mobile phone, outside factory |

### 2.3 Machine Users

| Type | Auth Method | Purpose |
|------|------------|---------|
| **Kiosk** | UUID token (no login) | TV dashboard display on factory floor |

### 2.4 Permission Matrix

| Permission | ADMIN | GERENTE | COORDENADOR | OPERADOR |
|-----------|-------|---------|-------------|----------|
| dashboard:view | Y | Y | Y | - |
| orders:view | Y | Y | Y | - |
| orders:create | Y | Y | Y | - |
| orders:edit | Y | Y | - | - |
| orders:delete | Y | - | - | - |
| scan:view | Y | Y | Y | Y |
| scan:execute | Y | Y | Y | Y |
| labels:print | Y | Y | Y | - |
| rework:report | Y | Y | Y | Y |
| rework:resolve | Y | Y | Y | - |
| rework:view | Y | Y | Y | Y |
| users:manage | Y | - | - | - |
| settings:manage | Y | - | - | - |
| **quality:view** | Y | Y | Y | - |
| **quality:manage** | Y | Y | - | - |
| **factions:view** | Y | Y | - | - |
| **factions:manage** | Y | Y | - | - |
| **reports:export** | Y | Y | - | - |

> Permissions in **bold** are NEW — must be added to `src/lib/permissions.ts`

---

## 3. INFORMATION ARCHITECTURE

### 3.1 Navigation Structure (App)

```
LISION App (authenticated, Supabase Auth)
├── /dashboard                    [EXISTS — NEEDS REFINEMENT]
│   ├── KPIs (real data)
│   ├── Production chart (real data)
│   ├── Active OPs
│   ├── Stale lots alerts
│   ├── Activity feed (real data)
│   └── Ranking operadores (real data)
│
├── /production
│   ├── /orders                   [EXISTS — PRODUCTION-READY]
│   │   ├── List (paginated, filterable)
│   │   └── /new                  [EXISTS]
│   └── /orders/[id]              [EXISTS — PRODUCTION-READY]
│       ├── Order detail + progress
│       ├── Lots table
│       └── Label printing (ZPL/PDF)
│
├── /scan                         [EXISTS — PRODUCTION-READY]
│   ├── Stage selector
│   ├── Barcode input
│   ├── Feedback panel (audio)
│   ├── Scan history
│   └── Defect modal (inline)
│
├── /rework                       [EXISTS — PRODUCTION-READY]
│   ├── List tab (filterable)
│   └── Report tab (by type, by OP)
│
├── /quality                      [EMPTY — MUST BUILD]
│   ├── Overview (KPIs de qualidade)
│   ├── Defect analytics (Pareto, trends)
│   ├── By OP breakdown
│   ├── By stage breakdown
│   └── By faction breakdown
│
├── /factions                     [EMPTY — MUST BUILD]
│   ├── List (all factions with KPIs)
│   ├── /factions/[id]            [NEW]
│   │   ├── Detail (contact, rating, history)
│   │   ├── Active shipments
│   │   ├── Defect history
│   │   └── Financial summary
│   └── Shipment management
│       ├── Create shipment        [NEW]
│       └── Track/receive returns  [NEW]
│
├── /team                         [EMPTY — MUST BUILD]
│   ├── Members list
│   ├── Add member / Edit role
│   ├── Deactivate member
│   └── PIN management
│
└── /settings                     [EMPTY — MUST BUILD]
    ├── Profile (edit own)
    ├── Tenant (name, logo, timezone)
    ├── Production stages (CRUD, reorder)
    ├── Production targets
    ├── Kiosk tokens (CRUD)         [API EXISTS]
    └── Faction tokens (CRUD)       [API EXISTS]
```

### 3.2 Navigation Structure (Portal — Factions)

```
LISION Portal (authenticated, Token + PIN)
├── /portal                       [EXISTS — Login]
└── /portal/(authenticated)
    ├── /dashboard                [EXISTS — Summary KPIs]
    ├── /shipments                [EXISTS — List]
    │   └── /[id]                 [PARTIAL — Needs full detail]
    ├── /returns                  [EXISTS — Estimate/reschedule]
    ├── /defects                  [EXISTS — Confirm/contest]
    ├── /financial                [EXISTS — Period + history]
    └── /notifications            [EXISTS — Read/mark read]
```

### 3.3 Navigation Structure (Kiosk)

```
LISION Kiosk (token auth, no login UI)
└── /tv?token=<uuid>              [EXISTS — PRODUCTION-READY]
    ├── KPIs
    ├── OP progress cards
    └── Stale lot alerts
```

---

## 4. GAP ANALYSIS — MODULE BY MODULE

### 4.1 MODULE: Quality (`/quality`)

#### Backend Gaps

| API | Method | Purpose | Status | Tables |
|-----|--------|---------|--------|--------|
| `/api/quality/overview` | GET | KPIs: defect rate, total defects, by severity, trend | MUST CREATE | `defect_records`, `scan_events`, `lots` |
| `/api/quality/by-type` | GET | Defects grouped by type with quantities | MUST CREATE | `defect_records` |
| `/api/quality/by-stage` | GET | Defects per production stage | MUST CREATE | `defect_records`, `stages` |
| `/api/quality/by-op` | GET | Defects per production order | MUST CREATE | `defect_records`, `production_orders` |
| `/api/quality/by-faction` | GET | Defects per faction (external quality) | MUST CREATE | `defect_records`, `faction_shipments`, `factions` |
| `/api/quality/trend` | GET | Defect rate over time (daily/weekly) | MUST CREATE | `defect_records` |

**Query params (all endpoints):** `from`, `to`, `limit`, `offset`

#### Frontend Gaps

| Component | Description | Priority |
|-----------|-------------|----------|
| QualityOverview | 4 KPI cards: total defects, defect rate, by severity pie, resolution rate | P1 |
| DefectPareto | Bar chart — defects by type (horizontal, sorted desc) | P1 |
| DefectTrend | Area chart — defect rate over time (line + area) | P1 |
| StageHeatmap | Table/heatmap — stages x defect types, intensity by count | P2 |
| FactionQuality | Table — faction defect rates, contest rates | P2 |
| DateRangeFilter | Reusable period selector (today/week/month/custom) | P1 |

#### Database: No migration needed
- All data exists in `defect_records` + joins
- Queries can use existing indexes

---

### 4.2 MODULE: Factions Management (`/factions`)

#### Backend Gaps

| API | Method | Purpose | Status | Tables |
|-----|--------|---------|--------|--------|
| `/api/factions` | GET | List all factions with summary KPIs | MUST CREATE | `factions`, `faction_shipments` |
| `/api/factions` | POST | Create new faction | MUST CREATE | `factions` |
| `/api/factions/[id]` | GET | Faction detail with shipment history | MUST CREATE | `factions`, `faction_shipments`, `defect_records` |
| `/api/factions/[id]` | PATCH | Update faction info | MUST CREATE | `factions` |
| `/api/factions/[id]` | DELETE | Deactivate faction (soft) | MUST CREATE | `factions` |
| `/api/factions/[id]/shipments` | GET | Shipments for this faction | MUST CREATE | `faction_shipments`, `lots` |
| `/api/shipments` | POST | Create new shipment to faction | MUST CREATE | `faction_shipments`, `lots` |
| `/api/shipments/[id]/receive` | PATCH | Mark shipment as returned | MUST CREATE | `faction_shipments`, `lots` |

#### Frontend Gaps

| Component | Description | Priority |
|-----------|-------------|----------|
| FactionsList | Table — name, contact, active shipments, rating, status | P1 |
| FactionDetail | Detail page — info, KPIs, shipment history, defect history | P1 |
| FactionForm | Create/edit faction (name, type, contact, price/piece) | P1 |
| ShipmentCreate | Create shipment — select lots, assign to faction, driver | P2 |
| ShipmentReceive | Receive return — quantity returned, defects found | P2 |
| FactionScoreCard | Rating widget (stars/score + delivery avg + quality %) | P2 |

#### Database: No migration needed
- `factions` table exists with all needed fields
- `faction_shipments` has full schema

---

### 4.3 MODULE: Team (`/team`)

#### Backend Gaps

| API | Method | Purpose | Status | Tables |
|-----|--------|---------|--------|--------|
| `/api/team/members` | GET | List all profiles for tenant | MUST CREATE | `profiles` |
| `/api/team/members` | POST | Create new user (Supabase Auth + profile) | MUST CREATE | `auth.users`, `profiles` |
| `/api/team/members/[id]` | GET | Get single profile | MUST CREATE | `profiles` |
| `/api/team/members/[id]` | PATCH | Update role, sector, status | MUST CREATE | `profiles` |
| `/api/team/members/[id]/deactivate` | PATCH | Soft deactivate user | MUST CREATE | `profiles` |
| `/api/team/members/[id]/reset-pin` | PATCH | Reset PIN code | MUST CREATE | `profiles` |
| `/api/profile` | PATCH | Update own profile | MUST CREATE | `profiles` |

#### Frontend Gaps

| Component | Description | Priority |
|-----------|-------------|----------|
| MembersList | Table — name, role badge, sector, status, actions | P1 |
| MemberForm | Create/edit — name, email, phone, role, sector | P1 |
| MemberDetail | Profile card with stats (scans today, defects reported) | P2 |
| PinReset | Inline action — reset with confirmation dialog | P1 |
| DeactivateDialog | Confirmation modal with consequences listed | P1 |

#### Database: No migration needed
- `profiles` table has all fields
- Auth user creation via `supabaseAdmin.auth.admin.createUser()`

---

### 4.4 MODULE: Settings (`/settings`)

#### Backend Gaps

| API | Method | Purpose | Status | Tables |
|-----|--------|---------|--------|--------|
| `/api/settings/tenant` | GET | Get tenant settings | MUST CREATE | `tenants` |
| `/api/settings/tenant` | PATCH | Update tenant settings | MUST CREATE | `tenants` |
| `/api/settings/stages` | GET | List all stages (ordered) | MUST CREATE | `stages` |
| `/api/settings/stages` | POST | Create new stage | MUST CREATE | `stages` |
| `/api/settings/stages/[id]` | PATCH | Update stage (name, color, order) | MUST CREATE | `stages` |
| `/api/settings/stages/[id]` | DELETE | Delete stage (only if unused) | MUST CREATE | `stages`, `lots`, `scan_events` |
| `/api/settings/stages/reorder` | PATCH | Reorder stages | MUST CREATE | `stages` |
| `/api/settings/targets` | GET | Get production targets | MUST CREATE | `tenants.settings` |
| `/api/settings/targets` | PATCH | Update production targets | MUST CREATE | `tenants.settings` |

Note: Token management APIs already exist (`/api/admin/kiosk-tokens`, `/api/admin/faction-tokens`)

#### Frontend Gaps

| Component | Description | Priority |
|-----------|-------------|----------|
| SettingsTabs | Tab navigation — Profile, Tenant, Stages, Targets, Tokens | P1 |
| ProfileEdit | Edit own name, phone, avatar (uses PATCH `/api/profile`) | P1 |
| TenantSettings | Edit name, logo upload, timezone, currency | P2 |
| StageManager | Drag-and-drop reorder, create, edit name/color/icon, delete | P1 |
| TargetsConfig | Daily target, allowance target, shift config | P1 |
| KioskTokens | Table — name, token (masked), status, revoke button | P1 |
| FactionTokens | Table — name, faction, status, revoke, create button | P1 |

#### Database: No migration needed
- `tenants.settings` is JSONB — extensible without migration
- `stages` table has all fields (name, displayName, orderIndex, color, icon)

---

### 4.5 MODULE: Dashboard (`/dashboard`) — Refinements

#### Issues Found

| Issue | Current State | Required State | Severity |
|-------|--------------|----------------|----------|
| Goal targets hardcoded | `target: 2100`, `target: 100`, `target: 15` | Read from `tenants.settings` | MEDIUM |
| No shift projection | Static chart | Projected end-of-shift based on hourly rate | LOW |
| Activity feed format | Raw event type strings | Human-readable descriptions | LOW |
| No notification bell | Icon exists but no onClick | Dropdown with unread count | MEDIUM |
| Search bar non-functional | Static div | Global search (OPs, lots, barcode) | LOW |

#### Backend Gaps

| API | Method | Purpose | Status |
|-----|--------|---------|--------|
| `/api/notifications` | GET | Internal notifications for user | MUST CREATE |
| `/api/notifications/read` | PATCH | Mark as read | MUST CREATE |
| `/api/search` | GET | Global search (OPs, lots, barcodes) | OPTIONAL |

---

### 4.6 MODULE: Portal — Refinements

#### Gaps

| Item | Status | Required |
|------|--------|----------|
| Portal navigation/sidebar | MISSING | Tab bar or bottom nav for mobile |
| Shipment detail page | PARTIAL | Full detail with lots, defects, timeline |
| PWA manifest | MISSING | `manifest.json` for install prompt |
| Service Worker | MISSING | Offline caching for portal |

---

### 4.7 Cross-Cutting Gaps

| Gap | Impact | Solution |
|-----|--------|----------|
| No error boundary | App crashes on unhandled error | Add React Error Boundary |
| Inconsistent data fetching | Some hooks, some inline fetch | Standardize with hooks pattern |
| No skeleton loaders for tables | Poor perceived performance | Add table skeleton component |
| Tables not mobile-responsive | Broken on phones | Card view on mobile breakpoint |
| No toast system used | Sonner installed but unused | Wire up for all mutations |
| No optimistic updates | Sluggish feel on mutations | Add optimistic UI for scans, resolves |
| Auth error no retry | User sees stale data after session expire | Auto-redirect to login on 401 |

---

## 5. DATA FLOW ARCHITECTURE

### 5.1 Authentication Flows

```
INTERNAL USER
┌──────────┐     POST /api/auth/login      ┌──────────────┐
│  Login   │──────────────────────────────>│ Supabase Auth │
│  Page    │    {email, password}           │              │
│          │<──────────────────────────────│ JWT + Session │
└──────────┘     Set-Cookie (8h)           └──────────────┘

OPERATOR (PIN)
┌──────────┐     POST /api/auth/pin        ┌──────────────┐
│  Login   │──────────────────────────────>│ bcrypt verify │
│  Numpad  │    {tenantId, pin}            │ profiles      │
│          │<──────────────────────────────│ Magic link    │
└──────────┘     JWT + Session (8h)        └──────────────┘

FACTION
┌──────────┐     POST /api/faction/auth    ┌──────────────┐
│  Portal  │──────────────────────────────>│ Token + PIN  │
│  Login   │    {token, pin}               │ bcrypt verify │
│          │<──────────────────────────────│ HttpOnly 30d │
└──────────┘     faction_session cookie    └──────────────┘

KIOSK (no login)
┌──────────┐     GET /api/kiosk/dashboard  ┌──────────────┐
│  TV Page │──────────────────────────────>│ Token lookup  │
│          │    ?token=<uuid>              │ service_role  │
│          │<──────────────────────────────│ Read-only     │
└──────────┘     JSON response             └──────────────┘
```

### 5.2 Data Flow Per Module

#### Dashboard
```
Dashboard.tsx
  ├── useDashboardData(dateRange) ─── poll 30s
  │   ├── GET /api/dashboard/kpis ──────────> scan_events + lots + stages + production_orders
  │   ├── GET /api/dashboard/production-chart > scan_events (grouped by hour/day)
  │   └── GET /api/production/orders ────────> production_orders (latest 20)
  ├── useUserProfile() ─── one-time
  │   └── GET /api/profile ──────────────────> profiles + auth.users
  ├── fetchStaleLots() ─── poll 30s
  │   └── GET /api/dashboard/stale-lots ─────> lots + stages + production_orders (stalled >2h)
  └── fetchActivity() ─── poll 15s
      └── GET /api/dashboard/activity ───────> scan_events + lots + stages + profiles
```

#### Quality (NEW)
```
QualityPage.tsx
  └── useQualityData(dateRange)
      ├── GET /api/quality/overview ──────────> defect_records (aggregated)
      ├── GET /api/quality/by-type ───────────> defect_records GROUP BY defect_type
      ├── GET /api/quality/by-stage ──────────> defect_records JOIN stages
      ├── GET /api/quality/by-op ─────────────> defect_records JOIN production_orders
      └── GET /api/quality/trend ─────────────> defect_records GROUP BY date
```

#### Team (NEW)
```
TeamPage.tsx
  └── useTeamMembers()
      ├── GET /api/team/members ──────────────> profiles WHERE tenant_id = auth_tenant_id()
      ├── POST /api/team/members ─────────────> auth.admin.createUser() + profiles.insert()
      ├── PATCH /api/team/members/[id] ───────> profiles.update()
      └── PATCH /api/team/members/[id]/deactivate > profiles.update(deleted_at)
```

#### Settings (NEW)
```
SettingsPage.tsx
  ├── Tab: Profile
  │   ├── GET /api/profile ───────────────────> profiles
  │   └── PATCH /api/profile ─────────────────> profiles.update()
  ├── Tab: Stages
  │   ├── GET /api/settings/stages ───────────> stages ORDER BY order_index
  │   ├── POST /api/settings/stages ──────────> stages.insert()
  │   ├── PATCH /api/settings/stages/[id] ────> stages.update()
  │   └── PATCH /api/settings/stages/reorder ─> stages.update(order_index) batch
  ├── Tab: Targets
  │   ├── GET /api/settings/targets ──────────> tenants.settings (JSONB)
  │   └── PATCH /api/settings/targets ────────> tenants.update(settings)
  └── Tab: Tokens
      ├── GET /api/admin/kiosk-tokens ────────> kiosk_tokens (EXISTING)
      ├── POST /api/admin/kiosk-tokens ───────> kiosk_tokens.insert() (EXISTING)
      ├── DELETE /api/admin/kiosk-tokens/[id] > kiosk_tokens.update(is_active=false) (EXISTING)
      ├── GET /api/admin/faction-tokens ──────> faction_tokens (EXISTING)
      ├── POST /api/admin/faction-tokens ─────> faction_tokens.insert() (EXISTING)
      └── DELETE /api/admin/faction-tokens/[id] > faction_tokens.update(is_active=false) (EXISTING)
```

#### Factions (NEW)
```
FactionsPage.tsx
  └── useFactionsData()
      ├── GET /api/factions ──────────────────> factions + faction_shipments (aggregated)
      ├── POST /api/factions ─────────────────> factions.insert()
      └── GET /api/factions/[id] ─────────────> factions + shipments + defects

ShipmentCreate.tsx
  ├── GET /api/factions ──────────────────────> factions (for selector)
  ├── GET /api/production/lots?available=true > lots WHERE status suitable
  └── POST /api/shipments ────────────────────> faction_shipments.insert() + lots.update()

ShipmentReceive.tsx
  └── PATCH /api/shipments/[id]/receive ──────> faction_shipments.update() + lots.update()
```

### 5.3 API Response Contract Standards

All NEW APIs must follow this contract:

```typescript
// Success (single item)
{ data: T }

// Success (collection)
{ data: T[], pagination: { page: number, limit: number, total: number, pages: number } }

// Error
{ error: string, code?: string, details?: string }

// All responses include proper HTTP status codes:
// 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized,
// 403 Forbidden, 404 Not Found, 409 Conflict, 500 Internal Server Error
```

---

## 6. FRONTEND ARCHITECTURE STANDARDS

### 6.1 Data Fetching Pattern (STANDARD)

All new modules MUST use custom hooks:

```typescript
// Pattern: useModuleData hook
function useModuleData(params?: Params) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => { ... }, [params]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
```

### 6.2 Error Handling (STANDARD)

```
1. API errors → toast notification (Sonner)
2. 401 responses → redirect to /login
3. Network errors → inline error banner with retry button
4. Unhandled exceptions → Error Boundary with fallback UI
```

### 6.3 Loading States (STANDARD)

```
1. Initial load → Skeleton loader (matching card/table shape)
2. Refetch/polling → Reduced opacity overlay (opacity-60)
3. Mutation in progress → Button spinner + disabled state
4. Empty state → Icon + message + action button
```

### 6.4 Responsive Strategy (STANDARD)

```
1. Tables → Card view below md (768px)
2. Sidebar → Collapsed icon-only below md, sheet overlay on mobile
3. Charts → Full width, reduced height on mobile
4. Forms → Stack vertically on mobile
5. Modals → Full-screen sheet on mobile, dialog on desktop
```

### 6.5 Component Hierarchy

```
Page
├── PageHeader (eyebrow + title + actions)
├── FilterBar (if applicable)
│   ├── DateRangePicker (reusable)
│   ├── StatusFilter (reusable)
│   └── SearchInput (reusable)
├── KPI Row (if applicable)
│   └── MetricCard (reusable)
├── Content Area
│   ├── DataTable / CardList (responsive)
│   └── ChartCard (if applicable)
└── Pagination (if applicable)
```

---

## 7. NEW APIS SPECIFICATION

### 7.1 Total New Endpoints Required

| Domain | Count | Endpoints |
|--------|-------|-----------|
| Quality | 6 | overview, by-type, by-stage, by-op, by-faction, trend |
| Factions | 8 | CRUD factions, faction detail, faction shipments, create shipment, receive return |
| Team | 7 | CRUD members, deactivate, reset-pin, update own profile |
| Settings | 7 | tenant CRUD, stages CRUD+reorder, targets CRUD |
| Notifications | 2 | list for user, mark read |
| **TOTAL** | **30** | |

### 7.2 Existing APIs to Enhance

| API | Enhancement | Priority |
|-----|------------|----------|
| `GET /api/production/orders` | Add status, search, date filters | MEDIUM |
| `GET /api/dashboard/kpis` | Read targets from tenant settings, not hardcode | HIGH |
| `GET /api/admin/faction-tokens` | Add pagination | LOW |
| `GET /api/admin/kiosk-tokens` | Add pagination | LOW |
| `GET /api/profile` | Add PATCH method for self-update | HIGH |

---

## 8. DATABASE IMPACT ASSESSMENT

### 8.1 Migrations Required: ZERO for core

All 17 tables already exist with the necessary schema. The quality, team, factions, and settings modules can be built entirely with existing tables:
- `defect_records` — Quality analytics (already has all fields)
- `profiles` — Team management (already has role, sector, pinCode, isActive, deletedAt)
- `factions` — Faction CRUD (already has name, type, contact, pricing, rating)
- `stages` — Stage management (already has orderIndex, color, icon)
- `tenants.settings` — JSONB extensible (no migration needed)

### 8.2 Potential Future Migration

| When | What | Why |
|------|------|-----|
| If quality inspections become formal | `quality_inspections` table | Separate from ad-hoc defect reports |
| If shift tracking needed | `shifts` table | To segment KPIs by shift |
| If audit log viewer built | Index on `audit_log(entity_type, created_at)` | Performance for listing |

### 8.3 RLS Validation

All existing RLS policies cover the new API patterns:
- Team members: `profiles` already has `tenant_id = auth_tenant_id()` policy
- Factions CRUD: `factions` already has `tenant_id = auth_tenant_id()` policy
- Stages CRUD: `stages` already has `tenant_id = auth_tenant_id()` policy
- Quality queries: All join through tenant-isolated tables

---

## 9. SECURITY CONSIDERATIONS

### 9.1 Issues to Fix

| Issue | Location | Fix |
|-------|----------|-----|
| `Math.random()` for PIN generation | `/api/admin/faction-tokens` | Use `crypto.getRandomValues()` |
| No CSRF protection | All mutation endpoints | SameSite=Lax is sufficient for same-origin |
| No rate limiting on scan | `/api/scan` | Add rate limiter (100 req/min per user) |

### 9.2 New Endpoints Security Requirements

| Endpoint Group | Auth | Role Check | Special |
|---------------|------|-----------|---------|
| Quality APIs | `withAuth()` | `quality:view` | Read-only, no special |
| Factions CRUD | `withAuth()` | `factions:manage` | Tenant isolation via RLS |
| Team CRUD | `withAuth()` | `users:manage` | Cannot edit own role, cannot deactivate self |
| Settings | `withAuth()` | `settings:manage` | Cannot change tenant plan |
| Profile PATCH | `withAuth()` | Self only | Can only edit own profile |

---

## 10. IMPLEMENTATION PRIORITY MAP

### Tier 1 — System Foundation (Cross-cutting)
1. Error Boundary component
2. Standardized hook pattern (useServerData)
3. Toast notification wiring (Sonner)
4. Responsive table → card component
5. Skeleton loader components
6. Permissions update (new permissions)
7. DateRangePicker reusable component

### Tier 2 — Settings Module (unblocks other modules)
1. Tenant settings API (targets)
2. Stages CRUD API
3. Profile PATCH API
4. Settings page with tabs

### Tier 3 — Team Module
1. Team CRUD APIs
2. Members list page
3. Create/edit member form
4. PIN reset, deactivate

### Tier 4 — Quality Module
1. Quality analytics APIs (6 endpoints)
2. Quality overview page
3. Pareto chart, trend chart, heatmap

### Tier 5 — Factions Module (internal)
1. Factions CRUD APIs
2. Factions list page
3. Faction detail page
4. Shipment create/receive

### Tier 6 — Dashboard Refinements
1. Dynamic targets from settings
2. Notification bell dropdown
3. Activity feed formatting

### Tier 7 — Portal Refinements
1. Navigation (bottom tab bar)
2. Shipment detail page completion
3. PWA manifest

---

## 11. DELIVERABLE FOR PHASE 2 (UX)

This document provides @ux-design-expert with:

1. **Complete navigation map** (Section 3) — every page, its status, its hierarchy
2. **User roles + permissions** (Section 2) — who sees what
3. **Component inventory** (Section 4) — what exists, what must be built
4. **Data available per page** (Section 5) — what APIs return, what can be shown
5. **Design constraints** (Section 1) — OKLCH palette is immutable, layout can change
6. **Responsive requirements** (Section 6.4) — mobile-first for operator pages
7. **Priority map** (Section 10) — what to design first

**UX must produce:**
- Interaction model for each new module
- Component specifications (what each card/table/form contains)
- Mobile adaptation strategy for each page
- Micro-interaction definitions (hover, click, transition)
- Information density optimization (factory floor = quick glance, office = detailed analysis)

---

*— Aria, arquitetando o futuro 🏗️*
