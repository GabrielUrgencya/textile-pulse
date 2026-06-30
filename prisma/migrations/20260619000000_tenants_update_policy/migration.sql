-- Story 8.20 (HOTFIX) — Policy de UPDATE em tenants
-- Bug: settings do tenant (metas, turnos, etc.) não persistiam porque `tenants`
-- tinha RLS habilitado com APENAS `tenants_select`. O UPDATE da sessão do usuário
-- era bloqueado silenciosamente (0 linhas, sem erro). Esta policy permite o tenant
-- atualizar o próprio registro. A restrição admin permanece na API (settings:manage).
-- Aplicada via Supabase Management API em 2026-06-19 (banco coxfzplrsfzbhzuwdfnw).

DROP POLICY IF EXISTS "tenants_update" ON "tenants";
CREATE POLICY "tenants_update" ON "tenants"
  FOR UPDATE
  USING (id = auth_tenant_id())
  WITH CHECK (id = auth_tenant_id());
