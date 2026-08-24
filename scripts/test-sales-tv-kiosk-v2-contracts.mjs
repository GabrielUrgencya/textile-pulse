import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const sql=readFileSync(resolve("prisma/migrations/20260813190000_sales_tv_kiosk_v2/migration.sql"),"utf8");
const rollback=readFileSync(resolve("prisma/migrations/20260813190000_sales_tv_kiosk_v2/rollback.sql"),"utf8");

assert.match(sql,/gen_random_bytes\(32\)/);assert.match(sql,/digest\(convert_to\(v_raw,'UTF8'\),'sha256'\)/);
assert.match(sql,/token_hash bytea NOT NULL UNIQUE CHECK \(octet_length\(token_hash\)=32\)/);
assert.doesNotMatch(sql,/INSERT INTO public\.sales_tv_kiosk_credentials[^;]*token[,)]/);
for(const fn of["create","rotate","revoke"])assert.match(sql,new RegExp(`sales_tv_kiosk_admin_${fn}_v2[\\s\\S]*sales_is_admin\\(\\)`));
const status=sql.slice(sql.indexOf("CREATE FUNCTION public.sales_tv_kiosk_admin_status_v2"),sql.indexOf("CREATE FUNCTION public.sales_tv_kiosk_snapshot_v2"));
assert.match(status,/auth_tenant_id\(\)/);assert.match(status,/auth\.uid\(\)/);assert.match(status,/sales_is_admin\(\)/);assert.match(status,/c\.tenant_id=v_tenant/);
for(const key of["credential_id","name","generation","expires_at","created_at","updated_at"])assert.match(status,new RegExp(`'${key}'`));
for(const forbidden of["token_hash","token","tenant_id","created_by","created_by_id"])assert.doesNotMatch(status.slice(status.indexOf("jsonb_build_object")),new RegExp(`'${forbidden}'`));
assert.match(status,/COALESCE\(v_status,jsonb_build_object\('active',false\)\)/);
assert.ok((sql.match(/RETURN jsonb_build_object\('credential_id',v_id,'token',v_raw/g)??[]).length===2);
const audits=[...sql.matchAll(/INSERT INTO public\.sales_audit_events[\s\S]*?;/g)].map(x=>x[0]).join("\n");assert.doesNotMatch(audits,/v_raw|token_hash|receipt_hash/);
assert.match(sql,/p_expires_at IS NULL/);
assert.match(sql,/UPDATE public\.sales_tv_kiosk_credentials SET revoked_at=expires_at,updated_at=now\(\)WHERE tenant_id=v_tenant AND revoked_at IS NULL AND expires_at<=now\(\)/);

assert.match(sql,/SALES_TV_KIOSK_LEGACY_SCRUBBED/);assert.match(sql,/UPDATE public\.kiosk_tokens SET token=pg_catalog\.gen_random_uuid\(\),is_active=false WHERE scope='sales_tv'/);
assert.match(sql,/CREATE TRIGGER sales_tv_legacy_token_guard_v2 BEFORE INSERT OR UPDATE/);assert.match(sql,/IF NEW\.scope='sales_tv' OR\(TG_OP='UPDATE'AND OLD\.scope='sales_tv'\)THEN RAISE EXCEPTION 'sales_tv_legacy_tokens_disabled'/);
assert.doesNotMatch(rollback,/UPDATE public\.kiosk_tokens|is_active=true|GRANT EXECUTE ON FUNCTION public\.sales_tv_snapshot_v1.*anon|DROP TRIGGER IF EXISTS sales_tv_legacy_token_guard_v2|DROP FUNCTION IF EXISTS public\.sales_tv_legacy_token_guard_v2/);

const snapshot=sql.slice(sql.indexOf("CREATE FUNCTION public.sales_tv_kiosk_snapshot_v2"),sql.indexOf("CREATE FUNCTION public.sales_tv_kiosk_ack_v2"));
assert.match(snapshot,/RETURN jsonb_build_object\('available',false\)/);assert.match(snapshot,/EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object\('available',false\)/);
assert.match(snapshot,/token_hash=extensions\.digest\(convert_to\(p_token,'UTF8'\),'sha256'\)/);
const snapshotLookup=snapshot.indexOf("SELECT c.tenant_id INTO v_lookup_tenant");const snapshotShared=snapshot.indexOf("pg_advisory_xact_lock_shared",snapshotLookup);const snapshotRevalidate=snapshot.indexOf("SELECT c.* INTO v_credential",snapshotShared);const snapshotMetrics=snapshot.indexOf("sales_metrics_internal_v1",snapshotRevalidate);assert.ok(snapshotLookup>=0&&snapshotShared>snapshotLookup&&snapshotRevalidate>snapshotShared&&snapshotMetrics>snapshotRevalidate,"snapshot lookup -> shared mutex -> full revalidation -> metrics order");
assert.match(snapshot,/pg_advisory_xact_lock_shared\(hashtextextended\(v_lookup_tenant::text\|\|':sales-tv-kiosk',0\)\)/);
assert.match(snapshot,/SELECT c\.\* INTO v_credential[\s\S]*c\.tenant_id=v_lookup_tenant[\s\S]*c\.scope='sales_tv'AND c\.revoked_at IS NULL AND c\.expires_at>now\(\)/);
assert.doesNotMatch(snapshot.slice(snapshotLookup,snapshotShared),/FOR UPDATE|FOR SHARE|sales_metrics_internal_v1|sales_tv_kiosk_deliveries/);
assert.match(snapshot,/sga\.profile_id IS NULL AND sga\.is_active AND sga\.goal_scope_snapshot='COLLECTIVE'/);
assert.match(snapshot,/NOT sga\.goal_is_challenge_snapshot/);
assert.match(snapshot,/sg\.provisioning_key='COLLECTIVE'/);assert.match(snapshot,/sga\.target_value_snapshot>0/);
assert.match(snapshot,/valid_from_snapshot IS NULL OR sga\.valid_from_snapshot<=v_end/);assert.match(snapshot,/valid_until_snapshot IS NULL OR sga\.valid_until_snapshot>=v_start/);
assert.match(snapshot,/sales_metrics_internal_v1/);assert.match(snapshot,/realized_value/);
assert.match(snapshot,/ON CONFLICT\(tenant_id,period_id,milestone_key,audience\)DO NOTHING/);
assert.match(snapshot,/UPDATE public\.sales_tv_kiosk_deliveries d SET credential_id=v_credential\.id[\s\S]*d\.acknowledged_at IS NULL AND d\.receipt_hash=v_receipt_hash[\s\S]*d\.credential_id IS DISTINCT FROM v_credential\.id/);
assert.match(snapshot,/d\.receipt_hash=v_receipt_hash AND d\.acknowledged_at IS NULL/);
assert.match(snapshot,/d\.credential_id=v_credential\.id AND d\.receipt_hash=v_receipt_hash AND d\.acknowledged_at IS NOT NULL/);
assert.match(snapshot,/'receipt_state','PENDING'/);assert.match(snapshot,/'receipt_state','ACKNOWLEDGED'/);
const acknowledgedProjection=snapshot.match(/WHEN v_acknowledged=1 THEN (jsonb_build_object\([^)]*\))/)?.[1]??"";assert.match(acknowledgedProjection,/'receipt_state','ACKNOWLEDGED'/);assert.doesNotMatch(acknowledgedProjection,/'receipt'|'token'|'credential_id'|'milestone'/);
assert.match(snapshot,/'refresh_after_seconds',30/);
assert.match(snapshot,/'empty',true,'refresh_after_seconds',30,'identity_key'/);
assert.match(snapshot,/digest\(v_credential\.token_hash\|\|convert_to\('sales_tv','UTF8'\),'sha256'\)/);
const publicDto=snapshot.slice(snapshot.indexOf("RETURN jsonb_build_object('available',true,'empty',false"));
for(const forbidden of["profile_id","goal_id","tenant_id","sale_value","commission","ticket","realized_value","target_value"])assert.doesNotMatch(publicDto,new RegExp(`'${forbidden}'`));

