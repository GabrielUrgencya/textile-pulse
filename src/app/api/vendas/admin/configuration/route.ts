import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { loadSalesAdminConfiguration, salesConfigInputSchema, setSalesConfig } from "@/lib/sales-admin-configuration";

export async function GET() { const session = await requireSalesAdminSession(); if (session.error) return session.error; return salesAdminResultResponse(await loadSalesAdminConfiguration(session.supabase)); }
export async function PUT(request: Request) { const session = await requireSalesAdminSession(); if (session.error) return session.error; const payload = await parseSalesAdminBody(request, salesConfigInputSchema); if (payload.error) return payload.error; return salesAdminResultResponse(await setSalesConfig(session.supabase, payload.data)); }
