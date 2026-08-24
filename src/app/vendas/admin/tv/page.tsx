import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
import { SalesTvAdmin } from "@/components/sales/admin/SalesTvAdmin";

export default function Page() {
  return (
    <SalesAdminRoute redirectPath="/vendas/admin/tv">
      <SalesTvAdmin />
    </SalesAdminRoute>
  );
}
