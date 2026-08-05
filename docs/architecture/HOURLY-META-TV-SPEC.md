# Front-End Spec — Meta por Hora na TV (por setor)

> ## ✅ DECISÕES DO GABRIEL (aprovadas — travadas)
> 1. **Cores do anel da HORA (por %):** `< 60%` = **VERMELHO** · `≥ 60%` = **AMARELO** · **quase batendo** (`≥ 90%`) = **VERDE** · **bateu** (`≥ 100%`) = **VERDE**. (Aplicar essa faixa ao anel da hora.)
> 2. **Herói condicional:** o anel da hora só vira herói **SE a meta por hora estiver configurada** para o setor. Sem meta por hora → o **DIÁRIO continua herói** (anel grande, layout ATUAL) e o card "Metas do Período" segue Semana·Mês (SEM o Dia). O "Dia" só entra em "Metas do Período" **quando a meta por hora está configurada**.
> 3. **Sem mudança brusca:** é ADIÇÃO ao dashboard atual, não redesign. Só (a) o anel da hora quando configurado + (b) mover o Dia pra "Metas do Período" nesse caso. Fora isso, a TV fica como está.
> 4. **Jornada:** início/fim/almoço **compartilhados por tenant**, com **override editável por setor** (opcional).
> 5. **Dia não-útil:** herói = **dia**. Os dias não-úteis são **configurados pelo ADMIN** (calendário de trabalho do tenant — reusar o mecanismo existente, NÃO inferir automaticamente).


**Autora:** Uma (@ux) · **Aprovação:** Gabriel (ANTES do Dex construir) · **Escopo:** TV do chão de fábrica (por setor). NÃO operador/Meu Plano.
**Decisões travadas:** meta por hora MOTIVACIONAL — não acumula dívida, ZERA a cada virada de hora, deriva da meta BASE do setor ÷ horas úteis da jornada (override manual opcional), CELEBRA ao bater. Quem cobra é a diária.
**Linguagem visual:** mantém o "Instrumento Premium Dark" atual (vidro, anéis, `RadialGauge`/`MiniRing`/`GlassPanel`, glow ambiente por estado, números tabulares grandes, legível de longe).

---

## 1. Dois modos da TV (o ponto central)

**MODO A — COM jornada configurada → HERÓI = HORA.**
**MODO B — SEM jornada (ou setor sem meta base) → HERÓI = DIA** (é o layout ATUAL da liserie — não pode regredir).

A TV escolhe o modo por setor/tenant: se existe jornada (início/fim/almoço) E o setor tem meta base → Modo A; senão → Modo B (idêntico ao de hoje).

---

## 2. MODO A — layout (herói = hora)

Reusa o mesmo grid atual; só muda o CONTEÚDO do herói e do card de metas:
```
"hero  hero  metas metas"
"hero  hero  kpis  kpis"
"wave  wave  rank  fac"
```

### 2.1 Herói = anel da META DA HORA (`RadialGauge` reaproveitado)
- **Centro (número grande):** produção do setor **NESTA hora** (ex.: `128`), unidade pequena.
- **Sub-rótulo:** `/ {metaHora} nesta hora` (ex.: `/ 150 nesta hora`).
- **Anel:** % da hora (produzido_na_hora ÷ metaHora), com a MESMA paleta de estado (verde/âmbar/vermelho por pace) e o glow ambiente reagindo igual.
- **Rótulo da janela:** pequeno acima do anel — `14h–15h` (a hora corrente, fuso do tenant).
- **Pílula de status** (onde hoje fica "PACE — FALTAM X"):
  - Em andamento: `NA HORA · FALTAM {n}` (âmbar/verde por pace).
  - Batida: `HORA BATIDA 🎉` (verde/dourado, cheia).
  - (nunca "dívida"/vermelho punitivo por não bater — motivacional.)

### 2.2 Tira "batidas do dia" (o dopamina do Fábio) — logo abaixo do herói
- **`★ 5 / 8 horas batidas`** em número grande + uma fileira de **Y pips** (Y = horas úteis do dia), aceso = hora batida, apagado = ainda não / não bateu, halo pulsante no pip da hora ATUAL.
- Legível de longe: pips grandes (≥16px), número `font-display` grande.

### 2.3 Card "Metas do Período" → agora **Dia · Semana · Mês** (3 `MiniRing`)
- O **Dia** sai do herói e entra aqui como o 1º MiniRing (produzido_dia / meta_dia_efetiva — a meta diária ACUMULADA continua sendo a que "cobra", inalterada).
- Semana e Mês seguem como hoje.

