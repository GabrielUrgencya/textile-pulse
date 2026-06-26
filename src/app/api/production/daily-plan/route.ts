import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";
import { todayInTz } from "@/lib/tz";

/**
 * Story 8.27 + 8.32 — Plano Diário de Produção, agora POR PLANO.
 *
 * GET ?date=YYYY-MM-DD&scope=all  → (settings:manage) todos os planos da data
 *                                    com name, is_general, members, items, meta. (EDITOR)
 * GET ?date=YYYY-MM-DD            → planos visíveis ao usuário pela regra de prioridade:
 *                                    se há plano(s) restrito(s) atrelado(s) a ele → só esses;
 *                                    senão → os gerais. (DASHBOARD)
 * POST/PUT { id?, date, name?, is_general, member_ids[], items[], target_override?, notes? }
 *                                    → (settings:manage) cria/edita um plano; replace de itens e membros.
 * DELETE ?id=...                  → (settings:manage) remove o plano (cascade).
 */

type IncomingItem = {
  reference?: string | null;
  color?: string | null;
  size_label?: string | null;
  quantity?: number | null;
  meta_value?: number | null;
};

function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function computeMeta(targetOverride: number | null, items: { meta_value: number | null }[]): number {
  if (targetOverride != null) return Number(targetOverride);
  return items.reduce((acc, it) => acc + (Number(it.meta_value) || 0), 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function hydratePlans(supabase: SB, plans: Array<Record<string, unknown>>) {
  const ids = plans.map((p) => p.id as string);
  if (ids.length === 0) return [];

  const [{ data: items }, { data: members }] = await Promise.all([
    supabase
      .from("daily_plan_items")
      .select("id, plan_id, reference, color, size_label, quantity, meta_value, sort_order")
      .in("plan_id", ids)
      .order("sort_order", { ascending: true }),
    supabase
      .from("daily_plan_members")
      .select("plan_id, profile_id, profiles(full_name)")
      .in("plan_id", ids),
  ]);

  const itemsByPlan = new Map<string, Array<Record<string, unknown>>>();
  for (const it of items || []) {
    const arr = itemsByPlan.get(it.plan_id) ?? [];
    arr.push(it);
    itemsByPlan.set(it.plan_id, arr);
  }
  const membersByPlan = new Map<string, Array<{ profile_id: string; full_name: string | null }>>();
  for (const m of members || []) {
    const arr = membersByPlan.get(m.plan_id) ?? [];
    arr.push({ profile_id: m.profile_id, full_name: m.profiles?.full_name ?? null });
    membersByPlan.set(m.plan_id, arr);
  }

  return plans.map((p) => {
    const planItems = itemsByPlan.get(p.id as string) ?? [];
    return {
      id: p.id,
      name: p.name ?? null,
      is_general: p.is_general,
      target_override: p.target_override ?? null,
      notes: p.notes ?? null,
      members: membersByPlan.get(p.id as string) ?? [],
      items: planItems,
      meta: computeMeta((p.target_override as number) ?? null, planItems as { meta_value: number | null }[]),
    };
  });
}

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || todayInTz();
  const scope = searchParams.get("scope");
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date inválida (use YYYY-MM-DD)" }, { status: 400 });
  }

  const { data: plans, error } = await supabase
    .from("daily_plans")
    .select("id, name, is_general, target_override, notes, created_at")
    .eq("plan_date", date)
    .order("created_at", { ascending: true });

  if (error) return dbError("GET /api/production/daily-plan", error);

  // EDITOR: todos os planos (admin)
  if (scope === "all") {
    if (!can(user, "settings:manage")) {
      return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
    }
    return NextResponse.json({ plans: await hydratePlans(supabase, plans || []), date });
  }

  // DASHBOARD: regra de prioridade (específico > geral)
  const all = plans || [];
  const restricted = all.filter((p) => p.is_general === false);
  let visible = all.filter((p) => p.is_general === true);

  if (restricted.length > 0) {
    const { data: myMemberships } = await supabase
      .from("daily_plan_members")
      .select("plan_id")
      .eq("profile_id", user.id)
      .in("plan_id", restricted.map((p) => p.id));
    const myPlanIds = new Set((myMemberships || []).map((m: { plan_id: string }) => m.plan_id));
    const mine = restricted.filter((p) => myPlanIds.has(p.id));
    if (mine.length > 0) visible = mine; // específico tem prioridade
  }

  return NextResponse.json({ plans: await hydratePlans(supabase, visible), date });
}

