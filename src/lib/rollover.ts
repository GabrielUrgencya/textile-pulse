/**
 * Utilitário de dia local (fuso São Paulo).
 *
 * O rollover dinâmico de 30 dias (Story 9.3) foi REMOVIDO (Frente 2.5): meta de
 * operador e de setor usam agora o mesmo motor persistido (goal_deficits), que
 * "começa zerado". Resta apenas o helper localDay, usado por consumidores que
 * agrupam bipagens por dia local.
 */

/** YYYY-MM-DD local (fuso São Paulo, -03:00) de um timestamp ISO. */
export function localDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
