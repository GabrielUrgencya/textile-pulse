import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limiter";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Multi-tenant: tenantId/tenantSlug são apenas DICAS de tenant (caminho rápido).
  // O PIN sozinho basta — a resolução real acontece abaixo. Isso elimina a
  // dependência frágil de NEXT_PUBLIC_DEFAULT_TENANT_ID (env de build): se o
  // default não bate com o tenant do operador, o login ANTES dava "invalid"
  // mesmo com o PIN certo. Agora, sem match no tenant informado, cai no fallback
  // que resolve o PIN entre os tenants ativos (só em match ÚNICO).
  if (!body?.pin) {
    return NextResponse.json(
      { error: "pin is required" },
      { status: 400 }
    );
  }

  const { pin, tenantSlug } = body as { pin: string; tenantId?: string; tenantSlug?: string };
  // "" (env vazio) é tratado como ausente.
  let tenantId = (body.tenantId as string | undefined) || undefined;

  // Rate limit ANTES de resolver o slug (chave = identificador bruto):
  // evita probing ilimitado de slugs e mantém 1 chave por (ip, tenant).
  const ip = getClientIp(request);
  const key = rateLimitKey(ip, tenantId ?? tenantSlug ?? "unknown");

  const limit = checkRateLimit(key);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      }
    );
  }

  const headers = { "X-RateLimit-Remaining": String(limit.remaining) };

  // Slug é só uma DICA — se não resolver, seguimos para o fallback (não 401).
  if (!tenantId && tenantSlug) {
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (tenant) tenantId = tenant.id as string;
  }

  interface PinProfile { id: string; pin_code: string | null; full_name: string; role: string; email: string | null; tenant_id: string; }

  // Busca perfis candidatos (ativos, com PIN). scopeTenant=null → todos os tenants.
  async function findMatches(scopeTenant: string | null): Promise<PinProfile[]> {
    let q = supabaseAdmin
      .from("profiles")
      .select("id, pin_code, full_name, role, email, tenant_id")
      .eq("is_active", true)
      .not("pin_code", "is", null);
    if (scopeTenant) q = q.eq("tenant_id", scopeTenant);
    const { data } = await q;
    const out: PinProfile[] = [];
    for (const p of (data ?? []) as PinProfile[]) {
      if (p.pin_code && (await bcrypt.compare(pin, p.pin_code))) out.push(p);
    }
    return out;
  }

  let matched: PinProfile | null = null;

  // 1) Caminho rápido: dentro do tenant informado (se houver). Mantém o
  //    comportamento atual (primeiro match no tenant).
  if (tenantId) {
    const scoped = await findMatches(tenantId);
    if (scoped.length > 0) matched = scoped[0];
  }

  // 2) Fallback robusto: sem match no tenant informado (ou sem tenant), resolve o
  //    PIN entre TODOS os tenants ativos. Entra só em match ÚNICO — se o mesmo PIN
  //    existir em mais de um tenant (colisão), REJEITA (preserva o isolamento;
  //    nunca loga num tenant arbitrário). A sessão é escopada ao tenant do perfil
  //    encontrado (RLS inalterada).
  if (!matched) {
    const all = await findMatches(null);
    if (all.length === 1) matched = all[0];
  }

  // Tenant efetivo = o do perfil que casou (não a dica recebida).
  if (matched) tenantId = matched.tenant_id;

  if (!matched || !tenantId) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401, headers }
    );
  }

  // Get the auth user to find their email
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(matched.id);

  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500, headers }
    );
  }

  // Ensure tenant_id + role in app_metadata for RLS
  await supabaseAdmin.auth.admin.updateUserById(matched.id, {
    app_metadata: {
      ...userData.user.app_metadata,
      tenant_id: tenantId,
      role: matched.role,
    },
  });

  // Generate magic link and exchange for session
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email!,
    });

  if (linkError || !linkData.properties?.hashed_token) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500, headers }
    );
  }

  // Use the SSR server client to verify OTP — this automatically sets session cookies
  const supabaseServer = createSupabaseServerClient();
  const { data: session, error: verifyError } =
    await supabaseServer.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });

  if (verifyError || !session.session) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500, headers }
    );
  }

  return NextResponse.json(
    {
      user: {
        id: session.user!.id,
        full_name: matched.full_name,
        role: matched.role,
        tenant_id: tenantId,
      },
      session: {
        access_token: session.session.access_token,
        expires_at: session.session.expires_at,
      },
    },
    { headers }
  );
}
