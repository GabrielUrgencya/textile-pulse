"use client";

import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ReportDownloadCard } from "@/components/reports/ReportDownloadCard";
import { usePermissions } from "@/hooks/use-permissions";

export default function ReportsPage() {
  const { can: hasPerm, isLoading } = usePermissions();

  if (!isLoading && !hasPerm("reports:export")) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <Lock className="size-10 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-[18px] font-semibold">Acesso restrito</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Peça ao administrador a permissão &quot;Exportar relatórios&quot;.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Dados" title="Relatórios" />
      <div className="mt-6">
        <ReportDownloadCard />
      </div>
    </div>
  );
}
