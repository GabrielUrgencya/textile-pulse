import { redirect } from "next/navigation";
import { SalesAccessState } from "@/components/sales/SalesAccessState";
import { resolveSalesPageAccess } from "@/lib/sales-page-access";
import { salesHomeForRole } from "@/lib/sales-access";

export default async function SalesIndexPage() {
  const state = await resolveSalesPageAccess();
  if (state.kind === "unauthenticated") redirect("/vendas/login?redirect=/vendas");
  if (state.kind === "enabled" && state.access.role) redirect(salesHomeForRole(state.access.role));
  if (state.kind === "unavailable") {
    return <SalesAccessState title="Vendas indisponível" description="Não foi possível consultar seu acesso agora. Tente novamente em alguns instantes." />;
  }
  return <SalesAccessState title="Acesso ainda não habilitado" description="Sua conta está autenticada, mas ainda não possui um vínculo ativo com o LISION Vendas. Solicite a habilitação a um administrador." />;
}
