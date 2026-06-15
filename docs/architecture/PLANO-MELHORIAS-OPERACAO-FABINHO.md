# Plano de Melhorias — Operação Liserie (Feedback do Fabinho)

> **Autor:** Aria (@architect) | **Data:** 2026-06-15 | **Versão:** 1.0
> **Origem:** Transcrição dos áudios 1–8 do Fabinho (sócio operacional / piloto Liserie)
> **Status:** Aprovado pelo sócio (Gabriel) para virar stories no Epic 8
> **Decisões do dono:** (a) Meta = peças reais + total ponderado pelo peso da referência; (b) Excluir OP = cancelar/arquivar (soft), nunca apagar fisicamente.

---

## 1. Contexto e Diagnóstico

O Fabinho testou o LISION em operação real e validou que **todas as funções existentes funcionam**. O pedido central dele é **adaptar o sistema do mindset "comércio/Mercado Livre" (1 bipada = 1 item) para o mindset "confecção/lingerie" (contagem por PEÇA, com peso por modelo)**.

Quando ele fala em "criar um banco de dados", ele **não sabe que o LISION já tem** banco completo (Supabase/Postgres com 30+ tabelas, incluindo `production_orders`, `lots`, `scan_events`, `reference_targets`). O que ele quer existe em fundação — falta "ligar os fios" na bipagem e na tela.

### 1.1 Os 6 pedidos × estado atual

| # | Pedido (linguagem do Fabinho) | Estado atual no código | Conclusão |
|---|---|---|---|
| 1 | Produto cadastrado com a meta; OP puxa sozinha (cada conjunto = uma meta) | `production_orders.meta_coefficient` existe e a API aceita, mas o **form de Nova OP não envia** e **não há cadastro referência→meta** para autofill | **NOVO** → Story 8.13 |
| 2 | Meta por **peças**, não por bipagens | **Já resolvido**: Story **8.1** (`InProgress`, T1–T5 done) soma `lots.quantity × COALESCE(meta_coefficient,1.0)`; Story **8.12** filtra por turno na TV | **Concluir + QA** (não duplicar) |
| 3 | Bipar **início e fim** de processo; medir tempo/dias (prazo de facção) | `scan_events` só grava `STAGE_IN` (duplicado é bloqueado). Enum já prevê `STAGE_OUT`. `lots.entered_current_stage_at` existe | **NOVO** → Story 8.14 |
| 4 | Usuário **fracionar o lote** conforme necessidade | Form cria lotes em tamanhos **iguais** automaticamente; não há split manual por cor/tamanho/modelo | **NOVO** → Story 8.15 |
| 5 | **Excluir OP** | Rota `production_orders/[id]` só tem `GET`; sem cancelar/excluir | **NOVO** → Story 8.16 |
| 6 | **Botão da TV** na tela principal (sem link separado) | TV existe em `/tv` (kiosk + token), mas **AppSidebar não tem item de TV** | **NOVO** → Story 8.17 |

### 1.2 Decisão arquitetural central

> **Unidade de medida da produção = PEÇA, ponderada por coeficiente de referência.**
> Já implementada em 8.1/8.12 no nível de dashboard/TV. As novas stories (8.13–8.17) completam a experiência ao redor dessa decisão: cadastrar o coeficiente uma vez (8.13), medir tempo real de processo (8.14), e dar controle operacional (8.15/8.16) + vitrine (8.17).

---

## 2. Stories Novas (Epic 8 — continuação da numeração)

> Sequência recomendada de execução: **8.13 → 8.14 → 8.15 → 8.16 → 8.17**.
> Bloco 1 (lingerie): 8.13 + 8.15. Bloco 2 (tempo/exclusão): 8.14 + 8.16. Bloco 3 (vitrine): 8.17.

### Story 8.13 — Cadastro de Referência com Meta + Autofill na OP
**Pedido #1 · Prioridade P1 · Complexidade M**

**Problema:** Não há onde cadastrar "a referência 1006 vale coeficiente X". Ao criar a OP, o usuário teria que digitar o peso na mão toda vez — e o form nem expõe esse campo.

