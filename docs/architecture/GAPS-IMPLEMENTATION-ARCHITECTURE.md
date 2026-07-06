# Arquitetura de Implementação — Gaps do Lision

**Versão:** 1.0
**Data:** 2026-06-07
**Autor:** @architect (Aria)
**Status:** Aguardando aprovação

---

## 1. VISÃO GERAL

Este documento define a arquitetura técnica para implementar os 12 gaps prioritários identificados na análise comparativa entre os documentos de requisitos e o estado atual do Lision.

**Decisão arquitetural:** Rastreamento por LOTE (não peça individual).

**Princípio:** Todas as implementações seguem os patterns existentes (Next.js API routes, Prisma, Supabase Auth, shadcn/ui). Zero novas dependências externas.

---

## 2. MÓDULOS A IMPLEMENTAR

### MÓDULO A — Confirmação de Entrega na Facção (Código de Entrega)

**Gap:** Lote sai do barracão mas facção não confirma recebimento de forma verificável.

**Solução:** Gerar código numérico de 6 dígitos no momento do envio. Facção precisa digitar o código no portal para confirmar.

#### Schema Changes
```prisma
// Adicionar campo em FactionShipment:
model FactionShipment {
  // ... campos existentes ...
  deliveryCode       String?   @map("delivery_code")       // 6 dígitos
  deliveryCodeExpiresAt DateTime? @map("delivery_code_expires_at") @db.Timestamptz
}
```

#### API Endpoints
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/shipments` | (Modificar) Gerar `deliveryCode` ao criar shipment |
| GET | `/api/shipments/[id]/delivery-code` | Motorista/operador visualiza código |
| POST | `/api/faction/shipments/[id]/confirm` | (Modificar) Exigir `deliveryCode` no body |

#### Frontend
- **Tela do operador:** Ao criar shipment, exibir código em destaque (grande, copiável)
- **Portal da facção:** No fluxo de confirmação, adicionar campo para digitar código
- **Alerta automático:** Se facção não confirmar em 4h, criar Notification

#### Regras de Negócio
- Código expira em 48h
- Código é único por shipment (não reutilizável)
- Se código expirado, gerente pode gerar novo via API
- Confirmação sem código válido = BLOQUEADA

---

### MÓDULO B — Aduana (Conferência de Carga com Validação Visual)

**Gap:** Schema `AduanaValidation` existe mas não há UI nem fluxo operacional.

**Solução:** Página `/aduana` com modo de conferência: selecionar motorista/rota → escanear lotes → validação em tempo real com cores.

#### API Endpoints
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/aduana/sessions` | Listar sessões de conferência ativas |
| POST | `/api/aduana/sessions` | Iniciar sessão (driverId, shipmentIds esperados) |
| POST | `/api/aduana/validate` | Validar barcode contra sessão ativa |
| PATCH | `/api/aduana/sessions/[id]/close` | Fechar sessão |

#### Lógica de Validação (POST `/api/aduana/validate`)
```
INPUT: { sessionId, barcode }

1. Buscar lote pelo barcode
2. Se lote NÃO existe → VERMELHO ("Lote não encontrado no sistema")
3. Se lote já foi validado nesta sessão → VERMELHO ("Lote já bipado — possível duplicação")
4. Se lote pertence a shipment DIFERENTE da sessão → LARANJA ("Lote pertence a outra remessa")
5. Se lote pertence à sessão correta → VERDE ("OK — Rota correta")

OUTPUT: { color: GREEN|AMBER|RED, reason: string, lot: {...} }

Registrar em aduana_validations: alertColor, alertReason
Se operador prosseguir com AMBER/RED → alertIgnored = true
```

#### Frontend — Página `/aduana`
- **Layout:** Tela cheia, otimizada para leitor USB (foco permanente no campo)
- **Estado 1:** Seleção de motorista + remessa
- **Estado 2:** Modo scan contínuo — fundo muda de cor a cada bipagem (verde/laranja/vermelho)
- **Feedback sonoro:** Beep curto = verde, beep duplo = laranja, sirene = vermelho
- **Resumo:** Contador (X verde, Y laranja, Z vermelho) + botão "Finalizar Conferência"
- **Log:** Se operador ignora alerta, registra com userId + timestamp

---

### MÓDULO C — OpsClock (Tempo de Espera do Motorista)

**Gap:** Tabela `ops_clock` existe sem UI.

**Solução:** Widget na página de expedição/aduana + dashboard de métricas.

#### API Endpoints
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/ops-clock` | Registrar chegada do motorista |
| PATCH | `/api/ops-clock/[id]` | Atualizar loading_started, loading_ended, departed |
| GET | `/api/ops-clock` | Listar registros (com filtros de período) |
| GET | `/api/ops-clock/metrics` | Métricas agregadas (tempo médio espera/carga) |

#### Frontend
- **Widget Expedição:** Card mostrando motoristas "na fila" com timer ao vivo
- **Dashboard Métricas:** Tempo médio de espera, tempo médio de carga, pior dia, tendência semanal
- **Fluxo:** Chegou → Timer inicia → "Iniciar Carga" → "Carga Finalizada" → "Saiu" (4 cliques)

---

### MÓDULO D — Meta Ponderada por Coeficiente de Referência

**Gap:** Dashboard usa quantidade absoluta, não pondera por `meta_coefficient`.

**Solução:** Modificar queries de KPI para calcular: `peças_produzidas × meta_coefficient`.

#### Alterações
| Arquivo | Mudança |
|---------|---------|
| `src/app/api/dashboard/kpis/route.ts` | Multiplicar produção por `metaCoefficient` da OP |
| `src/app/api/dashboard/all/route.ts` | Idem |
| `src/app/api/kiosk/dashboard/route.ts` | Idem para TV |
| `src/components/dashboard/Dashboard.tsx` | Label: "Pontos de Meta" vs "Peças" |

#### Lógica
```sql
-- Antes: COUNT(scan_events) WHERE event_type = 'STAGE_IN' AND stage = último_stage
-- Depois: SUM(lots.quantity * production_orders.meta_coefficient)
--         WHERE scan_event liga lot → OP → metaCoefficient
```

#### Config
- Tenant settings: `use_weighted_meta: boolean` (default: true)
- Se false, mantém contagem simples de peças

---

### MÓDULO E — Allowance Detalhado (Breakdown por Tipo e Responsável)

**Gap:** Taxa existe mas sem breakdown por motivo ou responsável.

**Solução:** Enriquecer endpoint de qualidade + criar alerta automático quando threshold excedido.

#### API Endpoints
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/quality/allowance` | Breakdown: por tipo, por responsável, por período |
| GET | `/api/quality/allowance/alert` | Verificar se threshold excedido |

