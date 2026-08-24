import { redirect } from "next/navigation";
import { SalesAccessState } from "@/components/sales/SalesAccessState";
import { SalesAdminPaymentMethodsManager } from "@/components/sales/admin/SalesAdminPaymentMethods";
import { SalesAdminSubnavigation } from "@/components/sales/admin/SalesAdminSubnavigation";
import { SalesShell } from "@/components/sales/SalesShell";
import { salesHomeForRole } from "@/lib/sales-access";
import { resolveSalesPageAccess } from "@/lib/sales-page-access";

export default async function SalesAdminPaymentMethodsPage() {
  const state = await resolveSalesPageAccess();
  if (state.kind === "unauthenticated") redirect("/vendas/login?redirect=/vendas/admin/metodos-pagamento");
  if (state.kind === "enabled" && state.access.role === "ADMIN") {
    return <SalesShell role="ADMIN"><SalesAdminSubnavigation /><SalesAdminPaymentMethodsManager /></SalesShell>;
  }
  if (state.kind === "unavailable") return <SalesAccessState kind="unavailable" title="Vendas indisponível" description="Não foi possível validar o módulo agora." />;
  if (state.kind === "enabled" && state.access.role) return <SalesAccessState kind="forbidden" title="Área não autorizada" description="Esta rota exige um vínculo ativo de administrador do Vendas." action={{ href: salesHomeForRole(state.access.role), label: "Ir para minha área" }} />;
  return <SalesAccessState title="Acesso ainda não habilitado" description="Sua conta ainda não possui um vínculo ativo com o LISION Vendas." />;
}
