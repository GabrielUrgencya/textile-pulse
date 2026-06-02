"use client";

import { useServerData } from "@/hooks/use-server-data";
import type { DateRange } from "@/components/ui/date-range-filter";

function buildQS(range?: DateRange | null) {
  if (!range) return "";
  const params = new URLSearchParams();
  params.set("from", range.from.toISOString());
  params.set("to", range.to.toISOString());
  return `?${params.toString()}`;
}

export interface QualityOverview {
  total: number;
  critical: number;
  resolved: number;
  resolutionRate: number;
  trends: {
    total: number;
    critical: number;
    resolutionRate: number;
  };
}

export interface DefectByType {
  defect_type: string;
  count: number;
  percentage: number;
  top_stages: { name: string; count: number }[];
}

export interface StageHeatmapData {
  stages: { stage: string; types: Record<string, number> }[];
  defect_types: string[];
}

export interface TrendPoint {
  period: string;
  count: number;
}

export interface FactionQualityItem {
  faction_id: string;
  name: string;
  total_defects: number;
  contestation_rate: number;
  rating: string;
}

export function useQualityOverview(range?: DateRange | null) {
  return useServerData<QualityOverview>(`/api/quality/overview${buildQS(range)}`);
}

export function useDefectsByType(range?: DateRange | null) {
  return useServerData<DefectByType[]>(`/api/quality/by-type${buildQS(range)}`);
}

export function useStageHeatmap(range?: DateRange | null) {
  return useServerData<StageHeatmapData>(`/api/quality/by-stage${buildQS(range)}`);
}

export function useDefectTrend(range?: DateRange | null, interval: string = "day") {
  const qs = buildQS(range);
  const sep = qs ? "&" : "?";
  return useServerData<TrendPoint[]>(`/api/quality/trend${qs}${sep}interval=${interval}`);
}

export function useFactionQuality(range?: DateRange | null) {
  return useServerData<FactionQualityItem[]>(`/api/quality/by-faction${buildQS(range)}`);
}