#### Lógica do Breakdown
```
GROUP BY defect_type → % por tipo (Costura 45%, Tecido 30%, etc.)
GROUP BY last_scan_user → % por responsável (quem teve a peça por último)
GROUP BY faction_id → % por facção
COMPARE com threshold (settings.allowance_target = 0.002)
```

#### Alerta Automático
- Endpoint chamado pelo cron/polling a cada hora
- Se taxa > threshold → cria Notification para ADMIN/GERENTE com severity "WARNING"
- Dashboard: indicador visual (verde < 70% do threshold, amarelo 70-100%, vermelho > 100%)

---

### MÓDULO F — Notificações Automáticas de Defeito para Facção

**Gap:** Notificações existem mas não são criadas automaticamente quando defeito é registrado.

**Solução:** Trigger no endpoint POST `/api/defects` — se lote está AT_FACTION, criar notificação para a facção.

#### Alteração em `src/app/api/defects/route.ts`
```typescript
// Após criar DefectRecord com sucesso:
if (lot.status === 'AT_FACTION') {
  const shipment = await prisma.factionShipment.findFirst({
    where: { lotId: lot.id, status: { in: ['SENT', 'RECEIVED_BY_FACTION'] } }
  });
  if (shipment) {
    await prisma.notification.create({
      data: {
        tenantId,
        factionId: shipment.factionId,
        type: 'DEFECT_DETECTED',
        title: `Defeito detectado — Lote ${lot.barcode}`,
        message: `${quantity} peça(s) com defeito de ${defectType}. Severidade: ${severity}.`,
        severity: severity === 'GRAVE' ? 'CRITICAL' : 'WARNING',
      }
    });
  }
}
```

---

### MÓDULO G — Saldo Financeiro com Desconto Automático por Defeito

**Gap:** Portal mostra dados financeiros mas não desconta defeitos automaticamente.

**Solução:** Calcular `paymentValue` e `deductionValue` automaticamente no shipment.

#### Lógica de Cálculo
```
paymentValue = quantityReturned × faction.pricePerPiece
deductionValue = quantityDefective × faction.pricePerPiece
netPayment = paymentValue - deductionValue
```

#### Alterações
| Arquivo | Mudança |
|---------|---------|
| `PATCH /api/shipments/[id]/receive` | Calcular payment/deduction ao receber |
| `GET /api/faction/financial` | Retornar saldo líquido por período |
| Portal `/financial` | Mostrar: bruto, descontos, líquido |

#### Regras
- Desconto só aplicado quando gerente confirma defeito (não na contestação)
- Se facção contesta e ganha → reverter deduction
- Histórico de ajustes mantido em `metadata` JSON do shipment

---

### MÓDULO H — Ranking de Produtividade por Colaborador

**Gap:** Ranking existe para facções mas não para colaboradores internos.

**Solução:** Query sobre scan_events agrupada por userId + período.

#### API Endpoint
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/dashboard/team-ranking` | Ranking de produtividade (diário/semanal) |

#### Lógica
```sql
SELECT p.full_name, p.sector,
  SUM(se.quantity_scanned * po.meta_coefficient) as pontos,
  COUNT(se.id) as total_scans
FROM scan_events se
  JOIN lots l ON se.lot_id = l.id
  JOIN production_orders po ON l.po_id = po.id
  JOIN profiles p ON se.user_id = p.id
WHERE se.event_type = 'STAGE_IN'
  AND se.scanned_at >= {period_start}
GROUP BY p.id
ORDER BY pontos DESC
```

#### Frontend
- Card no dashboard principal (abaixo de GoalsRow ou na sidebar)
- Top 5 colaboradores com barra de progresso relativa ao #1
- Filtro: Hoje / Semana / Mês

---

### MÓDULO I — Exportação para ERP (CSV de Lotes Finalizados)

**Gap:** Zero integração com ERP externo.

**Solução:** Endpoint de exportação CSV/JSON de lotes que entraram em estoque.

#### API Endpoint
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/export/stock-entries` | Exportar lotes estocados por período |

#### Formato de Saída (CSV)
```csv
data_entrada,op_number,referencia,lote,quantidade_ok,quantidade_defeito,quantidade_descarte
2026-06-07,OP-001,REF1002,L001,145,3,2
```

#### Frontend
- Botão "Exportar para ERP" na página de Produção → Orders
- Modal com seleção de período + formato (CSV/Excel)
- Download direto no browser

---

### MÓDULO J — Status Visual de Trânsito (Pipeline da Facção)

**Gap:** Não há indicação visual clara de onde o lote está no ciclo facção.

**Solução:** Status machine visual no shipment: PREPARANDO → EM TRÂNSITO → COM FACÇÃO → RETORNANDO → DEVOLVIDO.

