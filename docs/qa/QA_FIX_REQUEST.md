# QA FIX REQUEST — Stories 3.9-3.15

| Campo | Valor |
|-------|-------|
| **Gerado por** | @qa (Quinn) |
| **Validado por** | @architect (Aria) |
| **Data** | 2026-06-02 |
| **Stories revisadas** | 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15 |
| **Veredito QA** | CONCERNS |
| **Total de issues** | 18 (3 CRITICAL, 5 HIGH, 6 MEDIUM, 4 LOW) + 2 UX alignment |

---

## CRITICAL (Bloqueiam merge)

### C1 — Defects sem filtro de faction_id

| Campo | Detalhe |
|-------|---------|
| **ID** | C1 |
| **Severidade** | CRITICAL |
| **Arquivo(s)** | `src/app/api/factions/[id]/route.ts:39-42` |
| **Story** | 3.13 (Factions) |
| **Descricao** | Query de defeitos busca 50 registros aleatorios do tenant sem filtrar por faction_id. Faccao A ve defeitos da Faccao B. Vazamento de dados entre faccoes. |
| **Codigo atual** | `supabase.from("defect_records").select("id, defect_type, severity, status, created_at").limit(50)` |
| **Correcao esperada** | Adicionar join via `lots` -> `shipment_lots` -> `shipments` para filtrar defeitos que pertencem a lotes enviados para a faccao especifica (param `id`). Alternativamente, se `defect_records` tiver coluna `faction_id`, usar `.eq("faction_id", id)`. |
| **AC de validacao** | Dado faccao A com 3 defeitos e faccao B com 5 defeitos, quando GET `/api/factions/A`, entao retorna apenas os 3 defeitos de A. Nenhum defeito de B aparece. |

### C2 — Financial hardcoded a zero

| Campo | Detalhe |
|-------|---------|
| **ID** | C2 |
| **Severidade** | CRITICAL |
| **Arquivo(s)** | `src/app/api/factions/[id]/route.ts:49-52`, `src/components/factions/FactionDetail.tsx:259-275` |
| **Story** | 3.13 (Factions) |
| **Descricao** | Secao financeira retorna grossValue, deductions e netValue hardcoded como 0. O frontend renderiza R$ 0,00 sempre. Secao financeira completamente inutil. |
| **Codigo atual** | `financial: { grossValue: 0, deductions: 0, netValue: 0 }` |
| **Correcao esperada** | Calcular valores financeiros reais: (1) grossValue = SUM(pecas * preco_por_peca) dos lotes da faccao, (2) deductions = SUM(deducoes por defeitos/atrasos), (3) netValue = grossValue - deductions. Se tabela financeira nao existe, criar query que derive os valores de shipments + lots + pricing. |
| **AC de validacao** | Dado faccao com 3 remessas totalizando 500 pecas a R$4,50/peca, quando GET `/api/factions/{id}`, entao financial.grossValue = 2250.00 e netValue = grossValue - deductions. |

### C3 — KPIs avgDefectRate e totalPendingValue fake

| Campo | Detalhe |
|-------|---------|
| **ID** | C3 |
| **Severidade** | CRITICAL |
| **Arquivo(s)** | `src/app/api/factions/route.ts:53-54` |
| **Story** | 3.13 (Factions) |
| **Descricao** | KPIs do listing de faccoes retornam avgDefectRate e totalPendingValue hardcoded como 0. Metricas exibidas como reais mas sao falsas. Gerente toma decisoes com dados incorretos. |
| **Codigo atual** | `avgDefectRate: 0, totalPendingValue: 0` |
| **Correcao esperada** | (1) avgDefectRate = media da taxa de defeitos por faccao (total_defeitos / total_pecas * 100), calculado via query agregada. (2) totalPendingValue = SUM de valores pendentes de pagamento (remessas completadas mas nao pagas). |
| **AC de validacao** | Dado 3 faccoes com taxas de defeito 2%, 5% e 3%, quando GET `/api/factions`, entao kpis.avgDefectRate ~= 3.33. Dado R$ 5000 pendente, totalPendingValue = 5000. |

