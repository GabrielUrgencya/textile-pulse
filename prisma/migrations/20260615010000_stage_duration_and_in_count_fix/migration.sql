-- Story 8.18 — Tempo médio por etapa + correção de contagem IN/OUT
-- Aplicada via Supabase Management API em 2026-06-15 (banco coxfzplrsfzbhzuwdfnw).
--
-- Contexto: a Story 8.14 introduziu STAGE_OUT. As funções de dashboard contavam
-- TODOS os scan_events, passando a contar a bipagem de FIM como produção (inflação).
-- Correção: produção conta apenas STAGE_IN. STAGE_OUT serve só para medir tempo.

-- ============================================================
-- RPC 1: dashboard_top_producers — contar apenas STAGE_IN
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
    AND se.event_type = 'STAGE_IN'
  GROUP BY se.user_id, p.full_name
  ORDER BY scan_count DESC
  LIMIT 10;
$$;

-- ============================================================
-- RPC 2: dashboard_chart_data — contar apenas STAGE_IN
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
      AND event_type = 'STAGE_IN'
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
-- RPC 3: dashboard_avg_stage_duration (NOVA)
-- Pareia STAGE_IN -> STAGE_OUT por lote+etapa (n-ésimo IN com n-ésimo OUT)
-- e retorna a média de horas por etapa no período. Considera só pares completos.
-- ============================================================
CREATE OR REPLACE FUNCTION dashboard_avg_stage_duration(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ
)
RETURNS TABLE (
  stage_id UUID,
  stage_name TEXT,
  avg_hours NUMERIC,
  samples BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ordered AS (
    SELECT
      se.lot_id,
      se.stage_id,
      se.event_type,
      se.scanned_at,
      ROW_NUMBER() OVER (
        PARTITION BY se.lot_id, se.stage_id, se.event_type
        ORDER BY se.scanned_at
      ) AS rn
    FROM scan_events se
    WHERE se.event_type IN ('STAGE_IN', 'STAGE_OUT')
      AND se.stage_id IS NOT NULL
  ),
  paired AS (
    SELECT
      i.stage_id,
      EXTRACT(EPOCH FROM (o.scanned_at - i.scanned_at)) / 3600.0 AS hours
    FROM ordered i
    JOIN ordered o
      ON o.lot_id = i.lot_id
     AND o.stage_id = i.stage_id
     AND o.rn = i.rn
     AND o.event_type = 'STAGE_OUT'
    WHERE i.event_type = 'STAGE_IN'
      AND o.scanned_at >= i.scanned_at
      AND i.scanned_at >= from_date
      AND i.scanned_at <= to_date
  )
  SELECT
    p.stage_id,
    s.name AS stage_name,
    ROUND(AVG(p.hours)::numeric, 2) AS avg_hours,
    COUNT(*) AS samples
  FROM paired p
  INNER JOIN stages s ON s.id = p.stage_id
  GROUP BY p.stage_id, s.name
  ORDER BY s.name;
$$;