### 2.4 Resto (inalterado): Ritmo/h, Tempo/Lote, Onda de Produção (a linha "Meta X/h" da onda passa a usar a metaHora REAL da jornada, não `daily/8`), Ranking, Facção.

---

## 3. Estados da hora (animação sutil, TV sempre ligada)
| Estado | Visual |
|---|---|
| **Em andamento** | anel enche com produzido/meta; cor por pace; pip da hora com halo pulsante |
| **Bateu** 🎉 | anel completa em **verde→dourado**, selo "HORA BATIDA", glow da sala dá um pulso curto (~1.2s), 1 pip acende com um "pop" |
| **Não bateu** (hora acabou sem bater) | o pip **fica apagado** (sem vermelho, sem dívida); o anel simplesmente **reseta** para a próxima hora |
| **Virada de hora** | número zera, rótulo vira a nova janela (`15h–16h`), progresso recomeça do 0 |

Motivacional: celebra o acerto, ignora o erro (o erro é "cobrado" só pela meta diária, que já existe).

---

## 4. MODO B — fallback (herói = dia) e dia não-útil
- **Sem jornada:** TV = layout de HOJE (herói = RadialGauge do DIA; card = Semana·Mês). Nenhuma tira de pips, nenhum anel de hora. Zero regressão para a liserie.
- **Dia não-útil** (calendário do tenant): não há meta por hora → cai no Modo B nesse dia (herói = dia), e a tira de batidas não aparece. (Opcional: selo discreto "Sem expediente" no dia de folga — a confirmar com o Gabriel; default = Modo B.)
- **Transição A↔B:** sem "piscar" — a página decide o modo no carregamento/refresh dos KPIs (o mesmo poll que já atualiza a TV).

---

## 5. Tela de configuração da JORNADA (admin — Configurações do tenant)
Card **"Jornada de trabalho"** (uma vez por tenant), à prova de erro:
- **Início** (time) · **Fim** (time) · **Almoço**: início + fim (ou duração em min).
- **"Horas úteis: X h Y min"** calculado AO VIVO = (fim − início − almoço), exibido em destaque (é daqui que a meta da hora deriva).
- Validações: fim > início; almoço dentro da jornada; horas úteis > 0. Erros inline, salvar desabilitado se inválido.
- **Override manual (opcional), por setor:** na config de metas do setor (onde já ficam daily/weekly/monthly targets), um campo **"Meta por hora (manual)"** — se preenchido, **sobrepõe** `base ÷ horas úteis`; vazio = derivada. Micro-ajuda: "deixe vazio para calcular automaticamente da meta diária".

---

## 6. Cálculo (para o Dex/Dara — a regra, não o código)
- `horasUteis = (fim − início − almoço)` em horas (fuso do tenant).
- `metaHora = override_setor ?? (metaBaseDiáriaDoSetor ÷ horasUteis)` — **da BASE**, NÃO da acumulada (corrige o `daily_target/8` atual, que usa a efetiva/acumulada).
- `produzidoNaHora` = produção ponderada do setor na hora corrente (mesmo motor STAGE_OUT/coeficiente do resto), janela `[hora:00 .. hora:59]` no fuso do tenant; zera na virada.
- `batidasHoje` = nº de horas úteis já decorridas hoje cujo produzido ≥ metaHora; `Y` = total de horas úteis do dia.
- **REGRA DE OURO:** nada disso escreve/lê `goal_deficits`. A hora é puro display derivado de bipagens + jornada.

---

## 7. Componentes tocados/criados (para o Dex)
**Reusar:** `RadialGauge` (herói vira hora), `MiniRing` (3º anel Dia), `GlassPanel`, `TVWaveChart` (linha Meta/h passa a receber metaHora real), paleta `state.ts`, glow ambiente.
**Criar:**
- `HourPipsStrip` (a tira "★ X/Y" + pips) — átomo novo na TV.
- lógica de modo A/B em `TVSectorDefault.tsx` (herói condicional).
- no backend (Dara/Dex): campo(s) de jornada no `Tenant.settings` (ou tabela) + cálculo `metaHora`/`produzidoNaHora`/`batidasHoje` em `sector-kpis.ts` (novos campos no `SectorKpis`).
- config UI: card "Jornada" em Configurações + campo override na config de setor.

---

## 8. Fora de escopo
Meta por hora de operador / Meu Plano (decisão do Gabriel: só setor/TV agora). Relatório e individual não recebem meta-hora — só não podem quebrar.

— Uma 💝