**Solução:**
- Tela de cadastro de referências (CRUD) usando a tabela `reference_targets` (`tenant_id`, `reference`, `meta_coefficient`, `description`). Já existe no schema.
- API `GET/POST/PATCH/DELETE /api/settings/references`.
- No form de Nova OP (`src/app/(app)/production/orders/new/page.tsx`): campo Referência vira combo com busca; ao selecionar/ digitar uma referência conhecida, **preenche `meta_coefficient` automaticamente** (com fallback editável). O POST de OP passa a enviar `meta_coefficient`.

**Escopo IN:**
- `src/app/api/settings/references/route.ts` (CRIAR — GET, POST)
- `src/app/api/settings/references/[id]/route.ts` (CRIAR — PATCH, DELETE)
- `src/components/settings/ReferencesConfig.tsx` (CRIAR)
- `src/app/(app)/production/orders/new/page.tsx` (MODIFICAR — autofill + enviar `meta_coefficient`)
- `src/app/(app)/settings/` (MODIFICAR — adicionar aba Referências)

**OUT:** consumo de matéria-prima por conjunto (módulo Hunter, futuro); cadastro de produto completo com fotos.

**Compatibilidade:** referências antigas sem coeficiente → fallback `1.0` (regra de 8.1).

---

### Story 8.14 — Bipagem de Início e Fim de Processo + Tempo por Etapa
**Pedido #3 · Prioridade P1 · Complexidade M**

**Problema:** Hoje cada lote registra só a **entrada** na etapa. Não dá pra saber quanto tempo levou um processo, nem (na facção) quantos dias faltam para o prazo.

**Solução:**
- `/api/scan` aceita `event_type` = `STAGE_IN` **ou** `STAGE_OUT`. Remover o bloqueio rígido de duplicado: permitir o par IN→OUT na mesma etapa (bloquear apenas IN→IN ou OUT sem IN).
- Calcular duração da etapa = `STAGE_OUT.scanned_at − STAGE_IN.scanned_at` e expor no detalhe do lote e nos KPIs de tempo médio por etapa.
- UI de bipagem (`/scan`) ganha seletor **Início / Fim** (default inteligente: se o lote já tem IN aberto na etapa, sugere Fim).
- Facção: usar `faction_shipments.expected_return_at` (já existe) para exibir **"faltam N dias / atrasado há N dias"**. Esta parte conecta com 8.7/8.8 (status de trânsito e alerta de não-confirmação).

**Escopo IN:**
- `src/app/api/scan/route.ts` (MODIFICAR — suportar STAGE_OUT + lógica de duplicado)
- `src/app/(app)/scan/` (MODIFICAR — toggle Início/Fim)
- `src/app/api/production/lots/[id]/route.ts` (MODIFICAR — retornar durações por etapa)
- `src/app/api/dashboard/kpis/route.ts` (MODIFICAR — tempo médio por etapa real)

**OUT:** pagamento por tempo de processo (futuro); cronômetro ao vivo na TV.

**Risco:** mudar a regra de duplicado pode afetar fluxo atual de bipagem única. Mitigação: feature compatível — se nenhum OUT for bipado, comportamento permanece igual ao atual.

---

### Story 8.15 — Fracionamento Manual de Lote
**Pedido #4 · Prioridade P2 · Complexidade M**

**Problema:** O sistema só divide a OP em lotes de tamanho igual. Lingerie precisa quebrar um lote em pedaços por **cor, tamanho ou modelo** (lotes pequenos com variação).

**Solução:**
- Endpoint `POST /api/production/lots/[id]/split` que recebe uma lista de frações (`[{quantity, label?}]`). Valida que a soma das frações ≤ quantidade disponível do lote; cria novos lotes filhos (`barcode` sequencial via mesma regra) e ajusta/encerra o lote-mãe.
- UI no detalhe da OP: botão "Fracionar lote" abre modal para definir as partes (com preview, igual ao preview de sub-lotes já existente).

**Escopo IN:**
- `src/app/api/production/lots/[id]/split/route.ts` (CRIAR)
- `src/app/(app)/production/orders/[id]/page.tsx` (MODIFICAR — botão + modal de fracionamento)
- `src/components/production/SplitLotModal.tsx` (CRIAR)

**OUT:** fracionar lote que já passou de determinada etapa (regra: só fraciona em `CREATED`/`IN_CUT`); atributos estruturados de cor/tamanho (usar `label` livre na Fase 1).