---

## HIGH (Devem ser corrigidos antes do merge)

### H1 — Quality overview carrega tudo em memoria

| Campo | Detalhe |
|-------|---------|
| **ID** | H1 |
| **Severidade** | HIGH |
| **Arquivo(s)** | `src/app/api/quality/overview/route.ts` |
| **Story** | 3.12 (Quality) |
| **Descricao** | Busca TODOS os defect_records do tenant para memoria JS e faz `.filter()` / `.length` para contar por severity e status. Com 10k+ registros, causa latencia e uso excessivo de memoria. |
| **Codigo atual** | `const { data: records } = await supabase.from("defect_records").select("*")` seguido de `records.filter(r => r.severity === "CRITICAL").length` |
| **Correcao esperada** | Substituir por queries SQL agregadas: `SELECT severity, status, COUNT(*) FROM defect_records WHERE tenant_id = ? GROUP BY severity, status`. Usar `.rpc()` ou multiplas queries com `.select("id", { count: "exact" }).eq("severity", "CRITICAL")`. |
| **AC de validacao** | Response identico ao atual. Query plan mostra COUNT agregado no PostgreSQL, nao fetch de todos os registros. Tempo de resposta < 500ms com 10k registros. |

### H2 — Reorder stages com N+1 queries sem transaction

| Campo | Detalhe |
|-------|---------|
| **ID** | H2 |
| **Severidade** | HIGH |
| **Arquivo(s)** | `src/app/api/settings/stages/reorder/route.ts:24-32` |
| **Story** | 3.10 (Settings) |
| **Descricao** | Loop `for...of` faz um UPDATE por stage (N queries). Sem transaction — se falhar no meio, ordem fica inconsistente. Com 20 stages, sao 20 round-trips ao banco. |
| **Codigo atual** | `for (const item of updates) { await supabase.from("stages").update({ order_index: item.order_index }).eq("id", item.id) }` |
| **Correcao esperada** | Usar RPC (stored procedure) que recebe array de {id, order_index} e faz UPDATE em batch dentro de uma transaction. Alternativa: usar `supabase.rpc("reorder_stages", { updates: JSON.stringify(updates) })`. |
| **AC de validacao** | Dado 10 stages reordenados, quando POST `/api/settings/stages/reorder`, entao apenas 1 query (RPC call) e executada. Se falhar, nenhuma ordem muda (rollback). |

### H3 — Permissions module criado mas nao integrado

| Campo | Detalhe |
|-------|---------|
| **ID** | H3 |
| **Severidade** | HIGH |
| **Arquivo(s)** | `src/lib/permissions.ts` (criado), TODAS as API routes em `src/app/api/**/*.ts` |
| **Story** | 3.9 (System Foundation) |
| **Descricao** | `permissions.ts` implementa `hasPermission()`, `hasMinRole()`, `hasAllPermissions()`, `hasAnyPermission()`. Porem NENHUMA API route usa. Todas fazem check hardcoded: `if (!["ADMIN", "GERENTE"].includes(role))`. Viola gap analysis secao 9.2 que especifica uso do modulo de permissions. |
| **Correcao esperada** | Substituir TODOS os checks hardcoded de role nas API routes por chamadas a `hasPermission(role, permission)` ou `hasMinRole(role, minRole)`. Cada route deve declarar a permission necessaria. |
| **AC de validacao** | Nenhuma API route contem `["ADMIN", "GERENTE"].includes(role)` ou similar. Todas usam `hasPermission()` ou `hasMinRole()` de `src/lib/permissions.ts`. Grep por `includes(role)` retorna 0 resultados em `src/app/api/`. |

### H4 — Notifications mark-all-read pode afetar outros usuarios

