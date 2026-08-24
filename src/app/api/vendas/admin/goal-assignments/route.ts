import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { salesGoalAssignmentInputSchema, setSalesGoalAssignment } from "@/lib/sales-admin-configuration";

export async function PUT(request: Request) { const session = await requireSalesAdminSession(); if (session.error) return session.error; const payload = await parseSalesAdminBody(request, salesGoalAssignmentInputSchema); if (payload.error) return payload.error; return salesAdminResultResponse(await setSalesGoalAssignment(session.supabase, payload.data)); }
