BEGIN;

DO $$BEGIN
  IF pg_catalog.to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
     OR pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'sales_tv_kiosk_v2_requires_pgcrypto';
  END IF;
END;$$;

CREATE TABLE public.sales_tv_kiosk_credentials (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  scope text NOT NULL DEFAULT 'sales_tv' CHECK (scope='sales_tv'),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation>0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  rotated_from_id uuid REFERENCES public.sales_tv_kiosk_credentials(id) ON DELETE SET NULL,
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_tv_kiosk_credentials_actor_tenant_fk FOREIGN KEY(tenant_id,created_by_id) REFERENCES public.profiles(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT sales_tv_kiosk_credentials_expiry_check CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX sales_tv_kiosk_one_active_per_tenant ON public.sales_tv_kiosk_credentials(tenant_id,scope) WHERE revoked_at IS NULL;
CREATE INDEX sales_tv_kiosk_credentials_lookup ON public.sales_tv_kiosk_credentials(token_hash) WHERE revoked_at IS NULL;

CREATE TABLE public.sales_tv_kiosk_deliveries (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES public.sales_tv_kiosk_credentials(id) ON DELETE CASCADE,
  period_id uuid NOT NULL,
  milestone_key text NOT NULL CHECK(milestone_key IN('COLLECTIVE')),
  audience public."SalesCelebrationAudience" NOT NULL DEFAULT 'TV' CHECK(audience='TV'),
  receipt_hash bytea NOT NULL CHECK(octet_length(receipt_hash)=32),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  CONSTRAINT sales_tv_kiosk_deliveries_period_fk FOREIGN KEY(tenant_id,period_id) REFERENCES public.sales_periods(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,period_id,milestone_key,audience),
  UNIQUE(credential_id,period_id,milestone_key,receipt_hash)
);

ALTER TABLE public.sales_tv_kiosk_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_tv_kiosk_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales_tv_kiosk_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_tv_kiosk_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_tv_kiosk_credentials,public.sales_tv_kiosk_deliveries FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.sales_tv_kiosk_admin_create_v2(p_name text,p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_raw text;v_id uuid;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
  IF length(btrim(COALESCE(p_name,'')))NOT BETWEEN 1 AND 120 OR p_expires_at IS NULL OR p_expires_at<=now() OR p_expires_at>now()+interval '1 year' THEN RAISE EXCEPTION 'sales_tv_kiosk_validation' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-tv-kiosk',0));
  UPDATE public.sales_tv_kiosk_credentials SET revoked_at=expires_at,updated_at=now()WHERE tenant_id=v_tenant AND revoked_at IS NULL AND expires_at<=now();
  IF EXISTS(SELECT 1 FROM public.sales_tv_kiosk_credentials c WHERE c.tenant_id=v_tenant AND c.revoked_at IS NULL)THEN RAISE EXCEPTION 'sales_tv_kiosk_active_exists' USING ERRCODE='23505';END IF;
  v_raw:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.sales_tv_kiosk_credentials(tenant_id,token_hash,name,expires_at,created_by_id)VALUES(v_tenant,extensions.digest(convert_to(v_raw,'UTF8'),'sha256'),btrim(p_name),p_expires_at,v_actor)RETURNING id INTO v_id;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)VALUES(v_tenant,v_actor,'SALES_TV_KIOSK_CREATED','sales_tv_kiosk_credential',v_id,jsonb_build_object('scope','sales_tv','expires_at',p_expires_at,'secret_recorded',false));
  RETURN jsonb_build_object('credential_id',v_id,'token',v_raw,'expires_at',p_expires_at);
END;$$;

CREATE FUNCTION public.sales_tv_kiosk_admin_rotate_v2(p_credential_id uuid,p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_old public.sales_tv_kiosk_credentials%ROWTYPE;v_raw text;v_id uuid;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
  IF p_credential_id IS NULL OR p_expires_at IS NULL OR p_expires_at<=now() OR p_expires_at>now()+interval '1 year' THEN RAISE EXCEPTION 'sales_tv_kiosk_validation' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-tv-kiosk',0));
  SELECT * INTO v_old FROM public.sales_tv_kiosk_credentials c WHERE c.tenant_id=v_tenant AND c.id=p_credential_id AND c.revoked_at IS NULL FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
  UPDATE public.sales_tv_kiosk_credentials SET revoked_at=now(),updated_at=now()WHERE id=v_old.id;
  v_raw:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.sales_tv_kiosk_credentials(tenant_id,token_hash,name,generation,expires_at,rotated_from_id,created_by_id)VALUES(v_tenant,extensions.digest(convert_to(v_raw,'UTF8'),'sha256'),v_old.name,v_old.generation+1,p_expires_at,v_old.id,v_actor)RETURNING id INTO v_id;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)VALUES(v_tenant,v_actor,'SALES_TV_KIOSK_ROTATED','sales_tv_kiosk_credential',v_id,jsonb_build_object('previous_credential_id',v_old.id,'generation',v_old.generation+1,'expires_at',p_expires_at,'secret_recorded',false));
  RETURN jsonb_build_object('credential_id',v_id,'token',v_raw,'expires_at',p_expires_at);
END;$$;

CREATE FUNCTION public.sales_tv_kiosk_admin_revoke_v2(p_credential_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_changed integer;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-tv-kiosk',0));
  UPDATE public.sales_tv_kiosk_credentials SET revoked_at=COALESCE(revoked_at,now()),updated_at=now()WHERE tenant_id=v_tenant AND id=p_credential_id AND revoked_at IS NULL;GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed=0 THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)VALUES(v_tenant,v_actor,'SALES_TV_KIOSK_REVOKED','sales_tv_kiosk_credential',p_credential_id,jsonb_build_object('scope','sales_tv','secret_recorded',false));
  RETURN jsonb_build_object('revoked',true);
END;$$;

CREATE FUNCTION public.sales_tv_kiosk_admin_status_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_status jsonb;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
  SELECT jsonb_build_object('active',true,'credential_id',c.id,'name',c.name,'generation',c.generation,'expires_at',c.expires_at,'created_at',c.created_at,'updated_at',c.updated_at)INTO v_status FROM public.sales_tv_kiosk_credentials c WHERE c.tenant_id=v_tenant AND c.scope='sales_tv'AND c.revoked_at IS NULL AND c.expires_at>now()ORDER BY c.generation DESC LIMIT 1;
  RETURN COALESCE(v_status,jsonb_build_object('active',false));
END;$$;

CREATE FUNCTION public.sales_tv_kiosk_snapshot_v2(p_token text,p_period_key text DEFAULT NULL,p_receipt text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_lookup_tenant uuid;v_credential public.sales_tv_kiosk_credentials%ROWTYPE;v_period uuid;v_start date;v_end date;v_metrics jsonb;v_previous uuid;v_previous_metrics jsonb;v_percent numeric:=0;v_previous_percent numeric:=0;v_goal_key text;v_receipt_hash bytea;v_claimed integer:=0;v_acknowledged integer:=0;
BEGIN
  IF p_token IS NULL OR p_token!~'^[0-9a-f]{64}$' OR(p_period_key IS NOT NULL AND p_period_key!~'^[0-9a-f]{64}$')OR(p_receipt IS NOT NULL AND p_receipt!~'^[0-9a-f]{64}$')THEN RETURN jsonb_build_object('available',false);END IF;
  SELECT c.tenant_id INTO v_lookup_tenant FROM public.sales_tv_kiosk_credentials c WHERE c.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256');
  IF v_lookup_tenant IS NULL THEN RETURN jsonb_build_object('available',false);END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(v_lookup_tenant::text||':sales-tv-kiosk',0));
  SELECT c.* INTO v_credential FROM public.sales_tv_kiosk_credentials c WHERE c.tenant_id=v_lookup_tenant AND c.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256')AND c.scope='sales_tv'AND c.revoked_at IS NULL AND c.expires_at>now();
  IF v_credential.id IS NULL THEN RETURN jsonb_build_object('available',false);END IF;
  SELECT sp.id,sp.starts_on,sp.ends_on INTO v_period,v_start,v_end FROM public.sales_periods sp WHERE sp.tenant_id=v_credential.tenant_id AND(p_period_key IS NULL OR public.sales_collective_period_key_v1(v_credential.tenant_id,sp.id)=p_period_key)ORDER BY(sp.status='OPEN')DESC,sp.starts_on DESC LIMIT 1;
  IF v_period IS NULL THEN RETURN jsonb_build_object('available',true,'empty',true,'refresh_after_seconds',30,'identity_key',encode(extensions.digest(v_credential.token_hash||convert_to('sales_tv','UTF8'),'sha256'),'hex'));END IF;
  v_metrics:=public.sales_metrics_internal_v1(v_credential.tenant_id,v_period,NULL,NULL);v_percent:=COALESCE((v_metrics->>'collective_percent')::numeric,0);
  SELECT sp.id INTO v_previous FROM public.sales_periods sp WHERE sp.tenant_id=v_credential.tenant_id AND sp.ends_on<v_start ORDER BY sp.ends_on DESC LIMIT 1;
  IF v_previous IS NOT NULL THEN v_previous_metrics:=public.sales_metrics_internal_v1(v_credential.tenant_id,v_previous,NULL,NULL);v_previous_percent:=COALESCE((v_previous_metrics->>'collective_percent')::numeric,0);END IF;
  IF p_receipt IS NOT NULL THEN
    SELECT sg.provisioning_key INTO v_goal_key FROM public.sales_goal_assignments sga JOIN public.sales_goals sg ON sg.tenant_id=sga.tenant_id AND sg.id=sga.goal_id WHERE sga.tenant_id=v_credential.tenant_id AND sga.period_id=v_period AND sga.profile_id IS NULL AND sga.is_active AND sga.goal_scope_snapshot='COLLECTIVE'AND NOT sga.goal_is_challenge_snapshot AND sg.provisioning_key='COLLECTIVE'AND sga.target_value_snapshot>0 AND(sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end)AND(sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start)AND COALESCE((v_metrics->>'realized_value')::numeric,0)>=sga.target_value_snapshot ORDER BY sga.target_value_snapshot DESC,sga.goal_id LIMIT 1;
    IF v_goal_key IS NOT NULL THEN
      v_receipt_hash:=extensions.digest(convert_to(p_receipt,'UTF8'),'sha256');
      INSERT INTO public.sales_tv_kiosk_deliveries(tenant_id,credential_id,period_id,milestone_key,receipt_hash)VALUES(v_credential.tenant_id,v_credential.id,v_period,v_goal_key,v_receipt_hash)ON CONFLICT(tenant_id,period_id,milestone_key,audience)DO NOTHING;
      UPDATE public.sales_tv_kiosk_deliveries d SET credential_id=v_credential.id WHERE d.tenant_id=v_credential.tenant_id AND d.period_id=v_period AND d.milestone_key=v_goal_key AND d.audience='TV'AND d.acknowledged_at IS NULL AND d.receipt_hash=v_receipt_hash AND d.credential_id IS DISTINCT FROM v_credential.id;
      SELECT count(*)::integer INTO v_claimed FROM public.sales_tv_kiosk_deliveries d WHERE d.tenant_id=v_credential.tenant_id AND d.period_id=v_period AND d.milestone_key=v_goal_key AND d.audience='TV'AND d.credential_id=v_credential.id AND d.receipt_hash=v_receipt_hash AND d.acknowledged_at IS NULL;
      SELECT count(*)::integer INTO v_acknowledged FROM public.sales_tv_kiosk_deliveries d WHERE d.tenant_id=v_credential.tenant_id AND d.period_id=v_period AND d.milestone_key=v_goal_key AND d.audience='TV'AND d.credential_id=v_credential.id AND d.receipt_hash=v_receipt_hash AND d.acknowledged_at IS NOT NULL;
    END IF;
  END IF;
  RETURN jsonb_build_object('available',true,'empty',false,'refresh_after_seconds',30,'identity_key',encode(extensions.digest(v_credential.token_hash||uuid_send(v_period),'sha256'),'hex'),'period',jsonb_build_object('starts_on',v_start,'ends_on',v_end,'status',v_metrics->>'period_status'),'progress',jsonb_build_object('percent',v_percent,'ideal_pace_percent',COALESCE((v_metrics->>'ideal_pace_percent')::numeric,0),'necessary_per_business_day_percent',CASE WHEN COALESCE((v_metrics->>'business_days_remaining')::int,0)=0 THEN 0 ELSE round(GREATEST(100-v_percent,0)/((v_metrics->>'business_days_remaining')::int),2)END,'band',CASE WHEN v_percent<60 THEN'BUILDING'WHEN v_percent<100 THEN'ALERT'ELSE'ACHIEVED'END),'comparison',CASE WHEN v_previous IS NULL THEN jsonb_build_object('available',false)ELSE jsonb_build_object('available',true,'previous_percent',v_previous_percent,'delta_percent',round(v_percent-v_previous_percent,2),'direction',CASE WHEN v_percent>v_previous_percent THEN'ABOVE'WHEN v_percent<v_previous_percent THEN'BELOW'ELSE'STABLE'END)END,'celebration',CASE WHEN v_claimed=1 THEN jsonb_build_object('available',true,'milestone',v_goal_key,'receipt',p_receipt,'receipt_state','PENDING')WHEN v_acknowledged=1 THEN jsonb_build_object('available',false,'receipt_state','ACKNOWLEDGED')ELSE jsonb_build_object('available',false)END,'updated_at',now());
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('available',false);
END;$$;

CREATE FUNCTION public.sales_tv_kiosk_ack_v2(p_token text,p_receipt text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_lookup_tenant uuid;v_credential uuid;v_changed integer;
BEGIN
  IF p_token IS NULL OR p_token!~'^[0-9a-f]{64}$'OR p_receipt IS NULL OR p_receipt!~'^[0-9a-f]{64}$'THEN RETURN jsonb_build_object('accepted',true);END IF;
  SELECT c.tenant_id INTO v_lookup_tenant FROM public.sales_tv_kiosk_credentials c WHERE c.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256');
  IF v_lookup_tenant IS NULL THEN RETURN jsonb_build_object('accepted',true);END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(v_lookup_tenant::text||':sales-tv-kiosk',0));
  SELECT c.id INTO v_credential FROM public.sales_tv_kiosk_credentials c WHERE c.tenant_id=v_lookup_tenant AND c.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256')AND c.scope='sales_tv'AND c.revoked_at IS NULL AND c.expires_at>now();
  IF v_credential IS NULL THEN RETURN jsonb_build_object('accepted',true);END IF;
  UPDATE public.sales_tv_kiosk_deliveries SET acknowledged_at=now()WHERE credential_id=v_credential AND receipt_hash=extensions.digest(convert_to(p_receipt,'UTF8'),'sha256')AND acknowledged_at IS NULL;GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN jsonb_build_object('accepted',true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('accepted',true);
END;$$;

INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)
SELECT kt.tenant_id,NULL,'SALES_TV_KIOSK_LEGACY_SCRUBBED','tenant',kt.tenant_id,jsonb_build_object('scope','sales_tv','plaintext_destroyed',true,'scrubbed_count',count(*))
FROM public.kiosk_tokens kt WHERE kt.scope='sales_tv'GROUP BY kt.tenant_id;
UPDATE public.kiosk_tokens SET token=pg_catalog.gen_random_uuid(),is_active=false WHERE scope='sales_tv';

CREATE FUNCTION public.sales_tv_legacy_token_guard_v2()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.scope='sales_tv' OR(TG_OP='UPDATE'AND OLD.scope='sales_tv')THEN RAISE EXCEPTION 'sales_tv_legacy_tokens_disabled' USING ERRCODE='42501';END IF;
  RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.sales_tv_legacy_token_guard_v2()FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sales_tv_legacy_token_guard_v2 BEFORE INSERT OR UPDATE ON public.kiosk_tokens FOR EACH ROW EXECUTE FUNCTION public.sales_tv_legacy_token_guard_v2();

COMMENT ON TABLE public.sales_tv_kiosk_deliveries IS 'Exactly-once claim per tenant/period/milestone/TV. The same opaque receipt retries until ACK and may rebind a pending delivery to the rotated active credential; acknowledged deliveries never rebind. Unknown receipts remain neutral.';
COMMENT ON FUNCTION public.sales_tv_kiosk_snapshot_v2(text,text,text) IS 'Returns refresh_after_seconds=30 as a client polling contract. This hint is not database-enforced rate limiting; edge/API throttling remains required because multiple TVs share one credential.';

REVOKE ALL ON FUNCTION public.sales_tv_kiosk_admin_create_v2(text,timestamptz),public.sales_tv_kiosk_admin_rotate_v2(uuid,timestamptz),public.sales_tv_kiosk_admin_revoke_v2(uuid),public.sales_tv_kiosk_admin_status_v2(),public.sales_tv_kiosk_snapshot_v2(text,text,text),public.sales_tv_kiosk_ack_v2(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sales_tv_kiosk_admin_create_v2(text,timestamptz),public.sales_tv_kiosk_admin_rotate_v2(uuid,timestamptz),public.sales_tv_kiosk_admin_revoke_v2(uuid),public.sales_tv_kiosk_admin_status_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_tv_kiosk_snapshot_v2(text,text,text),public.sales_tv_kiosk_ack_v2(text,text) TO service_role;

COMMIT;
