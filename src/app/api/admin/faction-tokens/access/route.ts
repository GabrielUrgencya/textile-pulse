import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { decryptFactionPin, encryptFactionPin } from "@/lib/faction-pin-crypto";

/**
 * POST /api/admin/faction-tokens/access — acesso da facção ao portal (solução
 * definitiva). Substitui o antigo "Gerar Token Portal" + PIN-mostrado-uma-vez.
 *
 * Body: { faction_id, action: "get" | "rotate" }
 *  - "get"    → recupera o acesso ATUAL (link + PIN) para reenviar. Idempotente:
 *               não troca token nem PIN se já existir um acesso válido. Cria um
 *               na primeira vez (facção recém-cadastrada) ou quando o token
 *               legado não tem PIN em claro (rotaciona uma vez para o novo modelo).
 *  - "rotate" → gera um PIN NOVO no MESMO token (link estável) e invalida o
 *               anterior. Revogação real: sem o PIN novo, ninguém entra.
 *
 * Invariante: 1 token ATIVO por facção. Ao ser usado, consolida — mantém o
 * canônico (mais recente) e desativa os demais ativos daquela facção.
 *
 * Segurança: login continua por bcrypt (pin_hash); pin_plain existe só para o
 * admin recuperar/reenviar. Gate factions:manage. Auditado.
 */
export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "User has no tenant_id" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const factionId: string | undefined = body?.faction_id;
  const action: "get" | "rotate" = body?.action === "rotate" ? "rotate" : "get";
  if (!factionId) {
    return NextResponse.json({ error: "faction_id é obrigatório" }, { status: 400 });
  }

  // Facção precisa ser do tenant do admin.
  const { data: faction } = await supabase
    .from("factions")
    .select("id, name")
    .eq("id", factionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!faction) {
    return NextResponse.json({ error: "Facção não encontrada neste tenant" }, { status: 404 });
  }

  // Tokens ativos desta facção (o mais recente é o canônico).
  const { data: active } = await supabaseAdmin
    .from("faction_tokens")
    .select("id, token, pin_ciphertext, pin_plain, created_at")
    .eq("tenant_id", tenantId)
    .eq("faction_id", factionId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  let canonical = (active && active[0]) || null;
  const { data: tenant } = await supabaseAdmin.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  const canMigrateLegacyPlaintext = tenant?.slug === "fabrica-teste-31ykr";

  // Consolidação: desativa os OUTROS ativos (mantém só o canônico).
  if (active && active.length > 1) {
    const extras = active.slice(1).map((t) => t.id);
    await supabaseAdmin.from("faction_tokens").update({ is_active: false }).in("id", extras);
  }

  const genPin = () => crypto.randomInt(100000, 999999).toString();
  let pin: string | null = null;

  if (!canonical) {
    // Facção sem token → cria (primeiro acesso). Sempre com PIN novo.
    pin = genPin();
    const pinHash = await bcrypt.hash(pin, 10);
    const { data: created, error } = await supabaseAdmin
      .from("faction_tokens")
      .insert({ tenant_id: tenantId, faction_id: factionId, name: faction.name, pin_hash: pinHash, pin_ciphertext: encryptFactionPin(pin), pin_plain: null })
      .select("id, token")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: "Falha ao criar o acesso" }, { status: 500 });
    }
    canonical = { ...created, pin_ciphertext: null, pin_plain: null, created_at: new Date().toISOString() };
  } else if (action === "rotate") {
    // Rotaciona o PIN no MESMO token (link estável). Também cobre token legado
    // sem pin_plain: como o PIN antigo é irrecuperável (só hash), o primeiro
    // "get" nesse caso define um PIN novo — e o admin reenvia.
    pin = genPin();
    const pinHash = await bcrypt.hash(pin, 10);
    const { error } = await supabaseAdmin
      .from("faction_tokens")
      .update({ pin_hash: pinHash, pin_ciphertext: encryptFactionPin(pin), pin_plain: null })
      .eq("id", canonical.id);
    if (error) {
      return NextResponse.json({ error: "Falha ao gerar novo PIN" }, { status: 500 });
    }
  } else if (canonical.pin_ciphertext) {
    try {
      pin = decryptFactionPin(canonical.pin_ciphertext as string);
    } catch {
      return NextResponse.json({ error: "Falha ao recuperar o PIN; gere um novo PIN" }, { status: 500 });
    }
  } else if (canonical.pin_plain && canMigrateLegacyPlaintext) {
    pin = canonical.pin_plain as string;
    const { data: migrated, error } = await supabaseAdmin
      .from("faction_tokens")
      .update({ pin_ciphertext: encryptFactionPin(pin), pin_plain: null })
      .eq("id", canonical.id)
      .select("id")
      .maybeSingle();
    if (error || !migrated) return NextResponse.json({ error: "Falha ao proteger o PIN legado" }, { status: 500 });
  } else if (canonical.pin_plain) {
    // Tenant fora da frente de teste: leitura compatÃ­vel sem qualquer UPDATE.
    pin = canonical.pin_plain as string;
  } else {
    return NextResponse.json({ error: "PIN indisponÃ­vel; gere um novo PIN" }, { status: 409 });
  }

  if (!canonical) {
    return NextResponse.json({ error: "Falha ao resolver o acesso da facÃ§Ã£o" }, { status: 500 });
  }

  // Auditoria (best-effort).
  const rotated = action === "rotate";
  await supabase.from("audit_log").insert({
    tenant_id: tenantId,
    user_id: user.id,
    action: rotated ? "FACTION_PIN_ROTATED" : "FACTION_ACCESS_ISSUED",
    entity_type: "faction_token",
    entity_id: factionId,
    details: {
      faction: faction.name,
      token_id: canonical.id,
      admin: (user as { email?: string | null }).email ?? user.id,
    },
  }).then(({ error }) => { if (error) console.error("[faction access] audit:", error); });

  return NextResponse.json({
    data: { token: canonical.token, pin, factionName: faction.name, rotated },
  });
}
