"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, subDays, startOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "@/lib/date";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: Date;
  to: Date;
}

interface Preset {
  label: string;
  range: () => DateRange;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    label: "Hoje",
    range: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  },
  {
    label: "7 dias",
    range: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    label: "30 dias",
    range: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    label: "Este mes",
    range: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }),
  },
];

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: Preset[];
  className?: string;
}

function DateRangeFilter({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
}: DateRangeFilterProps) {
  const [open, setOpen] = React.useState(false);

  const label =
    value.from && value.to
      ? `${format(value.from, "dd/MM/yy", { locale: ptBR })} — ${format(value.to, "dd/MM/yy", { locale: ptBR })}`
      : "Selecionar periodo";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Desktop: presets as ghost buttons */}
      <div className="hidden md:flex items-center gap-1">
        {presets.map((p) => (
          <Button
            key={p.label}
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange(p.range())}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-xs font-normal">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          {/* Mobile: presets stacked */}
          <div className="md:hidden flex flex-col border-b border-border/40 p-2 gap-1">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="justify-start text-xs"
                onClick={() => {
                  onChange(p.range());
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={{ from: value.from, to: value.to }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onChange({ from: startOfDay(range.from), to: endOfDay(range.to) });
                setOpen(false);
              } else if (range?.from) {
                onChange({ from: startOfDay(range.from), to: endOfDay(range.from) });
              }
            }}
            numberOfMonths={1}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { DateRangeFilter, DEFAULT_PRESETS };
export type { DateRangeFilterProps, Preset };
