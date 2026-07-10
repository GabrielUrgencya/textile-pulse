# Auditoria — Divergência de Métricas (investigação por evidência)

**Autora:** Dara (@data-engineer) · **Data:** 2026-07-10 · **Banco:** produção (real)
**Regra:** nenhum número afirmado sem query real. Cada hipótese abaixo tem query + resultado + veredito.

---

## 🔴 CAUSA RAIZ PRINCIPAL (confirmada) — resolução de etapa sem escopo de tenant

`computeUserMeta` resolve a etapa do usuário pelo setor com:
```
supabase.from("stages").select("id").ilike("name", sector).maybeSingle()   // SEM tenant_id
```
Existem **2 tenants** (`liserie`, `fabrica-teste-31ykr`) e ambos têm as **mesmas 8 etapas** (`CORTE`, `TRAVETE`, `ESTOQUE`…). Sem filtro de tenant, `"TRAVETE"` casa **2 linhas** → `.maybeSingle()` retorna **PGRST116 (multiple rows)** → `stageId = null` → **`computeUserMeta` devolve `null` — a meta inteira some.**

**Prova executada:**
| Query | Resultado |
|---|---|
| `.ilike("name","TRAVETE").maybeSingle()` (código atual) | ❌ `PGRST116` → stageId=null → **META NULL** |
| `.eq("tenant_id", liserie).ilike("name","TRAVETE").maybeSingle()` (fix) | ✅ `id=4fdea089` → resolve certo |

**Alcance:** 14 perfis com setor definido → **apenas 1 tem `user_targets`** (resolve pelo stage_id explícito, escapa do bug). **Os outros 13 dependem do fallback por setor → meta 100% quebrada.**

**Natureza:** é uma **regressão latente** — antes do 2º tenant existir, cada nome de etapa casava 1 linha e funcionava. Ao criar "Fábrica Teste" com os mesmos nomes de etapa, todo o fallback quebrou. **Bônus de severidade:** sem escopo de tenant, a resolução poderia casar a etapa do tenant ERRADO (vazamento cross-tenant).

---

## H1 — "Produção do dia" zero (sintomas #2/#3) · **REFUTADA (a hipótese do nome)**
- Etapa `name = "ESTOQUE"` (case-sensitive) **existe** (1 por tenant). A hipótese da caixa/nome está errada.
- **Porém:** `STAGE_OUT` hoje (2026-07-10) = **0** em todas as etapas; últimos 7 dias = **81**. Hoje simplesmente ainda não houve produção → o card mostra 0 corretamente para o dia.
- O "zero travado" percebido é, na verdade, a **causa raiz acima** (meta null nos 13 usuários), não o card de produção do dia.

## H2 — TV ≠ Dashboard (sintoma #4) · **CONFIRMADA (fontes diferentes)**
Três fontes de "produção" distintas, provadas:
- `production_orders.meta_coefficient`: 60 OPs com valor, distintos = **{1, 2, 1.2, 0.25}** → usado pelo card "Produção do dia" e pela TV.
- `reference_stage_targets`: **101 linhas** → usado pelo `computeUserMeta` ("Minha meta"). **Peso de fonte diferente → nunca batem.**
- Janela de tempo: TV usa dia **UTC**, dashboard usa dia **LOCAL (SP)**. Hoje sem produção no offset → coincidiram; em dia com produção perto da virada, divergem em 3h.

## H3 — Meta não acumula (sintoma #1) · **REFUTADA no banco / mascarada pela causa raiz**
- `goal_deficits` **tem 8 linhas** (daily), acumulação correta: user com base 2100→2200→2300→2400 (+daily/dia), `carried_to` até 2026-07-10. **O acúmulo está gravado e evoluindo** — o cron rodou.
- Mas os 13 usuários do fallback **nunca veem esse acúmulo** porque `computeUserMeta` morre na resolução de etapa (causa raiz) e devolve null. Não é o acúmulo que falha — é a meta que não renderiza.

## H4 — Setor ainda mostra meta de semana/mês (sintoma #5) · **CONFIRMADA (meta derivada)**
- `sector_targets`: 8 linhas, **todas com `weekly_target = null` e `monthly_target = null`**. Só `daily_target` está setado.
- `computeUserMeta` **deriva** semana/mês da diária (`weekly = daily × 5`, `monthly = daily × dias úteis`), marcada "estimada".
- `TRAVETE` tem `daily_target = 2200` (destoa dos outros ~180-200) → é o "setor específico" que ainda mostra semana/mês grandes.
- O botão "Zerar meta" só grava `goal_deficits.deficit = 0` — **não toca `sector_targets.daily_target`** (a base). Por isso a semana/mês derivadas continuam. Para zerar de verdade, é preciso limpar a **base diária** do setor.

