-- Apply before deploying the backend that supports guest bookings (ddl-auto:none).
-- Do not create walk-ins while older backend instances are still serving traffic.
BEGIN;
CREATE TABLE IF NOT EXISTS public.salon_closures (
    id BIGSERIAL PRIMARY KEY,
    salon_id BIGINT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    closed_date DATE NOT NULL,
    reason VARCHAR(500),
    CONSTRAINT uq_salon_closure_date UNIQUE (salon_id, closed_date)
);
ALTER TABLE public.salon_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS walk_in_name VARCHAR(255);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS walk_in_phone VARCHAR(20);
COMMIT;
