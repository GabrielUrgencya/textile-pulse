REVOKE ALL ON FUNCTION public.create_faction_shipments_atomic_v1(
  uuid, uuid[], timestamptz, numeric, text, boolean, text[], timestamptz[], text
) FROM authenticated;

DROP FUNCTION IF EXISTS public.create_faction_shipments_atomic_v1(
  uuid, uuid[], timestamptz, numeric, text, boolean, text[], timestamptz[], text
);