async function upsertPlan(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }
  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) return NextResponse.json({ error: "User has no tenant_id" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const date = body?.date;
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date é obrigatória (YYYY-MM-DD)" }, { status: 400 });
  }

  const isGeneral = body?.is_general !== false; // default geral
  const memberIds: string[] = isGeneral
    ? []
    : Array.from(new Set((Array.isArray(body?.member_ids) ? body.member_ids : []).filter(Boolean)));
  if (!isGeneral && memberIds.length === 0) {
    return NextResponse.json(
      { error: "Plano restrito precisa de ao menos um membro (ou marque como Geral)" },
      { status: 400 }
    );
  }

  const targetOverride =
    body?.target_override === null || body?.target_override === undefined || body?.target_override === ""
      ? null
      : Number(body.target_override);

  // Coeficientes p/ cálculo de meta dos itens
  const { data: refs } = await supabase.from("reference_targets").select("reference, meta_coefficient");
  const coefByRef = new Map<string, number>(
    (refs || []).map((r: { reference: string; meta_coefficient: number }) => [
      r.reference.toLowerCase(),
      Number(r.meta_coefficient) || 1,
    ]),
  );

  const rawItems: IncomingItem[] = Array.isArray(body?.items) ? body.items : [];
  const items = rawItems.map((it, idx) => {
    const reference = it.reference?.toString().trim() || null;
    const quantity =
      it.quantity === null || it.quantity === undefined || (it.quantity as unknown) === ""
        ? null
        : Math.trunc(Number(it.quantity));
    let metaValue: number | null =
      it.meta_value === null || it.meta_value === undefined || (it.meta_value as unknown) === ""
        ? null
        : Number(it.meta_value);
    if (metaValue == null && reference && quantity != null) {
      metaValue = Math.round(quantity * (coefByRef.get(reference.toLowerCase()) ?? 1) * 100) / 100;
    }
    return {
      reference,
      color: it.color?.toString().trim() || null,
      size_label: it.size_label?.toString().trim() || null,
      quantity: quantity != null && quantity >= 0 ? quantity : null,
      meta_value: metaValue,
      sort_order: idx,
    };
  });

  // 1) Upsert do plano (por id)
  let planId = body?.id as string | undefined;
  const planFields = {
    name: body?.name?.toString().trim() || null,
    is_general: isGeneral,
    target_override: targetOverride,
    notes: body?.notes?.toString().trim() || null,
  };

  if (planId) {
    const { error } = await supabase.from("daily_plans").update(planFields).eq("id", planId);
    if (error) return dbError("PUT daily-plan update", error);
  } else {
    const { data: created, error } = await supabase
      .from("daily_plans")
      .insert({ tenant_id: tenantId, plan_date: date, created_by: user.id, ...planFields })
      .select("id")
      .single();
    if (error) return dbError("PUT daily-plan insert", error);
    planId = created.id;
  }

  // 2) Replace de itens
  const delItems = await supabase.from("daily_plan_items").delete().eq("plan_id", planId);
  if (delItems.error) return dbError("daily-plan items delete", delItems.error);
  if (items.length > 0) {
    const ins = await supabase
      .from("daily_plan_items")
      .insert(items.map((it) => ({ ...it, plan_id: planId })));
    if (ins.error) return dbError("daily-plan items insert", ins.error);
  }

  // 3) Replace de membros
  const delMembers = await supabase.from("daily_plan_members").delete().eq("plan_id", planId);
  if (delMembers.error) return dbError("daily-plan members delete", delMembers.error);
  if (!isGeneral && memberIds.length > 0) {
    const ins = await supabase
      .from("daily_plan_members")
      .insert(memberIds.map((pid) => ({ plan_id: planId, profile_id: pid })));
    if (ins.error) return dbError("daily-plan members insert", ins.error);
  }

  return NextResponse.json({ plan_id: planId, meta: computeMeta(targetOverride, items) }, { status: 200 });
}

export const POST = upsertPlan;
export const PUT = upsertPlan;

export async function DELETE(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const { error } = await supabase.from("daily_plans").delete().eq("id", id);
  if (error) return dbError("DELETE /api/production/daily-plan", error);
  return NextResponse.json({ success: true });
}
