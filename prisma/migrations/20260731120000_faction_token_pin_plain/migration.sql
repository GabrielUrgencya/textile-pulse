-- Acesso da facção ao portal — solução definitiva (Copiar acesso / Gerar novo PIN).
-- Migração ADITIVA e não destrutiva.
--
-- O admin precisa RECUPERAR o PIN atual para reenviar o acesso ("Copiar acesso").
-- O PIN fica com hash (bcrypt) para o LOGIN — e isso NÃO muda. Adicionamos o PIN
-- em claro numa coluna à parte, lida só pelo admin (service role), apenas para
-- montar a mensagem de acesso. Credencial de conveniência de 6 dígitos, baixa
-- sensibilidade; a verificação de login continua exclusivamente por pin_hash.
ALTER TABLE "faction_tokens"
  ADD COLUMN IF NOT EXISTS "pin_plain" VARCHAR(6);

COMMENT ON COLUMN "faction_tokens"."pin_plain" IS
  'PIN atual em claro (6 dígitos) para o admin recuperar/reenviar o acesso (Copiar acesso). Login continua verificando por pin_hash (bcrypt). Leitura apenas via admin/service role.';

-- NOTA: o invariante "1 token ativo por facção" é mantido pela aplicação (o
-- endpoint de acesso consolida: mantém o canônico e desativa os demais ao ser
-- usado). Não criamos índice único parcial agora para não quebrar facções que
-- hoje têm múltiplos tokens ativos (a consolidação acontece com segurança em uso).

-- ROLLBACK (manual):
--   ALTER TABLE "faction_tokens" DROP COLUMN IF EXISTS "pin_plain";
