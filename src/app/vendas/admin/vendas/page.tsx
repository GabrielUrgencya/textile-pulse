import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
import { SalesAdminSalesList } from "@/components/sales/admin/SalesAdminSalesList";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/vendas"><SalesAdminSalesList /></SalesAdminRoute>; }
