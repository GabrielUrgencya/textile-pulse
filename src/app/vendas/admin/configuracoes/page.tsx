import { SalesAdminConfiguration } from "@/components/sales/admin/SalesAdminConfiguration";
import { SalesAreaPermissionsEditor } from "@/components/sales/admin/SalesAreaPermissionsEditor";
import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
export default function Page() {
  return (
    <SalesAdminRoute redirectPath="/vendas/admin/configuracoes">
      <div className="space-y-8">
        <SalesAdminConfiguration />
        <SalesAreaPermissionsEditor />
      </div>
    </SalesAdminRoute>
  );
}
