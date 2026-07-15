# Story — Relatório de produção profissional (.xlsx + PDF)

**Status:** Draft (aprovada pelo Gabriel — 2026-07-13)
**Autor:** Aria (@architect)
**Frente:** 1 de 3 (relatório → calendário → auditoria)

## Causa raiz (confirmada com evidência)

O relatório atual (`/api/reports/production`, formato **CSV**) abre "quebrado" no Excel:
os valores da coluna `periodo` (datas ISO "2026-07-09") viram `########` — o Excel os
interpreta como data/número e a coluna estreita não exibe. **CSV puro não controla largura
nem formato de célula → sempre quebra assim.** Além disso a métrica está errada:
`producao` = **contagem de eventos** `scan_events` (via `computeChartData`), **não** peças
ponderadas, e **NÃO exclui OP CANCELADA** — por isso não bate com a dashboard/TV.

Correção de raiz (não remendo): (1) trocar o formato por **planilha real (.xlsx)** e **PDF**;
(2) trocar a fonte de dados para o **motor unificado** (mesma métrica da dashboard/TV/meta).

## Formatos (decisão do Gabriel: OS DOIS)

- **.xlsx** — biblioteca **exceljs** (DEPENDÊNCIA NOVA, aprovada; @dev instala e sinaliza).
  Abas: **Resumo**, **Por Setor**, **Por Operador**. Larguras de coluna definidas, datas como
  data, números como número com separador de milhar. Zero `########`. Analisável no Excel/Sheets.
- **PDF** — **jsPDF** (já existe, sem dep nova). Cabeçalho com marca LISION + período; tabelas
  por setor/operador; meta vs realizado; déficit acumulado; totais. Layout limpo p/ impressão.
- UI: dois botões claros (ou 1 com escolha de formato) no ReportDownloadCard.

## Contrato de dados (MESMA fonte de verdade — tem que bater com a tela)

Novo módulo `src/lib/report-data.ts` → `computeProductionReport(supabase, tenantId, from, to)`
reusando os motores existentes (NÃO reinventar métrica):
- **Resumo:** produção total = peças que entraram no **ESTOQUE** no período (mesma métrica do
  card "Produção do dia" do dashboard — ponderada por `meta_coefficient`, CANCELADA fora,
  fuso local); defeitos no período; % de atingimento; datas.
- **Por setor:** para cada stage com `sector_targets` — realizado = Σ STAGE_OUT ponderado por
  `reference_stage_targets` (mesma métrica da TV de setor); meta do período = base diária ×
  dias úteis do período; **déficit acumulado vigente** (goal_deficits scope='SECTOR'); %.
- **Por operador:** para cada operador produtivo — realizado (mesma métrica de `computeUserMeta`
  na etapa dele); meta = base × dias úteis; **déficit** (goal_deficits scope='USER'); %.
- **Totais** e período. OPs CANCELADAS sempre excluídas.

Escopo de tenant OBRIGATÓRIO em toda query (a auditoria da Frente 3 vai verificar).

## UX (@ux-design-expert)
Estrutura/apresentação profissional para gestor/dono: hierarquia visual do PDF (capa/cabeçalho,
seções, tabelas, destaque de totais e % de meta), e a organização das abas/colunas do .xlsx.
Marca LISION. Legível e apresentável.

## Validação (QA — prova real, abrindo os arquivos)
- Gerar **os dois** arquivos com dados reais do **Fábrica Teste** (liserie intocada).
- Abrir o **.xlsx** (sem `########`, abas certas, formatos certos) e o **PDF** (render limpo) —
  **screenshots dos dois abertos** como prova.
- Conferir que os números **batem com a dashboard e a TV** (mesmo motor).
- QA valida abrindo os arquivos de verdade, não "a função rodou".

## Fora de escopo
Calendário por empresa (Frente 2) e auditoria (Frente 3) — próximas frentes.
