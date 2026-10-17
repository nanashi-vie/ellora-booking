# Public guest self-booking and email notifications

## Plan and contract
- Allow a customer without an account to book through the existing public booking wizard. Require name, phone, email, salon/service and date/time. Preserve the existing minimum one-hour notice, minute selection, full-service working-hour/closure validation and salon/employee conflict locking.
- Add only nullable `bookings.guest_email VARCHAR(255)`; reuse existing `walk_in_name` and `walk_in_phone` for guest name/phone snapshots. No profile lookup/creation/linking by email. A guest online booking is distinct from an owner-created walk-in. Accountless completion retains the existing auto-confirm behavior; no public history/cancel/review/completion API is introduced.
- Add exact public `POST /api/bookings/guest` accepting `{salonId,serviceId,employeeId?,scheduledAt,fullName,phone,email,customerNote?}`. Return only `{id,status,scheduledAt,salonName,serviceName}` inside the standard API response. All existing protected endpoints stay protected; authenticated owner/admin requests cannot use the guest endpoint.
- Apply a bounded, expiring per-recipient throttle to this public endpoint (five requests per ten minutes, case-insensitive email), without trusting proxy headers or adding dependencies. This is per backend instance; shared/distributed limits would require an infrastructure change if the service scales.
- Enqueue an immediate `BOOKING_RECEIVED` receipt for the guest, plus the existing salon new-booking email. Enqueue `CONFIRMED` when the salon accepts; include confirmed guests in the existing one-hour reminder scanner and delivery revalidation. Keep SMTP retries/HTML templates/unique outbox key.
- Remove login requirement only from the booking route, retaining owner/admin guards. Add required guest contact fields, bypass token lookup only for the exact public POST and show a receipt after success without redirecting guests to authenticated history. Keep registered-customer booking unchanged.

## Verification plan
- Mocked backend tests for field validation, exact anonymous POST/security, receipt privacy, lead time/closures/conflicts, guest snapshots, mail routing and reminders, throttle and existing account/walk-in regressions.
- Frontend tests for public route/guards/interceptor, required guest fields, guest submission/receipt and authenticated path; production browser/server build. Browser-check the guest wizard on mobile and desktop with no booking submission.
- Apply the additive column on the configured Supabase database before restarting local backend; no fake bookings or synthetic messages to real recipients. Preserve local-only frontend host settings, existing uncommitted reminder work and running frontend.

## Workflow
- Codex planning/implementation with peer review/verification follows the user's earlier repository workflow authorization. The local design skill excludes multi-step product UI; retain the established Ellora wizard layout.

## Results and verification
- Implemented public guest DTO/controller, contact snapshots, shared booking checks, protected owner details, per-recipient limiter, guest receipt/confirmation and one-hour reminder support. Existing owner walk-ins and account-owned completion/review rules remain intact.
- Applied `guest-self-booking.sql` to the configured Supabase database: nullable 255-character column is ready, booking row security remains enabled and no existing booking row was changed. Read-only EXPLAIN validated guest reminder selection and the outbox unique conflict arbiter, without executing diagnostic inserts.
- Backend test reports total 229 cases with zero failures/errors/skips. The first run found one overly strict HTML Unicode assertion; it was corrected to verify decoded text plus escaping, and all eight guest mail tests passed on focused rerun. No production change was needed for that assertion.
- Frontend four-spec verification passed 37 tests (guest booking/API/template, hours, role guards and auth interceptor); production browser/server build passed after both validation alignment and final mobile CSS updates.
- Actual local browser checks: guest completed service/staff/date/time steps without signing in; missing name/phone/email produced three required-field errors with no booking submission. Forms fit 320px/390px and 1440px viewports without horizontal overflow. Adjusted the small-screen step indicator and alert wrapping after inspection. Screenshots are saved outside the repository in the task visualization directory.
- Local backend restarted with mail enabled. `/api/ping` returned 200, anonymous empty guest submission returned 400, and anonymous booking history returned 401. No synthetic booking or mail was created or sent to real recipients. Changes are local and have not been committed/pushed/deployed.
