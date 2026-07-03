-- SECURITY FIX (CRITICAL) — dashboard_lots_by_stage vazava dados entre tenants.
-- A função era SECURITY DEFINER sem filtro de tenant: qualquer tenant novo via
-- o pipeline de lotes de OUTROS tenants no dashboard.
-- Correção: SECURITY INVOKER (RLS volta a valer) + filtro explícito por
-- auth_tenant_id() na cadeia lots→production_orders (defesa em profundidade).
-- Mantém a exclusão de OP cancelada (20260630120000).

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
  INNER JOIN production_orders po ON po.id = l.po_id
  WHERE l.current_stage_id IS NOT NULL
    AND po.status <> 'CANCELLED'
    AND po.tenant_id = auth_tenant_id()
  GROUP BY s.name, l.current_stage_id
  ORDER BY count DESC;
$$;
