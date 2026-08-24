import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estados de carregamento honestos (CROSS-1) — skeletons proporcionais ao
 * layout final, em vez do texto cru "Carregando fonte canônica…".
 */
export function SalesLoading({ variant = "list" }: { variant?: "list" | "form" | "cards" }) {
  if (variant === "form") {
    return (
      <div role="status" aria-label="Carregando" className="space-y-4">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (variant === "cards") {
    return (
      <div role="status" aria-label="Carregando" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-[20px]" />)}
      </div>
    );
  }
  return (
    <div role="status" aria-label="Carregando" className="space-y-3">
      <Skeleton className="h-11 w-44 rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-[18px]" />)}
    </div>
  );
}
