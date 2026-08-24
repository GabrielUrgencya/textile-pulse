import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
import { SalesAdminSaleDetail } from "@/components/sales/admin/SalesAdminSaleDetail";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/vendas/nova"><SalesAdminSaleDetail /></SalesAdminRoute>; }
