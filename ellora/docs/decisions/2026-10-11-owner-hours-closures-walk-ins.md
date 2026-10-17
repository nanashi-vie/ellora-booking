# Owner working hours, planned closures, and walk-in bookings

## Scope and confirmed behavior
- Restore the existing weekly working-hours API in the salon profile. Owners can set each weekday's hours, mark recurring closed weekdays, and copy a shared interval (for example 09:00–19:00) to the whole week before saving.
- The user requires closures to be scheduled at least one calendar day in advance, using Asia/Ho_Chi_Minh dates. Add dated closures for unexpected days off. Newly closing today's weekday is rejected; previously saved closures remain valid.
- Closing a date or adding a recurring closed weekday automatically rejects PENDING and cancels CONFIRMED bookings on affected future dates. Completed/cancelled/rejected/in-progress bookings are preserved. Reopening does not restore cancelled appointments.
- Connect the existing walk-in button to a real owner-only booking form: optional name/phone, service, employee (or automatic assignment), date/time, notes. Walk-ins start PENDING and use the existing confirmation/start/completion workflow.

## Implementation plan
1. Add a salon_closures table and nullable customer relation plus walk-in name/phone columns on bookings. Use real guest booking data rather than creating authentication accounts.
2. Extend SalonWorkingHourService with planned closure CRUD and automatic rejection/cancellation; serialize schedule updates with the same salon lock used by booking creation. Check dated closures in booking validation.
3. Reuse the complete booking validation/employee assignment path for walk-ins. Scope the new endpoint to the authenticated owner's salon. Make mapping, review/cancellation checks, and email handling safe for guests; guests have no customer email.
4. Restore weekly hour controls and add planned closure controls in salon profile, independently of profile approval. Replace the walk-in placeholder panel with a validated form and refresh the existing appointment state after creation.
5. Use actual hours/closures in the customer booking calendar and slots, including service duration, and show the reason when backend rejects a now-unavailable time.

## Constraints and risks
- No new dependencies; retain existing dashboard styles and SSR compatibility.
- Supabase uses ddl-auto:none. Ship an explicit idempotent SQL migration; validate against an isolated database before applying it to any shared database. Coordinate backend deployment with nullable guest bookings so older code does not read guest records.
- Schedule changes affect existing future bookings, so rejection/cancellation occurs in the same transaction as the schedule change and records the closure reason.
- Returning-customer statistics must exclude anonymous guest groups. Walk-in revenue participates in existing completed-booking reports.

## Verification plan
- Backend tests for advance notice, owner scoping, dated/weekly closures, affected statuses, reopening, hours limits, and conflicting appointments; existing booking/security/email tests.
- Frontend tests for copying hours then overriding a day, load/save failures, minimum closure date, walk-in save/validation, and dynamic customer time slots.
- Production frontend build, backend compile, and focused diff review. Keep localhost configuration local and do not push this follow-up without a new request.

## Local activation — 2026-10-17
- The user approved applying the Supabase migration and requested the local backend/frontend to be started for testing.
- Applied and verified `owner-closures-walk-ins.sql` in a transaction. Existing booking rows were preserved.
- Started the current backend with the Supabase profile on port 8080; local mail delivery is disabled.
