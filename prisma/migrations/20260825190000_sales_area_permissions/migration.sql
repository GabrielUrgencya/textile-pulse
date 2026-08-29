-- LISION Vendas — Story 11.6a: permissões de área por cargo + por usuário.
--
-- Modelo: o admin do Vendas controla quais áreas admin cada CARGO e cada USUÁRIO vê.
-- Efetivo = default por cargo (ADMIN = todas) ⊕ override por cargo ⊕ override por usuário
-- (usuário vence). Acesso só via RPCs SECURITY DEFINER; tabelas com RLS deny-direct.

CREATE TABLE IF NOT EXISTS public.sales_area_permissions (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public."SalesMemberRole" NOT NULL,
  area text NOT NULL,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role, area),
  CONSTRAINT sales_area_permissions_area_chk CHECK (area IN
    ('dashboard','sales','team','payment-methods','goals','periods','calendar','closing','tv-access','config'))
);

CREATE TABLE IF NOT EXISTS public.sales_user_area_permissions (
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  area text NOT NULL,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, profile_id, area),
  CONSTRAINT sales_user_area_permissions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT sales_user_area_permissions_profile_fk FOREIGN KEY (tenant_id, profile_id) REFERENCES public.profiles(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT sales_user_area_permissions_area_chk CHECK (area IN
    ('dashboard','sales','team','payment-methods','goals','periods','calendar','closing','tv-access','config'))
);

-- RLS deny-direct: nenhum acesso direto por authenticated/anon; só via RPCs definer.
ALTER TABLE public.sales_area_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_user_area_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_area_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sales_user_area_permissions FROM PUBLIC, anon, authenticated;

-- Áreas efetivas do usuário atual (para nav + guard).
CREATE OR REPLACE FUNCTION public.sales_my_areas_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_role public."SalesMemberRole";
  v_admin_areas text[] := ARRAY['dashboard','sales','team','payment-methods','goals','periods','calendar','closing','tv-access','config'];
  v_base text[];
  v_result text[] := ARRAY[]::text[];
  v_area text;
  v_role_ovr boolean;
  v_user_ovr boolean;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT sm.role INTO v_role FROM public.sales_memberships sm
  WHERE sm.tenant_id = v_tenant AND sm.profile_id = v_actor AND sm.is_active;
  IF v_role IS NULL THEN RETURN '[]'::jsonb; END IF;

  v_base := CASE WHEN v_role = 'ADMIN' THEN v_admin_areas ELSE ARRAY[]::text[] END;

  FOREACH v_area IN ARRAY v_base LOOP
    SELECT allowed INTO v_role_ovr FROM public.sales_area_permissions
      WHERE tenant_id = v_tenant AND role = v_role AND area = v_area;
    SELECT allowed INTO v_user_ovr FROM public.sales_user_area_permissions
      WHERE tenant_id = v_tenant AND profile_id = v_actor AND area = v_area;
    IF COALESCE(v_user_ovr, v_role_ovr, true) THEN
      v_result := array_append(v_result, v_area);
    END IF;
  END LOOP;

  RETURN to_jsonb(v_result);
END;
$$;

-- Matriz para o editor (admin-only).
CREATE OR REPLACE FUNCTION public.sales_admin_area_permissions_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'areas', to_jsonb(ARRAY['dashboard','sales','team','payment-methods','goals','periods','calendar','closing','tv-access','config']),
    'roleOverrides', COALESCE((
      SELECT jsonb_object_agg(role, ovr) FROM (
        SELECT role::text AS role, jsonb_object_agg(area, allowed) AS ovr
        FROM public.sales_area_permissions WHERE tenant_id = v_tenant GROUP BY role
      ) r), '{}'::jsonb),
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'profileId', p.id,
        'fullName', p.full_name,
        'email', p.email,
        'salesRole', sm.role,
        'overrides', COALESCE((
          SELECT jsonb_object_agg(u.area, u.allowed) FROM public.sales_user_area_permissions u
          WHERE u.tenant_id = v_tenant AND u.profile_id = p.id), '{}'::jsonb)
      ) ORDER BY p.full_name, p.id)
      FROM public.sales_memberships sm
      JOIN public.profiles p ON p.tenant_id = sm.tenant_id AND p.id = sm.profile_id
      WHERE sm.tenant_id = v_tenant AND sm.is_active), '[]'::jsonb)
  );
