-- Transitional security hardening for faction portal credentials.
-- pin_hash remains the authentication verifier. pin_ciphertext is a recoverable
-- AES-256-GCM envelope used only by the authorized "copy access" flow.
--
-- IMPORTANT: this migration intentionally performs no DML and does not remove
-- pin_plain globally. The application will backfill only Fabrica Teste, verify
-- each ciphertext, and clear that tenant's pin_plain afterwards. Liserie and all
-- other tenants remain untouched during this migration.
ALTER TABLE public.faction_tokens
  ADD COLUMN IF NOT EXISTS pin_ciphertext text;

COMMENT ON COLUMN public.faction_tokens.pin_hash IS
  'bcrypt hash used for faction portal authentication; never decryptable.';

COMMENT ON COLUMN public.faction_tokens.pin_ciphertext IS
  'Versioned AES-256-GCM envelope for authorized idempotent access-copy. Key material is server-only; never expose this column to clients.';

COMMENT ON COLUMN public.faction_tokens.pin_plain IS
  'Legacy transition column. Backfill and clear tenant-by-tenant only after ciphertext verification; do not populate for new or rotated credentials.';
