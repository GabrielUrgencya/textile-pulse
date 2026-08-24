import { SalesAdminConfiguration } from "@/components/sales/admin/SalesAdminConfiguration";
import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/configuracoes"><SalesAdminConfiguration /></SalesAdminRoute>; }
