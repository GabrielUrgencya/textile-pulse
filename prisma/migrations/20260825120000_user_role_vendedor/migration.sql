-- LISION Vendas — cargo VENDEDOR no enum de perfis (UserRole).
--
-- Contexto: o cliente precisa de um cargo exclusivo de vendas, separado dos
-- cargos de produção (ADMIN/GERENTE/COORDENADOR/OPERADOR/FACCAO). VENDEDOR nasce
-- SEM permissões de produção (ver src/lib/permissions.ts), então só enxerga o
-- módulo LISION Vendas. O acesso ao Vendas em si vem do vínculo (sales_memberships).
--
-- Segurança/segurança de migração:
--   - ADD VALUE IF NOT EXISTS: idempotente (seguro reaplicar).
--   - Append-only: PostgreSQL não remove valores de enum. O rollback documenta o
--     procedimento manual (recriação do tipo) — não executado automaticamente.
--   - PG 15 (Supabase) permite ADD VALUE dentro de transação; o valor novo não é
--     USADO nesta mesma migração, então não há restrição de visibilidade.

ALTER TYPE public."UserRole" ADD VALUE IF NOT EXISTS 'VENDEDOR';
