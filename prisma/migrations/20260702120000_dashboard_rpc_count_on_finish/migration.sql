-- Story 9.2 — Produção conta no FIM do lote (STAGE_OUT), não no início.
-- Recria as RPCs do dashboard de gestão para contar STAGE_OUT (mantendo a
-- exclusão de OP cancelada da migration 20260630120000).
-- Rollback: reaplicar 20260630120000 (que usa STAGE_IN).

-- ============================================================
-- dashboard_top_producers — quem FINALIZOU lotes (STAGE_OUT)
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
  INNER JOIN lots l ON l.id = se.lot_id
  INNER JOIN production_orders po ON po.id = l.po_id
  WHERE se.scanned_at >= from_date
    AND se.scanned_at <= to_date
    AND se.event_type = 'STAGE_OUT'
    AND po.status <> 'CANCELLED'
  GROUP BY se.user_id, p.full_name
  ORDER BY scan_count DESC
  LIMIT 10;
$$;

-- ============================================================
-- dashboard_chart_data — produção (fim) por período
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
        WHEN group_by = 'hour' THEN to_char(se.scanned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24":00"')
        ELSE to_char(se.scanned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS period,
      COUNT(*) AS cnt
    FROM scan_events se
    INNER JOIN lots l ON l.id = se.lot_id
    INNER JOIN production_orders po ON po.id = l.po_id
    WHERE se.scanned_at >= from_date
      AND se.scanned_at <= to_date
      AND se.event_type = 'STAGE_OUT'
      AND po.status <> 'CANCELLED'
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
