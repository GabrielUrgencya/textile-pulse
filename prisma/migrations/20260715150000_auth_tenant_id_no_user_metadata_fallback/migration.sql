-- SEGURANÇA (auditoria pré-deploy): remove o fallback para user_metadata em
-- auth_tenant_id(). O user_metadata é GRAVÁVEL pelo próprio usuário (supabase.auth.updateUser),
-- então um usuário sem app_metadata.tenant_id podia se auto-atribuir qualquer tenant e
-- vazar dados de outra empresa via RLS (exploit comprovado: leu 54 OPs da liserie).
-- app_metadata é definido SÓ server-side (service_role) → fonte de verdade confiável.
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID;
$function$;
