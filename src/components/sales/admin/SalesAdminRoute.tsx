import { redirect } from "next/navigation";
import { SalesAccessState } from "@/components/sales/SalesAccessState";
import { SalesAdminSubnavigation } from "@/components/sales/admin/SalesAdminSubnavigation";
import { SalesShell } from "@/components/sales/SalesShell";
import { salesHomeForRole } from "@/lib/sales-access";
import { resolveSalesPageAccess } from "@/lib/sales-page-access";
import { areaForPath } from "@/lib/sales-areas";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function SalesAdminRoute({ redirectPath, children }: { redirectPath: string; children: React.ReactNode }) {
  const state = await resolveSalesPageAccess();
  if (state.kind === "unauthenticated") redirect(`/vendas/login?redirect=${redirectPath}`);
  if (state.kind === "enabled" && state.access.role === "ADMIN") {
    // 11.6a: gating por área — mesmo sendo ADMIN, a área precisa estar liberada.
    const area = areaForPath(redirectPath);
    if (area) {
      const supabase = createSupabaseServerClient();
      const { data } = await supabase.rpc("sales_my_areas_v1");
      const allowed = Array.isArray(data) ? (data as string[]) : [];
      if (!allowed.includes(area)) {
        return <SalesAccessState kind="forbidden" title="Área não autorizada" description="Seu acesso a esta área do Vendas foi restringido pelo administrador." action={{ href: "/vendas/admin", label: "Voltar ao início" }} />;
      }
    }
    return <SalesShell role="ADMIN"><SalesAdminSubnavigation />{children}</SalesShell>;
  }
  if (state.kind === "unavailable") return <SalesAccessState kind="unavailable" title="Vendas indisponível" description="Não foi possível validar o módulo agora." />;
  if (state.kind === "enabled" && state.access.role) return <SalesAccessState kind="forbidden" title="Área não autorizada" description="Esta rota exige um vínculo ativo de administrador do Vendas." action={{ href: salesHomeForRole(state.access.role), label: "Ir para minha área" }} />;
  return <SalesAccessState title="Acesso ainda não habilitado" description="Sua conta ainda não possui um vínculo ativo com o LISION Vendas." />;
}
