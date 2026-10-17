-- Apply before starting the backend with completion confirmation (Supabase ddl-auto:none).
-- Additive only: existing appointments, reviews and recorded payments are preserved.
BEGIN;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completion_confirmation VARCHAR(32);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completion_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completion_responded_at TIMESTAMP;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completion_customer_note VARCHAR(1000);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completion_admin_note VARCHAR(2000);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completion_resolved_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS public.booking_completion_disputes (
    id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    completion_version BIGINT NOT NULL CHECK (completion_version >= 0),
    reason VARCHAR(1000) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('OPEN', 'UPHELD', 'REOPENED')),
    created_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    resolved_by UUID,
    admin_note VARCHAR(2000),
    CONSTRAINT uq_booking_completion_dispute UNIQUE (booking_id, completion_version)
);
CREATE INDEX IF NOT EXISTS booking_completion_disputes_queue_idx
    ON public.booking_completion_disputes(status, created_at DESC, id DESC);
ALTER TABLE public.booking_completion_disputes ENABLE ROW LEVEL SECURITY;
COMMIT;
