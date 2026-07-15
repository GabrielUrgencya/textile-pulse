# TV do chão de fábrica — Redesign "Instrumento" (spec para @dev)

**Autora:** Uma (@ux-design-expert) · **Status:** ✅ APROVADO pelo Gabriel — em implementação
**Mockup renderizável:** aprovado no chat (versão premium: glow âmbar ambiente, arco cromático com glow, vidro edge-light, anel de traços, vinheta, tabular-nums).

## ⚠️ Correções obrigatórias (portão do Gabriel — inegociáveis)

### Correção 1 — Fonte REAL da LISION (não a genérica do mockup)
- Usar a fonte do design system: **Inter** via `var(--font-display)` / classe existente (o mockup usava `font-family` genérico só para prototipar).
- **Manter as decisões de HIERARQUIA do mockup:** número herói gigante, labels em CAIXA ALTA com `letter-spacing`, unidades menores que o número, e `font-variant-numeric: tabular-nums` em todos os dígitos.
- Pesos: 800 nos números herói, 600 nos labels/valores secundários.

### Correção 2 — O redesign vale para a TV INTEIRA, TODOS os setores
- **Não pode existir setor com tela antiga e setor com tela nova.** Todos renderizam o novo design.
- Hoje a view de setor tem DOIS caminhos em `src/app/(kiosk)/tv/page.tsx`:
  1. `dashboard_config` custom (admin, Story 8.41) → `WidgetRenderer`/bento — **é a variação por setor que causa telas diferentes.**
  2. Sem config → `TVSectorDefault`.
- **Decisão de arquitetura (Aria):** a view de setor passa a renderizar **SEMPRE** o novo `TVSectorDefault` (design aprovado), ignorando o caminho de config custom. Isso unifica todos os setores sob um único design premium. O seletor de setor (`TVHeaderV2`) continua funcionando — só muda o setor exibido, nunca o layout.
- A integração do status da FACÇÃO entra como card dentro do novo `TVSectorDefault` (rodapé, junto ao ranking), como no mockup.
- **Fora de escopo desta frente:** a "Visão Geral" (não é um setor — usa produção do dia, lotes por estágio, alertas). Fica como está; se o Gabriel quiser redesenhá-la, é uma frente separada (não há mockup aprovado dela).

### Estado responsivo (glow) — 3 cores, provadas por QA
- `emerald` = no ritmo (meta batida/em dia) · `amber` = atenção · `red`/vermelho = abaixo.
- Mapeamento por `percent` da meta acumulada efetiva (ajustável): **≥100% emerald · 70–99% amber · <70% vermelho**.
- O glow ambiente da sala, a cor do arco, do %, do pill de status e do text-shadow do número herói **acompanham o estado**.
- QA força os 3 estados com dados reais no Fábrica Teste e prova as 3 cores em tela.

## Conceito
"Instrumento industrial de luxo": vidro + glow + medidores radiais + onda viva.
Beleza a serviço de UMA pergunta respondida em 2s a 5m de distância: **estamos batendo a meta?**
A cor responde antes do número (emerald = no ritmo, âmbar = atenção, vermelho = abaixo/déficit).

## Hierarquia (o que é herói)
1. **HERÓI:** medidor radial da META DO MOMENTO (número gigante no centro, % colorido, anel que enche).
2. **Secundário:** distância da meta, ritmo/h, tempo de processo, mini-anéis de semana/mês.
3. **Rodapé:** onda de produção por hora (com linha de meta) + ranking do setor + status da facção.
4. **Moldura:** marca + setor · relógio + data + AO VIVO pulsante.

## Tokens (identidade LISION, elevada)
- Fundo: radial `#0f1512 → #0a0b0d → #08090b` (dark com profundidade). Grão de scanline sutil (opacity .06).
- **Glow herói:** radial emerald `rgba(16,185,129,.45)` no topo-centro, blur 40px, opacity .55.
- Vidro (glass): `bg rgba(255,255,255,.045)` · `border 1px rgba(255,255,255,.09)` · `backdrop-filter blur(14px)` · inset highlight `rgba(255,255,255,.06)`.
- Cores-sinal: emerald `#10b981` (+claro `#34d399`) · âmbar `#f59e0b` · vermelho `#ef4444`.
- Texto: `#fafafa`; labels/mut `#a1a1aa`. Fonte **Inter** (800 nos números, 600 nos labels).
- Raio de card ~1.2cqw; espaçamento generoso (gaps 1.4cqw).

