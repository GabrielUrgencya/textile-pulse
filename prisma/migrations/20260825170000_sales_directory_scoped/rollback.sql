-- Rollback de 20260825170000_sales_directory_scoped
-- Restaura o diretório sem escopo (lista todos os profiles) e remove a busca.

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
      'profile_id', p.id, 'full_name', p.full_name, 'email', p.email,
      'profile_is_active', p.is_active AND p.deleted_at IS NULL,
      'membership_id', sm.id, 'sales_role', sm.role,
      'membership_is_active', COALESCE(sm.is_active, false)
    ) ORDER BY p.full_name, p.id), '[]'::jsonb)
    FROM public.profiles p
    LEFT JOIN public.sales_memberships sm
      ON sm.tenant_id = p.tenant_id AND sm.profile_id = p.id
    WHERE p.tenant_id = v_tenant
  );
END;
$$;

DROP FUNCTION IF EXISTS public.sales_admin_profile_search_v1(text);
