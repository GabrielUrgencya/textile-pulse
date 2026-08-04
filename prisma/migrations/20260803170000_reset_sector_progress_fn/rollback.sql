-- Rollback Frente 1 — remove a função de zeração de progresso por setor.
DROP FUNCTION IF EXISTS public.reset_sector_progress(uuid, timestamptz, timestamptz);
