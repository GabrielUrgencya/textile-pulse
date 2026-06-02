import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, sector, phone, email, avatar_url")
    .eq("id", user.id)
    .single();

  const fullName = profile?.full_name || user.email?.split("@")[0] || "Usuário";
  const role = profile?.role || "OPERADOR";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // M1 FIX: Return { data: ... } instead of { profile: ... } per API contract
  return NextResponse.json({
    data: {
      id: user.id,
      fullName,
      role,
      initials,
      email: user.email || profile?.email || "",
      sector: profile?.sector || null,
      phone: profile?.phone || null,
      avatarUrl: profile?.avatar_url || null,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  const body = await request.json().catch(() => null);
  if (!body || !body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: body.name,
      phone: body.phone ?? null,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({ data: { success: true } });
}
