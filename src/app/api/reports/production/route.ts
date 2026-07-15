import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { requireTenantId } from "@/lib/api-helpers";
import { computeProductionReport } from "@/lib/report-data";
import { buildReportXlsx } from "@/lib/report-xlsx";
import { buildReportPdf } from "@/lib/report-pdf";

/**
 * GET /api/reports/production?from=YYYY-MM-DD&to=YYYY-MM-DD&format=xlsx|pdf|json
 *
 * Relatório profissional de produção por período (Frente 1). Fonte = motor
 * unificado (report-data), mesma métrica de dashboard/TV/meta (STAGE_OUT
 * ponderado, OP cancelada excluída). Escopado por tenant. Restrito a reports:export.
 */

const MAX_PERIOD_DAYS = 400;

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "reports:export")) {
    return NextResponse.json({ error: "Forbidden: reports:export required" }, { status: 403 });
  }
  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format") || "json";

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from e to (YYYY-MM-DD) são obrigatórios" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "Data inicial maior que a final" }, { status: 400 });
  }
  const diffDays = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1;
  if (diffDays > MAX_PERIOD_DAYS) {
    return NextResponse.json({ error: `Período máximo: ${MAX_PERIOD_DAYS} dias` }, { status: 400 });
  }
  if (!["xlsx", "pdf", "json"].includes(format)) {
    return NextResponse.json({ error: "format inválido (xlsx|pdf|json)" }, { status: 400 });
  }

  const report = await computeProductionReport(supabase, t.tenantId, from, to);
  const baseName = `lision-relatorio-${from}_${to}`;

  if (format === "xlsx") {
    const buf = await buildReportXlsx(report);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buf = buildReportPdf(report);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
      },
    });
  }

  return NextResponse.json(report);
}
