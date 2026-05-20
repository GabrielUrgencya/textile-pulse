import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { generateZPL } from "@/lib/zpl-generator";
import type { LotLabelData } from "@/lib/zpl-generator";

const MAX_LABELS = 50;

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // Permission check: only roles with labels:print can generate labels
  const role = user.app_metadata?.role as AppRole | undefined;
  if (!role || !hasPermission(role, "labels:print")) {
    return NextResponse.json(
      { error: "Forbidden: insufficient permissions for label printing" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body?.lot_ids || !Array.isArray(body.lot_ids) || body.lot_ids.length === 0) {
    return NextResponse.json(
      { error: "lot_ids array is required and must not be empty" },
      { status: 400 }
    );
  }

  // AC4: Max 50 labels per request
  if (body.lot_ids.length > MAX_LABELS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_LABELS} labels per request` },
      { status: 400 }
    );
  }

  // AC5: Fetch lots — RLS ensures they belong to user's tenant
  const { data: lots, error: lotsError } = await supabase
    .from("lots")
    .select("id, barcode, lot_number, po_id, production_orders(op_number, product_name, reference)")
    .in("id", body.lot_ids);

  if (lotsError) {
    return NextResponse.json(
      { error: "Failed to fetch lots" },
      { status: 500 }
    );
  }

  if (!lots || lots.length === 0) {
    return NextResponse.json(
      { error: "No lots found (check lot_ids and tenant access)" },
      { status: 404 }
    );
  }

  // Validate all requested lots were found (some might be from another tenant)
  if (lots.length !== body.lot_ids.length) {
    const foundIds = new Set(lots.map((l) => l.id));
    const missing = body.lot_ids.filter((id: string) => !foundIds.has(id));
    return NextResponse.json(
      { error: "Some lots not found or not accessible", missing_lot_ids: missing },
      { status: 403 }
    );
  }

  // Build label data
  const labelData: LotLabelData[] = lots.map((lot) => {
    const po = lot.production_orders as unknown as {
      op_number: string;
      product_name: string;
      reference: string | null;
    };
    return {
      barcode: lot.barcode,
      op_number: po?.op_number || "N/A",
      lot_number: lot.lot_number,
      product_name: po?.product_name || "N/A",
      reference: po?.reference || null,
    };
  });

  // AC3: Check format parameter
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  if (format === "pdf") {
    // Dynamic import to avoid loading PDF deps when not needed
    const { generatePDF } = await import("@/lib/pdf-label-generator");
    const pdfArrayBuffer = await generatePDF(labelData);

    return new Response(pdfArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="labels-${Date.now()}.pdf"`,
      },
    });
  }

  // Default: ZPL
  const zpl = generateZPL(labelData);

  return new Response(zpl, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="labels-${Date.now()}.zpl"`,
      "X-Label-Count": String(labelData.length),
    },
  });
}
