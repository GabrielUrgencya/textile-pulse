import { redirect } from "next/navigation";
import { SalesAccessState } from "@/components/sales/SalesAccessState";
import { SalesShell } from "@/components/sales/SalesShell";
import { SalesConsultantWorkspace } from "@/components/sales/consultant/SalesConsultantWorkspace";
import { resolveSalesPageAccess } from "@/lib/sales-page-access";
import { salesHomeForRole } from "@/lib/sales-access";

export default async function SalesConsultantPage() {
  const state = await resolveSalesPageAccess();
  if (state.kind === "unauthenticated") redirect("/vendas/login?redirect=/vendas/app");
  if (state.kind === "enabled" && state.access.role === "CONSULTANT") {
    return <SalesShell role="CONSULTANT"><SalesConsultantWorkspace /></SalesShell>;
  }
  if (state.kind === "unavailable") return <SalesAccessState kind="unavailable" title="Vendas indisponível" description="Não foi possível validar o módulo agora." />;
  if (state.kind === "enabled" && state.access.role) {
    return <SalesAccessState kind="forbidden" title="Área não autorizada" description="Esta rota exige um vínculo ativo de consultora." action={{ href: salesHomeForRole(state.access.role), label: "Ir para minha área" }} />;
  }
  return <SalesAccessState title="Acesso ainda não habilitado" description="Sua conta ainda não possui um vínculo ativo com o LISION Vendas." />;
}
