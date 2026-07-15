# E2E DEFINITIVO — LISION (crivo final antes do deploy)

**Arquiteta:** Aria (@architect) · **Constrói/valida no banco:** Dara (@data-engineer) · **Prova na tela:** Quinn (@qa)
**Tenant de teste:** Fábrica Teste (`fabrica-teste-31ykr`, id `69d6ebf0-e372-4b27-a469-d538622fe3aa`) · **liserie INTOCADA** (baseline **54 OPs** antes e depois)
**Data real (fuso tenant −03:00):** 2026-07-14 (terça). `prevWorkingDay(07-14, seg-sex)=07-13 (seg)`; cadeia 07-13→**07-10 (sex)** pula sáb 07-11 / dom 07-12.

## Motor (fonte de verdade — as 4 telas leem daqui)
- **Dashboard individual** → `/api/my-plan` → `computeUserMeta` (STAGE_OUT ponderado do usuário na etapa; meta efetiva = `accumulatedGoal(base, déficit persistido USER)`; CANCELLED fora).
- **Dashboard geral** → `/api/dashboard/all` → `computeKpis`.
- **TV (setor + geral)** → `/api/kiosk/dashboard` → `computeSectorKpis`.
- **Relatório** → `/api/reports/production` → `computeProductionReport`.
- **Déficit**: `goal_deficits` (scope USER e SECTOR). `getActiveDeficits(hoje)` lê a linha de `prevWorkingDay(hoje)` — cujo `deficit` já é a **cadeia acumulada** (cada fechamento grava `base = diária + déficit_anterior`).
- **Fechamento**: `GET /api/cron/goal-closures?tenant=fabrica-teste-31ykr` (header `x-cron-secret: $CRON_SECRET`), fecha `prevWorkingDay(hoje, calendário do tenant)`.
- **Determinismo**: NÃO cadastrar `reference_stage_targets` (coeficiente = 1.0) → produção = Σ quantidade dos lotes com STAGE_OUT (dedupe por lote). Assim cada número é conhecido de antemão.

---

## FASE 0 — Reset limpo do Fábrica Teste (Dara)
Apagar SOMENTE dado de teste do FT (ordem FK): `scan_events` (dos lotes do FT) → `lots` (das OPs do FT) → `production_orders` (FT) → `goal_deficits` (FT) → `user_targets` (FT) → `sector_targets` (FT). Manter perfis (reconfigurar) e facções (ou recriar 1 de teste). **NÃO tocar liserie.** Snapshot antes. Confirmar `goal_deficits(FT)=0`, `scan_events(FT)=0`, `production_orders(FT)=0` e `LISERIE_OPS=54`.

## FASE 1 — Construir o cenário (Dara) — números CONHECIDOS

### Setores + metas de setor (`sector_targets`, distintas)
| Setor (stage) | daily_target |
|---|---|
| CORTE | 1000 |
| PRODUCAO (Produção/Facção) | 1500 |
| TRAVETE | 800 |
| EMBALAGEM | 500 |
| LIMPEZA | **sem meta** (prova empty state de setor) |

### Operadores + meta individual (`user_targets`, PIN conhecido, `profiles.sector` = nome do stage)
| Operador | Setor | Meta individual | PIN |
|---|---|---|---|
| BRUNO | CORTE | **1200** | (Dara define, conhecido) |
| ANA | PRODUCAO | **800** | conhecido |
| CARLOS | TRAVETE | **500** | conhecido |
| DORA | EMBALAGEM | **sem user_target** (herda sector 500) | conhecido |
| EVA | LIMPEZA | **sem meta nenhuma** (empty state operador) | conhecido |

### Produção do dia D (=hoje 07-14) — STAGE_OUT, 1 lote = 1 scan, coef 1.0
| Operador | Produz hoje | Meta efetiva hoje | % esperado | Observação |
|---|---|---|---|---|
| BRUNO | 1200 | 1200 | 100% | meta exata batida |
| ANA | 600 | **1400** (800 + déficit 600, ver Fase 3) | 42,9% | caso de déficit |
| CARLOS | 650 | 500 | 130% | supera a base |
| DORA | 250 | 500 (sector) | 50% | herança de meta do setor |
| EVA | 0 | — | — | empty state |
| (OP CANCELLED) | +300 numa OP `CANCELLED` de BRUNO | — | — | NÃO pode contar (borda) |

### Produção por SETOR hoje (Σ operadores do stage) — esperado
| Setor | Produzido | Meta efetiva | % |
|---|---|---|---|
| CORTE | 1200 (BRUNO; CANCELLED fora) | 1000 | 120% |
| PRODUCAO | 600 (ANA) | **2500** (1500 + déficit 1000, Fase 3) | 24% |
| TRAVETE | 650 (CARLOS) | 800 | 81,25% |
| EMBALAGEM | 250 (DORA) | 500 | 50% |

---

