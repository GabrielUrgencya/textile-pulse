"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import type { SalesHolidayRecord } from "@/lib/sales-admin-configuration";

/**
 * Calendário comercial mensal (CAL-1) — grade real de dias, destacando
 * fins de semana e feriados. Clicar num dia abre o cadastro de feriado
 * já com a data preenchida. Respeita o "início da semana" da configuração.
 */

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };

export function SalesHolidayCalendar({
  holidays,
  weekStartsOn,
  onPickDate,
}: {
  holidays: SalesHolidayRecord[];
  weekStartsOn: number;
  onPickDate: (date: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const start = ((weekStartsOn % 7) + 7) % 7;
  const weekdayHeaders = useMemo(() => Array.from({ length: 7 }, (_, i) => WEEKDAYS[(start + i) % 7]), [start]);
  const holidayByDate = useMemo(() => {
    const map = new Map<string, SalesHolidayRecord>();
    for (const h of holidays) map.set(h.date, h);
    return map;
  }, [holidays]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const lead = (firstWeekday - start + 7) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: Array<{ day: number; iso: string; weekend: boolean } | null> = [];
    for (let i = 0; i < lead; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const weekday = new Date(year, month, d).getDay();
      list.push({ day: d, iso: iso(year, month, d), weekend: weekday === 0 || weekday === 6 });
    }
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month, start]);

  function shift(delta: number) {
    const next = month + delta;
    if (next < 0) { setMonth(11); setYear((y) => y - 1); }
    else if (next > 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth(next);
  }

  const today = todayIso();
  const monthHolidays = holidays.filter((h) => h.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));

  return (
    <KpiCard className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold tracking-tight">{MONTHS[month]} {year}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Mês anterior" onClick={() => shift(-1)}>‹</Button>
          <Button variant="outline" size="sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>Hoje</Button>
          <Button variant="outline" size="sm" aria-label="Próximo mês" onClick={() => shift(1)}>›</Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weekdayHeaders.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">{w}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;
          const holiday = holidayByDate.get(cell.iso);
          const isToday = cell.iso === today;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onPickDate(cell.iso)}
              title={holiday ? `Feriado: ${holiday.name}` : "Adicionar feriado neste dia"}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors",
                "hover:border-foreground/40 hover:bg-foreground/[0.04]",
                cell.weekend ? "border-border/40 text-muted-foreground/70" : "border-border/60",
                holiday && holiday.isActive && "border-warning/50 bg-warning/10 text-foreground",
                isToday && "ring-1 ring-foreground/50",
              )}
            >
              <span className="tabular-nums">{cell.day}</span>
              {holiday && <span aria-hidden className={cn("mt-0.5 size-1.5 rounded-full", holiday.isActive ? "bg-warning" : "bg-muted-foreground/40")} />}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" /> Feriado</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border border-border/60" /> Dia útil</span>
        <span className="opacity-70">Fim de semana em tom suave · clique num dia para cadastrar feriado</span>
      </div>

      {monthHolidays.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {monthHolidays.length} feriado(s) em {MONTHS[month]}: {monthHolidays.map((h) => `${h.date.slice(8)} ${h.name}`).join(" · ")}
        </p>
      )}
    </KpiCard>
  );
}
