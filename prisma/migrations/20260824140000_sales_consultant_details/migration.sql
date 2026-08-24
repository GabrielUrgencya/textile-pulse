-- D2: dados da consultora editáveis pelo ADM DENTRO do Vendas, sem tocar no perfil do Lision.
-- Tabela sales-scoped (override de nome de exibição + contato + observações), 1:1 com o perfil.
-- Acesso só via RPC (RLS + revoke), guard de admin/tenant como no restante do subsistema.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_consultant_details (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  display_name text CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR length(btrim(phone)) BETWEEN 1 AND 40),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, profile_id),
  CONSTRAINT sales_consultant_details_profile_fk
    FOREIGN KEY (tenant_id, profile_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE public.sales_consultant_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_consultant_details FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.sales_consultant_details IS 'Dados comerciais da consultora (override de nome/contato) escopados ao módulo Vendas; não altera public.profiles.';

CREATE OR REPLACE FUNCTION public.sales_admin_set_consultant_details_v1(p_profile_id uuid,p_display_name text,p_phone text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();
 v_name text:=NULLIF(btrim(COALESCE(p_display_name,'')),'');v_phone text:=NULLIF(btrim(COALESCE(p_phone,'')),'');v_notes text:=NULLIF(btrim(COALESCE(p_notes,'')),'');v_row jsonb;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sales_memberships sm WHERE sm.tenant_id=v_tenant AND sm.profile_id=p_profile_id) THEN RAISE EXCEPTION 'sales_consultant_not_in_scope' USING ERRCODE='P0002';END IF;
 IF(v_name IS NOT NULL AND length(v_name)>120)OR(v_phone IS NOT NULL AND length(v_phone)>40)OR(v_notes IS NOT NULL AND length(v_notes)>2000)THEN RAISE EXCEPTION 'sales_consultant_details_validation' USING ERRCODE='22023';END IF;
 INSERT INTO public.sales_consultant_details(tenant_id,profile_id,display_name,phone,notes,updated_at)VALUES(v_tenant,p_profile_id,v_name,v_phone,v_notes,now())
   ON CONFLICT(tenant_id,profile_id)DO UPDATE SET display_name=EXCLUDED.display_name,phone=EXCLUDED.phone,notes=EXCLUDED.notes,updated_at=now()
   RETURNING to_jsonb(sales_consultant_details.*)-'tenant_id' INTO v_row;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)VALUES(v_tenant,v_actor,'CONSULTANT_DETAILS_SET','consultant',p_profile_id,v_row);
 RETURN v_row;
END;$$;

CREATE OR REPLACE FUNCTION public.sales_admin_consultant_details_v1(p_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_row jsonb;
BEGIN
 IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(d.*)-'tenant_id' INTO v_row FROM public.sales_consultant_details d WHERE d.tenant_id=v_tenant AND d.profile_id=p_profile_id;
 RETURN COALESCE(v_row,jsonb_build_object('profile_id',p_profile_id,'display_name',NULL,'phone',NULL,'notes',NULL));
END;$$;

REVOKE ALL ON FUNCTION public.sales_admin_set_consultant_details_v1(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_set_consultant_details_v1(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.sales_admin_consultant_details_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_consultant_details_v1(uuid) TO authenticated;

COMMIT;
