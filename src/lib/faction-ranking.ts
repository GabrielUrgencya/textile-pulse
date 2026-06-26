/**
 * Story 8.33 — algoritmo de ranking de facções (extraído do kiosk dashboard).
 *
 * Score = pontualidade 40% + qualidade 35% + volume 25% (remessas dos últimos 30 dias).
 * Facções sem entregas concluídas: peso desloca para qualidade(60%)+volume(40%).
 * Função pura, reutilizável pela API /ranking (e pela TV enquanto existir).
 */

export interface FactionInput {
  id: string;
  name: string;
  photo_url?: string | null;
}

export interface ShipmentInput {
  faction_id: string;
  quantity_sent?: number | null;
  quantity_returned?: number | null;
  quantity_defective?: number | null;
  status?: string | null;
  actual_return_at?: string | null;
  expected_return_at?: string | null;
}

export interface FactionRankEntry {
  id: string;
  name: string;
  initials: string;
  photo_url: string | null;
  score: number;
  punctuality: number;
  quality: number;
  volume: number;
  deliveries_count: number;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Calcula o ranking de TODAS as facções, ordenado por score desc (sem cortar top N). */
export function computeFactionRanking(
  factions: FactionInput[],
  shipments: ShipmentInput[],
): FactionRankEntry[] {
  const map = new Map<
    string,
    { name: string; photo_url: string | null; onTime: number; total: number; sent: number; returned: number; defective: number }
  >();

  for (const f of factions) {
    map.set(f.id, { name: f.name, photo_url: f.photo_url ?? null, onTime: 0, total: 0, sent: 0, returned: 0, defective: 0 });
  }

  for (const s of shipments) {
    const data = map.get(s.faction_id);
    if (!data) continue;
    data.sent += Number(s.quantity_sent) || 0;
    data.returned += Number(s.quantity_returned) || 0;
    data.defective += Number(s.quantity_defective) || 0;
    if (s.status === "RETURNED" || s.status === "PARTIALLY_RETURNED") {
      data.total++;
      if (s.actual_return_at && s.expected_return_at) {
        if (new Date(s.actual_return_at) <= new Date(s.expected_return_at)) data.onTime++;
      }
    }
  }

  let maxReturned = 0;
  let maxSent = 0;
  for (const d of Array.from(map.values())) {
    if (d.returned > maxReturned) maxReturned = d.returned;
    if (d.sent > maxSent) maxSent = d.sent;
  }
  const volumeBase = maxReturned > 0 ? maxReturned : maxSent;

  const ranking: FactionRankEntry[] = [];
  for (const [id, d] of Array.from(map.entries())) {
    const punctuality = d.total > 0 ? (d.onTime / d.total) * 100 : 0;
    const quality = d.sent > 0 ? 100 - (d.defective / d.sent) * 100 : 100;
    const volume = volumeBase > 0 ? ((d.returned > 0 ? d.returned : d.sent) / volumeBase) * 100 : 0;
    const score =
      d.total > 0
        ? Math.round((punctuality * 0.4 + quality * 0.35 + volume * 0.25) * 10) / 10
        : Math.round((quality * 0.6 + volume * 0.4) * 10) / 10;
    ranking.push({
      id,
      name: d.name,
      initials: initialsOf(d.name),
      photo_url: d.photo_url,
      score,
      punctuality: Math.round(punctuality * 10) / 10,
      quality: Math.round(quality * 10) / 10,
      volume: Math.round(volume * 10) / 10,
      deliveries_count: d.total,
    });
  }

  ranking.sort((a, b) => b.score - a.score);
  return ranking;
}
