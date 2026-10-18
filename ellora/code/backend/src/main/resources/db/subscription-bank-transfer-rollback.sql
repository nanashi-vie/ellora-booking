-- Manual only: deploy the previous backend first and back up payment audit data before rollback.
-- Never executed by the application. Existing subscription statuses/periods are not changed.
BEGIN;
ALTER TABLE public.salon_subscription_requests DROP CONSTRAINT IF EXISTS ck_subscription_payment_confirmation;
ALTER TABLE public.salon_subscription_requests DROP CONSTRAINT IF EXISTS ck_subscription_payment_report;
ALTER TABLE public.salon_subscription_requests DROP COLUMN IF EXISTS payment_qr_url;
ALTER TABLE public.salon_subscription_requests DROP COLUMN IF EXISTS payment_reported_at;
ALTER TABLE public.salon_subscription_requests DROP COLUMN IF EXISTS payment_reference;
ALTER TABLE public.salon_subscription_requests DROP COLUMN IF EXISTS payment_confirmed_at;
ALTER TABLE public.salon_subscription_requests DROP COLUMN IF EXISTS payment_confirmed_by;
ALTER TABLE public.salon_subscription_requests DROP COLUMN IF EXISTS received_amount;
COMMIT;
