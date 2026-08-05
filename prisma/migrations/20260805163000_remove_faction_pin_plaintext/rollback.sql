-- Structural rollback only. pin_plain is deliberately left untouched.
ALTER TABLE public.faction_tokens
  DROP COLUMN IF EXISTS pin_ciphertext;
