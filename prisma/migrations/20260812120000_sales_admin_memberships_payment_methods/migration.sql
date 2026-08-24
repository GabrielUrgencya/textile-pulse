BEGIN;

CREATE OR REPLACE FUNCTION public.sales_normalize_payment_method_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(p_name, '[[:space:]]+', ' ', 'g')))
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sales_payment_methods spm
    GROUP BY spm.tenant_id, public.sales_normalize_payment_method_name(spm.name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'sales_payment_method_legacy_normalized_name_conflict'
      USING ERRCODE = '23505',
            HINT = 'Reconcile the reported tenant-scoped legacy duplicates without deleting referenced rows before retrying.';
  END IF;
END;
$$;

ALTER TABLE public.sales_payment_methods
  ADD COLUMN name_normalized text GENERATED ALWAYS AS (
    public.sales_normalize_payment_method_name(name)
  ) STORED;

ALTER TABLE public.sales_payment_methods
  DROP CONSTRAINT sales_payment_methods_tenant_name_key;

ALTER TABLE public.sales_payment_methods
  ADD CONSTRAINT sales_payment_methods_name_not_blank_check
    CHECK (length(name_normalized) > 0),
  ADD CONSTRAINT sales_payment_methods_tenant_normalized_name_key
    UNIQUE (tenant_id, name_normalized);

CREATE TABLE public.sales_payment_method_order_states (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_payment_method_reorder_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_payment_method_reorder_requests_tenant_key
    UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE public.sales_payment_method_order_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_payment_method_reorder_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sales_payment_method_order_states,
  public.sales_payment_method_reorder_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sales_require_active_payment_method_for_new_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.payment_method_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.sales_payment_methods spm
        WHERE spm.id = NEW.payment_method_id
          AND spm.tenant_id = NEW.tenant_id
          AND spm.is_active
      ) THEN
        RAISE EXCEPTION 'sales_payment_method_inactive_or_not_found' USING ERRCODE = '23503';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_require_active_payment_method_for_new_sale_trigger
BEFORE INSERT OR UPDATE OF payment_method_id ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sales_require_active_payment_method_for_new_sale();

CREATE OR REPLACE FUNCTION public.sales_admin_directory_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_set_membership_v1(
  p_profile_id uuid,
  p_role public."SalesMemberRole",
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_membership public.sales_memberships%ROWTYPE;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_profile_id IS NULL OR p_role IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'sales_membership_state_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text || ':sales-admins', 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id AND p.tenant_id = v_tenant
      AND (NOT p_is_active OR (p.is_active AND p.deleted_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'sales_profile_not_found_or_ineligible' USING ERRCODE = 'P0002';
  END IF;

  SELECT to_jsonb(sm) INTO v_before
  FROM public.sales_memberships sm
  WHERE sm.tenant_id = v_tenant AND sm.profile_id = p_profile_id
  FOR UPDATE;
  IF v_before IS NOT NULL THEN v_membership := jsonb_populate_record(NULL::public.sales_memberships, v_before); END IF;

  IF v_membership.id IS NULL AND NOT p_is_active THEN
    RAISE EXCEPTION 'sales_membership_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_membership.id IS NOT NULL
     AND v_membership.role = 'ADMIN'::public."SalesMemberRole"
     AND v_membership.is_active
     AND (p_role <> 'ADMIN'::public."SalesMemberRole" OR NOT p_is_active)
     AND (SELECT count(*) FROM public.sales_memberships sm
          WHERE sm.tenant_id = v_tenant AND sm.role = 'ADMIN' AND sm.is_active) <= 1 THEN
    RAISE EXCEPTION 'sales_last_active_admin' USING ERRCODE = '23514';
  END IF;

  IF v_membership.id IS NOT NULL
     AND v_membership.role = p_role
     AND v_membership.is_active = p_is_active THEN
    RETURN jsonb_build_object(
      'id', v_membership.id, 'profile_id', v_membership.profile_id,
      'role', v_membership.role, 'is_active', v_membership.is_active
    );
  END IF;

  INSERT INTO public.sales_memberships (tenant_id, profile_id, role, is_active)
  VALUES (v_tenant, p_profile_id, p_role, p_is_active)
  ON CONFLICT (tenant_id, profile_id) DO UPDATE
    SET role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = CASE
          WHEN sales_memberships.role IS DISTINCT FROM EXCLUDED.role
            OR sales_memberships.is_active IS DISTINCT FROM EXCLUDED.is_active
          THEN now() ELSE sales_memberships.updated_at END
  RETURNING * INTO v_membership;

  v_after := to_jsonb(v_membership);
  IF v_before IS DISTINCT FROM v_after THEN
    INSERT INTO public.sales_audit_events
      (tenant_id, actor_id, action, entity_type, entity_id, details)
    VALUES (
      v_tenant, v_actor,
      CASE
        WHEN v_before IS NULL THEN 'SALES_MEMBERSHIP_CREATED'
        WHEN NOT COALESCE((v_before ->> 'is_active')::boolean, false) AND p_is_active THEN 'SALES_MEMBERSHIP_REACTIVATED'
        WHEN NOT p_is_active THEN 'SALES_MEMBERSHIP_DEACTIVATED'
        ELSE 'SALES_MEMBERSHIP_UPDATED'
      END,
      'sales_membership', v_membership.id,
      jsonb_build_object('before', v_before, 'after', v_after)
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_membership.id, 'profile_id', v_membership.profile_id,
    'role', v_membership.role, 'is_active', v_membership.is_active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_payment_methods_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_revision bigint;
  v_methods jsonb;
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(s.revision, 0) INTO v_revision
  FROM (SELECT 1) seed
  LEFT JOIN public.sales_payment_method_order_states s ON s.tenant_id = v_tenant;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', spm.id, 'name', spm.name, 'sort_order', spm.sort_order,
    'is_active', spm.is_active
  ) ORDER BY spm.sort_order, spm.name_normalized, spm.id), '[]'::jsonb)
  INTO v_methods
  FROM public.sales_payment_methods spm
  WHERE spm.tenant_id = v_tenant;

  RETURN jsonb_build_object('order_revision', v_revision, 'methods', v_methods);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_set_payment_method_v1(
  p_method_id uuid,
  p_name text,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_name text := pg_catalog.btrim(pg_catalog.regexp_replace(COALESCE(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_normalized text;
  v_before jsonb;
  v_method public.sales_payment_methods%ROWTYPE;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS NULL OR length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'sales_payment_method_name_invalid' USING ERRCODE = '22023';
  END IF;
  v_normalized := public.sales_normalize_payment_method_name(v_name);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text || ':sales-payment-methods', 0));

  IF p_method_id IS NOT NULL THEN
    SELECT to_jsonb(spm) INTO v_before
    FROM public.sales_payment_methods spm
    WHERE spm.id = p_method_id AND spm.tenant_id = v_tenant
    FOR UPDATE;
    IF v_before IS NOT NULL THEN v_method := jsonb_populate_record(NULL::public.sales_payment_methods, v_before); END IF;
    IF v_method.id IS NULL THEN
      RAISE EXCEPTION 'sales_payment_method_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.sales_payment_methods other
      WHERE other.tenant_id = v_tenant AND other.name_normalized = v_normalized
        AND other.id <> p_method_id
    ) THEN
      RAISE EXCEPTION 'sales_payment_method_name_conflict' USING ERRCODE = '23505';
    END IF;

    IF v_method.name IS DISTINCT FROM v_name OR v_method.is_active IS DISTINCT FROM p_is_active THEN
      UPDATE public.sales_payment_methods
      SET name = v_name, is_active = p_is_active, updated_at = now()
      WHERE tenant_id = v_tenant AND id = p_method_id
      RETURNING * INTO v_method;
    END IF;
  ELSE
    SELECT to_jsonb(spm) INTO v_before
    FROM public.sales_payment_methods spm
    WHERE spm.tenant_id = v_tenant AND spm.name_normalized = v_normalized
    FOR UPDATE;
    IF v_before IS NOT NULL THEN v_method := jsonb_populate_record(NULL::public.sales_payment_methods, v_before); END IF;

    IF v_method.id IS NULL THEN
      INSERT INTO public.sales_payment_methods (tenant_id, name, sort_order, is_active)
      SELECT v_tenant, v_name, COALESCE(max(spm.sort_order) + 1, 0), p_is_active
      FROM public.sales_payment_methods spm WHERE spm.tenant_id = v_tenant
      RETURNING * INTO v_method;
    ELSE
      IF v_method.name IS DISTINCT FROM v_name OR v_method.is_active IS DISTINCT FROM p_is_active THEN
        UPDATE public.sales_payment_methods
        SET name = v_name, is_active = p_is_active, updated_at = now()
        WHERE tenant_id = v_tenant AND id = v_method.id
        RETURNING * INTO v_method;
      END IF;
    END IF;
  END IF;

  IF v_before IS DISTINCT FROM to_jsonb(v_method) THEN
    INSERT INTO public.sales_payment_method_order_states (tenant_id, revision, updated_at)
    VALUES (v_tenant, 1, now())
    ON CONFLICT (tenant_id) DO UPDATE
      SET revision = sales_payment_method_order_states.revision + 1, updated_at = now();

    INSERT INTO public.sales_audit_events
      (tenant_id, actor_id, action, entity_type, entity_id, details)
    VALUES (
      v_tenant, v_actor,
      CASE
        WHEN v_before IS NULL THEN 'SALES_PAYMENT_METHOD_CREATED'
        WHEN NOT COALESCE((v_before ->> 'is_active')::boolean, false) AND p_is_active THEN 'SALES_PAYMENT_METHOD_REACTIVATED'
        WHEN NOT p_is_active THEN 'SALES_PAYMENT_METHOD_DEACTIVATED'
        ELSE 'SALES_PAYMENT_METHOD_UPDATED'
      END,
      'sales_payment_method', v_method.id,
      jsonb_build_object('before', v_before, 'after', to_jsonb(v_method))
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_method.id, 'name', v_method.name,
    'sort_order', v_method.sort_order, 'is_active', v_method.is_active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_reorder_payment_methods_v1(
  p_ordered_method_ids uuid[],
  p_expected_order_revision bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_request jsonb;
  v_existing_request jsonb;
  v_existing_result jsonb;
  v_revision bigint;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_ordered_method_ids IS NULL OR p_expected_order_revision IS NULL
     OR length(v_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'sales_payment_method_reorder_invalid' USING ERRCODE = '22023';
  END IF;

  v_request := jsonb_build_object(
    'ordered_method_ids', to_jsonb(p_ordered_method_ids),
    'expected_order_revision', p_expected_order_revision
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text || ':sales-payment-methods', 0));

  SELECT request, result INTO v_existing_request, v_existing_result
  FROM public.sales_payment_method_reorder_requests
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF v_existing_result IS NOT NULL THEN
    IF v_existing_request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'sales_idempotency_key_payload_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing_result;
  END IF;

  PERFORM 1 FROM public.sales_payment_methods spm
  WHERE spm.tenant_id = v_tenant ORDER BY spm.id FOR UPDATE;

  INSERT INTO public.sales_payment_method_order_states (tenant_id, revision, updated_at)
  VALUES (v_tenant, 0, now()) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT revision INTO v_revision
  FROM public.sales_payment_method_order_states
  WHERE tenant_id = v_tenant FOR UPDATE;

  SELECT COALESCE(jsonb_agg(spm.id ORDER BY spm.sort_order, spm.name_normalized, spm.id), '[]'::jsonb)
  INTO v_before FROM public.sales_payment_methods spm WHERE spm.tenant_id = v_tenant;

  IF v_revision <> p_expected_order_revision THEN
    RAISE EXCEPTION 'sales_payment_method_order_revision_conflict'
      USING ERRCODE = '40001',
            DETAIL = jsonb_build_object('order_revision', v_revision, 'ordered_method_ids', v_before)::text;
  END IF;
  IF cardinality(p_ordered_method_ids) <> (
       SELECT count(DISTINCT x) FROM unnest(p_ordered_method_ids) AS x
     ) OR cardinality(p_ordered_method_ids) <> (
       SELECT count(*) FROM public.sales_payment_methods spm WHERE spm.tenant_id = v_tenant
     ) OR EXISTS (
       SELECT 1 FROM unnest(p_ordered_method_ids) AS x
       WHERE NOT EXISTS (
         SELECT 1 FROM public.sales_payment_methods spm
         WHERE spm.tenant_id = v_tenant AND spm.id = x
       )
     ) THEN
    RAISE EXCEPTION 'sales_payment_method_order_set_conflict'
      USING ERRCODE = '23514',
            DETAIL = jsonb_build_object('order_revision', v_revision, 'ordered_method_ids', v_before)::text;
  END IF;

  IF v_before = to_jsonb(p_ordered_method_ids) THEN
    v_existing_result := jsonb_build_object('order_revision', v_revision, 'ordered_method_ids', v_before);
    INSERT INTO public.sales_payment_method_reorder_requests
      (tenant_id, idempotency_key, request, result)
    VALUES (v_tenant, v_key, v_request, v_existing_result);
    RETURN v_existing_result;
  END IF;

  UPDATE public.sales_payment_methods spm
  SET sort_order = ordered.ordinality - 1, updated_at = now()
  FROM unnest(p_ordered_method_ids) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE spm.tenant_id = v_tenant AND spm.id = ordered.id;

  UPDATE public.sales_payment_method_order_states
  SET revision = revision + 1, updated_at = now()
  WHERE tenant_id = v_tenant RETURNING revision INTO v_revision;

  SELECT COALESCE(jsonb_agg(spm.id ORDER BY spm.sort_order, spm.name_normalized, spm.id), '[]'::jsonb)
  INTO v_after FROM public.sales_payment_methods spm WHERE spm.tenant_id = v_tenant;
  v_existing_result := jsonb_build_object('order_revision', v_revision, 'ordered_method_ids', v_after);

  INSERT INTO public.sales_payment_method_reorder_requests
    (tenant_id, idempotency_key, request, result)
  VALUES (v_tenant, v_key, v_request, v_existing_result);
  INSERT INTO public.sales_audit_events
    (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_tenant, v_actor, 'SALES_PAYMENT_METHODS_REORDERED',
    'sales_payment_method_order', v_tenant,
    jsonb_build_object('before', v_before, 'after', v_after, 'revision', v_revision)
  );

  RETURN v_existing_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_normalize_payment_method_name(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_require_active_payment_method_for_new_sale() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_admin_directory_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_membership_v1(uuid, public."SalesMemberRole", boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_payment_methods_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_payment_method_v1(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_reorder_payment_methods_v1(uuid[], bigint, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sales_admin_directory_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_set_membership_v1(uuid, public."SalesMemberRole", boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_payment_methods_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_set_payment_method_v1(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_reorder_payment_methods_v1(uuid[], bigint, text) TO authenticated;

COMMENT ON FUNCTION public.sales_admin_directory_v1() IS
  'ADMIN-only minimal tenant directory. Preserves Profile RLS and sales_my_access_v1.';
COMMENT ON FUNCTION public.sales_admin_reorder_payment_methods_v1(uuid[], bigint, text) IS
  'Atomic full-list reorder with opaque revision, tenant-scoped idempotency and one audit event.';

COMMIT;
