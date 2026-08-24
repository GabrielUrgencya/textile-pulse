import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { salesPeriodInputSchema, setSalesPeriod } from "@/lib/sales-admin-configuration";

export async function PUT(request: Request) { const session = await requireSalesAdminSession(); if (session.error) return session.error; const payload = await parseSalesAdminBody(request, salesPeriodInputSchema); if (payload.error) return payload.error; return salesAdminResultResponse(await setSalesPeriod(session.supabase, payload.data)); }