END;
$$;

-- Grava overrides (full-replace por tenant), com anti-lockout do admin chamador.
CREATE OR REPLACE FUNCTION public.sales_admin_set_area_permissions_v1(p_role_overrides jsonb, p_user_overrides jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_valid text[] := ARRAY['dashboard','sales','team','payment-methods','goals','periods','calendar','closing','tv-access','config'];
  v_role text; v_area text; v_allowed boolean; v_profile uuid;
  v_role_json jsonb; v_area_json jsonb;
  v_actor_role public."SalesMemberRole";
  v_role_config boolean; v_user_config boolean;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  p_role_overrides := COALESCE(p_role_overrides, '{}'::jsonb);
  p_user_overrides := COALESCE(p_user_overrides, '{}'::jsonb);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-area-perms', 0));

  -- Anti-lockout: o admin chamador não pode perder a área 'config'.
  SELECT sm.role INTO v_actor_role FROM public.sales_memberships sm
    WHERE sm.tenant_id = v_tenant AND sm.profile_id = v_actor AND sm.is_active;
  v_role_config := (p_role_overrides #>> ARRAY[COALESCE(v_actor_role::text,'ADMIN'),'config'])::boolean;
  v_user_config := (p_user_overrides #>> ARRAY[v_actor::text,'config'])::boolean;
  IF COALESCE(v_user_config, v_role_config, true) = false THEN
    RAISE EXCEPTION 'sales_permission_lockout' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.sales_area_permissions WHERE tenant_id = v_tenant;
  DELETE FROM public.sales_user_area_permissions WHERE tenant_id = v_tenant;

  -- Role overrides
  FOR v_role, v_role_json IN SELECT * FROM jsonb_each(p_role_overrides) LOOP
    IF v_role NOT IN ('ADMIN','CONSULTANT') THEN CONTINUE; END IF;
    FOR v_area, v_area_json IN SELECT * FROM jsonb_each(v_role_json) LOOP
      IF NOT (v_area = ANY(v_valid)) THEN CONTINUE; END IF;
      v_allowed := (v_area_json)::text::boolean;
      INSERT INTO public.sales_area_permissions(tenant_id, role, area, allowed)
      VALUES (v_tenant, v_role::public."SalesMemberRole", v_area, v_allowed)
      ON CONFLICT (tenant_id, role, area) DO UPDATE SET allowed = EXCLUDED.allowed;
    END LOOP;
  END LOOP;

  -- User overrides
  FOR v_role, v_role_json IN SELECT * FROM jsonb_each(p_user_overrides) LOOP
    BEGIN v_profile := v_role::uuid; EXCEPTION WHEN others THEN CONTINUE; END;
    IF NOT EXISTS (SELECT 1 FROM public.sales_memberships sm WHERE sm.tenant_id = v_tenant AND sm.profile_id = v_profile) THEN CONTINUE; END IF;
    FOR v_area, v_area_json IN SELECT * FROM jsonb_each(v_role_json) LOOP
      IF NOT (v_area = ANY(v_valid)) THEN CONTINUE; END IF;
      v_allowed := (v_area_json)::text::boolean;
      INSERT INTO public.sales_user_area_permissions(tenant_id, profile_id, area, allowed)
      VALUES (v_tenant, v_profile, v_area, v_allowed)
      ON CONFLICT (tenant_id, profile_id, area) DO UPDATE SET allowed = EXCLUDED.allowed;
    END LOOP;
  END LOOP;

  RETURN public.sales_admin_area_permissions_v1();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_my_areas_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_area_permissions_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_area_permissions_v1(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_my_areas_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_area_permissions_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_set_area_permissions_v1(jsonb, jsonb) TO authenticated;