| Campo | Detalhe |
|-------|---------|
| **ID** | H4 |
| **Severidade** | HIGH |
| **Arquivo(s)** | `src/app/api/notifications/read/route.ts:25-31` |
| **Story** | 3.14 (Dashboard) |
| **Descricao** | Mark-all-read usa `.is("read_at", null).or(...)` com composicao de filtro que pode marcar notificacoes broadcast (target_type = "ALL") como lidas para TODOS os usuarios, nao apenas para o usuario atual. |
| **Correcao esperada** | Usar tabela de join `notification_reads` (user_id, notification_id, read_at) para rastrear leitura por usuario. Ou adicionar filtro explicito `.eq("user_id", userId)` se notificacoes sao por usuario. Para broadcasts, usar tabela separada de "dismissed" por usuario. |
| **AC de validacao** | Dado usuario A marca todas como lidas, quando usuario B acessa notificacoes, entao notificacoes broadcast de B continuam como nao-lidas. |

### H5 — Quality by-faction engole erro silenciosamente

| Campo | Detalhe |
|-------|---------|
| **ID** | H5 |
| **Severidade** | HIGH |
| **Arquivo(s)** | `src/app/api/quality/by-faction/route.ts:30-31` |
| **Story** | 3.12 (Quality) |
| **Descricao** | Quando query com join falha, retorna HTTP 200 com `{ data: [] }` ao inves de HTTP 500 com mensagem de erro. Frontend mostra "sem dados" quando na verdade houve erro. Impossivel debugar. |
| **Codigo atual** | `if (error) { return NextResponse.json({ data: [] }) }` |
| **Correcao esperada** | Retornar erro apropriado: `return NextResponse.json({ error: error.message }, { status: 500 })`. Adicionar log server-side com `console.error("[quality/by-faction]", error)`. |
| **AC de validacao** | Dado query falha (ex: tabela inexistente), quando GET `/api/quality/by-faction`, entao retorna HTTP 500 com `{ error: "..." }`. Log do servidor contem o erro detalhado. |

---

## MEDIUM (Documentar como tech debt, corrigir antes de producao)

### M1 — Profile API viola contrato de response

| Campo | Detalhe |
|-------|---------|
| **ID** | M1 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | `src/app/api/profile/route.ts` |
| **Story** | 3.10 (Settings) |
| **Descricao** | Retorna `{ profile: ... }` ao inves de `{ data: ... }`. Gap analysis secao 5.3 define contrato: sucesso = `{ data: T }`, erro = `{ error: string }`. |
| **Correcao esperada** | Alterar response para `{ data: profile }`. Atualizar frontend que consome este endpoint para ler `response.data` ao inves de `response.profile`. |
| **AC de validacao** | GET `/api/profile` retorna `{ data: { ... } }`. Frontend continua funcionando. |

### M2 — Dashboard targets hardcoded (magic numbers)

| Campo | Detalhe |
|-------|---------|
| **ID** | M2 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | `src/components/dashboard/Dashboard.tsx` |
| **Story** | 3.14 (Dashboard) |
| **Descricao** | GoalsRow usa `target: 100` para Lotes e `target: 15` para OPs. Valores fixos que nao refletem metas reais do tenant. |
| **Correcao esperada** | Buscar targets da API `/api/dashboard/targets` (ou da tabela de configuracao do tenant). Se targets nao existem no banco, usar os valores atuais como fallback mas marcar como "meta padrao". |
| **AC de validacao** | Dado tenant com meta de 200 lotes/dia configurada, quando dashboard carrega, entao GoalsRow mostra target: 200, nao 100. |

### M3 — FactionScoreCard pode exibir NaN

| Campo | Detalhe |
|-------|---------|
| **ID** | M3 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | `src/components/factions/FactionDetail.tsx` |
| **Story** | 3.13 (Factions) |
| **Descricao** | `FactionScoreCard` recebe `rating` via `Number()` que pode ser `null`/`undefined`, resultando em `NaN` exibido na UI. |
| **Correcao esperada** | Adicionar fallback: `Number(rating) || 0` ou `Number(rating ?? 0)`. Exibir "Sem avaliacao" quando rating nao existe. |
| **AC de validacao** | Dado faccao sem rating, quando pagina de detalhe carrega, entao exibe "Sem avaliacao" ou 0, nunca NaN. |

