# Story — Calendário de trabalho por empresa (dias úteis por tenant)

**Status:** Draft (aprovada pelo Gabriel — 2026-07-13)
**Autor:** Aria (@architect) · **Frente:** 2 de 3

## Investigação (estado atual, confirmado com dados)
O sistema **hardcoda seg-sex** (`dow !== 0 && dow !== 6`) em 7 lugares:
`business-days.ts`, `goal-deficits.ts` (isBusinessDay/prevBusinessDay), `rollover.ts`
(effectiveDailyTarget), `user-meta.ts` e `sector-kpis.ts` (BUSINESS_DAYS_PER_WEEK=5 +
businessDaysBetween), `report-data.ts`, e o cron `goal-closures`.
Consequência: sábado/domingo **nunca** geram fechamento (bom p/ seg-sex por acaso), mas
**impossível** para empresa que opera sábado (o dia é invisível na cadeia). Não é configurável.
Tenants guardam `settings` JSON com `work_days_per_week` mas **sem** `work_days`/`holidays`.

## Decisão do Gabriel
Cada empresa (tenant) configura seus próprios dias de trabalho. A meta só acumula/cobra nos
dias úteis daquela empresa. Empresa seg-sáb conta sábado; seg-sex não. Estrutura pronta p/ feriados.

## Princípio de segurança (baixo risco)
**Default = seg-sex.** Tenant sem `work_days` configurado se comporta EXATAMENTE como hoje →
zero mudança para liserie e para as provas das frentes anteriores. Só muda quem configurar.

## Escopo técnico

### 1. Modelo de dados (SEM migração — usa tenants.settings JSON)
- `settings.work_days`: number[] de índices de dia da semana (0=Dom … 6=Sáb) que são úteis.
  Default `[1,2,3,4,5]` (seg-sex). Ex.: seg-sáb = `[1,2,3,4,5,6]`; todos = `[0,1,2,3,4,5,6]`.
- `settings.holidays`: string[] de `YYYY-MM-DD` NÃO-úteis (exceções). Default `[]`. (Estrutura
  pronta; UI de feriado pode vir depois.)

### 2. Novo lib `src/lib/work-calendar.ts`
- `interface WorkCalendar { workDays: Set<number>; holidays: Set<string>; }`
- `parseCalendar(settings): WorkCalendar` (defaults seg-sex se ausente/ inválido).
- `getTenantCalendar(supabase, tenantId): Promise<WorkCalendar>` (lê tenants.settings).
- `isWorkingDay(dateStr, cal): boolean` (dow ∈ workDays E dateStr ∉ holidays).
- `prevWorkingDay(today, cal): string` · `workingDaysBetween(from, to, cal): number` · `workingDaysPerWeek(cal): number` (= cal.workDays.size).

### 3. Refatorar os motores para serem calendar-aware (default preserva comportamento)
Threading do `WorkCalendar`:
- `goal-deficits.ts`: `prevBusinessDay` → aceitar calendário (nova assinatura ou overload);
  `getActiveDeficits`/`getActiveSectorDeficit` recebem `cal` e usam `prevWorkingDay(today, cal)` p/ a ref diária.
- `rollover.ts` `effectiveDailyTarget`: iterar dias úteis do `cal` (não hardcode).
- `user-meta.ts` / `sector-kpis.ts`: carregar o `cal` do tenant e passar adiante; `BUSINESS_DAYS_PER_WEEK` → `workingDaysPerWeek(cal)`; `businessDaysBetween` → `workingDaysBetween(..., cal)`.
- `report-data.ts`: `businessDaysBetween` → `workingDaysBetween(..., cal)` (tenant já disponível).
- Semana/mês (prevWeekStart/prevMonthStart) permanecem âncoras de calendário — NÃO mudam.

### 4. Cron `goal-closures` — por TENANT + calendário + escopável
- Reestruturar para **iterar tenants**: para cada tenant, carregar `cal`, seus usuários e
  `sector_targets`, e computar os fechamentos com `prevWorkingDay(today, cal)`.
- **Param opcional `?tenant=<id|slug>`**: quando presente, processa SÓ aquele tenant (permite
  rodar isolado — QA testa Fábrica Teste sem tocar liserie). Sem o param, roda todos (nightly).
- Em dia não-útil do tenant, a cadeia pula (não vira dívida). Idempotência preservada.

### 5. Config UI (tela de configuração do tenant)
- Seção "Dias de trabalho" em /settings: checkboxes Dom–Sáb (marca os úteis). Salva em
  `settings.work_days`. Reusar o caminho de update de settings existente. Só admin/gerente com
  permissão de settings. (Feriados: deixar o campo no modelo; UI depois.)

## Prova (QA — dados reais, Fábrica Teste, liserie intocada)
- Empresa seg-sex: fechar um **sábado** NÃO gera dívida (déficit não acumula no fim de semana).
- Empresa seg-sáb (configurar work_days=[1..6] no Fábrica Teste temporariamente): fechar **sábado**
  gera/cobra normalmente; **domingo** não.
- Meta de **segunda** reflete só os dias úteis anteriores (não pune por sáb/dom não trabalhados).
- Cron com `?tenant=fabrica-teste` processa só esse tenant (não grava nada na liserie).
- Regressão: com default seg-sex, os números das frentes anteriores permanecem idênticos.

## Fora de escopo
UI de feriados (só o modelo). Auditoria (Frente 3, depois).