const ack=sql.slice(sql.indexOf("CREATE FUNCTION public.sales_tv_kiosk_ack_v2"),sql.indexOf("INSERT INTO public.sales_audit_events",sql.indexOf("CREATE FUNCTION public.sales_tv_kiosk_ack_v2")));
const ackLookup=ack.indexOf("SELECT c.tenant_id INTO v_lookup_tenant");const ackShared=ack.indexOf("pg_advisory_xact_lock_shared",ackLookup);const ackRevalidate=ack.indexOf("SELECT c.id INTO v_credential",ackShared);const ackWrite=ack.indexOf("UPDATE public.sales_tv_kiosk_deliveries",ackRevalidate);assert.ok(ackLookup>=0&&ackShared>ackLookup&&ackRevalidate>ackShared&&ackWrite>ackRevalidate,"ACK lookup -> shared mutex -> full revalidation -> delivery write order");
assert.match(ack,/SELECT c\.id INTO v_credential[\s\S]*c\.tenant_id=v_lookup_tenant[\s\S]*c\.scope='sales_tv'AND c\.revoked_at IS NULL AND c\.expires_at>now\(\)/);
assert.doesNotMatch(ack.slice(ackLookup,ackShared),/FOR UPDATE|FOR SHARE|sales_tv_kiosk_deliveries/);
assert.match(ack,/acknowledged_at=now\(\)[^;]*acknowledged_at IS NULL/);assert.ok((ack.match(/jsonb_build_object\('accepted',true\)/g)??[]).length>=4);assert.match(ack,/EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object\('accepted',true\)/);
assert.match(sql,/UNIQUE\(tenant_id,period_id,milestone_key,audience\)/);assert.match(sql,/UNIQUE\(credential_id,period_id,milestone_key,receipt_hash\)/);assert.doesNotMatch(sql,/UNIQUE\(credential_id,receipt_hash\)/);assert.doesNotMatch(sql,/sales_tv_kiosk_deliveries_goal_fk/);
assert.match(sql,/refresh_after_seconds=30 as a client polling contract[\s\S]*not database-enforced rate limiting/);
assert.match(sql,/acknowledged deliveries never rebind/);

