import { SalesAdminDashboard } from "@/components/sales/admin/SalesAdminDashboard";
import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin"><SalesAdminDashboard /></SalesAdminRoute>; }