#### Alterações no Frontend
- **Página de Facções:** Adicionar timeline/stepper visual em cada shipment
- **Dashboard:** Widget "Lotes em trânsito" com contadores por status
- **Cores de urgência:** Verde (no prazo), Laranja (próximo do prazo), Vermelho (atrasado)

#### Regras de Cor
```
diasRestantes = expectedReturnAt - hoje
Verde: diasRestantes > 2
Laranja: 0 <= diasRestantes <= 2
Vermelho: diasRestantes < 0
```

---

### MÓDULO K — Alerta de Facção Não Confirmou Recebimento

**Gap:** Facção pode ignorar confirmação sem consequência.

**Solução:** Job periódico que verifica shipments com status SENT e sem `factionConfirmedAt` há mais de 4h.

#### Implementação
- Rota: `GET /api/cron/check-unconfirmed` (chamada por cron externo ou revalidação)
- Lógica: buscar shipments WHERE status = 'SENT' AND faction_confirmed_at IS NULL AND sent_at < NOW() - 4h
- Ação: criar Notification para sentBy (operador) + GERENTE
- Frequência: a cada 1h

---

### MÓDULO L — Meta por Turno na TV

**Gap:** TV mostra KPIs do dia inteiro sem diferenciar turnos.

**Solução:** Adicionar filtro de turno nos KPIs da TV.

#### Configuração (Tenant settings)
```json
{
  "shifts": [
    { "name": "Manhã", "start": "07:00", "end": "12:00" },
    { "name": "Tarde", "start": "13:00", "end": "18:00" }
  ]
}
```

#### Alteração em `/api/kiosk/dashboard`
- Aceitar query param `?shift=current` (auto-detecta turno pelo horário)
- Filtrar scan_events pelo intervalo do turno ativo
- Fallback: se nenhum turno configurado, retorna dia inteiro

#### Frontend TV
- Indicador do turno atual no header
- KPIs filtrados automaticamente pelo turno

---

## 3. ORDEM DE IMPLEMENTAÇÃO (Fases)

### Fase 1 — Fundação Operacional (Prioridade Máxima)
| # | Módulo | Dependência |
|---|--------|-------------|
| 1 | **D** — Meta Ponderada | Nenhuma |
| 2 | **A** — Código de Entrega | Nenhuma |
| 3 | **F** — Notificação Auto Defeito | Nenhuma |
| 4 | **E** — Allowance Detalhado | Nenhuma |

### Fase 2 — Controle de Expedição
| # | Módulo | Dependência |
|---|--------|-------------|
| 5 | **B** — Aduana | Módulo A (código de entrega) |
| 6 | **C** — OpsClock | Nenhuma |
| 7 | **J** — Status Visual Trânsito | Módulo A |
| 8 | **K** — Alerta Não Confirmou | Módulo A |

### Fase 3 — Métricas e Financeiro
| # | Módulo | Dependência |
|---|--------|-------------|
| 9 | **G** — Saldo com Desconto | Nenhuma |
| 10 | **H** — Ranking Colaboradores | Módulo D |
| 11 | **I** — Exportação ERP | Nenhuma |
| 12 | **L** — Meta por Turno TV | Módulo D |

---

## 4. SCHEMA MIGRATION (Consolidada)

```prisma
// ÚNICA alteração necessária no schema:
model FactionShipment {
  // ... campos existentes ...
  deliveryCode          String?   @map("delivery_code")
  deliveryCodeExpiresAt DateTime? @map("delivery_code_expires_at") @db.Timestamptz
}

// Adicionar ao Tenant.settings JSON:
// "shifts": [{"name":"Manhã","start":"07:00","end":"12:00"},{"name":"Tarde","start":"13:00","end":"18:00"}]
// "use_weighted_meta": true
```

**Impacto:** 1 campo novo em 1 tabela. Zero breaking changes. O restante usa tabelas/campos já existentes.

---

## 5. NOVAS ROTAS (Resumo)

| Rota | Método | Módulo |
|------|--------|--------|
| `/api/shipments/[id]/delivery-code` | GET | A |
| `/api/aduana/sessions` | GET, POST | B |
| `/api/aduana/validate` | POST | B |
| `/api/aduana/sessions/[id]/close` | PATCH | B |
| `/api/ops-clock` | GET, POST | C |
| `/api/ops-clock/[id]` | PATCH | C |
| `/api/ops-clock/metrics` | GET | C |
| `/api/quality/allowance` | GET | E |
| `/api/dashboard/team-ranking` | GET | H |
| `/api/export/stock-entries` | GET | I |
| `/api/cron/check-unconfirmed` | GET | K |

**Total:** 11 novas rotas + 4 modificações em rotas existentes.

---

## 6. NOVAS PÁGINAS

| Rota | Descrição | Módulo |
|------|-----------|--------|
| `/(app)/aduana` | Conferência de carga (Aduana) | B |
| `/(app)/expedition` | Painel de expedição (OpsClock + envios) | C |

**Total:** 2 novas páginas. O restante são componentes adicionais em páginas existentes.

---

## 7. COMPONENTES NOVOS

| Componente | Onde Usado | Módulo |
|-----------|------------|--------|
| `DeliveryCodeDisplay` | Shipment detail, modal de envio | A |
| `DeliveryCodeInput` | Portal facção — confirmação | A |
| `AduanaScanner` | Página /aduana | B |
| `AduanaColorFeedback` | Página /aduana | B |
| `OpsClockWidget` | Página expedição | C |
| `OpsClockMetrics` | Dashboard ou expedição | C |
| `AllowanceBreakdown` | Página qualidade | E |
| `AllowanceAlert` | Dashboard principal | E |
| `TeamRankingCard` | Dashboard principal | H |
| `ExportModal` | Página produção | I |
| `ShipmentTimeline` | Página facções, portal | J |
| `ShiftIndicator` | TV header | L |

