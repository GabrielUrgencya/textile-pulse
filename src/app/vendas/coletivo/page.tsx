import { redirect } from "next/navigation";
import { SalesAccessState } from "@/components/sales/SalesAccessState";
import { SalesShell } from "@/components/sales/SalesShell";
import { SalesCollectiveWorkspace } from "@/components/sales/collective/SalesCollectiveWorkspace";
import { resolveSalesPageAccess } from "@/lib/sales-page-access";

export default async function SalesCollectivePage() {
  const state = await resolveSalesPageAccess();
  if (state.kind === "unauthenticated")
    redirect("/vendas/login?redirect=/vendas/coletivo");
  if (state.kind === "enabled" && state.access.role) {
    return (
      <SalesShell role={state.access.role}>
        <SalesCollectiveWorkspace />
      </SalesShell>
    );
  }
  if (state.kind === "unavailable")
    return (
      <SalesAccessState
        kind="unavailable"
        title="Vendas indisponível"
        description="Não foi possível validar o módulo agora."
      />
    );
  return (
    <SalesAccessState
      title="Acesso ainda não habilitado"
      description="É necessário possuir um vínculo ativo com o LISION Vendas."
    />
  );
}
