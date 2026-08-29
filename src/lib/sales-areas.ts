// LISION Vendas — mapa canônico de áreas admin (Story 11.6a).
// Compartilhado entre a sidebar (nav), o guard de rota e o editor de permissões.
// Sem imports server-side — seguro em client components.

export const SALES_ADMIN_AREAS = [
  { area: "dashboard", url: "/vendas/admin", title: "Dashboard" },
  { area: "sales", url: "/vendas/admin/vendas", title: "Vendas" },
  { area: "team", url: "/vendas/admin/equipe", title: "Equipe" },
  { area: "payment-methods", url: "/vendas/admin/metodos-pagamento", title: "Métodos de pagamento" },
  { area: "goals", url: "/vendas/admin/metas", title: "Metas e comissões" },
  { area: "periods", url: "/vendas/admin/periodos", title: "Períodos" },
  { area: "calendar", url: "/vendas/admin/calendario", title: "Calendário" },
  { area: "closing", url: "/vendas/admin/fechamento", title: "Fechamento" },
  { area: "tv-access", url: "/vendas/admin/tv", title: "Acesso da TV" },
  { area: "config", url: "/vendas/admin/configuracoes", title: "Configurações" },
] as const;

export type SalesArea = (typeof SALES_ADMIN_AREAS)[number]["area"];

export const SALES_AREA_TITLES: Record<string, string> = Object.fromEntries(
  SALES_ADMIN_AREAS.map((a) => [a.area, a.title]),
);

/** Deriva a área a partir de um caminho (match mais longo primeiro). */
export function areaForPath(path: string): SalesArea | null {
  const sorted = [...SALES_ADMIN_AREAS].sort((a, b) => b.url.length - a.url.length);
  for (const a of sorted) {
    if (path === a.url || path.startsWith(`${a.url}/`)) return a.area;
  }
  return null;
}