## Escala tipográfica (responsiva)
> ⚠️ **NÃO usar `cqw`/container queries** — foi a causa da tela preta no protótipo. A `/tv` é `h-screen w-screen` fixa: usar `clamp()`/`vw`/`vh` ou tamanhos fixos coerentes com os componentes atuais (`text-[Npx]`). Mantendo os RATIOS abaixo (o `cqw` aqui é só referência de proporção do mockup).
- Número herói: **8.4cqw**, weight 800, tabular-nums, text-shadow glow âmbar/emerald.
- % herói: 2.4cqw 800. Relógio: 1.8cqw. Marca: 2.1cqw 800.
- KPIs (ritmo/processo): 3.2cqw. Ring central semana/mês: 2cqw. Labels: 1.1–1.2cqw uppercase, letter-spacing .2cqw, cor mut.
- Ranking nome: 1.3cqw; valor: 1.5cqw.

## Medidor radial (SVG)
- Anel de progresso: `r=86`, `stroke-width=11`, `stroke-linecap round`, gradiente `#34d399 → #10b981 → #f59e0b`, `drop-shadow` glow.
- Track: `rgba(255,255,255,.07)` width 11. **Anel de "traços" (instrumento):** circle com `stroke-dasharray:1.5 7.2`, `rgba(255,255,255,.16)` (ticks concêntricos).
- Progresso via `stroke-dashoffset` (circunferência 540.35). **Cor do % e do anel muda por estado**: ≥100% emerald, 85–99% âmbar, <85% âmbar/vermelho.
- Mini-anéis semana/mês: `r=40`, width 9, mesma técnica.

## Onda de produção por hora (SVG)
- Curva **spline/bezier suave** (nunca retas quebradas), `stroke #34d399` 2.4px com glow.
- Área com gradiente vertical emerald `.42 → 0` (desvanece p/ baixo).
- **Linha de meta** tracejada `rgba(255,255,255,.28)`. Ponto "agora" pulsante no fim da curva.
- Eixo de horas discreto (08h…agora).

## Animação (durações + easing exatos)
- Anéis preenchem: `stroke-dashoffset` transition **1.7s** `cubic-bezier(.22,1,.36,1)` (ease-out expressivo).
- Números **count-up**: 1.4–1.5s, easing cúbico (1−(1−p)³). Formato pt-BR (separador de milhar).
- Onda **desenha-se**: linha via `stroke-dashoffset` **2.1s** `cubic-bezier(.4,0,.2,1)`; área faz fade-in (1.2s, delay 1s); ponto pulsa (2s loop).
- **AO VIVO**: dot com `ping` (anel expandindo) 2s loop + glow.
- Número herói "respira" (opacity 1→.86, 4s loop) — sutil, vivo.
- **Tempo real:** quando o dado chega (polling atual da TV), o número faz count-up até o novo valor e o anel re-preenche com a mesma curva (transição suave, nunca troca seca). Demonstrado no mockup (produção sobe a cada ~4s).
- Barras do ranking crescem (`width`) 1.4s ease-out com stagger.

## Regras de leitura a distância (função > decoração)
- O maior elemento é sempre "quanto produzimos vs meta". Nada compete com ele.
- Cor = sinal primário. Um operador a 5m lê "verde/âmbar/vermelho" antes de ler dígitos.
- Sem interação de mouse; movimento só com propósito (comunicar mudança de dado / manter vivo).

## Dados (mapear para a API atual da TV)
Reusar `sector_kpis` (computeSectorKpis) já existente: produced, daily_target (efetiva), percent,
distance_daily, weekly/monthly, avg_per_lot_min, hourly[], top_collaborators[], faction_status.
Nenhuma mudança de dados — só apresentação. (No mockup os números são do Fábrica Teste.)

## Implementação sugerida (quando aprovado)
- Substituir os componentes de barra por: `RadialGauge.tsx` (SVG), `WaveChart.tsx` (SVG path spline),
  `CountUp` util, `MiniRing.tsx`. Reaproveitar a rota `/tv` e o polling atual.
- SVG para anéis/onda (controle de gradiente/glow/animação de path); CSS `backdrop-filter` para o vidro;
  transições CSS + rAF para o count-up. Sem libs novas necessárias.
- Manter acessibilidade/perf: a TV roda o dia todo — usar transições GPU-friendly (transform/opacity/stroke-dashoffset), evitar reflow.
