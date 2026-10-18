-- Additive and idempotent. Apply after salon-subscriptions.sql before restarting with ddl-auto:none.
-- Vietnam local timestamps. No price, QR instruction, report, receipt or entitlement backfill.
BEGIN;
ALTER TABLE public.salon_subscription_requests ADD COLUMN IF NOT EXISTS payment_qr_url TEXT;
ALTER TABLE public.salon_subscription_requests ADD COLUMN IF NOT EXISTS payment_reported_at TIMESTAMP;
ALTER TABLE public.salon_subscription_requests ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);
ALTER TABLE public.salon_subscription_requests ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP;
ALTER TABLE public.salon_subscription_requests ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID;
ALTER TABLE public.salon_subscription_requests ADD COLUMN IF NOT EXISTS received_amount NUMERIC(15,0);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_subscription_payment_report' AND conrelid='public.salon_subscription_requests'::regclass) THEN
        ALTER TABLE public.salon_subscription_requests ADD CONSTRAINT ck_subscription_payment_report CHECK (
            payment_reported_at IS NULL OR (quoted_price > 0 AND payment_qr_url IS NOT NULL AND length(trim(payment_qr_url)) > 0)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_subscription_payment_confirmation' AND conrelid='public.salon_subscription_requests'::regclass) THEN
        ALTER TABLE public.salon_subscription_requests ADD CONSTRAINT ck_subscription_payment_confirmation CHECK (
            (payment_confirmed_at IS NULL AND payment_confirmed_by IS NULL AND received_amount IS NULL)
            OR (payment_confirmed_at IS NOT NULL AND payment_confirmed_by IS NOT NULL AND received_amount IS NOT NULL
                AND received_amount > 0 AND quoted_price > 0 AND received_amount = quoted_price
                AND payment_reported_at IS NOT NULL AND payment_qr_url IS NOT NULL AND length(trim(payment_qr_url)) > 0
                AND status='APPROVED')
        );
    END IF;
END $$;
COMMIT;
