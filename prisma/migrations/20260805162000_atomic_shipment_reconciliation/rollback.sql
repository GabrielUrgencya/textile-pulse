DROP FUNCTION IF EXISTS public.hold_shipment_inspection_v1(uuid, text);
DROP FUNCTION IF EXISTS public.reconcile_shipment_return_v1(uuid, text, integer, integer, boolean, text);
DROP INDEX IF EXISTS "faction_ledger_idempotency_key_unique";
ALTER TABLE public.faction_ledger DROP COLUMN IF EXISTS idempotency_key;
