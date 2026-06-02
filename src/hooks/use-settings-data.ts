"use client";

import { useServerData } from "@/hooks/use-server-data";

export interface TenantTargets {
  dailyPiecesTarget: number;
  productivityTarget: number;
  defectTolerance: number;
  shiftStart: string;
  shiftEnd: string;
}

export function useTargets() {
  return useServerData<TenantTargets>("/api/settings/targets");
}

export interface StageData {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  is_active: boolean;
}

export function useStages() {
  return useServerData<StageData[]>("/api/settings/stages");
}