---

## 8. IMPACTO EM ARQUIVOS EXISTENTES

| Arquivo | Módulo | Natureza da Mudança |
|---------|--------|---------------------|
| `prisma/schema.prisma` | A | +2 campos em FactionShipment |
| `src/app/api/shipments/route.ts` | A | Gerar deliveryCode no POST |
| `src/app/api/faction/shipments/[id]/confirm/route.ts` | A | Validar deliveryCode |
| `src/app/api/defects/route.ts` | F | Criar notification automática |
| `src/app/api/dashboard/kpis/route.ts` | D | Ponderar por metaCoefficient |
| `src/app/api/dashboard/all/route.ts` | D | Ponderar por metaCoefficient |
| `src/app/api/kiosk/dashboard/route.ts` | D, L | Ponderar + filtro turno |
| `src/app/api/shipments/[id]/receive/route.ts` | G | Calcular payment/deduction |
| `src/app/api/faction/financial/route.ts` | G | Retornar saldo líquido |
| `src/components/dashboard/Dashboard.tsx` | H, E | Adicionar TeamRanking + Allowance |
| `src/app/(app)/factions/[id]/page.tsx` | J | Adicionar ShipmentTimeline |

---

## 9. SEGURANÇA

- **Código de entrega:** Rate-limit de 5 tentativas/hora por facção. Bloquear após 5 erros.
- **Aduana:** Log imutável de alertas ignorados. Não deletável.
- **OpsClock:** Somente ADMIN/GERENTE/COORDENADOR podem registrar.
- **Exportação ERP:** Somente ADMIN/GERENTE. Rate-limit de 10 exports/hora.
- **Ranking:** Dados pessoais (nome) apenas visíveis para ADMIN/GERENTE.

---

## 10. PERFORMANCE

- **Aduana:** Busca de lote por barcode = index existente (`@@index([barcode])`). <50ms.
- **Meta ponderada:** JOIN com production_orders em queries existentes. Impacto: +5-10ms.
- **Allowance breakdown:** Query com GROUP BY. Para 20k peças/mês, <200ms.
- **Ranking:** Aggregate query com window function. <100ms.
- **OpsClock:** Tabela pequena (poucos registros/dia). Zero concern.

---

## 11. UX/UI SPECIFICATIONS

**Definido por:** @ux-design-expert (Uma)
**Princípios gerais para TODAS as telas:**

- **Tipografia mínima:** 16px para body, 20px+ para campos de input em tela de operação
- **Touch targets:** Mínimo 48×48px para botões de ação
- **Feedback imediato:** Toda ação retorna resposta visual em <300ms
- **Foco automático:** Em telas de scan, cursor SEMPRE no campo de barcode
- **Contraste:** WCAG AA mínimo — texto claro sobre fundo escuro (oklch)
- **Sem scroll para ações primárias:** Ação principal visível sem rolar

---

### 11.1 MÓDULO A — DeliveryCode (Código de Entrega)

#### Para o Operador (ao criar shipment)

**Componente:** `DeliveryCodeDisplay`
- **Layout:** Card centralizado com o código em fonte monospace, tamanho 64px, bold
- **Fundo:** `bg-accent/10` com borda `border-accent` (azul elétrico)
- **Formato visual:** `XXX — XXX` (3 dígitos, travessão, 3 dígitos) para facilitar leitura em voz alta
- **Ações:** Botão "Copiar" (icon clipboard) + Botão "Enviar por WhatsApp" (futuro)
- **Expiração:** Badge discreto abaixo: "Válido até DD/MM às HH:MM"
- **Contexto:** Aparece em modal após criação do shipment + na página de detalhe do shipment

#### Para a Facção (no portal — confirmação)

**Componente:** `DeliveryCodeInput`
- **Layout:** InputOTP de 6 dígitos (componente `input-otp` já existente no projeto)
- **Estilo:** Mesmo visual do PIN login — caixas grandes, espaçadas, auto-foco no próximo
- **Feedback:**
  - Ao digitar 6 dígitos → validação automática (sem botão "confirmar")
  - Correto: flash verde + check animado + toast "Recebimento confirmado!"
  - Incorreto: shake animation + borda vermelha + toast "Código inválido"
  - Bloqueado (5 tentativas): Mensagem "Muitas tentativas. Contate o fornecedor."
- **Hierarquia na página:** H2 "Confirmar Recebimento" → texto "Digite o código informado pelo motorista" → InputOTP

---

### 11.2 MÓDULO B — Aduana (Conferência de Carga)

#### Layout da Página `/aduana`

**Estado 1 — Seleção (antes de começar)**
- **Layout:** Centralizado, formulário simples
- **Campos:** Select de Motorista + Select de Remessas pendentes (multi-select)
- **Botão:** "Iniciar Conferência" (primary, full-width, 56px height)

**Estado 2 — Modo Scan (tela de operação)**
- **Layout:** FULLSCREEN — sem sidebar, sem header do app
- **Estrutura:**
  ```
  ┌─────────────────────────────────────────────┐
  │  [X Sair]              ADUANA         [?]   │  ← Header mínimo
  ├─────────────────────────────────────────────┤
  │                                             │
  │         █████████████���██████████            │  ← Área de feedback
  │         ██  FUNDO MUDA DE COR  ██          │     (ocupa 60% da tela)
  │         ██  + ÍCONE + TEXTO    ██          │
  │         ████████████████████████            │
  │                                             │
  ├─────────────────────────────────────────────┤
  │  [___Campo de barcode (auto-focus)____]     │  ← Input 24px font
  ├─────────────────────────────────────────────┤
  │  ✓ 12 Verde  │  ⚠ 2 Laranja  │  ✕ 0 Verm │  ← Contadores
  └─────────────────────────────────────────────┘
  ```