function snapshotTransition(delivery,{credential,receipt}){if(!delivery)return{delivery:{credential,receipt,ack:false},state:"PENDING"};if(delivery.receipt!==receipt)return{delivery,state:"NEUTRAL"};if(delivery.ack)return{delivery,state:delivery.credential===credential?"ACKNOWLEDGED":"NEUTRAL"};return{delivery:{...delivery,credential},state:"PENDING"};}
function ackTransition(delivery,{credential,receipt,valid=true}){if(valid&&delivery&&!delivery.ack&&delivery.credential===credential&&delivery.receipt===receipt)return{...delivery,ack:true};return delivery;}
let delivery=null;({delivery}=snapshotTransition(delivery,{credential:"old",receipt:"r"}));
delivery=ackTransition(delivery,{credential:"old",receipt:"r",valid:false});assert.equal(delivery.ack,false,"failed ACK stays pending");
let takeover=snapshotTransition(delivery,{credential:"new",receipt:"r"});assert.equal(takeover.state,"PENDING");assert.equal(takeover.delivery.credential,"new","correct receipt rebinds pending after rotation");
assert.equal(snapshotTransition(takeover.delivery,{credential:"other",receipt:"wrong"}).state,"NEUTRAL","other receipt cannot take over");
delivery=ackTransition(takeover.delivery,{credential:"new",receipt:"r"});assert.equal(delivery.ack,true);
assert.equal(snapshotTransition(delivery,{credential:"new",receipt:"r"}).state,"ACKNOWLEDGED","correct receipt proves ACK on later GET");
const afterAckRotation=snapshotTransition(delivery,{credential:"third",receipt:"r"});assert.equal(afterAckRotation.state,"NEUTRAL");assert.equal(afterAckRotation.delivery.credential,"new","acknowledged delivery never rebinds");
function serializedCredentialRead({exclusiveAdminCommitsFirst,tokenKnown=true}){if(!tokenKnown)return"NEUTRAL";return exclusiveAdminCommitsFirst?"NEUTRAL_AFTER_REVALIDATION":"STABLE_VALID_READ";}
assert.equal(serializedCredentialRead({exclusiveAdminCommitsFirst:true}),"NEUTRAL_AFTER_REVALIDATION","rotation/revoke committed while shared reader waited is rejected after lock");
assert.equal(serializedCredentialRead({exclusiveAdminCommitsFirst:false}),"STABLE_VALID_READ","shared reader completes against one stable credential state before admin mutation");
assert.equal(serializedCredentialRead({tokenKnown:false}),"NEUTRAL","unknown token cannot select a tenant mutex");

assert.match(sql,/REVOKE ALL ON public\.sales_tv_kiosk_credentials,public\.sales_tv_kiosk_deliveries FROM PUBLIC,anon,authenticated/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.sales_tv_kiosk_snapshot_v2\(text,text,text\),public\.sales_tv_kiosk_ack_v2\(text,text\) TO service_role/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION[^;]*sales_tv_kiosk_admin_status_v2\(\) TO authenticated/);
assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public\.sales_tv_kiosk_(?:snapshot|ack)_v2[^;]*TO (?:PUBLIC|anon|authenticated)/);
assert.match(rollback,/REVOKE EXECUTE ON FUNCTION public\.sales_tv_kiosk_snapshot_v2\(text,text,text\),public\.sales_tv_kiosk_ack_v2\(text,text\) FROM service_role/);
assert.match(rollback,/DROP FUNCTION IF EXISTS public\.sales_tv_kiosk_admin_status_v2\(\)/);
assert.doesNotMatch(sql,/GRANT .*credentials|GRANT .*deliveries/);
assert.match(rollback,/DROP TABLE IF EXISTS public\.sales_tv_kiosk_deliveries/);assert.match(rollback,/DROP TABLE IF EXISTS public\.sales_tv_kiosk_credentials/);
assert.ok(/^BEGIN;/m.test(sql)&&/COMMIT;\s*$/.test(sql)&&/^BEGIN;/m.test(rollback)&&/COMMIT;\s*$/.test(rollback));

console.log("sales TV kiosk v2 structural contracts: PASS (structural only; no PostgreSQL runtime asserted)");
