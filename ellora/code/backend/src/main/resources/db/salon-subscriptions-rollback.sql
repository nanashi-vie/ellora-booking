-- Manual rollback only, after deploying the previous backend and backing up subscription history.
-- This removes only this feature's tables, constraint and columns. It is never run by the application.
BEGIN;
DROP TABLE IF EXISTS public.salon_subscription_requests;
DROP TABLE IF EXISTS public.salon_subscription_plans;
ALTER TABLE public.salons DROP CONSTRAINT IF EXISTS ck_salon_subscription_period;
ALTER TABLE public.salons DROP COLUMN IF EXISTS subscription_tier;
ALTER TABLE public.salons DROP COLUMN IF EXISTS subscription_starts_at;
ALTER TABLE public.salons DROP COLUMN IF EXISTS subscription_expires_at;
COMMIT;
