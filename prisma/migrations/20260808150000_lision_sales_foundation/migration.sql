BEGIN;

CREATE TYPE public."SalesMemberRole" AS ENUM ('ADMIN', 'CONSULTANT');
CREATE TYPE public."SalesSaleStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE public."SalesGoalScope" AS ENUM ('INDIVIDUAL', 'COLLECTIVE', 'QUARTERLY');
CREATE TYPE public."SalesPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE public."SalesCelebrationAudience" AS ENUM ('PRIVATE', 'COLLECTIVE', 'TV');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.sales_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  role public."SalesMemberRole" NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_memberships_tenant_profile_key UNIQUE (tenant_id, profile_id),
  CONSTRAINT sales_memberships_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT sales_memberships_profile_tenant_fk
    FOREIGN KEY (tenant_id, profile_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE public.sales_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  pieces_per_set integer NOT NULL DEFAULT 2 CHECK (pieces_per_set > 0),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  week_starts_on integer NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  allow_team_aggregates boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_holidays_tenant_date_key UNIQUE (tenant_id, date)
);

CREATE TABLE public.sales_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_payment_methods_tenant_name_key UNIQUE (tenant_id, name),
  CONSTRAINT sales_payment_methods_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE TABLE public.sales_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status public."SalesPeriodStatus" NOT NULL DEFAULT 'OPEN',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_periods_dates_check CHECK (ends_on >= starts_on),
  CONSTRAINT sales_periods_tenant_dates_key UNIQUE (tenant_id, starts_on, ends_on),
  CONSTRAINT sales_periods_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL,
  consultant_profile_id uuid NOT NULL,
  pv_number text NOT NULL CHECK (length(btrim(pv_number)) > 0),
  sale_value numeric(14,2) NOT NULL CHECK (sale_value >= 0),
  freight_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (freight_value >= 0),
  discount_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  payment_method_id uuid,
  installments integer NOT NULL DEFAULT 1 CHECK (installments >= 1),
  sets_count integer NOT NULL DEFAULT 0 CHECK (sets_count >= 0),
  loose_pieces_count integer NOT NULL DEFAULT 0 CHECK (loose_pieces_count >= 0),
  pieces_total integer NOT NULL DEFAULT 0 CHECK (pieces_total >= 0),
  invoice_number text,
  status public."SalesSaleStatus" NOT NULL DEFAULT 'CLOSED',
  sold_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by_id uuid,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_tenant_pv_key UNIQUE (tenant_id, pv_number),
  CONSTRAINT sales_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT sales_period_tenant_fk
    FOREIGN KEY (tenant_id, period_id)
    REFERENCES public.sales_periods(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sales_consultant_tenant_fk
    FOREIGN KEY (tenant_id, consultant_profile_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sales_payment_method_tenant_fk
    FOREIGN KEY (tenant_id, payment_method_id)
    REFERENCES public.sales_payment_methods(tenant_id, id) ON DELETE SET NULL (payment_method_id),
  CONSTRAINT sales_cancelled_by_tenant_fk
    FOREIGN KEY (tenant_id, cancelled_by_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE SET NULL (cancelled_by_id),
  CONSTRAINT sales_discount_not_above_sale_check CHECK (discount_value <= sale_value),
  CONSTRAINT sales_cancelled_state_check CHECK (
    (status <> 'CANCELLED' AND cancelled_at IS NULL AND cancelled_by_id IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by_id IS NOT NULL)
  )
);

CREATE TABLE public.sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  scope public."SalesGoalScope" NOT NULL,
  target_value numeric(14,2) NOT NULL CHECK (target_value >= 0),
  commission_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (commission_percent BETWEEN 0 AND 100),
  sort_order integer NOT NULL DEFAULT 0,
  is_challenge boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_goals_validity_check CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CONSTRAINT sales_goals_tenant_name_scope_key UNIQUE (tenant_id, name, scope),
  CONSTRAINT sales_goals_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE TABLE public.sales_goal_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL,
  period_id uuid NOT NULL,
  profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_goal_assignments_goal_tenant_fk
    FOREIGN KEY (tenant_id, goal_id)
    REFERENCES public.sales_goals(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT sales_goal_assignments_period_tenant_fk
    FOREIGN KEY (tenant_id, period_id)
    REFERENCES public.sales_periods(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT sales_goal_assignments_profile_tenant_fk
    FOREIGN KEY (tenant_id, profile_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX sales_goal_assignments_unique
  ON public.sales_goal_assignments (tenant_id, goal_id, period_id, COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE public.sales_period_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL,
  closed_by_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_period_closures_tenant_period_key UNIQUE (tenant_id, period_id),
  CONSTRAINT sales_period_closures_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT sales_period_closures_period_tenant_fk
    FOREIGN KEY (tenant_id, period_id)
    REFERENCES public.sales_periods(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sales_period_closures_actor_tenant_fk
    FOREIGN KEY (tenant_id, closed_by_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.sales_celebrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  profile_id uuid,
  audience public."SalesCelebrationAudience" NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_celebrations_period_tenant_fk
    FOREIGN KEY (tenant_id, period_id)
    REFERENCES public.sales_periods(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT sales_celebrations_goal_tenant_fk
    FOREIGN KEY (tenant_id, goal_id)
    REFERENCES public.sales_goals(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT sales_celebrations_profile_tenant_fk
    FOREIGN KEY (tenant_id, profile_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE SET NULL (profile_id)
);

CREATE UNIQUE INDEX sales_celebrations_unique
  ON public.sales_celebrations (tenant_id, period_id, goal_id, COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'::uuid), audience);

CREATE TABLE public.sales_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_audit_events_actor_tenant_fk
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES public.profiles(tenant_id, id) ON DELETE SET NULL (actor_id)
);

CREATE INDEX sales_memberships_profile_active_idx ON public.sales_memberships (profile_id, is_active);
CREATE INDEX sales_holidays_tenant_date_idx ON public.sales_holidays (tenant_id, date);
CREATE INDEX sales_payment_methods_active_idx ON public.sales_payment_methods (tenant_id, is_active, sort_order);
CREATE INDEX sales_periods_status_idx ON public.sales_periods (tenant_id, status, starts_on);
CREATE INDEX sales_consultant_date_idx ON public.sales (tenant_id, consultant_profile_id, sold_at DESC);
CREATE INDEX sales_period_status_idx ON public.sales (tenant_id, period_id, status);
CREATE INDEX sales_payment_method_idx ON public.sales (payment_method_id);
CREATE INDEX sales_goals_scope_idx ON public.sales_goals (tenant_id, scope, is_active, sort_order);
CREATE INDEX sales_goal_assignments_lookup_idx ON public.sales_goal_assignments (tenant_id, period_id, profile_id);
CREATE INDEX sales_period_closures_tenant_idx ON public.sales_period_closures (tenant_id, created_at DESC);
CREATE INDEX sales_celebrations_lookup_idx ON public.sales_celebrations (tenant_id, period_id, audience);
CREATE INDEX sales_audit_entity_idx ON public.sales_audit_events (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX sales_audit_actor_idx ON public.sales_audit_events (actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sales_membership_role()
RETURNS public."SalesMemberRole"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT sm.role
  FROM public.sales_memberships sm
  WHERE sm.tenant_id = public.auth_tenant_id()
    AND sm.profile_id = auth.uid()
    AND sm.is_active
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.sales_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(public.sales_membership_role() = 'ADMIN'::public."SalesMemberRole", false)
$$;

ALTER TABLE public.sales_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goal_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_period_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_celebrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_memberships_select ON public.sales_memberships
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (profile_id = auth.uid() OR public.sales_is_admin()));

CREATE POLICY sales_config_select ON public.sales_config
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.sales_membership_role() IS NOT NULL);

CREATE POLICY sales_holidays_select ON public.sales_holidays
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.sales_membership_role() IS NOT NULL);

CREATE POLICY sales_payment_methods_select ON public.sales_payment_methods
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.sales_membership_role() IS NOT NULL);

CREATE POLICY sales_periods_select ON public.sales_periods
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.sales_membership_role() IS NOT NULL);

CREATE POLICY sales_select ON public.sales
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (consultant_profile_id = auth.uid() OR public.sales_is_admin())
  );

CREATE POLICY sales_goals_select ON public.sales_goals
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.sales_membership_role() IS NOT NULL);

CREATE POLICY sales_goal_assignments_select ON public.sales_goal_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (profile_id IS NULL OR profile_id = auth.uid() OR public.sales_is_admin())
  );

CREATE POLICY sales_period_closures_select ON public.sales_period_closures
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.sales_is_admin());

CREATE POLICY sales_celebrations_select ON public.sales_celebrations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (profile_id = auth.uid() OR (profile_id IS NULL AND public.sales_membership_role() IS NOT NULL) OR public.sales_is_admin())
  );

CREATE POLICY sales_audit_events_select ON public.sales_audit_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.sales_is_admin());

CREATE OR REPLACE FUNCTION public.sales_my_access_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'enabled', sm.id IS NOT NULL,
    'tenant_id', sm.tenant_id,
    'profile_id', sm.profile_id,
    'role', sm.role,
    'is_active', COALESCE(sm.is_active, false)
  )
  FROM (SELECT 1) seed
  LEFT JOIN public.sales_memberships sm
    ON sm.tenant_id = public.auth_tenant_id()
   AND sm.profile_id = auth.uid()
   AND sm.is_active
