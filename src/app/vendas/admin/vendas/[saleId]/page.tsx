import { SalesAdminRoute } from "@/components/sales/admin/SalesAdminRoute";
import { SalesAdminSaleDetail } from "@/components/sales/admin/SalesAdminSaleDetail";
export default function Page({ params }: { params: { saleId: string } }) { return <SalesAdminRoute redirectPath={`/vendas/admin/vendas/${params.saleId}`}><SalesAdminSaleDetail saleId={params.saleId} /></SalesAdminRoute>; }
