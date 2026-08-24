import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
import { SalesImportCsv } from "@/components/sales/admin/SalesImportCsv";
export default function Page() { return <SalesAdminRoute redirectPath="/vendas/admin/vendas/importar"><SalesImportCsv /></SalesAdminRoute>; }
