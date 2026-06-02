-- ============================================================
-- Migration: Dashboard RPC Functions for Performance
-- Purpose: Replace full-table-scan queries with server-side
--          aggregation to eliminate ~3-4s latency on dashboard
-- ============================================================

-- ============================================================
-- RPC 1: dashboard_lots_by_stage
-- Replaces: SELECT all lots + JOIN stages → count in JS
-- Returns: stage_name, stage_id, count (aggregated in DB)
-- ============================================================
CREATE OR REPLACE FUNCTION dashboard_lots_by_stage()
RETURNS TABLE (
  stage_name TEXT,
  stage_id UUID,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
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

-- ============================================================
-- RPC 2: dashboard_top_producers
-- Replaces: SELECT all scan_events + JOIN profiles → group in JS
-- Returns: user_id, full_name, scan_count (top 10 by volume)
-- ============================================================
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
SECURITY INVOKER
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

-- ============================================================
-- RPC 3: dashboard_chart_data
-- Replaces: SELECT all scan_events + defect_records → group in JS
-- Returns: period (text), scans (count), defects (count)
-- Supports grouping by 'hour' or 'day'
-- ============================================================
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
SECURITY INVOKER
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

-- ============================================================
-- Verify functions were created
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Dashboard RPC functions created successfully:';
  RAISE NOTICE '  - dashboard_lots_by_stage()';
  RAISE NOTICE '  - dashboard_top_producers(from_date, to_date)';
  RAISE NOTICE '  - dashboard_chart_data(from_date, to_date, group_by)';
END $$;
