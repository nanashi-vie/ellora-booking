-- Apply before deploying guest self-booking (Supabase ddl-auto:none).
-- Guest contact data remains private on the booking; no profile is created.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);
