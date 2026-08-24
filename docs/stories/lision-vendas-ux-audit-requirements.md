# LISION Vendas — Auditoria UX & Requisitos de Refinamento

> **Autoria:** Uma (UX/UI) — auditoria ao vivo · **Formalização:** Aria (Architect) · **Execução:** Dex (Dev)
> **Data:** 2026-08-24 · **Método:** auditoria heurística ao vivo (dev localhost, tenant Fábrica Teste, perfil ADMIN gestor)
> **Personas:** (1) **Gestora comercial** — configura o ciclo, lança/audita vendas, fecha período; (2) **Consultora** — acompanha o próprio desempenho.
> **Princípio-guia:** reciclar o design system do Lision (LisionCard/KpiCard/RadialGauge/recharts/StatusBadge). **Não construir do zero.**

---

## 0. Achados transversais (afetam todos os módulos)

| ID | Severidade | Achado | Decisão de UX | Requisito p/ Dev |
|----|-----------|--------|---------------|------------------|
| CROSS-1 | **Alta** | Telas de config (Metas, Períodos, Fechamento, Configurações) exibem "Carregando fonte canônica…" cru por ~2s — sem skeleton, e o rodapé da sidebar fica "Carregando…" com avatar "?". Sensação de app quebrado. | Skeletons proporcionais ao layout final (como o Dashboard já faz com `Skeleton`). Sidebar nunca deve mostrar "Carregando…" — renderizar o usuário do lado servidor ou manter o último estado. | Criar um componente `SalesLoading` (skeletons por tipo de tela: form, tabela, cards) e aplicar em todas as telas admin. Hidratar identidade da sidebar no SSR. |
| CROSS-2 | Média | "Status" aparece como texto simples ("Aberto", "Ativo") em Períodos/Calendário, mas como `StatusBadge` em Vendas. Inconsistência. | Padronizar em `StatusBadge` em todo o subsistema. | Trocar textos de status soltos por `<StatusBadge>` (tokens de cor por estado). |
| CROSS-3 | Média | Estados vazios são frases secas ("Nenhum agregado…"). Não orientam a próxima ação. | Estado vazio = ícone + frase + **CTA** para a ação que resolve (ex.: "Nenhuma venda ainda → Nova venda"). | Componente `EmptyState` reutilizável (ícone, título, descrição, ação opcional). |
| CROSS-4 | Média | Botões de ação destrutiva/irreversível (Fechar período, Desativar método) disparam direto, sem confirmação explícita. | Ações irreversíveis exigem confirmação (modal com resumo do impacto). | Modal de confirmação reutilizável para ações irreversíveis. |
| CROSS-5 | Baixa | Formulários não indicam campos obrigatórios antes do submit (o PV só reclama ao salvar). | Marcar obrigatórios (`*`) e validar no blur. | Marcar required + validação inline nos forms. |

---

## 1. Dashboard comercial (`/vendas/admin`)

**Estado atual:** KPIs animados (bom), 1 gráfico de parcelamentos **pequeno** (220px, coluna 2/3) e ranking em barras. O usuário classificou como "pobre em gráfico".

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| DASH-1 | **Alta** | Só existe 1 gráfico e ele é pequeno. Falta a leitura mais importante: **evolução do realizado ao longo do período**. | Adicionar um **gráfico de tendência em destaque** (área/linha, altura ≥ 320px) — realizado acumulado por dia útil vs. linha de ritmo ideal. Reciclar a onda do `SalesLiveTv`/`TVWaveChart`. | Novo endpoint/agregação "realizado por dia" no período + `AreaChart` recharts com `Brush` para zoom. |
| DASH-2 | **Alta** | Gráfico de parcelamentos espremido em coluna estreita. | Promover para largura maior e dar respiro; parcelamentos vira card secundário abaixo do herói de tendência. | Reorganizar grid: linha 1 = tendência (full-width), linha 2 = parcelamentos + formas de pagamento lado a lado. |
| DASH-3 | Média | Não há **medidor de progresso das metas** — a gestora não vê "quanto falta pra bater a Meta 1/2/3". | Faixa de **RadialGauge/MiniRing por meta** (realizado vs meta), com cor por estado (reciclar instrumento da TV). | Cards de meta com anel de progresso, consumindo metas vigentes + realizado. |
| DASH-4 | Média | Filtro de consultora existe, mas não há **comparação período-a-período** (vs. período anterior). | Adicionar toggle "vs. período anterior" com deltas (▲▼ %) nos KPIs. | KPIs aceitam `delta` opcional; buscar realizado do período anterior. |
| DASH-5 | Baixa | Sem exportação. | Botão "Exportar" (CSV/print) do painel do período. | Ação de exportação do resumo. |

