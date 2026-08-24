import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { salesHolidayInputSchema, setSalesHoliday } from "@/lib/sales-admin-configuration";

export async function PUT(request: Request) { const session = await requireSalesAdminSession(); if (session.error) return session.error; const payload = await parseSalesAdminBody(request, salesHolidayInputSchema); if (payload.error) return payload.error; return salesAdminResultResponse(await setSalesHoliday(session.supabase, payload.data)); }
