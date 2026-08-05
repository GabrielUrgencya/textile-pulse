"use client";

import * as React from "react";
import { ChevronRight, Package, Truck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, type EmptyStateProps } from "@/components/ui/empty-state";
import type { DataTableColumn } from "@/components/ui/data-table";
import { getShipmentStatusMeta } from "@/lib/shipment-status";
import type { FactionShipment } from "@/hooks/use-factions-data";
import { cn } from "@/lib/utils";

/**
 * Visualização AGRUPADA das remessas de uma facção (Frente: agrupar por envio).
 *
 * O modelo é 1 remessa = 1 lote; remessas do mesmo envio apenas COMPARTILHAM
 * `shipment_group_id` (gravado na criação). Aqui NÃO mexemos no modelo: só
 * colapsamos visualmente as remessas do mesmo grupo num card único, que expande
 * para os lotes individuais — cada um com sua conferência/status/ações intactos.
 *
 * As somas do card (peças, valor a receber) são REDUCES sobre as próprias
 * remessas do grupo — mesma fonte de verdade dos lotes, nunca recalculadas por
 * fora. O status do grupo é a contagem honesta por status ("3 Enviado, 2
 * Devolvido"), sem fingir que "está tudo pronto".
 *
 * As colunas e o onRowClick são os MESMOS da DataTable de "Separado" — reuso
 * total das células (timeline, status, botões de ação, abrir drawer).
 */

interface ShipmentGroupedTableProps {
  columns: DataTableColumn<FactionShipment>[];
  shipments: FactionShipment[];
  onRowClick: (row: FactionShipment) => void;
  emptyState?: EmptyStateProps;
}

type Item =
  | { kind: "single"; shipment: FactionShipment }
  | { kind: "group"; groupId: string; members: FactionShipment[] };

/** Agrupa por shipment_group_id preservando a ordem de chegada (sent_at desc). */
function buildItems(shipments: FactionShipment[]): Item[] {
  const items: Item[] = [];
  const groupPos = new Map<string, number>();

  for (const s of shipments) {
    const gid = s.shipment_group_id ?? null;
    if (!gid) {
      items.push({ kind: "single", shipment: s });
      continue;
    }
    const existing = groupPos.get(gid);
    if (existing !== undefined) {
      (items[existing] as Extract<Item, { kind: "group" }>).members.push(s);
    } else {
      groupPos.set(gid, items.length);
      items.push({ kind: "group", groupId: gid, members: [s] });
    }
  }

  // Grupo com 1 lote só = remessa avulsa (aparece normal, como hoje).
  return items.map((it) =>
    it.kind === "group" && it.members.length === 1
      ? { kind: "single", shipment: it.members[0] }
      : it,
  );
}

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Resumo do grupo: somas e contagem por status — tudo derivado dos lotes. */
function summarize(members: FactionShipment[]) {
  const pieces = members.reduce((sum, m) => sum + (m.total_quantity || 0), 0);

  // Valor a receber = Σ payment_value (o "Bruto" canônico por remessa).
  // Só somamos os que já têm valor definido; se nenhum tem, mostramos "—"
  // em vez de inventar um número.
  let value = 0;
  let anyValue = false;
  for (const m of members) {
    if (m.payment_value != null) {
      value += Number(m.payment_value);
      anyValue = true;
    }
  }

  // Contagem por status, na ordem canônica da timeline.
  const byStatus = new Map<string, { label: string; tone: ReturnType<typeof getShipmentStatusMeta>["tone"]; order: number; count: number }>();
  for (const m of members) {
    const meta = getShipmentStatusMeta(m.status);
    const cur = byStatus.get(meta.label);
    if (cur) cur.count += 1;
    else byStatus.set(meta.label, { label: meta.label, tone: meta.tone, order: meta.order, count: 1 });
  }
  const statuses = Array.from(byStatus.values()).sort((a, b) => a.order - b.order);

  return { pieces, value, anyValue, statuses, lots: members.length };
}

