-- Canonical server-side production aggregation.
-- Replaces client-side scan_events reductions that are truncated by PostgREST's
-- row limit. One JSONB row carries stage/user/hour/timing/stock aggregates.

CREATE INDEX IF NOT EXISTS "idx_scan_events_kpi_stage_time"
  ON "scan_events" ("stage_id", "event_type", "scanned_at", "lot_id")
  WHERE "disregarded_at" IS NULL;

CREATE OR REPLACE FUNCTION public.production_aggregates_v1(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_stage_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_timezone text DEFAULT 'America/Sao_Paulo'
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH
tenant_guard AS MATERIALIZED (
  -- Authenticated callers cannot select a different tenant even if they forge
  -- the RPC argument. service_role is reserved for server jobs, which must
  -- resolve the tenant before invoking this function.
  SELECT 1
  WHERE p_tenant_id = auth_tenant_id() OR auth.role() = 'service_role'
),
valid_out AS (
  SELECT
    se.id,
    se.lot_id,
    se.stage_id,
    se.user_id,
    se.scanned_at,
    l.quantity::numeric AS quantity,
    po.meta_coefficient::numeric AS po_coefficient,
    (l.quantity::numeric * COALESCE(rst.coefficient, 1::numeric)) AS weighted
  FROM scan_events se
  CROSS JOIN tenant_guard
  JOIN lots l ON l.id = se.lot_id
  JOIN production_orders po ON po.id = l.po_id
  JOIN stages stg ON stg.id = se.stage_id AND stg.tenant_id = p_tenant_id
  LEFT JOIN reference_stage_targets rst
    ON rst.tenant_id = p_tenant_id
   AND rst.stage_id = se.stage_id
   AND rst.reference = po.reference
  WHERE po.tenant_id = p_tenant_id
    AND po.status <> 'CANCELLED'
    AND se.event_type = 'STAGE_OUT'
    AND se.disregarded_at IS NULL
    AND se.scanned_at >= p_from
    AND se.scanned_at <= p_to
    AND (p_stage_id IS NULL OR se.stage_id = p_stage_id)
    AND (p_user_id IS NULL OR se.user_id = p_user_id)
),
stage_first AS (
  SELECT DISTINCT ON (stage_id, lot_id)
    stage_id, lot_id, user_id, scanned_at, quantity, po_coefficient, weighted
  FROM valid_out
  ORDER BY stage_id, lot_id, scanned_at, id
),
user_first AS (
  SELECT DISTINCT ON (stage_id, user_id, lot_id)
    stage_id, user_id, lot_id, scanned_at, weighted
  FROM valid_out
  ORDER BY stage_id, user_id, lot_id, scanned_at, id
),
valid_in AS (
  SELECT se.id, se.lot_id, se.stage_id, se.user_id, se.scanned_at
  FROM scan_events se
  CROSS JOIN tenant_guard
  JOIN lots l ON l.id = se.lot_id
  JOIN production_orders po ON po.id = l.po_id
  JOIN stages stg ON stg.id = se.stage_id AND stg.tenant_id = p_tenant_id
  WHERE po.tenant_id = p_tenant_id
    AND po.status <> 'CANCELLED'
    AND se.event_type = 'STAGE_IN'
    AND se.disregarded_at IS NULL
    AND se.scanned_at >= p_from
    AND se.scanned_at <= p_to
    AND (p_stage_id IS NULL OR se.stage_id = p_stage_id)
    AND (p_user_id IS NULL OR se.user_id = p_user_id)
),
stage_in_first AS (
  SELECT DISTINCT ON (stage_id, lot_id) stage_id, lot_id, scanned_at
  FROM valid_in
  ORDER BY stage_id, lot_id, scanned_at, id
),
user_in_first AS (
  SELECT DISTINCT ON (stage_id, user_id, lot_id) stage_id, user_id, lot_id, scanned_at
  FROM valid_in
  ORDER BY stage_id, user_id, lot_id, scanned_at, id
),
stage_totals AS (
  SELECT stage_id, ROUND(SUM(weighted), 1) AS produced, COUNT(*)::bigint AS lots
  FROM stage_first GROUP BY stage_id
),
user_totals AS (
  SELECT uf.stage_id, uf.user_id, p.full_name, ROUND(SUM(uf.weighted), 1) AS produced, COUNT(*)::bigint AS lots
  FROM user_first uf
  LEFT JOIN profiles p ON p.id = uf.user_id AND p.tenant_id = p_tenant_id
  GROUP BY uf.stage_id, uf.user_id, p.full_name
),
hourly_stage AS (
  SELECT
    stage_id,
    EXTRACT(HOUR FROM timezone(p_timezone, scanned_at))::integer AS hour_local,
    ROUND(SUM(weighted), 1) AS produced
  FROM stage_first
  GROUP BY stage_id, EXTRACT(HOUR FROM timezone(p_timezone, scanned_at))
),
stage_timing AS (
  SELECT
    i.stage_id,
    MIN(i.scanned_at) AS first_in_at,
    ROUND(AVG(EXTRACT(EPOCH FROM (o.scanned_at - i.scanned_at)) / 60.0)::numeric, 1) AS avg_per_lot_min
  FROM stage_in_first i
  LEFT JOIN stage_first o
    ON o.stage_id = i.stage_id AND o.lot_id = i.lot_id AND o.scanned_at >= i.scanned_at
  GROUP BY i.stage_id
),
user_timing AS (
  SELECT
    i.stage_id,
    i.user_id,
    MIN(i.scanned_at) AS first_in_at,
    ROUND(AVG(EXTRACT(EPOCH FROM (o.scanned_at - i.scanned_at)) / 60.0)::numeric, 1) AS avg_per_lot_min
  FROM user_in_first i
  LEFT JOIN user_first o
    ON o.stage_id = i.stage_id AND o.user_id = i.user_id
   AND o.lot_id = i.lot_id AND o.scanned_at >= i.scanned_at
  GROUP BY i.stage_id, i.user_id
),
stock_total AS (
  SELECT
    COALESCE(SUM(sf.quantity), 0)::numeric AS pieces,
    ROUND(COALESCE(SUM(sf.quantity * COALESCE(sf.po_coefficient, 1)), 0), 1) AS weighted
  FROM stage_first sf
  JOIN stages stg ON stg.id = sf.stage_id AND stg.tenant_id = p_tenant_id
  WHERE stg.name = 'ESTOQUE'
)
SELECT jsonb_build_object(
  'stage_totals', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('stage_id', stage_id, 'produced', produced, 'lots', lots) ORDER BY stage_id)
    FROM stage_totals
  ), '[]'::jsonb),
  'user_totals', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('stage_id', stage_id, 'user_id', user_id, 'full_name', full_name, 'produced', produced, 'lots', lots) ORDER BY produced DESC, user_id)
    FROM user_totals
  ), '[]'::jsonb),
  'hourly_stage', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('stage_id', stage_id, 'hour_local', hour_local, 'produced', produced) ORDER BY stage_id, hour_local)
    FROM hourly_stage
  ), '[]'::jsonb),
  'stage_timing', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('stage_id', stage_id, 'first_in_at', first_in_at, 'avg_per_lot_min', avg_per_lot_min) ORDER BY stage_id)
    FROM stage_timing
  ), '[]'::jsonb),
  'user_timing', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('stage_id', stage_id, 'user_id', user_id, 'first_in_at', first_in_at, 'avg_per_lot_min', avg_per_lot_min) ORDER BY stage_id, user_id)
    FROM user_timing
  ), '[]'::jsonb),
  'stock', (SELECT jsonb_build_object('pieces', pieces, 'weighted', weighted) FROM stock_total)
);
$$;

REVOKE ALL ON FUNCTION public.production_aggregates_v1(uuid, timestamptz, timestamptz, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.production_aggregates_v1(uuid, timestamptz, timestamptz, uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.production_aggregates_v1(uuid, timestamptz, timestamptz, uuid, uuid, text) IS
  'Canonical tenant-scoped weighted production aggregation. STAGE_OUT, disregarded/cancelled excluded, deterministic dedupe, no PostgREST row-limit truncation.';
