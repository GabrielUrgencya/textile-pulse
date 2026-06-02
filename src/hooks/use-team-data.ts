"use client";

import { useServerData } from "@/hooks/use-server-data";

export interface TeamMember {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  sector: string | null;
  is_active: boolean;
  created_at: string;
}

export function useTeamMembers(params: {
  search?: string;
  role?: string;
  active?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set("search", params.search);
  if (params.role) searchParams.set("role", params.role);
  if (params.active === false) searchParams.set("active", "false");

  const qs = searchParams.toString();
  const url = `/api/team/members${qs ? `?${qs}` : ""}`;

  return useServerData<TeamMember[]>(url);
}
