import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

const ALLOWED_ROLES = ["ADMIN", "GERENTE"];
const MAX_PERIOD_DAYS = 90;
const MAX_ROWS = 5000;

/**
 * GET /api/export/stock-entries — Export finalized lots for ERP
 * Story 8.11 — AC1-AC3, AC7
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const format = searchParams.get("format") || "json";

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 }
    );
  }

  // Validate period <= 90 days (AC2)
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays > MAX_PERIOD_DAYS) {
    return NextResponse.json(
      { error: `Período máximo: ${MAX_PERIOD_DAYS} dias` },
      { status: 400 }
    );
  }

  // Query lots with their production orders
  const { data: lots, error } = await supabase
    .from("lots")
    .select(`
      id,
      lot_number,
      quantity,
      quantity_ok,
      quantity_defect,
      status,
      created_at,
      production_orders!inner(
        op_number,
        reference,
        tenant_id
      )
    `)
    .eq("production_orders.tenant_id", tenantId)
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (lots || []).map((lot: any) => {
    const po = lot.production_orders;
    const quantityDiscard = Math.max(
      0,
      (lot.quantity || 0) - (lot.quantity_ok || 0) - (lot.quantity_defect || 0)
    );

    return {
      data_entrada: new Date(lot.created_at).toISOString().slice(0, 10),
      op_number: po?.op_number || "",
      referencia: po?.reference || "",
      lote: lot.lot_number || lot.id,
      quantidade_ok: lot.quantity_ok || 0,
      quantidade_defeito: lot.quantity_defect || 0,
      quantidade_descarte: quantityDiscard,
    };
  });

  if (format === "csv") {
    const columns = [
      { key: "data_entrada", header: "data_entrada" },
      { key: "op_number", header: "op_number" },
      { key: "referencia", header: "referencia" },
      { key: "lote", header: "lote" },
      { key: "quantidade_ok", header: "quantidade_ok" },
      { key: "quantidade_defeito", header: "quantidade_defeito" },
      { key: "quantidade_descarte", header: "quantidade_descarte" },
    ];

    const header = columns.map((c) => c.header).join(";");
    const csvRows = rows.map((row) =>
      columns.map((c) => row[c.key as keyof typeof row] ?? "").join(";")
    );
    const csv = "\uFEFF" + [header, ...csvRows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lision-export-${startDate}-${endDate}.csv"`,
      },
    });
  }

  // JSON format (also used for preview count)
  return NextResponse.json({ data: rows, total: rows.length });
}
