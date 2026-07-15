# Pendências pré-deploy (LISION) — status

## Pendência 1 — Bug de data (off-by-one de fuso) — ✅ RESOLVIDA
- **Raiz:** colunas `timestamptz` (`expected_return_at`/`expected_return`) recebiam string data-only crua → meia-noite UTC = dia anterior em BRT; displays sem `timeZone`.
- **Fix:** storage `localDayEnd(date)` (fim do dia no fuso do tenant) em `/api/shipments` e `/api/shipments/[id]/deadline`; display via helpers `formatDateBR`/`formatDateTimeBR` (tz.ts) — data pura formata direto, timestamptz no fuso `America/Sao_Paulo`. Aplicado em FactionDetail, ShipmentDrawer, ShipmentPaymentDialog, DeliveryCodeDisplay, portal (returns/defects/notifications/dashboard).
- **Prova:** `expectedReturn "2026-07-18"` → grava `2026-07-19T02:59Z` (=18/07 23:59 BRT) → exibe **18/07**. tsc+lint limpos. Testes headless: date puro e timestamptz → 18/07/2026.
- **Débito menor:** remessas criadas ANTES do fix (ex.: Bianca no E2E) têm o valor bugado gravado (exibem 17/07). Dado de teste; não afeta o código.

## Pendência 2 — Build de produção (CSS + estabilidade) — ✅ RESOLVIDA
- **Build:** `next build` OK (todas as rotas; `/dashboard` ○ Static). Sem erros.
- **CSS estático:** o HTML de produção traz `<link rel=stylesheet>` no `<head>` (`/_next/static/css/*.css`, `data-precedence=next`) → carregado antes do 1º paint.
- **Prova visual:** `/dashboard` na produção renderizou ESTILIZADO (cssRules=233, bodyBg=oklch(0.07 0 0) — tema escuro aplicado; screenshot com "Produzido hoje 2.950" + "Foi pro estoque 250"). FOUC era artefato **só do dev (Turbopack HMR)**.
- **Estabilidade:** `next start` subiu em **573ms** e respondeu estável. As quedas eram do **harness de preview / dev**, não do app.

## Pendência 3 — Auditoria de segurança (nível máximo) — EM ANDAMENTO
Portão final antes do deploy. Escopo: isolamento entre tenants (RLS + queries + cron por tenant + buscas por nome), auth/sessão (admin e-mail, PIN, rate-limit), autorização por papel (operador × admin, ?userId=), edge/API (kiosk sem-auth, validação, injeção), segredos (git/.env), exposição de dados, abuso/resiliência (cron não disparável). Entregável: relatório por severidade, Crítico/Alto fechados, veredito honesto.

## Commit/push
NÃO fazer até: Pendências 1 e 2 (feitas) + auditoria limpa + OK explícito do Gabriel. Então @devops prepara o commit consolidado.