**Feedback visual por cor:**
- **VERDE:** Fundo `bg-green-950`, ícone CheckCircle (lucide) 120px, texto "OK — Rota correta"
- **LARANJA:** Fundo `bg-amber-950`, ícone AlertTriangle 120px, texto "ATENÇÃO — Lote de outra remessa" + botões "Prosseguir" / "Separar"
- **VERMELHO:** Fundo `bg-red-950`, ícone XCircle 120px, texto "BLOQUEADO — [razão]" + botão "Registrar Ocorrência"

**Feedback sonoro:**
- Verde: Beep curto agudo (200ms, 880Hz)
- Laranja: Dois beeps médios (200ms + 200ms, 660Hz)
- Vermelho: Tom contínuo grave (500ms, 440Hz) — impossível ignorar

**Transição:** Após feedback (1.5s para verde, permanece para laranja/vermelho até ação), tela reseta para aguardar próximo scan.

**Botão Finalizar:** Fixo no canto inferior direito. Ao clicar, modal de resumo com lista de alertas ignorados (se houver).

#### Micro-interações (Motion)
- Feedback de cor: `animate={{ backgroundColor }}` com `transition={{ duration: 0.15 }}`
- Ícone: `scale: [0, 1.2, 1]` com spring
- Contadores: `layoutId` para animação de incremento

---

### 11.3 MÓDULO C — OpsClock (Tempo de Espera do Motorista)

#### Widget na Página de Expedição

**Componente:** `OpsClockWidget`
- **Layout:** Card com lista de motoristas "em fila"
- **Cada item:**
  ```
  ┌──────────────────────────────────────────┐
  │  🚛 Carlos Silva     ⏱ 00:32:15         │
  │  Placa: ABC-1234     Status: AGUARDANDO  │
  │  [Iniciar Carga]  [Cancelar]             │
  └──────────────────────────────────────────┘
  ```
- **Timer:** Fonte monospace, cor muda conforme tempo:
  - < 30min: `text-muted-foreground` (neutro)
  - 30-60min: `text-amber-400` (atenção)
  - > 60min: `text-red-400` (crítico, pulsa suavemente)
- **Estados do item:** AGUARDANDO → CARREGANDO → FINALIZADO → SAIU
- **Ação:** 4 botões sequenciais (só aparece o próximo estado)

#### Fluxo de interação
1. "Registrar Chegada" → Select motorista + timestamp auto
2. Card aparece na fila com timer rodando
3. "Iniciar Carga" → Timer muda cor para azul (working)
4. "Finalizar Carga" → Timer para, mostra duração
5. "Registrar Saída" → Card some da fila (vai pro histórico)

#### Dashboard de Métricas (`OpsClockMetrics`)
- **Posição:** Seção na página `/expedition`
- **Cards:** Tempo médio espera (gauge) | Tempo médio carga (gauge) | Total motoristas hoje
- **Gráfico:** BarChart horizontal — tempos dos últimos 7 dias (Recharts)

---

### 11.4 MÓDULO D — Meta Ponderada

#### Mudança Visual no Dashboard

- **GoalsRow:** Label muda de "Peças Produzidas" para "Pontos de Meta"
- **Tooltip:** Ao hover, mostrar breakdown: "150 peças × 1.2 coef = 180 pontos"
- **Formato numérico:** 1 casa decimal (ex: "487.5 / 600 pontos")
- **Barra de progresso:** Sem mudança visual — já funciona com percentual

#### Config no Settings
- **Toggle:** Switch "Usar meta ponderada por referência" em `/settings`
- **Se desativado:** Volta para contagem simples de peças (backward-compatible)

---

### 11.5 MÓDULO E — Allowance Detalhado

#### Componente: `AllowanceBreakdown`

**Posição:** Nova seção na página `/quality`, abaixo do overview existente
- **Layout:** Grid 2 colunas
  - **Coluna 1:** DonutChart (Recharts PieChart) — breakdown por tipo de defeito
  - **Coluna 2:** BarChart horizontal — top 5 responsáveis (últimos 30 dias)
- **Header:** "Taxa de Perda (Allowance)" com badge mostrando taxa atual vs. meta
  - Badge verde: `0.15% / 0.20%` (dentro da meta)
  - Badge vermelho: `0.28% / 0.20%` (acima da meta, com ícone TrendingUp)

#### Componente: `AllowanceAlert`

**Posição:** Dashboard principal — acima de GoalsRow quando ativo
- **Aparece SOMENTE quando:** taxa > 80% do threshold
- **Layout:** Alert banner (componente `alert` existente)
  - Variante `warning` (80-100%): Fundo amber, "Taxa de perda em 0.18% — próxima do limite"
  - Variante `destructive` (>100%): Fundo red, "Taxa de perda EXCEDIDA: 0.25% (meta: 0.20%)"
- **Ação:** Link "Ver detalhes" → navega para `/quality`

---

### 11.6 MÓDULO F — Notificação Auto de Defeito

#### UX no Portal da Facção

- **Notificação:** Badge vermelho no sino (NotificationBell) — incrementa contador
- **Toast:** Ao entrar no portal com notificação não lida: toast "Novo defeito detectado no Lote X"
- **Card na lista:** Ícone AlertTriangle vermelho + título bold + timestamp
- **Detalhe:** Ao clicar, expande com: tipo de defeito, quantidade, severidade, foto (se tiver)

