BEGIN;

DROP FUNCTION IF EXISTS public.sales_admin_reorder_payment_methods_v1(uuid[], bigint, text);
DROP FUNCTION IF EXISTS public.sales_admin_set_payment_method_v1(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.sales_admin_payment_methods_v1();
DROP FUNCTION IF EXISTS public.sales_admin_set_membership_v1(uuid, public."SalesMemberRole", boolean);
DROP FUNCTION IF EXISTS public.sales_admin_directory_v1();

DROP TRIGGER IF EXISTS sales_require_active_payment_method_for_new_sale_trigger ON public.sales;
DROP FUNCTION IF EXISTS public.sales_require_active_payment_method_for_new_sale();

DROP TABLE IF EXISTS public.sales_payment_method_reorder_requests;
DROP TABLE IF EXISTS public.sales_payment_method_order_states;

ALTER TABLE public.sales_payment_methods
  DROP CONSTRAINT IF EXISTS sales_payment_methods_tenant_normalized_name_key,
  DROP CONSTRAINT IF EXISTS sales_payment_methods_name_not_blank_check,
  DROP COLUMN IF EXISTS name_normalized;

ALTER TABLE public.sales_payment_methods
  ADD CONSTRAINT sales_payment_methods_tenant_name_key UNIQUE (tenant_id, name);

DROP FUNCTION IF EXISTS public.sales_normalize_payment_method_name(text);

COMMIT;
