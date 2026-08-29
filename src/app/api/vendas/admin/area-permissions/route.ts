import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { loadSalesAreaPermissions, setSalesAreaPermissions } from "@/lib/sales-admin";
import { z } from "zod";

const overridesSchema = z.record(z.string(), z.record(z.string(), z.boolean()));
const bodySchema = z.object({
  roleOverrides: overridesSchema.default({}),
  userOverrides: overridesSchema.default({}),
}).strict();

/** GET — matriz de permissões de área (cargo × área + overrides por usuário). */
export async function GET() {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  return salesAdminResultResponse(await loadSalesAreaPermissions(session.supabase));
}

/** PUT — grava overrides por cargo e por usuário (full-replace, anti-lockout). */
export async function PUT(request: Request) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, bodySchema);
  if (payload.error) return payload.error;
  return salesAdminResultResponse(
    await setSalesAreaPermissions(session.supabase, payload.data.roleOverrides, payload.data.userOverrides),
  );
}