$$;

CREATE OR REPLACE FUNCTION public.sales_upsert_sale_v1(
  p_sale_id uuid,
  p_consultant_profile_id uuid,
  p_pv_number text,
  p_sale_value numeric,
  p_freight_value numeric DEFAULT 0,
  p_discount_value numeric DEFAULT 0,
  p_payment_method_id uuid DEFAULT NULL,
  p_installments integer DEFAULT 1,
  p_sets_count integer DEFAULT 0,
  p_loose_pieces_count integer DEFAULT 0,
  p_invoice_number text DEFAULT NULL,
  p_status public."SalesSaleStatus" DEFAULT 'CLOSED',
  p_sold_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_role public."SalesMemberRole" := public.sales_membership_role();
  v_consultant uuid;
  v_period uuid;
  v_pieces_per_set integer;
  v_sale public.sales%ROWTYPE;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'sales_access_denied' USING ERRCODE = '42501';
  END IF;

  v_consultant := COALESCE(p_consultant_profile_id, v_actor);
  IF v_role <> 'ADMIN' AND v_consultant <> v_actor THEN
    RAISE EXCEPTION 'sales_cross_consultant_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sales_memberships sm
    WHERE sm.tenant_id = v_tenant AND sm.profile_id = v_consultant
      AND sm.role = 'CONSULTANT' AND sm.is_active
  ) THEN
    RAISE EXCEPTION 'sales_consultant_not_enabled' USING ERRCODE = '23503';
  END IF;

  SELECT sp.id INTO v_period
  FROM public.sales_periods sp
  WHERE sp.tenant_id = v_tenant
    AND (p_sold_at AT TIME ZONE COALESCE((SELECT sc.timezone FROM public.sales_config sc WHERE sc.tenant_id = v_tenant), 'America/Sao_Paulo'))::date
        BETWEEN sp.starts_on AND sp.ends_on
    AND sp.status = 'OPEN'
  ORDER BY sp.starts_on DESC
  LIMIT 1;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'sales_open_period_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(sc.pieces_per_set, 2) INTO v_pieces_per_set
  FROM (SELECT 1) seed
  LEFT JOIN public.sales_config sc ON sc.tenant_id = v_tenant;

  IF p_sale_id IS NULL THEN
    INSERT INTO public.sales (
      tenant_id, period_id, consultant_profile_id, pv_number, sale_value,
      freight_value, discount_value, payment_method_id, installments,
      sets_count, loose_pieces_count, pieces_total, invoice_number, status, sold_at
    ) VALUES (
      v_tenant, v_period, v_consultant, btrim(p_pv_number), p_sale_value,
      COALESCE(p_freight_value, 0), COALESCE(p_discount_value, 0), p_payment_method_id,
      COALESCE(p_installments, 1), COALESCE(p_sets_count, 0), COALESCE(p_loose_pieces_count, 0),
      COALESCE(p_sets_count, 0) * v_pieces_per_set + COALESCE(p_loose_pieces_count, 0),
      NULLIF(btrim(p_invoice_number), ''), p_status, p_sold_at
    ) RETURNING * INTO v_sale;
  ELSE
    UPDATE public.sales s
    SET pv_number = btrim(p_pv_number),
        sale_value = p_sale_value,
        freight_value = COALESCE(p_freight_value, 0),
        discount_value = COALESCE(p_discount_value, 0),
        payment_method_id = p_payment_method_id,
        installments = COALESCE(p_installments, 1),
        sets_count = COALESCE(p_sets_count, 0),
        loose_pieces_count = COALESCE(p_loose_pieces_count, 0),
        pieces_total = COALESCE(p_sets_count, 0) * v_pieces_per_set + COALESCE(p_loose_pieces_count, 0),
        invoice_number = NULLIF(btrim(p_invoice_number), ''),
        status = p_status,
        sold_at = p_sold_at,
        period_id = v_period,
        updated_at = now()
    WHERE s.id = p_sale_id AND s.tenant_id = v_tenant
      AND s.status <> 'CANCELLED'
      AND (v_role = 'ADMIN' OR s.consultant_profile_id = v_actor)
    RETURNING * INTO v_sale;

    IF v_sale.id IS NULL THEN
      RAISE EXCEPTION 'sales_sale_not_found_or_locked' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, CASE WHEN p_sale_id IS NULL THEN 'SALE_CREATED' ELSE 'SALE_UPDATED' END,
          'sale', v_sale.id, jsonb_build_object('status', v_sale.status, 'consultant_profile_id', v_sale.consultant_profile_id));

  RETURN jsonb_build_object('id', v_sale.id, 'pv_number', v_sale.pv_number, 'status', v_sale.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_cancel_sale_v1(p_sale_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_sale public.sales%ROWTYPE;
BEGIN
  IF NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'sales_cancellation_reason_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales s
  SET status = 'CANCELLED', cancelled_at = now(), cancelled_by_id = v_actor,
      cancellation_reason = btrim(p_reason), updated_at = now()
  WHERE s.id = p_sale_id AND s.tenant_id = v_tenant AND s.status <> 'CANCELLED'
  RETURNING * INTO v_sale;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'sales_sale_not_found_or_cancelled' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'SALE_CANCELLED', 'sale', v_sale.id, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('id', v_sale.id, 'status', v_sale.status, 'cancelled_at', v_sale.cancelled_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_close_period_v1(p_period_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_snapshot jsonb;
  v_existing jsonb;
  v_existing_period uuid;
BEGIN
  IF NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  IF length(v_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'sales_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  -- Serialize retries by tenant/key. Different tenants may safely reuse the same key.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tenant::text || ':' || v_key, 0)
  );

  SELECT spc.period_id, spc.snapshot INTO v_existing_period, v_existing
  FROM public.sales_period_closures spc
  WHERE spc.tenant_id = v_tenant AND spc.idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    IF v_existing_period <> p_period_id THEN
      RAISE EXCEPTION 'sales_idempotency_key_reused_for_another_period' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing;
  END IF;

  PERFORM 1 FROM public.sales_periods sp
  WHERE sp.id = p_period_id AND sp.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_period_not_found' USING ERRCODE = 'P0002'; END IF;

  -- A concurrent request with another key may have closed this period while
  -- waiting for the row lock. Closing a period remains idempotent.
  SELECT spc.snapshot INTO v_existing
  FROM public.sales_period_closures spc
  WHERE spc.tenant_id = v_tenant AND spc.period_id = p_period_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT jsonb_build_object(
    'period_id', p_period_id,
    'closed_sales_total', COALESCE(sum(s.sale_value - s.discount_value), 0),
    'freight_total', COALESCE(sum(s.freight_value), 0),
    'discount_total', COALESCE(sum(s.discount_value), 0),
    'pieces_total', COALESCE(sum(s.pieces_total), 0),
    'sales_count', count(*)
  ) INTO v_snapshot
  FROM public.sales s
  WHERE s.tenant_id = v_tenant AND s.period_id = p_period_id AND s.status = 'CLOSED';

  INSERT INTO public.sales_period_closures (tenant_id, period_id, closed_by_id, snapshot, idempotency_key)
  VALUES (v_tenant, p_period_id, v_actor, v_snapshot, v_key);

  UPDATE public.sales_periods
  SET status = 'CLOSED', closed_at = now(), updated_at = now()
  WHERE id = p_period_id AND tenant_id = v_tenant;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'PERIOD_CLOSED', 'sales_period', p_period_id, v_snapshot);

  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_claim_celebration_v1(
  p_period_id uuid,
  p_goal_id uuid,
  p_profile_id uuid,
  p_audience public."SalesCelebrationAudience"
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF public.sales_membership_role() IS NULL THEN
    RAISE EXCEPTION 'sales_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_profile_id IS DISTINCT FROM v_actor AND NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_cross_consultant_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sales_celebrations (tenant_id, period_id, goal_id, profile_id, audience)
  VALUES (v_tenant, p_period_id, p_goal_id, p_profile_id, p_audience)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

-- Single source of truth for every sales dashboard formula. This function is
-- intentionally internal: callers receive only the projection allowed by their
-- public RPC contract.
CREATE OR REPLACE FUNCTION public.sales_metrics_v1(
  p_tenant_id uuid,
  p_period_id uuid,
  p_profile_id uuid DEFAULT NULL,
  p_as_of date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_starts_on date;
  v_ends_on date;
  v_period_status public."SalesPeriodStatus";
  v_timezone text;
  v_today date;
  v_realized numeric := 0;
  v_sales_count bigint := 0;
  v_pieces_total bigint := 0;
  v_freight_total numeric := 0;
  v_discount_total numeric := 0;
  v_business_days_total integer := 0;
  v_business_days_elapsed integer := 0;
  v_business_days_remaining integer := 0;
  v_collective_target numeric := 0;
  v_commission_percent numeric := 0;
  v_goals jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_period_id IS NULL THEN
    RAISE EXCEPTION 'sales_metrics_scope_required' USING ERRCODE = '22023';
  END IF;

  SELECT sp.starts_on, sp.ends_on, sp.status,
         COALESCE(sc.timezone, 'America/Sao_Paulo')
    INTO v_starts_on, v_ends_on, v_period_status, v_timezone
  FROM public.sales_periods sp
  LEFT JOIN public.sales_config sc ON sc.tenant_id = sp.tenant_id
  WHERE sp.tenant_id = p_tenant_id AND sp.id = p_period_id;

  IF v_starts_on IS NULL THEN
    RAISE EXCEPTION 'sales_period_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_today := COALESCE(p_as_of, (now() AT TIME ZONE v_timezone)::date);

  SELECT
    COALESCE(sum(s.sale_value - s.discount_value), 0),
    count(s.id),
    COALESCE(sum(s.pieces_total), 0),
    COALESCE(sum(s.freight_value), 0),
    COALESCE(sum(s.discount_value), 0)
    INTO v_realized, v_sales_count, v_pieces_total, v_freight_total, v_discount_total
  FROM public.sales s
  WHERE s.tenant_id = p_tenant_id
    AND s.period_id = p_period_id
    AND s.status = 'CLOSED'
    AND (p_profile_id IS NULL OR s.consultant_profile_id = p_profile_id);

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE v_period_status = 'CLOSED' OR work_day <= LEAST(v_today, v_ends_on)
    )::integer,
    count(*) FILTER (
      WHERE v_period_status = 'OPEN'
        AND work_day >= GREATEST(v_today, v_starts_on)
    )::integer
    INTO v_business_days_total, v_business_days_elapsed, v_business_days_remaining
  FROM (
    SELECT day_value::date AS work_day
    FROM pg_catalog.generate_series(v_starts_on, v_ends_on, interval '1 day') AS day_value
    WHERE extract(isodow FROM day_value) BETWEEN 1 AND 5
      AND NOT EXISTS (
        SELECT 1
        FROM public.sales_holidays sh
        WHERE sh.tenant_id = p_tenant_id AND sh.date = day_value::date
      )
  ) business_calendar;

  SELECT COALESCE(max(sg.target_value), 0)
    INTO v_collective_target
  FROM public.sales_goal_assignments sga
  JOIN public.sales_goals sg
    ON sg.tenant_id = sga.tenant_id AND sg.id = sga.goal_id
  WHERE sga.tenant_id = p_tenant_id
    AND sga.period_id = p_period_id
    AND sga.profile_id IS NULL
    AND sg.scope = 'COLLECTIVE'
    AND sg.is_active;

  IF p_profile_id IS NOT NULL THEN
    SELECT COALESCE(sg.commission_percent, 0)
      INTO v_commission_percent
    FROM public.sales_goal_assignments sga
    JOIN public.sales_goals sg
      ON sg.tenant_id = sga.tenant_id AND sg.id = sga.goal_id
    WHERE sga.tenant_id = p_tenant_id
      AND sga.period_id = p_period_id
      AND sga.profile_id = p_profile_id
      AND sg.scope = 'INDIVIDUAL'
      AND sg.is_active
      AND sg.target_value <= v_realized
    ORDER BY sg.target_value DESC, sg.sort_order DESC, sg.id
    LIMIT 1;
    v_commission_percent := COALESCE(v_commission_percent, 0);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'goal_id', sg.id,
      'name', sg.name,
      'scope', sg.scope,
      'target_value', sg.target_value,
      'progress_percent', CASE
        WHEN sg.target_value = 0 THEN 0
        ELSE round((v_realized / sg.target_value) * 100, 2)
      END,
      'ideal_pace_percent', CASE
        WHEN v_business_days_total = 0 THEN 0
        ELSE round((v_business_days_elapsed::numeric / v_business_days_total::numeric) * 100, 2)
      END,
      'required_per_business_day', CASE
        WHEN v_realized >= sg.target_value THEN 0
        WHEN v_business_days_remaining = 0 THEN NULL
        ELSE round((sg.target_value - v_realized) / v_business_days_remaining::numeric, 2)
      END,
      'commission_percent', sg.commission_percent,
      'is_challenge', sg.is_challenge,
      'sort_order', sg.sort_order
    ) ORDER BY sg.sort_order, sg.target_value, sg.id
  ), '[]'::jsonb)
    INTO v_goals
  FROM public.sales_goal_assignments sga
  JOIN public.sales_goals sg
    ON sg.tenant_id = sga.tenant_id AND sg.id = sga.goal_id
  WHERE sga.tenant_id = p_tenant_id
    AND sga.period_id = p_period_id
    AND sga.profile_id IS NOT DISTINCT FROM p_profile_id
    AND sg.is_active;

  RETURN jsonb_build_object(
    'period_id', p_period_id,
    'profile_id', p_profile_id,
    'as_of', v_today,
    'period_status', v_period_status,
    'realized_value', v_realized,
    'sales_count', v_sales_count,
    'pieces_total', v_pieces_total,
    'freight_total', v_freight_total,
    'discount_total', v_discount_total,
    'business_days_total', v_business_days_total,
    'business_days_elapsed', v_business_days_elapsed,
    'business_days_remaining', v_business_days_remaining,
    'ideal_pace_percent', CASE
      WHEN v_business_days_total = 0 THEN 0
      ELSE round((v_business_days_elapsed::numeric / v_business_days_total::numeric) * 100, 2)
    END,
    'collective_target_value', v_collective_target,
    'collective_percent', CASE
      WHEN v_collective_target = 0 THEN 0
      ELSE round((v_realized / v_collective_target) * 100, 2)
    END,
    'contribution_percent', CASE
      WHEN p_profile_id IS NULL OR v_collective_target = 0 THEN 0
      ELSE round((v_realized / v_collective_target) * 100, 2)
    END,
    'commission_percent', v_commission_percent,
    'commission_value', round(v_realized * v_commission_percent / 100, 2),
    'goals', v_goals
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_my_dashboard_v1(p_period_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_profile uuid := auth.uid();
  v_period uuid;
  v_result jsonb;
BEGIN
  IF public.sales_membership_role() IS NULL THEN
    RAISE EXCEPTION 'sales_access_denied' USING ERRCODE = '42501';
  END IF;
  SELECT sp.id INTO v_period FROM public.sales_periods sp
  WHERE sp.tenant_id = v_tenant AND (p_period_id IS NULL OR sp.id = p_period_id)
  ORDER BY (sp.status = 'OPEN') DESC, sp.starts_on DESC LIMIT 1;

  SELECT public.sales_metrics_v1(v_tenant, v_period, v_profile) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_dashboard_v1(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  SELECT public.sales_metrics_v1(public.auth_tenant_id(), p_period_id, NULL) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_collective_summary_v1(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_team_metrics jsonb;
  v_members jsonb;
BEGIN
  IF public.sales_membership_role() IS NULL THEN
    RAISE EXCEPTION 'sales_access_denied' USING ERRCODE = '42501';
  END IF;
  SELECT public.sales_metrics_v1(v_tenant, p_period_id, NULL) INTO v_team_metrics;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'profile_id', x.profile_id,
    'display_name', x.full_name,
    'contribution_percent', (x.metrics ->> 'contribution_percent')::numeric,
    'position', x.position
  ) ORDER BY x.position), '[]'::jsonb) INTO v_members
  FROM (
    SELECT ranked.profile_id, ranked.full_name, ranked.metrics,
           rank() OVER (ORDER BY (ranked.metrics ->> 'realized_value')::numeric DESC) position
    FROM (
      SELECT p.id profile_id, p.full_name,
             public.sales_metrics_v1(v_tenant, p_period_id, p.id) metrics
      FROM public.sales_memberships sm
      JOIN public.profiles p ON p.id = sm.profile_id AND p.tenant_id = sm.tenant_id
      WHERE sm.tenant_id = v_tenant AND sm.role = 'CONSULTANT' AND sm.is_active
    ) ranked
  ) x;

  RETURN jsonb_build_object(
    'period_id', p_period_id,
    'collective_percent', (v_team_metrics ->> 'collective_percent')::numeric,
    'ideal_pace_percent', (v_team_metrics ->> 'ideal_pace_percent')::numeric,
    'members', v_members
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_tv_snapshot_v1(p_token uuid, p_period_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_period uuid;
  v_metrics jsonb;
BEGIN
  SELECT kt.tenant_id INTO v_tenant FROM public.kiosk_tokens kt
  WHERE kt.token = p_token AND kt.is_active AND kt.scope = 'sales_tv';
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'sales_tv_token_invalid' USING ERRCODE = '42501'; END IF;

  SELECT sp.id INTO v_period FROM public.sales_periods sp
  WHERE sp.tenant_id = v_tenant AND (p_period_id IS NULL OR sp.id = p_period_id)
  ORDER BY (sp.status = 'OPEN') DESC, sp.starts_on DESC LIMIT 1;
  SELECT public.sales_metrics_v1(v_tenant, v_period, NULL) INTO v_metrics;

  RETURN jsonb_build_object(
    'period_id', v_period,
    'collective_percent', (v_metrics ->> 'collective_percent')::numeric,
    'ideal_pace_percent', (v_metrics ->> 'ideal_pace_percent')::numeric,
    'updated_at', now()
  );
END;
$$;

REVOKE ALL ON public.sales_memberships, public.sales_config, public.sales_holidays,
  public.sales_payment_methods, public.sales_periods, public.sales, public.sales_goals,
  public.sales_goal_assignments, public.sales_period_closures, public.sales_celebrations,
  public.sales_audit_events FROM anon;
REVOKE ALL ON FUNCTION public.sales_membership_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_my_access_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_upsert_sale_v1(uuid, uuid, text, numeric, numeric, numeric, uuid, integer, integer, integer, text, public."SalesSaleStatus", timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_cancel_sale_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_close_period_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_claim_celebration_v1(uuid, uuid, uuid, public."SalesCelebrationAudience") FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_metrics_v1(uuid, uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_my_dashboard_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_admin_dashboard_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_collective_summary_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_tv_snapshot_v1(uuid, uuid) FROM PUBLIC;

GRANT SELECT ON public.sales_memberships, public.sales_config, public.sales_holidays,
  public.sales_payment_methods, public.sales_periods, public.sales, public.sales_goals,
  public.sales_goal_assignments, public.sales_period_closures, public.sales_celebrations,
  public.sales_audit_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_membership_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_my_access_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_upsert_sale_v1(uuid, uuid, text, numeric, numeric, numeric, uuid, integer, integer, integer, text, public."SalesSaleStatus", timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_cancel_sale_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_close_period_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_claim_celebration_v1(uuid, uuid, uuid, public."SalesCelebrationAudience") TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_my_dashboard_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_dashboard_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_collective_summary_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_tv_snapshot_v1(uuid, uuid) TO anon, authenticated;

COMMENT ON TABLE public.sales_memberships IS 'Vínculo comercial por tenant, separado do papel global do LISION.';
COMMENT ON TABLE public.sales IS 'Vendas comerciais; cancelamento é auditado e não destrutivo.';
COMMENT ON FUNCTION public.sales_collective_summary_v1(uuid) IS 'DTO sanitizado: percentuais e posições, sem valores financeiros individuais.';
COMMENT ON FUNCTION public.sales_tv_snapshot_v1(uuid, uuid) IS 'Snapshot coletivo sanitizado para kiosk com scope sales_tv.';

COMMIT;