---

## 2. Vendas — lista & cadastro (`/vendas/admin/vendas`, `/nova`)

**Estado atual:** lista paginada com filtros Status/Ordenar/Direção; form "Nova venda" funcional (validado E2E: cria, valida PV, 201). Bom núcleo, pobre em produtividade.

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| SALE-1 | **Alta** | A gestora lança **muitas** vendas; não há **busca** (por PV, consultora, nota fiscal) nem filtro por consultora/método/data. | Barra de busca + filtros por consultora, método e intervalo de datas. | Busca textual + filtros server-side na lista. |
| SALE-2 | **Alta** | Não há **importação em lote** (CSV) — lançar dezenas de vendas uma a uma é lento. | Importação CSV com pré-visualização e validação linha a linha. | Fluxo de import CSV (staging → validação → commit) reusando o contrato canônico. |
| SALE-3 | Média | "Detalhes" existe, mas não há **duplicar venda** (muitas vendas são quase iguais). | Ação "Duplicar" que abre o form pré-preenchido. | Botão duplicar → `/nova` com query dos campos. |
| SALE-4 | Média | Form pede o campo cru "Conjuntos"/"Peças avulsas" sem mostrar o **total de peças resultante** (multiplicador "peças por conjunto" está em Configurações). | Mostrar, ao lado, "= N peças" calculado ao vivo conforme o usuário digita. | Preview de peças no form (lê `pieces_per_set`). |
| SALE-5 | Baixa | Data e hora default é "agora"; para lançar histórico é fricção. | Manter, mas adicionar atalhos "hoje / ontem". | Atalhos de data. |

---

## 3. Dashboard da Consultora (`/vendas` — visão consultora)

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| CONS-1 | Média | (a validar com perfil consultora) A consultora precisa ver **o próprio ritmo vs meta** e **quanto falta pra próxima meta/comissão**. | Herói pessoal com RadialGauge da meta + "faltam R$ X para a Meta 2 (comissão sobe para Y%)". | Painel pessoal com progresso e projeção de comissão. |
| CONS-2 | Baixa | Falta gamificação leve (posição no ranking sanitizado). | Mostrar a própria posição relativa (sem expor colegas). | Card "sua posição" reutilizando dados sanitizados. |

---

## 4. Métodos de pagamento (`/vendas/admin/metodos-pagamento`)

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| PAY-1 | Média | Coluna "Ordem" começa em **2** (sem o 1) — parece bug/gap. | Ordem sempre sequencial a partir de 1 na exibição, independente do valor bruto. | Normalizar exibição da ordem. |
| PAY-2 | Média | Nenhuma noção de **uso**: quais métodos realmente aparecem nas vendas? | Coluna "uso no período" (nº de vendas / % do volume) — ajuda a decidir o que manter. | Agregar contagem por método e exibir. |
| PAY-3 | Baixa | "Reordenar" — interação obscura. | Drag-and-drop direto nas linhas (ou setas ↑↓). | Reordenação por arrastar. |

---

## 5. Metas e comissões (`/vendas/admin/metas`)

**Estado atual:** card inline (Meta 1/2/3, Desafio, Trimestral, Coletiva) com Valor + Comissão + Salvar **por linha**. Bom padrão (já reciclado do Lision).

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| GOAL-1 | Média | Salvar **linha a linha** = 6 cliques para configurar o ciclo. | Botão "Salvar todas" + indicador de linhas alteradas (dirty). | Salvamento em lote opcional, preservando o por-linha. |
| GOAL-2 | Média | Ao abrir novo período, as metas começam do zero — retrabalho. | Ação "Copiar metas do período anterior". | Duplicar metas vigentes para o novo período. |
| GOAL-3 | Baixa | Metas coletiva/trimestral com comissão 0 sem explicação. | Texto de ajuda: "metas coletivas não pagam comissão individual". | Helper text contextual. |
| GOAL-4 | Baixa | Sem **simulador**: "se a consultora vender R$ X, quanto ganha?". | Mini-simulador de comissão por faixa de meta. | Componente simulador (client-side, lê metas vigentes). |

---

