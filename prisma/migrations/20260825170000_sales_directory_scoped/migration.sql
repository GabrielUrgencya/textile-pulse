-- LISION Vendas — Story 11.1: isolar a equipe do Vendas da equipe de produção.
--
-- Antes, sales_admin_directory_v1 retornava TODOS os profiles do tenant (vazava a
-- equipe de produção para o módulo Vendas). Agora retorna apenas pessoas do Vendas:
-- quem tem vínculo em sales_memberships OU cargo VENDEDOR (profiles.role).
--
-- Para promover alguém a ADMIN do Vendas quando necessário, uma RPC de busca
-- explícita (sales_admin_profile_search_v1) consulta todos os profiles do tenant —
-- a única porta que ainda enxerga produção, e só sob busca ativa do admin.

CREATE OR REPLACE FUNCTION public.sales_admin_directory_v1()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'profile_id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'profile_is_active', p.is_active AND p.deleted_at IS NULL,
      'membership_id', sm.id,
      'sales_role', sm.role,
      'membership_is_active', COALESCE(sm.is_active, false)
    ) ORDER BY p.full_name, p.id), '[]'::jsonb)
    FROM public.profiles p
    LEFT JOIN public.sales_memberships sm
      ON sm.tenant_id = p.tenant_id AND sm.profile_id = p.id
    WHERE p.tenant_id = v_tenant
      AND (sm.id IS NOT NULL OR p.role = 'VENDEDOR')  -- só pessoas do Vendas
  );
END;
$$;

-- Busca explícita de perfis do tenant (produção incluída) para promover a ADMIN
-- do Vendas. Admin-only, limitada, retorna o mesmo shape do diretório.
CREATE OR REPLACE FUNCTION public.sales_admin_profile_search_v1(p_query text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_q text := btrim(COALESCE(p_query, ''));
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'full_name', entry->>'profile_id'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'profile_id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'profile_is_active', p.is_active AND p.deleted_at IS NULL,
        'membership_id', sm.id,
        'sales_role', sm.role,
        'membership_is_active', COALESCE(sm.is_active, false)
      ) AS entry
      FROM public.profiles p
      LEFT JOIN public.sales_memberships sm
        ON sm.tenant_id = p.tenant_id AND sm.profile_id = p.id
      WHERE p.tenant_id = v_tenant
        AND p.deleted_at IS NULL
        AND (p.full_name ILIKE '%' || v_q || '%' OR p.email ILIKE '%' || v_q || '%')
      ORDER BY p.full_name, p.id
      LIMIT 20
    ) matches
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_admin_profile_search_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_profile_search_v1(text) TO authenticated;