## PILAR 1 — Amostragem correta em TODAS as telas (Quinn prova)
Para cada operador/setor, comparar **o que foi bipado (verdade)** com **cada tela**:
- **Produção por SETOR** = Σ bipagens do setor (CANCELLED fora) → conferir na **TV do setor** e na **dashboard geral**.
- **Produção por OPERADOR** = a produção do próprio usuário → conferir na **dashboard individual** (login PIN de cada um): ANA vê 600, BRUNO 1200, CARLOS 650 — **nunca a de outro nem a soma do setor**.
- **Meta vs realizado**: meta (setor e individual) correta; `% = realizado ÷ meta efetiva`.
- **Coerência 4 telas**: mesmo dado em dashboard individual, geral, TV e relatório.
Evidência: para cada número → bipado / esperado / lido na tela (screenshot ou inspeção real) / bate?.

## PILAR 2 — Déficit acumula e resolve (individual E setor) — o cenário crítico
Datas reais (seg-sex): **D-2 = 07-10 (sex)**, **D-1 = 07-13 (seg)**, **D = 07-14 (hoje)**.

1. **Acúmulo 1 dia (via cron real)**: seed produção de ANA e do setor PRODUCAO em **07-13** abaixo da meta → rodar o cron (`?tenant=…`) → ele grava `goal_deficits`:
   - ANA: base 800, produz **500** → déficit **300** (linha USER 07-13).
   - PRODUCAO: base 1500, produz 500 → déficit **1000** (linha SECTOR 07-13).
   Provar em 07-14 que a **meta efetiva** aparece somada (ANA 800+300=1100; setor 1500+1000=2500) na dashboard individual, na TV do setor e no relatório.
2. **Cadeia 2 dias (sem teto)**: seed também a linha **07-10** de ANA (déficit 300, como um fechamento anterior) e refazer o fechamento de 07-13 com `base=800+300=1100`, produz 500 → déficit **600**. Provar meta efetiva hoje = 800+600 = **1400** (soma 300+300, sem teto). *(Ajusta os números da tabela do Pilar 1 para ANA: meta efetiva 1400, % = 600/1400 = 42,9%.)*
3. **Ticker/déficit individual sem vazamento**: o déficit de ANA (600) aparece **na dashboard da ANA** com a quantidade certa; a dashboard do BRUNO/CARLOS **não** mostra o déficit da ANA.
4. **Resolução**: um operador com déficit ativo (ex.: CARLOS com déficit seed) **produz além** da meta efetiva hoje → % ≥100, distância 0, `completed`. E ao fechar esse dia pelo cron, `deficit = max(0, efetiva − produzido) = 0` → cadeia zera. Provar em tela que a dívida abate na proporção certa.

## PILAR 3.5 — Calendário por tenant (fim de semana) dentro do fluxo
- **seg-sex**: provar que **07-11 (sáb) e 07-12 (dom) NÃO têm linha em `goal_deficits`** (cron não gera dívida em dia não-útil) e que a meta de segunda (07-13) reflete só a sexta (07-10) — sem "somar dois dias de fim de semana". A cadeia 07-10→07-13 é a prova viva.
- **seg-sáb**: setar `settings.work_days=[1..6]` no FT e provar (via a MESMA lib `prevWorkingDay`/`workingDaysBetween` que cron e dashboards usam, exercitada de forma headless sobre 07-10..07-14, e via cron escopado) que **sábado conta** (prevWorkingDay(seg, seg-sáb)=sáb) e **domingo continua fora**.
- **Consistência**: dashboard individual, setor, TV e relatório respeitam o MESMO calendário (nenhuma tela "acha" que sábado foi útil quando o tenant diz que não). Restaurar `work_days` ao final.
Evidência: qual dia o cron fechou, quais NÃO fechou, e o déficit resultante em cada tela.

## PILAR 4 — Isolamento e não-interferência
- Vários operadores simultâneos: meta/produção/déficit/ticker de um não afeta o outro (matriz cruzada).
- **Multi-tenant**: nada do FT aparece na liserie e vice-versa; **liserie 54 OPs antes = 54 depois**.
- Calendário: operador/setor em dia não-útil não acumula déficit indevido.

## PILAR 5 — Bordas
- **OP CANCELLED**: as 300 peças da OP cancelada do BRUNO não contam em NENHUMA tela (operador, setor, geral, relatório).
- **Virada de dia**: produção do dia zera na virada (fuso tenant); acúmulo persiste (a linha `goal_deficits` sobrevive).
- **Operador/Setor sem meta**: EVA (LIMPEZA) → empty state limpo, sem número absurdo, sem erro.
- **Meta alterada no meio**: mudar uma `sector_target` (ex.: TRAVETE 800→650) e provar que o % recalcula em TODAS as telas (CARLOS 650 → 100%).

---

