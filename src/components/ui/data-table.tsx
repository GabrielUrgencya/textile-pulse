"use client";

import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, type EmptyStateProps } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyState?: EmptyStateProps;
  onRowClick?: (row: T) => void;
  mobileCard?: (row: T) => React.ReactNode;
  keyExtractor: (row: T) => string;
  className?: string;
}

function DataTable<T>({
  columns,
  data,
  loading,
  emptyState,
  onRowClick,
  mobileCard,
  keyExtractor,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null || bVal == null) return 0;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  if (loading) {
    return <TableSkeleton rows={5} columns={columns.length} className={className} />;
  }

  if (data.length === 0 && emptyState) {
    return <EmptyState {...emptyState} className={className} />;
  }

  return (
    <div className={className}>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={cn("text-xs", col.className)}>
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {col.header}
                      <ArrowUpDown className="size-3 text-muted-foreground/50" />
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row) => (
              <TableRow
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "link" : undefined}
                className={cn(
                  "border-border/40 hover:bg-secondary/30 transition-colors",
                  onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={cn("text-sm", col.className)}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sortedData.map((row) =>
          mobileCard ? (
            <div
              key={keyExtractor(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(row);
                }
              } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "link" : undefined}
              className={cn(onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
            >
              {mobileCard(row)}
            </div>
          ) : (
            <div
              key={keyExtractor(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(row);
                }
              } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "link" : undefined}
              className={cn(
                "rounded-xl border border-border/40 bg-secondary/30 p-4 space-y-1",
                onRowClick && "cursor-pointer active:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {columns.map((col) => (
                <div key={col.key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground text-xs">{col.header}</span>
                  <span>{col.render(row)}</span>
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export { DataTable };
export type { DataTableProps };
