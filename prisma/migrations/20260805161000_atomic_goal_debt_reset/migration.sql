-- Atomic, concurrency-safe debt reset for USER and SECTOR scopes.
-- All requested periods and the mandatory audit row commit or roll back together.

CREATE OR REPLACE FUNCTION public.reset_goal_debts_atomic_v1(
  p_scope text,
  p_entity_id uuid,
  p_period_types text[],
  p_period_references date[],
  p_carried_to date,
  p_context jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := auth_tenant_id();
  v_actor uuid := auth.uid();
  v_role text := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_allowed boolean := false;
  v_index integer;
  v_period text;
  v_reference date;
  v_row_id uuid;
  v_old_deficit integer;
  v_cleared jsonb := '{}'::jsonb;
  v_refs jsonb := '{}'::jsonb;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT (v_role = 'ADMIN') OR COALESCE((
    SELECT rp.allowed
    FROM role_permissions rp
    WHERE rp.tenant_id = v_tenant
      AND rp.role = v_role
      AND rp.permission = 'settings:manage'
    LIMIT 1
  ), false) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'SETTINGS_MANAGE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  p_scope := UPPER(COALESCE(p_scope, ''));
  IF p_scope NOT IN ('USER', 'SECTOR') THEN
    RAISE EXCEPTION 'INVALID_SCOPE';
  END IF;
  IF p_entity_id IS NULL OR p_carried_to IS NULL
     OR COALESCE(array_length(p_period_types, 1), 0) NOT BETWEEN 1 AND 3
     OR array_length(p_period_types, 1) IS DISTINCT FROM array_length(p_period_references, 1) THEN
    RAISE EXCEPTION 'INVALID_PERIOD_PAYLOAD';
  END IF;
  IF (SELECT COUNT(DISTINCT x) FROM unnest(p_period_types) x) <> array_length(p_period_types, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_PERIOD';
  END IF;

  IF p_scope = 'USER' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_entity_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'TARGET_NOT_IN_TENANT';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM stages WHERE id = p_entity_id AND tenant_id = v_tenant) THEN
      RAISE EXCEPTION 'TARGET_NOT_IN_TENANT';
    END IF;
  END IF;

  FOR v_index IN 1..array_length(p_period_types, 1) LOOP
    v_period := LOWER(p_period_types[v_index]);
    v_reference := p_period_references[v_index];
    IF v_period NOT IN ('daily', 'weekly', 'monthly') OR v_reference IS NULL THEN
      RAISE EXCEPTION 'INVALID_PERIOD';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'goal-debt-reset:' || v_tenant::text || ':' || p_scope || ':' || p_entity_id::text || ':' || v_period || ':' || v_reference::text,
      0
    ));

    IF p_scope = 'USER' THEN
      INSERT INTO goal_deficits (
        tenant_id, scope, user_id, stage_id, period_type, period_reference,
        base_goal, produced, deficit, carried_to
      ) VALUES (
        v_tenant, 'USER', p_entity_id, NULL, v_period, v_reference,
        0, 0, 0, p_carried_to
      ) ON CONFLICT (user_id, period_type, period_reference) DO NOTHING;

      SELECT id, deficit INTO STRICT v_row_id, v_old_deficit
      FROM goal_deficits
      WHERE tenant_id = v_tenant AND scope = 'USER' AND user_id = p_entity_id
        AND period_type = v_period AND period_reference = v_reference
      FOR UPDATE;
    ELSE
      INSERT INTO goal_deficits (
        tenant_id, scope, user_id, stage_id, period_type, period_reference,
        base_goal, produced, deficit, carried_to
      ) VALUES (
        v_tenant, 'SECTOR', NULL, p_entity_id, v_period, v_reference,
        0, 0, 0, p_carried_to
      ) ON CONFLICT (tenant_id, stage_id, period_type, period_reference) DO NOTHING;

      SELECT id, deficit INTO STRICT v_row_id, v_old_deficit
      FROM goal_deficits
      WHERE tenant_id = v_tenant AND scope = 'SECTOR' AND stage_id = p_entity_id
        AND period_type = v_period AND period_reference = v_reference
      FOR UPDATE;
    END IF;

    UPDATE goal_deficits
    SET deficit = 0, carried_to = p_carried_to
    WHERE id = v_row_id;

    v_cleared := v_cleared || jsonb_build_object(v_period, COALESCE(v_old_deficit, 0));
    v_refs := v_refs || jsonb_build_object(v_period, v_reference);
  END LOOP;

  INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    v_tenant,
    v_actor,
    CASE WHEN p_scope = 'USER' THEN 'GOAL_MANUAL_RESET' ELSE 'SECTOR_DEBT_RESET' END,
    'goal_deficit',
    p_entity_id::text,
    COALESCE(p_context, '{}'::jsonb) || jsonb_build_object(
      'scope', p_scope,
      'cleared', v_cleared,
      'period_references', v_refs,
      'atomic', true
    )
  );

  RETURN jsonb_build_object(
    'scope', p_scope,
    'entity_id', p_entity_id,
    'periods', to_jsonb(p_period_types),
    'cleared', v_cleared,
    'period_references', v_refs,
    'deficit', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_goal_debts_atomic_v1(text, uuid, text[], date[], date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_goal_debts_atomic_v1(text, uuid, text[], date[], date, jsonb) TO authenticated;

COMMENT ON FUNCTION public.reset_goal_debts_atomic_v1(text, uuid, text[], date[], date, jsonb) IS
  'Atomic USER/SECTOR debt reset for one or multiple periods. Tenant/auth checked; audit_log is mandatory in the same transaction.';
