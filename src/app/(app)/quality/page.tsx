"use client";

import { QualityPage } from "@/components/quality/QualityPage";
import { useUserProfile } from "@/hooks/use-user-profile";
import { hasPermission, type AppRole } from "@/lib/permissions";

export default function Page() {
  const { profile } = useUserProfile();
  const role = (profile?.role || "OPERADOR") as AppRole;
  const canViewFactions = hasPermission(role, "factions:view");

  return <QualityPage canViewFactions={canViewFactions} />;
}
