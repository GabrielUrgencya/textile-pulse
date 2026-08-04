import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  let data;
  let error;

  try {
    const supabase = createSupabaseServerClient();
    ({ data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    }));
  } catch {
    return NextResponse.json(
      { error: "O serviço de autenticação está temporariamente indisponível. Tente novamente em alguns instantes." },
      { status: 503 }
    );
  }

  if (error || !data.user || !data.session) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      role: data.user.app_metadata?.role,
      tenant_id: data.user.app_metadata?.tenant_id,
    },
    session: {
      access_token: data.session.access_token,
      expires_at: data.session.expires_at,
    },
  });
}
