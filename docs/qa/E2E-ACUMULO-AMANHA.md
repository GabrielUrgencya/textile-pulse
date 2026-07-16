# Teste de ACÚMULO — conferência amanhã (07-16) com o cron real

**Tenant:** Fábrica Teste (`fabrica-teste-31ykr`) · **Montado:** 2026-07-15 (qua) · **Conferir:** 2026-07-16 (qui). Ambos dias úteis (seg-sex). liserie INTOCADA.

## Como funciona o teste
Hoje (07-15) cada operador/setor produz ABAIXO da meta. O cron `goal-closures` roda **de madrugada (00:30 SP)**, fecha o dia 07-15 e grava o déficit. **Amanhã (07-16)** a meta efetiva de cada um deve aparecer = **meta base + déficit de hoje**. É o teste definitivo — o cron real, não simulação.

## TABELA — o que conferir amanhã (07-16)

### Operadores (dashboard individual "Meu Plano")
| Operador | Setor | PIN | Meta base | Produziu hoje | Déficit esperado | **Meta efetiva amanhã** |
|---|---|---|---|---|---|---|
| CORTADOR BRUNO | Corte | 111111 | 800 | 500 | **300** | **1.100** (800+300) |
| COSTUREIRA ANA | Produção | 222222 | 1.200 | 0 | **1.200** | **2.400** (1.200+1.200) |
| TRAVETADOR CARLOS | Travete | 333333 | 500 | 500 | **0** (bateu — controle) | **500** (sem acúmulo) |
| EMBALADORA DORA | Embalagem | 444444 | 600 | 250 | **350** | **950** (600+350) |
| LIMPADORA EVA | Limpeza | 555555 | sem meta | — | — | empty state (controle) |

### Setores (TV por setor / dashboard geral)
| Setor | Meta base | Produção do setor hoje | Déficit esperado | **Meta efetiva amanhã** |
|---|---|---|---|---|
| Corte | 2.000 | 500 | **1.500** | **3.500** |
| Produção | 1.500 | 0 | **1.500** | **3.000** |
| Travete | 800 | 500 | **300** | **1.100** |
| Embalagem | 1.000 | 250 | **750** | **1.750** |

## O que verificar (amanhã)
1. **Meta efetiva = base + déficit** de hoje, em cada operador (Meu Plano) e cada setor (TV).
2. **Déficit/ticker na dashboard individual** com a quantidade certa (ex.: ANA "1.200 peças atrás", meta 2.400).
3. **CARLOS sem déficit** (bateu hoje) — prova que o acúmulo só ocorre para quem NÃO bateu.
4. **Coerência**: o mesmo número (meta efetiva e %) na dashboard individual, na geral, na TV e no relatório.
5. **EVA**: continua empty (sem meta, sem número absurdo).

## Roteiro de acesso
- **Login:** http://localhost:3000/login?tenant=fabrica-teste-31ykr (dev) — ou a URL de produção.
- **Admin** (dashboard geral + relatório): "Email e Senha" → `gestor.teste@fabricateste.local` / `Teste@123456`.
- **Operadores** (Meu Plano): "PIN Rápido" → BRUNO 111111 · ANA 222222 · CARLOS 333333 · DORA 444444 · EVA 555555. (Limite 5 PINs/15min por IP.)
- **TV:** http://localhost:3000/tv?token=141eb884-12d8-4f9d-9cca-5f6583e66b5c (visão geral; troca de setor no seletor).

## Confirmações técnicas
- Cron `goal-closures` agendado no vercel.json (`30 3 * * *` = 00:30 SP) — roda em produção para todos os tenants (inclui Fábrica Teste). CRON_SECRET configurado no Vercel (a cron de notificações já roda).
- goal_deficits do FT ZERADOS na montagem (teste começa limpo — o déficit de amanhã é só o de hoje, sem cadeia anterior).
- Dados só no Fábrica Teste; liserie intocada (54 OPs).

> Se amanhã a meta efetiva NÃO subir (déficit não acumulou), verificar primeiro se o cron rodou (logs do Vercel) — pode ser agendamento, não lógica. A lógica já foi provada no E2E; este teste valida o cron REAL fechando o dia.
