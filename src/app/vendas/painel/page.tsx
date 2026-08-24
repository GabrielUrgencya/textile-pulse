import { redirect } from "next/navigation";
import { resolveSalesPageAccess } from "@/lib/sales-page-access";
import { salesHomeForRole } from "@/lib/sales-access";
import { SalesAccessState } from "@/components/sales/SalesAccessState";
import { SalesLiveTv } from "@/components/sales/tv/SalesLiveTv";

/**
 * Painel ao vivo do LISION Vendas — TV autenticada (sessão do admin, SEM token).
 * "Clicar e ir": renderiza fullscreen sem a sidebar. Dashboard rico em tempo real.
 */
export const dynamic = "force-dynamic";

export default async function SalesLivePanelPage() {
  const state = await resolveSalesPageAccess();
  if (state.kind === "unauthenticated") redirect("/vendas/login?redirect=/vendas/painel");
  if (state.kind === "enabled" && state.access.role === "ADMIN") return <SalesLiveTv />;
  if (state.kind === "enabled" && state.access.role)
    return (
      <SalesAccessState
        kind="forbidden"
        title="Área não autorizada"
        description="O painel ao vivo é exclusivo de administradores do Vendas."
        action={{ href: salesHomeForRole(state.access.role), label: "Ir para minha área" }}
      />
    );
  if (state.kind === "unavailable")
    return <SalesAccessState kind="unavailable" title="Vendas indisponível" description="Não foi possível validar o módulo agora." />;
  return <SalesAccessState title="Acesso ainda não habilitado" description="Sua conta ainda não possui um vínculo ativo com o LISION Vendas." />;
}