## 6. Períodos (`/vendas/admin/periodos`)

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| PER-1 | Média | Card do período é só "datas + Aberto". Período é o eixo de tudo, merece contexto. | Card enriquecido: `StatusBadge`, dias úteis restantes, nº de vendas/consultoras, total realizado, barra de progresso do ritmo. | Card de período com mini-KPIs. |
| PER-2 | Baixa | A ação mais importante (fechar) mora em outro módulo. | Atalho "Revisar fechamento" no card do período aberto. | Link para `/fechamento`. |

---

## 7. Calendário (`/vendas/admin/calendario`)

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| CAL-1 | **Alta** | Chama-se "Calendário" mas é uma **lista de feriados** — descompasso de expectativa; a gestora não vê os dias úteis. | Grade de **calendário mensal** real: dias úteis, fins de semana e feriados destacados; clicar num dia adiciona/remove feriado. | Componente de calendário mensal (reciclar tokens; sem lib pesada). |
| CAL-2 | Média | Cadastrar feriados nacionais um a um é lento. | Botão "Importar feriados nacionais (BR)" do ano. | Seed de feriados nacionais brasileiros por ano. |

---

## 8. Fechamento (`/vendas/admin/fechamento`)

**Estado atual:** dos melhores — "Impacto a congelar" (total/vendas/peças/comissão) + "Próximo período proposto".

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| CLOSE-1 | **Alta** | "Fechar período" é **irreversível** e dispara sem confirmação. | Modal de confirmação com resumo do impacto (usa CROSS-4). | Confirmação obrigatória antes de fechar. |
| CLOSE-2 | Média | Exibe um **hash de 64 caracteres** cru ("Revisão do preview") — ruído para a gestora. | Ocultar por padrão; expor como "identificador de auditoria" truncado com copiar. | Formatar/ocultar o token técnico. |
| CLOSE-3 | Baixa | Comissão R$ 0 sem explicar (nenhuma meta batida). | Nota: "nenhuma meta atingida neste período". | Texto contextual quando comissão = 0. |

---

## 9. Configurações (`/vendas/admin/configuracoes`)

| ID | Sev. | Achado | Decisão de UX | Requisito |
|----|------|--------|---------------|-----------|
| CFG-1 | **Alta** | "Início da semana (0–6)" pede um **número** — mental-model de desenvolvedor. | Dropdown com nomes dos dias (Domingo…Sábado). | Trocar input numérico por select de dia. |
| CFG-2 | Média | "Agregados da equipe" (toggle que governa a privacidade do Coletivo) sem explicação. | Helper text explicando o efeito (liga/desliga rankings coletivos). | Texto de ajuda no toggle. |
| CFG-3 | Média | "Peças por conjunto" sem indicar impacto. | Helper: "multiplica peças em cada venda com conjuntos". | Texto de ajuda + preview. |

---

## 10. Coletivo (`/vendas/coletivo`) — ✅ já refinado nesta sessão

Herói RadialGauge, mini-anéis de metas, agregados, **gráficos de distribuição** e **pódium** (top-3 sanitizado) já entregues e validados E2E. Pendência menor:

| ID | Sev. | Achado | Requisito |
|----|------|--------|-----------|
| COL-1 | Baixa | Distribuições ficam suprimidas com baixo volume (correto), mas o vazio não explica *por quê* claramente. | Estado vazio explicando o mínimo por bucket (usa CROSS-3). |

---

## Priorização sugerida (ondas de implementação)

**Onda 1 — Impacto visível imediato (o que o usuário mais sente):**
DASH-1, DASH-2, DASH-3 (Dashboard rica em gráfico) · CROSS-1 (skeletons) · CAL-1 (calendário real) · CLOSE-1 (confirmação) · CFG-1 (dia da semana).

**Onda 2 — Produtividade da gestora:**
SALE-1 (busca/filtros) · SALE-2 (import CSV) · GOAL-1/GOAL-2 (salvar em lote / copiar metas) · PAY-2 (uso por método) · PER-1 (card de período rico).

**Onda 3 — Polimento & deleite:**
CROSS-2/3/4/5 · SALE-3/4/5 · GOAL-3/4 · CAL-2 · CLOSE-2/3 · CFG-2/3 · CONS-1/2 · PAY-1/3 · COL-1.

---

## Handoff

- **Uma → Aria:** decisões de UX/UI acima são a fonte. Aria transforma em stories/requisitos executáveis (com AC testáveis) por onda.
- **Aria → Dex:** implementar por onda, reciclando o design system do Lision; QA (Quinn) valida E2E cada onda.
- **Restrição:** nada commitado sem OK do Gabriel (Gage faz o push). Fábrica Teste = tenant demo para validação.
