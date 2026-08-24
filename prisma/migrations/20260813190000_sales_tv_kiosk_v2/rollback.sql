BEGIN;

REVOKE EXECUTE ON FUNCTION public.sales_tv_kiosk_snapshot_v2(text,text,text),public.sales_tv_kiosk_ack_v2(text,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.sales_tv_kiosk_admin_create_v2(text,timestamptz),public.sales_tv_kiosk_admin_rotate_v2(uuid,timestamptz),public.sales_tv_kiosk_admin_revoke_v2(uuid),public.sales_tv_kiosk_admin_status_v2() FROM authenticated;
DROP FUNCTION IF EXISTS public.sales_tv_kiosk_ack_v2(text,text);
DROP FUNCTION IF EXISTS public.sales_tv_kiosk_snapshot_v2(text,text,text);
DROP FUNCTION IF EXISTS public.sales_tv_kiosk_admin_revoke_v2(uuid);
DROP FUNCTION IF EXISTS public.sales_tv_kiosk_admin_status_v2();
DROP FUNCTION IF EXISTS public.sales_tv_kiosk_admin_rotate_v2(uuid,timestamptz);
DROP FUNCTION IF EXISTS public.sales_tv_kiosk_admin_create_v2(text,timestamptz);
-- The legacy guard is intentionally preserved: rollback must never reopen plaintext sales_tv token creation.
DROP TABLE IF EXISTS public.sales_tv_kiosk_deliveries;
DROP TABLE IF EXISTS public.sales_tv_kiosk_credentials;

-- Deliberately do not restore or reactivate legacy sales_tv plaintext tokens.
REVOKE EXECUTE ON FUNCTION public.sales_tv_snapshot_v1(uuid,uuid) FROM anon;

COMMIT;