### M4 — Team POST nao valida role contra enum

| Campo | Detalhe |
|-------|---------|
| **ID** | M4 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | `src/app/api/team/members/route.ts` |
| **Story** | 3.11 (Team) |
| **Descricao** | POST para criar membro nao valida se `role` e um valor valido do enum (ADMIN, GERENTE, COORDENADOR, OPERADOR). Aceita qualquer string. |
| **Correcao esperada** | Adicionar validacao: `if (!["ADMIN", "GERENTE", "COORDENADOR", "OPERADOR"].includes(role)) return error 400`. Idealmente usar Zod schema. |
| **AC de validacao** | Dado POST com `role: "HACKER"`, quando request e enviado, entao retorna HTTP 400 com `{ error: "Role invalido" }`. |

### M5 — Stages POST nao valida nome unico

| Campo | Detalhe |
|-------|---------|
| **ID** | M5 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | `src/app/api/settings/stages/route.ts` |
| **Story** | 3.10 (Settings) |
| **Descricao** | POST para criar stage nao verifica se ja existe stage com mesmo nome no tenant. Permite duplicatas. |
| **Correcao esperada** | Antes de inserir, verificar: `SELECT id FROM stages WHERE name = ? AND tenant_id = ?`. Se existir, retornar 409 Conflict. |
| **AC de validacao** | Dado stage "Corte" ja existe, quando POST com name: "Corte", entao retorna HTTP 409 com `{ error: "Stage com este nome ja existe" }`. |

### M6 — Search parameter vulneravel a wildcard injection

| Campo | Detalhe |
|-------|---------|
| **ID** | M6 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | APIs que usam `.ilike()` com input do usuario |
| **Story** | 3.11 (Team), 3.13 (Factions) |
| **Descricao** | Parametro `search` e passado direto para `.ilike("name", "%${search}%")`. Caracteres `%` e `_` no input do usuario alteram o padrao de busca (wildcard injection no LIKE). |
| **Correcao esperada** | Escapar caracteres especiais do LIKE antes de usar: `search.replace(/%/g, "\\%").replace(/_/g, "\\_")`. |
| **AC de validacao** | Dado busca com `search=100%`, quando request e enviado, entao busca literal por "100%", nao por "100" seguido de wildcard. |

---

## LOW (Melhorias opcionais)

### L1 — Trends retornam dados zerados

| Campo | Detalhe |
|-------|---------|
| **ID** | L1 |
| **Severidade** | LOW |
| **Arquivo(s)** | `src/app/api/quality/trends/route.ts` |
| **Story** | 3.12 (Quality) |
| **Descricao** | Endpoint de trends retorna array com valores zerados quando nao ha dados no periodo. Grafico mostra linha flat em zero ao inves de mensagem "sem dados". |
| **Correcao esperada** | Se todos os pontos sao zero, retornar array vazio ou flag `hasData: false`. Frontend deve exibir empty state. |
| **AC de validacao** | Dado periodo sem defeitos, quando trends carrega, entao exibe "Nenhum dado no periodo" ao inves de grafico zerado. |

### L2 — Service worker cache stale

| Campo | Detalhe |
|-------|---------|
| **ID** | L2 |
| **Severidade** | LOW |
| **Arquivo(s)** | `public/sw.js` |
| **Story** | 3.15 (Portal) |
| **Descricao** | Cache version `lision-portal-v1` e estatica. Apos deploy, usuarios podem ver versao antiga do portal ate cache expirar. |
| **Correcao esperada** | Usar hash do build ou timestamp no nome do cache: `lision-portal-v${BUILD_HASH}`. Ou adicionar header `Cache-Control: no-cache` para o sw.js. |
| **AC de validacao** | Apos deploy, service worker atualiza automaticamente na proxima visita. |