#### Sem mudança visual no app principal — é backend-only (cria notification automaticamente)

---

### 11.7 MÓDULO G — Saldo Financeiro com Desconto

#### Mudança no Portal `/financial`

**Layout atualizado:**
```
┌─────────────────────────────────────────────┐
│  RESUMO DO PERÍODO: Junho 2026              │
├────────────┬────────────┬───────────────────┤
│  Bruto     │  Descontos │  Líquido          │
│  R$ 3.200  │  -R$ 180   │  R$ 3.020         │
│  (verde)   │  (vermelho)│  (branco, bold)   │
└────────────┴────────────┴───────────────────┘
```

- **Tabela de shipments:** Adicionar coluna "Desconto" com valor em vermelho
- **Tooltip no desconto:** "3 peças defeituosas × R$60/peça = R$180"
- **Contestação:** Se facção contestou e ainda pendente, mostrar como "Em análise" (amber)

---

### 11.8 MÓDULO H — Ranking de Colaboradores

#### Componente: `TeamRankingCard`

**Posição no Dashboard:** Após StagesCard + DefectsCard (nova row, col-span-5)
- **Layout:** Card com lista ranked (top 5)
  ```
  ┌──────────────────────────────────────┐
  │  👥 Produtividade — Hoje             │
  ├──────────────────────────────────────┤
  │  1. Maria Clara    487 pts  ████████ │
  │  2. Rodrigo        421 pts  ██████▌  │
  │  3. Janaina        398 pts  ██████   │
  │  4. Beatriz        356 pts  █████▌   │
  │  5. Valquíria      312 pts  █████    │
  └──────────────────────────────────────┘
  ```
- **Barra:** Proporcional ao #1 (quem tem mais = 100% da barra)
- **Cor da barra:** Gradiente sutil do accent color
- **Filtro:** Tabs pequenos no header: Hoje | Semana | Mês
- **Avatar:** Iniciais ao lado do nome (componente Avatar existente)
- **Animação:** Barras entram com stagger delay (motion)

---

### 11.9 MÓDULO I — Exportação ERP

#### Componente: `ExportModal`

**Trigger:** Botão "Exportar" no header da página Production Orders (ícone Download)
**Layout do Modal (Dialog existente):**
```
┌─────────────────────────────────────┐
│  Exportar Lotes para ERP            │
├─────────────────────────────────────┤
│  Período:                           │
│  [DatePicker início] → [fim]        │
│                                     │
│  Formato:                           │
│  (●) CSV   ( ) Excel               │
│                                     │
│  Filtro de Status:                  │
│  [x] Em Estoque                     │
│  [x] Parcialmente Estocado          │
│  [ ] Em Produção                    │
│                                     │
│  Preview: 47 lotes encontrados      │
├─────────────────────────────────────┤
│          [Cancelar] [Exportar ↓]    │
└─────────────────────────────────────┘
```

- **Preview dinâmico:** Ao mudar filtros, atualiza contagem em tempo real
- **Download:** Gera arquivo e inicia download direto (sem nova página)
- **Feedback:** Toast "47 lotes exportados com sucesso"

---

### 11.10 MÓDULO J — Status Visual de Trânsito (ShipmentTimeline)

#### Componente: `ShipmentTimeline`

**Layout:** Stepper horizontal com 5 estados
```
  ●────────●────────●────────○────────○
  Preparando  Enviado  Com Facção  Retornando  Devolvido
                          ▲ (estado atual — destacado)
```

- **Estado passado:** Círculo preenchido (`bg-accent`), linha sólida
- **Estado atual:** Círculo grande com pulse animation, label em bold
- **Estado futuro:** Círculo outline (`border-muted`), linha tracejada
- **Cor de urgência (no estado atual):**
  - Verde: No prazo (> 2 dias)
  - Laranja: Próximo do prazo (0-2 dias)
  - Vermelho: Atrasado (< 0 dias) — círculo pulsa em vermelho
- **Posição:** Topo da página de detalhe do shipment (facções e portal)
- **Responsivo:** Em mobile (portal), stepper vira vertical

---

### 11.11 MÓDULO K — Alerta Não Confirmou

#### UX — Notificação no Dashboard

- **Tipo:** Notification card com severity "WARNING"
- **Texto:** "Facção [nome] não confirmou recebimento do Lote [barcode] há X horas"
- **Ação:** Botão "Ver Remessa" → navega para detalhe do shipment
- **Posição:** Notification bell (sino no header) + seção de alertas no dashboard

#### No detalhe do shipment
- **Badge:** "Aguardando confirmação" (amber badge pulsante) no topo do card
- **Timer:** "Enviado há 6h — sem confirmação" em texto muted

---

### 11.12 MÓDULO L — Meta por Turno na TV

#### Componente: `ShiftIndicator`

**Posição:** Header da TV (TVHeader), ao lado do relógio
- **Layout:** Badge/chip com nome do turno: `[☀ Manhã]` ou `[🌙 Tarde]`
- **Cor:** Accent color (azul) — não distrai do conteúdo principal
- **Auto-detecção:** Muda automaticamente conforme horário do sistema
- **Tooltip (desktop):** "07:00 — 12:00"

#### Mudança nos KPIs da TV
- **Quando turno ativo:** KPIs filtram apenas scans do turno atual
- **Label ajustado:** "Produzido (Manhã): 234 / 300 pts"
- **Entre turnos (12:00-13:00):** Mostrar totais do dia (fallback)

---

### 11.13 PADRÕES TRANSVERSAIS