export function ShipmentGroupedTable({
  columns,
  shipments,
  onRowClick,
  emptyState,
}: ShipmentGroupedTableProps) {
  const items = React.useMemo(() => buildItems(shipments), [shipments]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (gid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });

  if (shipments.length === 0 && emptyState) {
    return <EmptyState {...emptyState} />;
  }

  // colSpan do conteúdo do grupo = todas as colunas (o chevron tem coluna própria).
  const contentSpan = columns.length;

  const renderMemberRow = (row: FactionShipment, inGroup: boolean) => (
    <TableRow
      key={row.id}
      onClick={() => onRowClick(row)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowClick(row);
        }
      }}
      tabIndex={0}
      role="link"
      className={cn(
        "border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        inGroup && "bg-secondary/10",
      )}
    >
      {/* célula do chevron: vazia; recuo visual quando é membro de grupo */}
      <TableCell className={cn("w-8", inGroup && "pl-8")} />
      {columns.map((col) => (
        <TableCell key={col.key} className={cn("text-sm", col.className)}>
          {col.render(row)}
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <div>
      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="w-8" />
              {columns.map((col) => (
                <TableHead key={col.key} className={cn("text-xs", col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              if (it.kind === "single") return renderMemberRow(it.shipment, false);

              const { pieces, value, anyValue, statuses, lots } = summarize(it.members);
              const isOpen = expanded.has(it.groupId);

              return (
                <React.Fragment key={it.groupId}>
                  {/* Linha-resumo do grupo (clica p/ expandir; não abre drawer) */}
                  <TableRow
                    onClick={() => toggle(it.groupId)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(it.groupId);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                    className="border-border/40 bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TableCell className="w-8">
                      <ChevronRight
                        className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                      />
                    </TableCell>
                    <TableCell colSpan={contentSpan} className="py-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                            <Truck className="size-4 text-muted-foreground" />
                            Envio agrupado
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-medium">
                            <Package className="size-3" />
                            {lots} lotes
                          </span>
                          {/* Status do conjunto — contagem honesta por status */}
                          <span className="flex items-center gap-1 flex-wrap">
                            {statuses.map((st) => (
                              <StatusBadge key={st.label} status={st.tone}>
                                {st.count}× {st.label}
                              </StatusBadge>
                            ))}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="font-mono">
                            <span className="text-muted-foreground text-xs mr-1">Peças</span>
                            {pieces}
                          </span>
                          <span className="font-mono">
                            <span className="text-muted-foreground text-xs mr-1">A receber</span>
                            {anyValue ? brl(value) : "—"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {isOpen ? "toque p/ recolher" : `toque p/ ver os ${lots} lotes`}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Lotes do grupo (expandido) — cada um com status/ações próprios */}
                  {isOpen && it.members.map((m) => renderMemberRow(m, true))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile — cards empilhados (mesma lógica de grupo/expansão) */}
      <div className="md:hidden space-y-3">
        {items.map((it) => {
          if (it.kind === "single") {
            const row = it.shipment;
            return (
              <div
                key={row.id}
                onClick={() => onRowClick(row)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); }
                }}
                className="rounded-xl border border-border/40 bg-secondary/30 p-4 space-y-1 cursor-pointer active:bg-secondary/50"
              >
                {columns.map((col) => (
                  <div key={col.key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-xs">{col.header}</span>
                    <span>{col.render(row)}</span>
                  </div>
                ))}
              </div>
            );
          }

          const { pieces, value, anyValue, statuses, lots } = summarize(it.members);
          const isOpen = expanded.has(it.groupId);
          return (
            <div key={it.groupId} className="rounded-xl border border-border/40 overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(it.groupId)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 bg-secondary/40 p-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Truck className="size-4 text-muted-foreground" /> Envio · {lots} lotes
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {statuses.map((st) => (
                      <StatusBadge key={st.label} status={st.tone}>{st.count}× {st.label}</StatusBadge>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground font-mono">
                    {pieces} peças · A receber {anyValue ? brl(value) : "—"}
                  </div>
                </div>
                <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              </button>
              {isOpen && (
                <div className="divide-y divide-border/40">
                  {it.members.map((row) => (
                    <div
                      key={row.id}
                      onClick={() => onRowClick(row)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); }
                      }}
                      className="p-4 space-y-1 cursor-pointer active:bg-secondary/30"
                    >
                      {columns.map((col) => (
                        <div key={col.key} className="flex justify-between text-sm">
                          <span className="text-muted-foreground text-xs">{col.header}</span>
                          <span>{col.render(row)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
