# Layout — Relatório de Produção LISION (PDF + .xlsx)

**Autora:** Uma (@ux-design-expert) · Handoff para @dev · Story: relatorio-profissional.story.md

## Princípios de legibilidade para gestão
1. **Resposta em 5 segundos:** o gestor abre e já vê produção total, % de meta e quem está devendo — sem procurar.
2. **Destaque o que exige ação:** setor/operador ABAIXO da meta ganha cor (vermelho/âmbar); quem bateu fica verde discreto. O resto é neutro.
3. **Números alinhados à direita, com separador de milhar** (1.234, não 1234). % com 1 casa (37,5%).
4. **Menos é mais:** o PDF resume e destaca (apresentação); o .xlsx detalha e permite cruzar (análise).
5. **Impressão-first no PDF:** fundo BRANCO, tinta escura. (O tema dark do app é de tela — no papel seria ilegível e gastaria tinta.)

## Paleta (derivada da marca LISION, adaptada para papel/claro)
- Tinta principal (texto): `#18181b` · Texto secundário/labels: `#71717a`
- Linhas/bordas: `#e4e4e7` · Fundo de cabeçalho de tabela: `#f4f4f5`
- **Verde (meta batida ≥100%):** `#10b981` · **Âmbar (70–99%):** `#f59e0b` · **Vermelho (<70% ou déficit>0):** `#ef4444`
- Faixa do cabeçalho do relatório: tinta `#18181b` com texto branco + fio de acento verde `#10b981`.
- Fonte: **Helvetica** (embutida no jsPDF — sem dependência de fonte). Limpa e neutra; equivalente visual do Inter do app.

## Regra de status (usada nos dois formatos)
`atingimento = realizado / meta`. Cor: **≥ 1,0 verde** · **0,7–0,99 âmbar** · **< 0,7 vermelho**. Déficit acumulado > 0 → texto vermelho.

---

## 1. PDF (jsPDF) — A4 retrato, margens 40pt

### Cabeçalho (todas as páginas, topo)
- Faixa `#18181b` altura ~64pt. À esquerda: wordmark **"LISION"** (Helvetica Bold 18, branco) + fio verde 3pt abaixo.
- À direita, alinhado: **{Nome da Empresa}** (Bold 11, branco) e abaixo `Relatório de Produção` (9, `#a1a1aa`).
- Linha abaixo da faixa (fora dela, 12pt): `Período: 01/06/2026 – 13/07/2026` (10, `#18181b`) · à direita `Gerado em 13/07/2026 14:30` (9, `#71717a`).

### Resumo executivo (logo abaixo do cabeçalho)
- 4 "cards" em linha (retângulos com borda `#e4e4e7`, cantos 6pt, altura ~56pt):
  1. **Produção total** — nº grande (Bold 22) + label "peças" (8, muted).
  2. **Defeitos** — nº (Bold 22) + "% do total" (8).
  3. **Meta atingida** — % (Bold 22, colorida pela regra de status) + "no período" (8).
  4. **Déficit acumulado** — nº (Bold 22, vermelho se >0) + "peças a recuperar" (8).

### Seção "Produção por Setor"
- Título de seção (Bold 13, `#18181b`) + fio fino `#e4e4e7`.
- Tabela, cabeçalho fundo `#f4f4f5` texto Bold 9:
  | Setor | Meta | Realizado | Atingimento | Déficit acum. |
  - Colunas numéricas alinhadas à direita, `#,##0`. Atingimento em % colorido pela regra.
  - Zebra sutil (linhas pares `#fafafa`). Célula de Atingimento: texto colorido (verde/âmbar/vermelho).
  - Linha **TOTAL** ao fim: Bold, fio superior `#18181b`.

### Seção "Produção por Operador" (ranking)
- Mesma estética. Ordenada por Realizado desc (ranking). Cabeçalho:
  | # | Operador | Setor | Meta | Realizado | Atingimento |
  - `#` = posição (1,2,3…). Top 3 podem ter o número em verde. Demais neutro.

### Rodapé (todas as páginas)
- Fio `#e4e4e7`. Esquerda: `Gerado por LISION` (8, `#71717a`). Centro: `{timestamp}`. Direita: `Página X de Y`.

### Regras de quebra
- Se a tabela de operadores passar da página, repetir o cabeçalho da tabela na página seguinte. Manter cabeçalho/rodapé do relatório em todas.

---

## 2. .xlsx (exceljs) — 3 abas

Regras gerais: **congelar a linha 1** (freeze panes) nas abas de dados; **autofilter** no cabeçalho;
cabeçalho **Bold, texto branco, fundo `#18181b`**; bordas finas `#e4e4e7`; **larguras generosas** (nunca `########`).
Formatos: peças `#,##0`; percentual **valor guardado como fração** (0.375) com formato `0.0%`; datas `dd/mm/yyyy`.

### Aba "Resumo"
- A1: "LISION — Relatório de Produção" (Bold 14, mesclado A1:D1).
- Linhas de metadados: Empresa, Período (De/Até como data), Gerado em.
- Bloco de KPIs (label na col A, valor col B): Produção total (peças, `#,##0`), Defeitos, Meta atingida (`0.0%`), Déficit acumulado.

### Aba "Por Setor"
Colunas (ordem, largura aprox., formato):
| Coluna | Largura | Formato |
|---|---|---|
| Setor | 24 | texto |
| Meta (período) | 16 | `#,##0` |
| Realizado | 16 | `#,##0` |
| Atingimento | 14 | `0.0%` (fração) |
| Déficit acumulado | 18 | `#,##0` |
- Linha **TOTAL** ao fim: Bold, fundo `#f4f4f5`, fio superior.
- Formatação condicional na coluna Atingimento: ≥1 verde, 0,7–0,99 âmbar, <0,7 vermelho (fonte).

### Aba "Por Operador"
Colunas:
| Coluna | Largura | Formato |
|---|---|---|
| # | 6 | número |
| Operador | 26 | texto |
| Setor | 20 | texto |
| Meta | 14 | `#,##0` |
| Realizado | 14 | `#,##0` |
| Atingimento | 14 | `0.0%` (fração) |
- Ordenada por Realizado desc. Mesma formatação condicional em Atingimento.

---

## Handoff @dev
- Números vêm do motor unificado (report-data.ts) — NÃO recalcular métrica aqui, só apresentar.
- % no .xlsx é **fração** (0.375) com formato `0.0%` — não multiplicar por 100 no valor.
- Larguras acima são o mínimo para não colapsar em `########`.
- PDF é claro/impressão; NÃO reusar o tema dark do app.
- Dois botões no ReportDownloadCard: "Baixar Excel (.xlsx)" e "Baixar PDF".