#### Sons (Web Audio API)
```typescript
// utils/audio-feedback.ts
const SOUNDS = {
  success: { freq: 880, duration: 150, type: 'sine' },
  warning: { freq: 660, duration: 200, repeat: 2, gap: 100 },
  error:   { freq: 440, duration: 400, type: 'sawtooth' },
  scan:    { freq: 1200, duration: 80, type: 'square' },
};
```
- Usar SOMENTE nas telas de operação (scan, aduana)
- Volume configurável nas Settings do tenant
- Botão mute no header das telas de operação

#### Animações (Motion patterns)
```typescript
// Padrões reutilizáveis
const fadeIn = { initial: { opacity: 0 }, animate: { opacity: 1 } };
const slideUp = { initial: { y: 20, opacity: 0 }, animate: { y: 0, opacity: 1 } };
const pulse = { animate: { scale: [1, 1.05, 1] }, transition: { repeat: Infinity, duration: 2 } };
const stagger = { transition: { staggerChildren: 0.05 } };
```

#### Componentes shadcn/ui a reutilizar
| Necessidade | Componente Existente |
|-------------|---------------------|
| Código de entrega | `InputOTP` |
| Timelines/Stepper | `Progress` + custom |
| Alertas | `Alert` (variantes destructive, warning) |
| Modal exportação | `Dialog` |
| Seleção motorista | `Select` / `Command` (combobox) |
| Filtro período | `DatePicker` (calendar) |
| Ranking barras | Custom com `div` + Tailwind width |
| Gauges | Recharts `RadialBarChart` |
| Timer | Custom hook `useTimer` + monospace display |

---

*— Uma, desenhando com empatia 💝*

---

## 12. REVISÃO ARQUITETURAL — FALHAS IDENTIFICADAS E CORREÇÕES

**Revisado por:** @architect (Aria) — Análise de robustez

### 12.1 FALHAS POTENCIAIS CORRIGIDAS

#### FALHA 1: Race Condition no Código de Entrega (Módulo A)

**Problema:** Se dois shipments forem criados simultaneamente, `Math.random()` pode gerar códigos duplicados.

**Correção:** Gerar código com `crypto.randomInt(100000, 999999)` + verificar unicidade no banco antes de salvar. Se colisão (improvável), retry até 3x.

```typescript
// Padrão obrigatório:
import { randomInt } from 'crypto';

async function generateUniqueDeliveryCode(tenantId: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const code = String(randomInt(100000, 999999));
    const exists = await prisma.factionShipment.findFirst({
      where: { deliveryCode: code, status: { in: ['PREPARING', 'SENT'] } }
    });
    if (!exists) return code;
  }
  throw new Error('Failed to generate unique delivery code');
}
```

#### FALHA 2: Aduana Session Leak (Módulo B)

**Problema:** Se operador fecha o browser sem fechar a sessão, a sessão fica "aberta" para sempre.

**Correção:** Sessões expiram automaticamente após 4h de inatividade. O endpoint GET `/api/aduana/sessions` deve filtrar `WHERE updated_at > NOW() - 4h OR status = 'ACTIVE'`. Na prática, usar campo `lastActivityAt` atualizado a cada scan.

**Schema adicional necessário:**
```prisma
// Não precisa de tabela nova — usar metadata JSON na AduanaValidation
// A "sessão" é virtual: agrupamento de validations pelo mesmo operador no mesmo período
// Isso evita complexidade desnecessária
```

**CORREÇÃO DE DESIGN:** Eliminar conceito de "sessão persistente". A Aduana funciona assim:
1. Operador seleciona motorista/remessa (estado no frontend, não no banco)
2. Cada scan chama POST `/api/aduana/validate` com `{ driverId, shipmentIds[], barcode }`
3. API valida e registra AduanaValidation
4. Sem sessão no backend = sem leak = sem cleanup

#### FALHA 3: Meta Ponderada pode quebrar dashboard existente (Módulo D)

**Problema:** Se `meta_coefficient` for NULL ou 0 em alguma OP antiga, multiplicar por ele retorna 0 ou NULL, zerando os KPIs.

**Correção:** COALESCE obrigatório: `COALESCE(meta_coefficient, 1.0)`. Toda query DEVE usar este fallback. O valor 1.0 significa "1 peça = 1 ponto" (backward-compatible com dados históricos).

#### FALHA 4: Allowance "por responsável" pode ser injusto (Módulo E)

**Problema:** A lógica "último bipador" pode culpar quem detectou o defeito, não quem o causou.

**Correção:** Usar `defect_records.detected_by` para contexto, mas o "responsável" real é o **penúltimo** scanner (quem operou ANTES da conferência detectar). Query corrigida:

```sql
-- Buscar quem operou o lote no stage ANTERIOR ao da detecção
SELECT se.user_id as responsible_user
FROM scan_events se
WHERE se.lot_id = {lot_id}
  AND se.stage_id = {previous_stage_id}  -- stage antes da conferência
  AND se.event_type = 'STAGE_IN'
ORDER BY se.scanned_at DESC LIMIT 1
```

Se `previous_stage_id` é NULL (defeito detectado no primeiro stage), atribuir ao criador do lote.

#### FALHA 5: OpsClock sem tenantId (Módulo C)

**Problema:** A tabela `ops_clock` no schema atual NÃO tem `tenant_id`. Isso impede filtragem multi-tenant.

**Correção:** Adicionar ao schema migration:
```prisma
model OpsClock {
  // ... campos existentes ...
  tenantId String @map("tenant_id") @db.Uuid
  tenant   Tenant @relation(fields: [tenantId], references: [id])
}
```

**ATUALIZAR seção 4 (Schema Migration):** São 3 alterações, não 2:
1. `deliveryCode` + `deliveryCodeExpiresAt` em FactionShipment
2. `tenantId` em OpsClock (+ relation com Tenant)

#### FALHA 6: Cron endpoint sem autenticação (Módulo K)