## CRITÉRIO DE APROVAÇÃO
Cada item provado com **evidência**: bipado / esperado / lido na tela / bate. Screenshots ou inspeção real das 4 telas — nunca "o código está certo". Qualquer divergência, déficit errado ou vazamento = **FALHA** → corrigir (@dev/@data-engineer) → re-testar → repetir até 100%. Entregar **relatório E2E consolidado** (cenário, evidência, PASS/FAIL por item). Deploy só com tudo verde. **Sem commit/push** até E2E verde + auditoria de segurança + validação do Gabriel.

---

## TABELA-VERDADE — construída e VALIDADA no banco por Dara (2026-07-15)
Datas reais: **D=07-15 (qua)**, **D-1=07-14 (ter, fechado pelo cron)**, **D-2=07-13 (seg, seed prévio ANA)**. Cron rodou escopado ao FT (`closed.daily=4, sectors=4`). Coef 1.0. **liserie 54→54**. PINs: **BRUNO 1111 · ANA 2222 · CARLOS 3333 · DORA 4444 · EVA 5555 · GESTOR(admin) 9999** (tenant slug `fabrica-teste-31ykr`). Token TV: `141eb884-12d8-4f9d-9cca-5f6583e66b5c`.

### Déficit ativo hoje (linha `goal_deficits` de 07-14, lida por `getActiveDeficits(07-15)`)
| Sujeito | 07-13 (seed) | 07-14 (cron) = déficit ATIVO hoje |
|---|---|---|
| ANA (user) | déficit 300 | base 1100 (800+300) − prod 500 = **600** (cadeia 2 dias, 300+300) |
| BRUNO (user) | — | 1200 − 1200 = **0** |
| CARLOS (user) | — | 500 − 400 = **100** |
| DORA (user) | — | 500 − 500 = **0** |
| EVA (user) | — | sem meta → **sem linha** |
| CORTE (setor) | — | 1000 − 1200 = **0** |
| PRODUCAO (setor) | — | 1500 − 500 = **1000** |
| TRAVETE (setor) | — | 800 − 400 = **400** |
| EMBALAGEM (setor) | — | 500 − 500 = **0** |
| 07-11 sáb / 07-12 dom | — | **ZERO linhas** (fim de semana não acumula) ✓ |

### O que CADA tela deve mostrar HOJE (07-15) — a VERDADE
**Operador (dashboard individual `/my-plan`):**
| Operador | base | déficit | meta efetiva | produziu hoje | % | estado |
|---|---|---|---|---|---|---|
| BRUNO (CORTE) | 1200 | 0 | **1200** | 1200 | **100,0%** | batida |
| ANA (PRODUCAO) | 800 | 600 | **1400** | 600 | **42,9%** | déficit 600 no ticker |
| CARLOS (TRAVETE) | 500 | 100 | **600** | 650 | **108,3%** | resolvido (quita, dist 0) |
| DORA (EMBALAGEM) | 500 (herda setor) | 0 | **500** | 250 | **50,0%** | sem user_target |
| EVA (LIMPEZA) | — | — | **—** | 0 | — | empty state |

**Setor (TV) — VALIDADO via kiosk API (motor):**
| Setor | meta efetiva | produziu hoje | % | conferido |
|---|---|---|---|---|
| CORTE | 1000 | **1200** (CANCELLED +300 fora) | **120%** | ✓ motor |
| PRODUCAO | 2500 | 600 | **24%** | ✓ motor |
| TRAVETE | 1200 | 650 | **54,2%** | ✓ motor |
| EMBALAGEM | 500 | 250 | **50%** | ✓ motor |
| LIMPEZA | null | 0 | — (empty) | ✓ motor |

**Borda CANCELLED**: OP `E2E-C-3` (status CANCELLED) do BRUNO tem +300 no CORTE hoje que **não aparece** em nenhum número (BRUNO 1200, CORTE 1200). Já provado no motor; Quinn confirma nas telas.

### Calendário (Pilar 3.5) — provar HEADLESS na lib real
Hoje (qua) a cadeia viva (07-15→07-14→07-13) não cruza fim de semana. Provar o comportamento sáb/dom exercitando as funções REAIS que cron e dashboards usam (`prevWorkingDay`, `workingDaysBetween`, `parseCalendar` de `src/lib/work-calendar.ts`) sobre 07-10..07-15 com os dois calendários (seg-sex e seg-sáb): sob seg-sex `prevWorkingDay(seg 07-13)=sex 07-10` (pula sáb/dom); sob seg-sáb `prevWorkingDay(seg 07-13)=sáb 07-11`. Complemento vivo: as **0 linhas** de `goal_deficits` em 07-11/07-12 já provam que dia não-útil não acumulou.

### Backup / reversão
Dado de teste anterior do FT salvo em `docs/qa/_e2e_backup_FT.json` (5 OPs, 16 lots, 18 scans, 11 goal_deficits). Reset só do FT; liserie nunca tocada.
