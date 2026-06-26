-- Feature "Ranking de Facções" — foto da facção + bucket de storage
-- ADITIVA + idempotente. Não desabilita RLS de storage (apenas adiciona policies).

-- ============================================================
-- 1) factions.photo_url
-- ============================================================
ALTER TABLE "public"."factions" ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
COMMENT ON COLUMN "public"."factions"."photo_url" IS 'URL pública da foto da facção (bucket faction-photos). Null = placeholder por iniciais.';

-- ============================================================
-- 2) Storage bucket público "faction-photos"
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('faction-photos', 'faction-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================
-- 3) Policies em storage.objects para o bucket (RLS já habilitado pelo Supabase)
-- ============================================================
-- Leitura pública (qualquer um lê as fotos)
DROP POLICY IF EXISTS "faction_photos_public_read" ON storage.objects;
CREATE POLICY "faction_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'faction-photos');

-- Escrita apenas autenticada
DROP POLICY IF EXISTS "faction_photos_auth_insert" ON storage.objects;
CREATE POLICY "faction_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'faction-photos');

DROP POLICY IF EXISTS "faction_photos_auth_update" ON storage.objects;
CREATE POLICY "faction_photos_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'faction-photos') WITH CHECK (bucket_id = 'faction-photos');

DROP POLICY IF EXISTS "faction_photos_auth_delete" ON storage.objects;
CREATE POLICY "faction_photos_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'faction-photos');
