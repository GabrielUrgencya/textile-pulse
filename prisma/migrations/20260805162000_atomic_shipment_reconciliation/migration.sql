-- Atomic shipment reconciliation: compare-and-set status, mandatory ledger,
-- shipment event and audit in one transaction. Prevents double credit in two tabs.

ALTER TABLE public.faction_ledger
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS "faction_ledger_idempotency_key_unique"
  ON public.faction_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reconcile_shipment_return_v1(
  p_shipment_id uuid,
  p_expected_status text,
  p_counted_ok integer,
  p_counted_defect integer DEFAULT NULL,
  p_use_recorded_defects boolean DEFAULT false,
  p_actor_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := auth_tenant_id();
  v_actor uuid := auth.uid();
  v_role text := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_allowed boolean;
  v_shipment faction_shipments%ROWTYPE;
  v_faction_tenant uuid;
  v_faction_price numeric;
  v_defect integer;
  v_sent integer;
  v_returned integer;
  v_shortage integer;
  v_reconciliation text;
  v_new_status text;
  v_unit_price numeric;
  v_payment numeric(12,2);
  v_deduction numeric(12,2);
  v_payment_status text;
  v_ledger_inserted integer := 0;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE((
    SELECT rp.allowed FROM role_permissions rp
    WHERE rp.tenant_id = v_tenant AND rp.role = v_role AND rp.permission = 'factions:manage'
    LIMIT 1
  ), v_role IN ('ADMIN', 'GERENTE')) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'FACTIONS_MANAGE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_expected_status NOT IN ('RETURN_DECLARED', 'AWAITING_INSPECTION') THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_STATUS';
  END IF;
  IF p_counted_ok IS NULL OR p_counted_ok < 0 OR (p_counted_defect IS NOT NULL AND p_counted_defect < 0) THEN
    RAISE EXCEPTION 'INVALID_COUNT';
  END IF;

  SELECT fs
    INTO v_shipment
  FROM faction_shipments fs
  JOIN factions f ON f.id = fs.faction_id
  WHERE fs.id = p_shipment_id AND f.tenant_id = v_tenant
  FOR UPDATE OF fs;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND';
  END IF;
  SELECT f.tenant_id, f.price_per_piece
    INTO v_faction_tenant, v_faction_price
  FROM factions f
  WHERE f.id = v_shipment.faction_id;
  IF v_shipment.status::text <> p_expected_status THEN
    RAISE EXCEPTION 'SHIPMENT_STATUS_CONFLICT:%', v_shipment.status USING ERRCODE = '40001';
  END IF;

  IF p_use_recorded_defects THEN
    SELECT COALESCE(SUM(quantity), 0)::integer INTO v_defect
    FROM defect_records WHERE shipment_id = p_shipment_id;
  ELSE
    v_defect := COALESCE(p_counted_defect, 0);
  END IF;

  v_sent := COALESCE(v_shipment.quantity_sent, 0);
  v_returned := p_counted_ok + v_defect;
  IF v_returned > v_sent THEN
    RAISE EXCEPTION 'OVER_COUNT:%', v_sent;
  END IF;
  v_shortage := GREATEST(0, v_sent - v_returned);

  IF v_shortage > 0 THEN
    v_reconciliation := 'SHORTAGE';
    v_new_status := 'PARTIALLY_RETURNED';
  ELSIF p_expected_status = 'RETURN_DECLARED'
        AND (p_counted_ok IS DISTINCT FROM COALESCE(v_shipment.declared_ok, 0)
          OR v_defect IS DISTINCT FROM COALESCE(v_shipment.declared_defect, 0)) THEN
    v_reconciliation := 'DISCREPANCY';
    v_new_status := 'PARTIALLY_RETURNED';
  ELSE
    v_reconciliation := 'OK';
    v_new_status := CASE WHEN v_defect > 0 THEN 'PARTIALLY_RETURNED' ELSE 'RETURNED' END;
  END IF;

  v_unit_price := CASE
    WHEN v_shipment.payment_value IS NOT NULL AND v_sent > 0 THEN v_shipment.payment_value / v_sent
    ELSE COALESCE(v_faction_price, 0)
  END;
  v_payment := ROUND(p_counted_ok * v_unit_price, 2);
  v_deduction := ROUND(v_defect * v_unit_price, 2);
  v_payment_status := CASE WHEN v_defect > 0 THEN 'PARTIALLY_RELEASED' ELSE 'RELEASED' END;

  UPDATE faction_shipments SET
    status = v_new_status::"ShipmentStatus",
    quantity_returned = p_counted_ok,
    quantity_defective = v_defect,
    shortage_qty = v_shortage,
    reconciliation_status = v_reconciliation,
    actual_return_at = now(),
    payment_value = v_payment,
    deduction_value = v_deduction,
    released_value = v_payment,
    retained_value = v_deduction,
    payment_status = v_payment_status,
    return_code_attempts = CASE WHEN p_expected_status = 'RETURN_DECLARED' THEN 0 ELSE return_code_attempts END,
    received_by = v_actor,
    updated_at = now()
  WHERE id = p_shipment_id AND status::text = p_expected_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIPMENT_STATUS_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF v_payment > 0 THEN
    INSERT INTO faction_ledger (
      tenant_id, faction_id, shipment_id, entry_type, amount,
      description, created_by, idempotency_key
    ) VALUES (
      v_tenant, v_shipment.faction_id, p_shipment_id, 'PAYMENT', v_payment,
      'Reconciliação atômica da devolução — ' || p_counted_ok || ' peças boas',
      v_actor, 'shipment-reconcile:' || p_shipment_id::text
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_ledger_inserted = ROW_COUNT;
    IF v_ledger_inserted <> 1 THEN
      RAISE EXCEPTION 'LEDGER_IDEMPOTENCY_CONFLICT';
    END IF;
  END IF;

  INSERT INTO shipment_events (
    tenant_id, shipment_id, event_type, actor_type, actor_name, visible_to_faction, payload
  ) VALUES (
    v_tenant, p_shipment_id, 'RECONCILED', 'ADMIN', p_actor_name, true,
    jsonb_build_object(
      'ok', p_counted_ok, 'defective', v_defect, 'shortage', v_shortage,
      'reconciliation_status', v_reconciliation, 'status', v_new_status,
      'atomic', true
    )
  );

  INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    v_tenant, v_actor, 'SHIPMENT_RECONCILED', 'faction_shipment', p_shipment_id::text,
    jsonb_build_object(
      'expected_status', p_expected_status, 'new_status', v_new_status,
      'counted_ok', p_counted_ok, 'counted_defect', v_defect,
      'released_value', v_payment, 'retained_value', v_deduction,
      'atomic', true
    )
  );

  RETURN jsonb_build_object(
    'status', v_new_status,
    'reconciliationStatus', v_reconciliation,
    'shortageQty', v_shortage,
    'countedOk', p_counted_ok,
    'countedDefect', v_defect,
    'paymentValue', v_payment,
    'releasedValue', v_payment,
    'retainedValue', v_deduction,
    'paymentStatus', v_payment_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_shipment_inspection_v1(
  p_shipment_id uuid,
  p_actor_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := auth_tenant_id();
  v_actor uuid := auth.uid();
  v_role text := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_allowed boolean;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE((
    SELECT rp.allowed FROM role_permissions rp
    WHERE rp.tenant_id = v_tenant AND rp.role = v_role AND rp.permission = 'factions:manage'
    LIMIT 1
  ), v_role IN ('ADMIN', 'GERENTE')) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'FACTIONS_MANAGE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE faction_shipments fs SET
    status = 'AWAITING_INSPECTION', actual_return_at = now(),
    return_code_attempts = 0, received_by = v_actor, updated_at = now()
  FROM factions f
  WHERE fs.id = p_shipment_id
    AND fs.faction_id = f.id AND f.tenant_id = v_tenant
    AND fs.status = 'RETURN_DECLARED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIPMENT_STATUS_CONFLICT' USING ERRCODE = '40001';
  END IF;

  INSERT INTO shipment_events (
    tenant_id, shipment_id, event_type, actor_type, actor_name, visible_to_faction, payload
  ) VALUES (
    v_tenant, p_shipment_id, 'RECEIVED', 'ADMIN', p_actor_name, true,
    jsonb_build_object('status', 'AWAITING_INSPECTION', 'mode', 'hold_for_inspection', 'atomic', true)
  );
  INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    v_tenant, v_actor, 'SHIPMENT_HELD_FOR_INSPECTION', 'faction_shipment', p_shipment_id::text,
    jsonb_build_object('from', 'RETURN_DECLARED', 'to', 'AWAITING_INSPECTION', 'atomic', true)
  );
  RETURN jsonb_build_object('status', 'AWAITING_INSPECTION');
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_shipment_return_v1(uuid, text, integer, integer, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hold_shipment_inspection_v1(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_shipment_return_v1(uuid, text, integer, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hold_shipment_inspection_v1(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reconcile_shipment_return_v1(uuid, text, integer, integer, boolean, text) IS
  'Atomic CAS reconciliation with mandatory unique ledger credit, shipment event and audit.';
COMMENT ON FUNCTION public.hold_shipment_inspection_v1(uuid, text) IS
  'Atomic CAS RETURN_DECLARED to AWAITING_INSPECTION with mandatory event and audit.';
