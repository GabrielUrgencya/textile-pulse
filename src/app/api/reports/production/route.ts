import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { computeChartData } from "@/lib/kpi-queries";

/**
 * GET /api/reports/production?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month|year&format=csv|json
 *
 * Relatório de produção por período. Reaproveita computeChartData (produção =
 * STAGE_OUT, OP cancelada excluída) e agrega os dias na granularidade pedida.
 * Restrito a quem tem reports:export. Máx. 400 dias (cobre "anual").
 */

const MAX_PERIOD_DAYS = 400;
type Granularity = "day" | "week" | "month" | "year";

function bucketKey(dateStr: string, gran: Granularity): string {
  if (gran === "year") return dateStr.slice(0, 4);
  if (gran === "month") return dateStr.slice(0, 7);
  if (gran === "week") {
    const d = new Date(`${dateStr}T12:00:00.000Z`);
    const dow = d.getUTCDay();
    const diff = dow === 0 ? 6 : dow - 1; // volta até a segunda
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  }
  return dateStr; // day
}

function bucketLabel(key: string, gran: Granularity): string {
  if (gran === "week") return `Semana de ${key}`;
  if (gran === "month") return key;
  if (gran === "year") return key;
  return key;
}

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "reports:export")) {
    return NextResponse.json({ error: "Forbidden: reports:export required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format") || "json";
  const granularity = (searchParams.get("granularity") || "day") as Granularity;

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from e to (YYYY-MM-DD) são obrigatórios" }, { status: 400 });
  }
  if (!["day", "week", "month", "year"].includes(granularity)) {
    return NextResponse.json({ error: "granularity inválida" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "Data inicial maior que a final" }, { status: 400 });
  }
  const diffDays = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1;
  if (diffDays > MAX_PERIOD_DAYS) {
    return NextResponse.json({ error: `Período máximo: ${MAX_PERIOD_DAYS} dias` }, { status: 400 });
  }

  // Produção + defeitos por DIA (RPC já respeita tenant via RLS + STAGE_OUT + exclui cancelada)
  const daily = await computeChartData(supabase, { from, to }, "day").catch(() => []);

  // Agrega os dias na granularidade pedida
  const buckets = new Map<string, { producao: number; defeitos: number }>();
  for (const d of daily) {
    const dateStr = d.period.slice(0, 10);
    const key = bucketKey(dateStr, granularity);
    const acc = buckets.get(key) || { producao: 0, defeitos: 0 };
    acc.producao += Number(d.scans) || 0;
    acc.defeitos += Number(d.defects) || 0;
    buckets.set(key, acc);
  }

  const rows = Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => ({ periodo: bucketLabel(key, granularity), producao: v.producao, defeitos: v.defeitos }));

  const totalProducao = rows.reduce((s, r) => s + r.producao, 0);
  const totalDefeitos = rows.reduce((s, r) => s + r.defeitos, 0);

  if (format === "csv") {
    const header = ["periodo", "producao", "defeitos"].join(";");
    const body = rows.map((r) => [r.periodo, r.producao, r.defeitos].join(";"));
    const totalLine = ["TOTAL", totalProducao, totalDefeitos].join(";");
    const csv = "﻿" + [header, ...body, totalLine].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lision-relatorio-${from}_${to}-${granularity}.csv"`,
      },
    });
  }

  return NextResponse.json({
    data: rows,
    totals: { producao: totalProducao, defeitos: totalDefeitos },
    period: { from, to, granularity },
  });
}
