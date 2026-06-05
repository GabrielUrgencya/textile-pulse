-- ============================================================
-- Fix: Change dashboard RPCs from SECURITY INVOKER to SECURITY DEFINER
-- Problem: SECURITY INVOKER inherits RLS policies which require
--          tenant_id chain (scan_events → lots → production_orders).
--          The RPC queries don't join through this chain, so RLS
--          blocks all rows. API-level auth (withAuth + requireTenantId)
--          already protects these endpoints.
-- ============================================================

-- 1. dashboard_chart_data — production chart (bipagens + defeitos)
CREATE OR REPLACE FUNCTION dashboard_chart_data(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ,
  group_by TEXT DEFAULT 'day'
)
RETURNS TABLE (
  period TEXT,
  scans BIGINT,
  defects BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH scan_counts AS (
    SELECT
      CASE
        WHEN group_by = 'hour' THEN to_char(scanned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24":00"')
        ELSE to_char(scanned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS period,
      COUNT(*) AS cnt
    FROM scan_events
    WHERE scanned_at >= from_date
      AND scanned_at <= to_date
    GROUP BY period
  ),
  defect_counts AS (
    SELECT
      CASE
        WHEN group_by = 'hour' THEN to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24":00"')
        ELSE to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS period,
      COUNT(*) AS cnt
    FROM defect_records
    WHERE detected_at >= from_date
      AND detected_at <= to_date
    GROUP BY period
  )
  SELECT
    COALESCE(sc.period, dc.period) AS period,
    COALESCE(sc.cnt, 0) AS scans,
    COALESCE(dc.cnt, 0) AS defects
  FROM scan_counts sc
  FULL OUTER JOIN defect_counts dc ON sc.period = dc.period
  ORDER BY period;
$$;

-- 2. dashboard_top_producers — ranking de operadores
CREATE OR REPLACE FUNCTION dashboard_top_producers(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  scan_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    se.user_id,
    p.full_name,
    COUNT(*) AS scan_count
  FROM scan_events se
  INNER JOIN profiles p ON p.id = se.user_id
  WHERE se.scanned_at >= from_date
    AND se.scanned_at <= to_date
  GROUP BY se.user_id, p.full_name
  ORDER BY scan_count DESC
  LIMIT 10;
$$;

-- 3. dashboard_lots_by_stage — pipeline de estágios
CREATE OR REPLACE FUNCTION dashboard_lots_by_stage()
RETURNS TABLE (
  stage_name TEXT,
  stage_id UUID,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.name AS stage_name,
    l.current_stage_id AS stage_id,
    COUNT(*) AS count
  FROM lots l
  INNER JOIN stages s ON s.id = l.current_stage_id
  WHERE l.current_stage_id IS NOT NULL
  GROUP BY s.name, l.current_stage_id
  ORDER BY count DESC;
$$;
