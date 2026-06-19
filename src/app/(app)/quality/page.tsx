"use client";

import { QualityPage } from "@/components/quality/QualityPage";
import { usePermissions } from "@/hooks/use-permissions";

export default function Page() {
  const { can } = usePermissions();
  const canViewFactions = can("factions:view");

  return <QualityPage canViewFactions={canViewFactions} />;
}
