import { SalesPeriodClosure } from "@/components/sales/admin/SalesPeriodClosure";
import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";

export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/fechamento"><SalesPeriodClosure /></SalesAdminRoute>; }