## H5 — Produção estática (sintoma #3) · **REFUTADA (é a causa raiz + dia sem produção)**
- Há STAGE_OUT nos últimos 7 dias (81), mas hoje = 0 → não é polling nem query morta; é o dia atual sem produção somado à meta null dos 13 usuários.

---

## Produção real por etapa (últimos 7 dias, prova de que a fábrica produz)
```
CORTE(liserie)=12  AVIAMENTOS=11  PRODUCAO=13  TRAVETE=8  LIMPEZA=8
CONFERENCIA=8  EMBALAGEM=8  ESTOQUE=8   |  fabrica-teste: CORTE=3 AVIAMENTOS=1
```

---

## Resumo executivo (para o @architect decidir as correções)
1. **[CRÍTICO] Escopo de tenant na resolução de etapa** (`user-meta.ts` + auditar todos os `.ilike("name"...)` de stages sem tenant). Corrige #1, #2 e a maior parte de #4. Também fecha vazamento cross-tenant.
2. **[ALTO] Unificar a fonte de "produção"** — decidir 1 métrica canônica (ESTOQUE vs etapa-do-usuário) e 1 fonte de coeficiente (`meta_coefficient` vs `reference_stage_targets`), e alinhar janela de tempo (local vs UTC) entre TV e dashboard. Corrige #4.
3. **[MÉDIO/negócio] "Zerar meta"** — decisão do Gabriel: zerar só o acúmulo (atual) ou também a base diária do setor? Corrige #5 conforme a intenção.
4. `goal_deficits`/cron: **não é o problema** — está funcionando; o acúmulo só estava invisível pela causa raiz #1.

---

## FECHAMENTO (Dara — execução das Correções 5/6 e verificações)

### Correção 5 — mapeamento setor→etapa por operador (EXECUTADO)
Mecanismo: `computeUserMeta` lê **`user_targets`** (não `user_stages` — este é enforcement de bipagem, Story 9.4). Lever correto = `user_targets`.

Inventário dos 12 operadores liserie em fallback:
- **Produtivos que já resolvem pós-fix de tenant:** Rodrigo, GABRIEL XAVIER (CORTE).
- **Produtivos mapeados agora (COSTURA→PRODUCAO):** GABRIEL TESTE, MARIA CLARA AMANCIO DOS SANTOS, PRODUÇÃO. Gravado `user_targets(stage_id=PRODUCAO, daily_target=NULL)` → herdam a meta base do setor (200/dia). **Prova:** ANTES `resolved=false` → DEPOIS `resolved=true, etapa=Produção/Facção, target=200`. ✅
- **Não-produtivos (sem meta, decisão Gabriel):** Luana, Fabio Silvestre, Fabinho, JANAINA, Karen, Erica Mara (ADMINISTRATIVO/ADMINISTRACAO/EXPEDICAO).

### TRAVETE — 2.200/dia NÃO é erro (corrige hipótese anterior)
Produção real do TRAVETE (últimos 30d, ponderada): **média 2.584/dia, pico 7.800/dia**, 9 dias com produção. O travete é operação de altíssima vazão — 2.200 é coerente (até um pouco abaixo da média real). **Recomendação: NÃO alterar** (ou subir para ~2.584 se o Gabriel quiser a meta = média real). A percepção de "destoa dos ~180-200" era comparação ingênua entre setores de vazões muito diferentes.

### Fuso do computeUserMeta — inconsistência real, latente
`computeUserMeta` usa bounds UTC; `kpi-queries` usa fuso local. No dia testado (sem produção no gap 00-03h) deu igual (60=60), mas a inconsistência é real e separa a meta do resto perto da virada. **Recomendação: alinhar computeUserMeta ao fuso do tenant** (localDayStart/End), coerente com a Correção 2. Prioridade baixa (latente), mas deve ser fechado.

### Higiene de dados (menor)
`Erica Mara de Lima` aparece com **perfil duplicado** (2 linhas, mesmo nome/setor) no liserie — vale limpar depois.
