"use client";

import { useServerData } from "@/hooks/use-server-data";

export interface Faction {
  id: string;
  name: string;
  type: string;
  contact_name: string | null;
  contact_phone: string | null;
  rating: number;
  is_active: boolean;
  price_per_piece: number | null;
  avg_delivery_days: number;
  created_at: string;
}

export interface FactionKPIs {
  totalActive: number;
  shipmentsInProgress: number;
  avgDefectRate: number;
  totalPendingValue: number;
}

export interface FactionShipment {
  id: string;
  faction_id: string;
  status: string;
  total_quantity: number;
  returned_quantity: number | null;
  sent_at: string;
  expected_return: string;
  received_at: string | null;
  notes: string | null;
  faction_confirmed_at: string | null;
}

export interface FactionDetail {
  faction: Faction & { address?: string | null };
  shipments: FactionShipment[];
  defects: Array<{
    id: string;
    defect_type: string;
    severity: string;
    status: string;
    created_at: string;
  }>;
  financial: {
    grossValue: number;
    deductions: number;
    netValue: number;
  };
  scores?: {
    deliveryScore: number;
    qualityScore: number;
    volumeTotal: number;
  };
}

export function useFactions(params?: { search?: string; active?: boolean }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.active === false) searchParams.set("active", "false");
  const qs = searchParams.toString();

  return useServerData<{ factions: Faction[]; kpis: FactionKPIs }>(
    `/api/factions${qs ? `?${qs}` : ""}`,
  );
}

export function useFactionDetail(id: string | null) {
  return useServerData<FactionDetail>(id ? `/api/factions/${id}` : null);
}

export function useFactionShipments(factionId: string, status?: string) {
  const qs = status ? `?status=${status}` : "";
  return useServerData<FactionShipment[]>(
    `/api/factions/${factionId}/shipments${qs}`,
  );
}