**Problema:** `GET /api/cron/check-unconfirmed` é uma rota pública que qualquer um pode chamar repetidamente, gerando spam de notificações.

**Correção:** Proteger com header secreto:
```typescript
// No route handler:
const cronSecret = request.headers.get('x-cron-secret');
if (cronSecret !== process.env.CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Alternativa (melhor para Vercel): usar Vercel Cron com `vercel.json` config.

#### FALHA 7: Export CSV pode ser gigante (Módulo I)

**Problema:** Se período selecionado for 1 ano, query pode retornar milhares de registros e travar.

**Correção:** Limite máximo de 90 dias por export. Se mais, retornar erro 400: "Período máximo: 90 dias". Também: `LIMIT 5000` na query como safety net.

---

### 12.2 REGRAS OBRIGATÓRIAS PARA O @dev (Prevenção de Erros)

#### REGRA 1: Padrão de API Response
Toda nova rota DEVE seguir o padrão existente:
```typescript
// CORRETO:
return NextResponse.json({ data: result });
return NextResponse.json({ error: 'Mensagem' }, { status: 4XX });

// INCORRETO (não fazer):
return NextResponse.json(result);  // sem wrapper 'data'
return new Response(JSON.stringify(error));  // sem NextResponse
```

#### REGRA 2: Sempre usar withAuth middleware
Toda rota nova (exceto `/api/cron/*`) DEVE usar o padrão:
```typescript
import { withAuth } from '@/lib/auth-middleware';

export async function POST(request: Request) {
  const auth = await withAuth(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { tenantId, userId } = auth;
  // ...
}
```

Para rotas do portal da facção, usar `withFactionAuth` de `@/lib/faction-middleware`.

#### REGRA 3: Validação de Input com Zod
Todo endpoint que recebe body DEVE validar com Zod ANTES de qualquer operação:
```typescript
import { z } from 'zod';

const schema = z.object({
  barcode: z.string().min(1),
  driverId: z.string().uuid(),
});

const parsed = schema.safeParse(await request.json());
if (!parsed.success) {
  return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
}
```

#### REGRA 4: Tenant isolation em TODA query
Toda query Prisma DEVE incluir `tenantId` no WHERE. Sem exceção.
```typescript
// CORRETO:
await prisma.lot.findFirst({ where: { barcode, productionOrder: { tenantId } } });

// INCORRETO (vulnerabilidade multi-tenant):
await prisma.lot.findFirst({ where: { barcode } });
```

#### REGRA 5: Não duplicar notificações
Antes de criar Notification, verificar se já existe uma igual não-lida:
```typescript
const existing = await prisma.notification.findFirst({
  where: { tenantId, type, factionId, readAt: null, createdAt: { gte: subHours(new Date(), 4) } }
});
if (!existing) { /* criar */ }
```

#### REGRA 6: Decimal handling com Prisma
`meta_coefficient` é `Decimal(4,2)`. No JavaScript, Prisma retorna como `Prisma.Decimal`, NÃO como `number`. Sempre converter:
```typescript
const coeff = Number(order.metaCoefficient) || 1.0;  // SEMPRE com fallback
```

#### REGRA 7: Componentes novos — local correto
```
src/components/aduana/       → AduanaScanner, AduanaColorFeedback
src/components/expedition/   → OpsClockWidget, OpsClockMetrics
src/components/dashboard/    → TeamRankingCard, AllowanceAlert
src/components/shipments/    → DeliveryCodeDisplay, DeliveryCodeInput, ShipmentTimeline
src/components/quality/      → AllowanceBreakdown
src/components/export/       → ExportModal
src/components/tv/           → ShiftIndicator (já existe pasta)
```

#### REGRA 8: Não criar hooks/utils soltos — usar lib/
```
src/lib/audio-feedback.ts    → Sons da Aduana/Scan
src/lib/delivery-code.ts     → Geração + validação do código de entrega
src/lib/ops-clock.ts         → Cálculos de tempo/métricas
src/lib/allowance.ts         → Cálculos de taxa de perda
src/lib/export.ts            → Geração de CSV/Excel
```

#### REGRA 9: Testes manuais obrigatórios antes de marcar completo
Para cada módulo implementado, o @dev DEVE:
1. Verificar `npx tsc --noEmit` passa
2. Verificar `npx next lint` passa
3. Testar o endpoint via curl/browser com dados reais do tenant `588a3542-d6db-4fc4-bd98-3dcde56bdb6b`
4. Verificar que dados existentes NÃO foram afetados (backward-compatible)

#### REGRA 10: Sidebar navigation — manter consistência
Novas páginas (Aduana, Expedição) devem ser adicionadas ao `AppSidebar` na seção correta:
- Aduana → Seção "Operações" (após Scan)
- Expedição → Seção "Operações" (após Aduana)

---

## 13. PARTICIPANTES DA IMPLEMENTAÇÃO

| Agente | Responsabilidade |
|--------|-----------------|
| **@architect (Aria)** | Documento de arquitetura, revisão de design, validação de decisões técnicas |
| **@ux-design-expert (Uma)** | Especificações UX/UI, padrões visuais, acessibilidade |
| **@sm (River)** | Criação das stories a partir da arquitetura |
| **@po (Pax)** | Validação das stories (10-point checklist) |
| **@dev (Dex)** | Implementação código (API + Frontend + Schema) |
| **@qa (Quinn)** | Revisão de qualidade pós-implementação |
| **@devops (Gage)** | Push e PR após aprovação |

**Workflow:** @architect → @sm (stories) → @po (validação) → @dev (implementação) → @qa (review) → @devops (push)

---

*— Aria, arquitetando o futuro 🏗️*
