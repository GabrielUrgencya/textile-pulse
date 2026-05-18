# LISION — Sprint Fase 1 Index

> **Prazo:** 5 dias | **Epic:** 5 (Backend v2.1) | **Stories:** 10 | **Status:** Ready (validado pelo @po)
> **Nota:** Stories 1.1-4.1 sao do plano original (Arch v2.0) e estao supersedidas pelo Epic 5.

## Mapa de Dependencias — Epic 5 (Architecture v2.1)

```
5.1 Schema ──► 5.2 RLS ──► 5.3 Auth ──┬──► 5.4 Scan API
                                        ├──► 5.5 Production API ──► 5.6 Labels
                                        └──► 5.7 Dashboard KPIs ──► 5.8 Kiosk Token

5.3-5.8 ──► 5.9 Sentry
Todas   ──► 5.10 Deploy Vercel Pro
```

## Stories por Dia

### Dia 1-2 — Fundacao (Schema + Seguranca + Auth)
| ID | Story | Agente | Prioridade | Status |
|----|-------|--------|------------|--------|
| 5.1 | Schema Corrigido + Migrations | @data-engineer | P0 BLOQUEANTE | Ready |
| 5.2 | RLS Completa em Todas as Tabelas | @data-engineer | P0 BLOQUEANTE | Ready |
| 5.3 | Auth: Email/Senha + PIN + Rate Limiting | @dev | P0 BLOQUEANTE | Ready |

### Dia 3-4 — Core APIs
| ID | Story | Agente | Prioridade | Status |
|----|-------|--------|------------|--------|
| 5.4 | API /api/scan — Bipagem por Lote | @dev | P1 BLOQUEANTE | Ready |
| 5.5 | API /api/production — OPs e Lotes | @dev | P1 BLOQUEANTE | Ready |
| 5.6 | API /api/print/label — Etiquetas ZPL | @dev | P2 IMPORTANTE | Ready |
| 5.7 | API /api/dashboard/kpis — KPIs | @dev | P3 VISIBILIDADE | Ready |
| 5.8 | Kiosk Token para TV Dashboard | @dev | P3 VISIBILIDADE | Ready |

### Dia 5 — Polish + Deploy
| ID | Story | Agente | Prioridade | Status |
|----|-------|--------|------------|--------|
| 5.9 | Sentry + Observabilidade | @dev | P2 IMPORTANTE | Ready |
| 5.10 | Deploy Vercel Pro | @devops | P1 BLOQUEANTE | Ready |

## Decisoes Arquiteturais Aplicadas (v2.1)

| Item | Decisao | Stories Afetadas |
|------|---------|-----------------|
| Item 1 | RLS scan_insert com cadeia completa | 5.2 |
| Item 2 | PIN bcrypt (manter) | 5.3 |
| Item 3 | Rate limiting em memoria | 5.3 |
| Item 4 | Supabase client unico (ADR-003) | 5.3, todas |
| Item 5 | Campos desnormalizados removidos (Opcao A) | 5.1, 5.5, 5.7 |
| Item 6 | CHECK constraint XOR payment_periods | 5.1 |
| Item 7 | Realtime qualificado por tenant | 5.7 |
| Item 8 | Kiosk token para TV | 5.8 |
| Item 9 | Vercel Pro desde dia 1 | 5.10 |
| Item 12 | CHECK barcode format | 5.1 |
| Item 13 | meta_coefficient snapshot | 5.5 |
| Item 17 | LGPD soft delete | 5.1 |
| Item 18 | Sentry + Vercel Analytics | 5.9 |

## Fora do Escopo Fase 1

- Pagamentos e calculos financeiros
- Faccoes e aduana
- Offline-first robusto
- Relatorios exportaveis
- Testes E2E automatizados

## Legenda de Prioridade

- **P0 BLOQUEANTE** — Sem isso, nada funciona
- **P1 BLOQUEANTE** — Core do negocio, bloqueia operacao
- **P2 IMPORTANTE** — Necessario para operacao completa
- **P3 VISIBILIDADE** — Valor alto mas nao bloqueia operacao

## Riscos Mapeados

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Integracao Zebra GC420t | Etiquetas nao imprimem | Fallback PDF (Story 5.6 AC3) |
| RLS complexa com JOINs | Performance degradada | Volume piloto <500 lotes/mes, aceitavel |
| Rate limiting em memoria | Perda em restart | Aceitavel Fase 1, Upstash Redis Fase 2 |
| Supabase Realtime + RLS | Complexidade de config | Fallback polling se necessario |

## Workflow de Execucao

```
@data-engineer (5.1, 5.2) → @dev (5.3-5.9) → @qa (validacao) → @devops (5.10 deploy)
```

---

## Stories Supersedidas (Arch v2.0)

> As stories abaixo foram criadas com base na arquitetura v2.0 e estao supersedidas pelo Epic 5.

| ID | Story | Status Original |
|----|-------|-----------------|
| 1.1 | Setup do Projeto | Ready for Review (parcialmente valido) |
| 1.2 | Controle de Acesso | Draft (supersedida por 5.3) |
| 2.1 | Ordens de Producao | Draft (supersedida por 5.5) |
| 2.2 | Bipagem por Lote | Draft (supersedida por 5.4) |
| 2.3 | Impressao de Etiquetas | Draft (supersedida por 5.6) |
| 3.1 | Dashboard de Producao | Draft (supersedida por 5.7) |
| 3.2 | TV Dashboard / Kiosk | Draft (supersedida por 5.8) |
| 3.3 | Gestao de Retrabalho | Draft (removida da Fase 1) |
| 4.1 | Deploy + Testes Reais | Draft (supersedida por 5.10) |
