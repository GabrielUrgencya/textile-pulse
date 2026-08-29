import { SalesGoalsWorkspace } from "@/components/sales/admin/SalesGoalsWorkspace";
import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/metas"><SalesGoalsWorkspace /></SalesAdminRoute>; }
