-- Atomic shipment creation for one or many lots. The shipment rows, lot
-- junctions, timeline events and audit entry commit together.

CREATE OR REPLACE FUNCTION public.create_faction_shipments_atomic_v1(
  p_faction_id uuid,
  p_lot_ids uuid[],
  p_expected_return timestamptz,
  p_price_per_piece numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_grouped boolean DEFAULT false,
  p_delivery_codes text[] DEFAULT NULL,
  p_delivery_code_expires_at timestamptz[] DEFAULT NULL,
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
  v_group_id uuid;
  v_lot_id uuid;
  v_lot_quantity integer;
  v_po_status text;
  v_po_number text;
  v_shipment_id uuid;
  v_first_shipment_id uuid;
  v_code text;
  v_code_expires_at timestamptz;
  v_shipments jsonb := '[]'::jsonb;
  v_total_quantity integer := 0;
  v_count integer;
  v_i integer;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE((
    SELECT rp.allowed
    FROM role_permissions rp
    WHERE rp.tenant_id = v_tenant
      AND rp.role = v_role
      AND rp.permission = 'factions:manage'
    LIMIT 1
  ), v_role IN ('ADMIN', 'GERENTE')) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'FACTIONS_MANAGE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_count := COALESCE(cardinality(p_lot_ids), 0);
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'INVALID_LOT_COUNT';
  END IF;
  IF p_expected_return IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_RETURN_REQUIRED';
  END IF;
  IF p_price_per_piece IS NOT NULL AND p_price_per_piece < 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_lot_ids) AS x) <> v_count
     OR array_position(p_lot_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_OR_NULL_LOT';
  END IF;
  IF p_delivery_codes IS NOT NULL AND cardinality(p_delivery_codes) <> v_count THEN
    RAISE EXCEPTION 'DELIVERY_CODE_COUNT_MISMATCH';
  END IF;
  IF p_delivery_code_expires_at IS NOT NULL
     AND cardinality(p_delivery_code_expires_at) <> v_count THEN
    RAISE EXCEPTION 'DELIVERY_CODE_EXPIRY_COUNT_MISMATCH';
  END IF;

  PERFORM 1
  FROM factions f
  WHERE f.id = p_faction_id AND f.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FACTION_NOT_FOUND';
  END IF;

  -- A stable lock order prevents two concurrent requests from assigning the
  -- same lot and avoids deadlocks for overlapping grouped requests.
  PERFORM pg_advisory_xact_lock(hashtextextended('shipment-lot:' || x::text, 0))
  FROM unnest(p_lot_ids) AS x
  ORDER BY x;

  v_group_id := CASE WHEN p_grouped AND v_count > 1 THEN gen_random_uuid() ELSE NULL END;

  FOR v_i IN 1..v_count LOOP
    v_lot_id := p_lot_ids[v_i];
    v_code := CASE WHEN p_delivery_codes IS NULL THEN NULL ELSE p_delivery_codes[v_i] END;
    v_code_expires_at := CASE
      WHEN p_delivery_code_expires_at IS NULL THEN NULL
      ELSE p_delivery_code_expires_at[v_i]
    END;

    SELECT COALESCE(l.quantity, 0), po.status::text, po.op_number
      INTO v_lot_quantity, v_po_status, v_po_number
    FROM lots l
    JOIN production_orders po ON po.id = l.po_id
    WHERE l.id = v_lot_id AND po.tenant_id = v_tenant
    FOR UPDATE OF l;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LOT_NOT_FOUND:%', v_lot_id;
    END IF;
    IF v_po_status NOT IN ('OPEN', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'LOT_PO_NOT_ELIGIBLE:%:%', COALESCE(v_po_number, v_lot_id::text), v_po_status;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM faction_shipments fs
      JOIN factions f ON f.id = fs.faction_id
      WHERE fs.lot_id = v_lot_id
        AND f.tenant_id = v_tenant
        AND fs.status::text IN (
          'PREPARING', 'SENT', 'RECEIVED_BY_FACTION', 'RETURN_DECLARED',
          'AWAITING_INSPECTION', 'PARTIALLY_RETURNED', 'OVERDUE'
        )
    ) THEN
      RAISE EXCEPTION 'LOT_ALREADY_IN_ACTIVE_SHIPMENT:%', v_lot_id USING ERRCODE = '23505';
    END IF;

    INSERT INTO faction_shipments (
      tenant_id, faction_id, lot_id, status, quantity_sent,
      shipment_group_id, payment_value, total_quantity, sent_at,
      expected_return_at, expected_return, notes,
      delivery_code, delivery_code_expires_at, sent_by
    ) VALUES (
      v_tenant, p_faction_id, v_lot_id, 'SENT', v_lot_quantity,
      v_group_id,
      CASE WHEN p_price_per_piece IS NULL THEN NULL
           ELSE ROUND(p_price_per_piece * v_lot_quantity, 2) END,
      v_lot_quantity, now(), p_expected_return, p_expected_return, p_notes,
      NULLIF(v_code, ''), v_code_expires_at, v_actor
    )
    RETURNING id INTO v_shipment_id;

    IF v_first_shipment_id IS NULL THEN
      v_first_shipment_id := v_shipment_id;
    END IF;

    INSERT INTO shipment_lots (shipment_id, lot_id, quantity)
    VALUES (v_shipment_id, v_lot_id, v_lot_quantity);

    INSERT INTO shipment_events (
      tenant_id, shipment_id, event_type, actor_type, actor_name,
      visible_to_faction, payload
    ) VALUES (
      v_tenant, v_shipment_id, 'CREATED', 'ADMIN', p_actor_name, true,
      jsonb_build_object(
        'quantity', v_lot_quantity,
        'faction_id', p_faction_id,
        'shipment_group_id', v_group_id,
        'atomic', true
      )
    );

    v_shipments := v_shipments || jsonb_build_array(jsonb_build_object(
      'id', v_shipment_id,
      'lot_id', v_lot_id,
      'delivery_code', NULLIF(v_code, '')
    ));
    v_total_quantity := v_total_quantity + v_lot_quantity;
  END LOOP;

  INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    v_tenant,
    v_actor,
    CASE WHEN v_group_id IS NULL THEN 'SHIPMENT_CREATED' ELSE 'SHIPMENT_GROUP_CREATED' END,
    CASE WHEN v_group_id IS NULL THEN 'faction_shipment' ELSE 'shipment_group' END,
    COALESCE(v_group_id, v_first_shipment_id)::text,
    jsonb_build_object(
      'faction_id', p_faction_id,
      'shipment_group_id', v_group_id,
      'shipment_count', v_count,
      'total_quantity', v_total_quantity,
      'lot_ids', to_jsonb(p_lot_ids),
      'status', 'SENT',
      'atomic', true
    )
  );

  RETURN jsonb_build_object(
    'shipments', v_shipments,
    'count', v_count,
    'shipment_group_id', v_group_id,
    'total_quantity', v_total_quantity,
    'status_counts', jsonb_build_object('SENT', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_faction_shipments_atomic_v1(
  uuid, uuid[], timestamptz, numeric, text, boolean, text[], timestamptz[], text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_faction_shipments_atomic_v1(
  uuid, uuid[], timestamptz, numeric, text, boolean, text[], timestamptz[], text
) TO authenticated;

COMMENT ON FUNCTION public.create_faction_shipments_atomic_v1(
  uuid, uuid[], timestamptz, numeric, text, boolean, text[], timestamptz[], text
) IS 'Atomic tenant-scoped creation of individual/grouped faction shipments, lot junctions, CREATED events and mandatory audit.';
