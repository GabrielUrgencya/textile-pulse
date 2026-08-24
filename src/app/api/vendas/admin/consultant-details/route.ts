import { NextResponse } from "next/server";
import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { loadSalesConsultantDetails, salesConsultantDetailsInputSchema, setSalesConsultantDetails } from "@/lib/sales-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
  if (!UUID.test(profileId)) return NextResponse.json({ error: { code: "VALIDATION", message: "Consultora inválida." } }, { status: 400 });
  return salesAdminResultResponse(await loadSalesConsultantDetails(session.supabase, profileId));
}

export async function PUT(request: Request) {
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesConsultantDetailsInputSchema); if (payload.error) return payload.error;
  return salesAdminResultResponse(await setSalesConsultantDetails(session.supabase, payload.data));
}