**Compatibilidade:** lote-mãe fracionado fica com status/quantidade ajustados; rastreabilidade preservada via novos barcodes filhos.

---

### Story 8.16 — Cancelamento/Arquivamento de OP
**Pedido #5 · Prioridade P2 · Complexidade S**

**Problema:** Não há como remover uma OP criada por engano.

**Solução (decisão do dono: soft delete):**
- `DELETE /api/production/orders/[id]` faz **soft cancel**: seta `status = 'CANCELLED'`, grava quem/quando em `audit_log` (já existe). Não apaga registros.
- Listagem (`GET /api/production/orders`) passa a **ocultar** OPs canceladas por padrão (filtro `?include_cancelled=true` para auditoria).
- UI no detalhe da OP: botão "Cancelar OP" com modal de confirmação (digitar o número da OP) + motivo. Permissão `orders:create`/admin.

**Escopo IN:**
- `src/app/api/production/orders/[id]/route.ts` (MODIFICAR — adicionar DELETE soft)
- `src/app/api/production/orders/route.ts` (MODIFICAR — ocultar canceladas)
- `src/app/(app)/production/orders/[id]/page.tsx` (MODIFICAR — botão + modal)

**OUT:** hard delete físico; reabrir OP cancelada (futuro).

---

### Story 8.17 — Botão de Acesso à TV no Menu
**Pedido #6 · Prioridade P2 · Complexidade S**

**Problema:** A TV só abre por link/token separado. O Fabinho quer um botão nativo (diferencial comercial).

**Solução:**
- Item "TV / Painel" no `AppSidebar` (e atalho no header do Dashboard) que abre o modo TV em nova aba/tela cheia.
- Reaproveitar o fluxo de kiosk-token existente (`/api/admin/kiosk-tokens`): o botão gera/usa um token válido do tenant e abre `/tv?token=...` — sem o admin precisar copiar link manualmente.

**Escopo IN:**
- `src/components/layout/AppSidebar.tsx` (MODIFICAR — item TV)
- `src/components/tv/` ou Dashboard header (MODIFICAR — botão "Abrir TV")
- Reuso de `src/app/api/admin/kiosk-tokens/route.ts`

**OUT:** múltiplos layouts de TV configuráveis; cast direto.

---

## 3. Itens já cobertos (NÃO recriar — apenas concluir/QA)

| Pedido | Story existente | Status | Ação |
|---|---|---|---|
| #2 Meta por peças ponderada | **8.1** | InProgress (T1–T5 done, T6 teste pendente) | Finalizar T6 + QA gate |
| #2/#6 Meta por turno na TV | **8.12** | Ready (implementada) | QA gate |
| #3 Prazo/status facção | **8.7 / 8.8** | Draft/Ready | Alinhar com 8.14 (datas/dias) |

---

## 4. Impacto no Banco de Dados

**Nenhuma migration estrutural nova é obrigatória** — o schema v2.1 já contempla:
- `reference_targets` (8.13)
- `scan_events.event_type` enum com `STAGE_OUT` (8.14)
- `lots` quantidade/barcode para split (8.15)
- `production_orders.status` aceita `'CANCELLED'` (8.16) — confirmar CHECK/enum durante implementação
- `audit_log` (8.16)

@data-engineer deve apenas validar índices/constraints durante a Fase Dev (ex.: status CANCELLED no filtro de listagem; constraint de soma em split é regra de aplicação).

---

## 5. Ordem de Execução e Workflow

```
@architect (este plano) ─► @sm (draft 8.13–8.17) ─► @po (validate) ─► @dev (implement) ─► @qa ─► @devops (push)
```

| Bloco | Stories | Justificativa de prioridade |
|---|---|---|
| 1 — Adaptação lingerie | 8.13, 8.15 | "Destrava para rodar na fábrica" (palavras do Fabinho) |
| 2 — Tempo & exclusão | 8.14, 8.16 | Controle operacional e correção de erros |
| 3 — Vitrine comercial | 8.17 | Efeito de venda; rápido, pode ser antecipado |

**Fora de escopo desta rodada:** consumo de matéria-prima por conjunto (paridade Hunter), pagamento por tempo, integrações fiscais/marketplace.
</content>
</invoke>
