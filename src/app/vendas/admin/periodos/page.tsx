import { SalesAdminPlanning } from "@/components/sales/admin/SalesAdminPlanning";
import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/periodos"><SalesAdminPlanning kind="periods" /></SalesAdminRoute>; }