### L3 — localStorage sem try/catch

| Campo | Detalhe |
|-------|---------|
| **ID** | L3 |
| **Severidade** | LOW |
| **Arquivo(s)** | `src/app/portal/install-prompt.tsx` |
| **Story** | 3.15 (Portal) |
| **Descricao** | Chamadas a `localStorage.getItem/setItem` sem try/catch. Em modo privado ou com storage cheio, lanca excecao. |
| **Correcao esperada** | Envolver chamadas localStorage em try/catch com fallback silencioso. |
| **AC de validacao** | Em modo privado do Safari (localStorage indisponivel), componente nao lanca erro. |

### L4 — date-fns locale adiciona peso ao bundle

| Campo | Detalhe |
|-------|---------|
| **ID** | L4 |
| **Severidade** | LOW |
| **Arquivo(s)** | Varios componentes que usam date-fns |
| **Story** | Cross-cutting |
| **Descricao** | Import de `date-fns/locale/pt-BR` em multiplos arquivos pode aumentar bundle se tree-shaking nao eliminar locales nao usados. |
| **Correcao esperada** | Centralizar import do locale em um unico arquivo util (`src/lib/date.ts`) e re-exportar. Verificar bundle size com `next build --analyze`. |
| **AC de validacao** | Locale importado de um unico ponto. Bundle analyzer confirma apenas pt-BR incluso. |

---

## DESALINHAMENTOS UX (vs UX-FRONTEND-ARCHITECTURE.md)

### UX1 — FactionScoreCard props incorretas

| Campo | Detalhe |
|-------|---------|
| **ID** | UX1 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | `src/components/factions/FactionDetail.tsx` |
| **Spec UX** | Secao 2.2 — FactionScoreCard deve receber `deliveryScore`, `qualityScore`, `volumeTotal` |
| **Implementacao** | Recebe apenas `rating` e `totalPieces` |
| **Correcao esperada** | Refatorar FactionScoreCard para aceitar props conforme spec UX. API deve retornar os 3 scores individuais. |
| **AC de validacao** | FactionScoreCard exibe 3 metricas separadas (entrega, qualidade, volume) conforme wireframe UX. |

### UX2 — TokenDisplay nunca criado

| Campo | Detalhe |
|-------|---------|
| **ID** | UX2 |
| **Severidade** | MEDIUM |
| **Arquivo(s)** | N/A (componente inexistente) |
| **Spec UX** | Secao 2.2 — TokenDisplay definido como molecule obrigatoria para exibicao de tokens na pagina de settings |
| **Implementacao** | Componente nunca foi criado. Tokens exibidos inline sem formatacao adequada. |
| **Correcao esperada** | Criar componente `src/components/settings/TokenDisplay.tsx` conforme spec: masked display, copy button, revoke action, expiry indicator. |
| **AC de validacao** | Componente TokenDisplay existe, renderiza tokens com mascara, botao copiar funciona, botao revogar funciona. |

---

## Resumo para @dev

| Severidade | Qtd | Acao |
|-----------|-----|------|
| CRITICAL | 3 | Corrigir IMEDIATAMENTE. Bloqueiam merge. |
| HIGH | 5 | Corrigir antes do merge. |
| MEDIUM | 6 + 2 UX | Corrigir antes de producao. |
| LOW | 4 | Melhorias opcionais. |

**Prioridade de implementacao sugerida:**
1. C1, C2, C3 (dados incorretos/vazamento entre faccoes)
2. H4, H5 (seguranca e integridade)
3. H1, H2 (performance)
4. H3 (arquitetura — permissions)
5. M1-M6, UX1, UX2 (qualidade e UX)
6. L1-L4 (melhorias)

---

*Gerado por @qa (Quinn) | Validado por @architect (Aria) | 2026-06-02*
