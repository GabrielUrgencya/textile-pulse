import { SalesAdminPlanning } from "@/components/sales/admin/SalesAdminPlanning";
import { SalesAdminAssignments } from "@/components/sales/admin/SalesAdminAssignments";
import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/metas"><div className="space-y-10"><SalesAdminPlanning kind="goals" /><SalesAdminAssignments /></div></SalesAdminRoute>; }
