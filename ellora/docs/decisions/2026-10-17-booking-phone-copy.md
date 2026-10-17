# Booking phone and copyable appointment details

## Plan and scope
- Send the phone entered on the customer booking form to the backend and retain it with the appointment. Do not overwrite the account's profile phone.
- Reuse the existing nullable phone column (`walk_in_phone`) through an explicitly named booking-contact field so both online customers and walk-ins retain their supplied number without a schema change. Older online bookings fall back to their customer profile phone when available.
- Keep the booking request backward compatible; validate optional phone input and preserve existing lead-time, hours, employee, authorization and status rules.
- Map the phone into owner booking events. Add a small reusable owner contact component showing the number, Copy phone, and Copy appointment summary actions in the appointment list and new-booking notification.
- Copied summary contains appointment id, customer name, phone, service and local date/time (Vietnam time). Copying is a user-triggered local clipboard action; do not open Zalo or send messages.
- Missing numbers are labeled honestly and the phone-only copy action is disabled. Copy failures show a useful message; do not claim success if the clipboard operation fails.

## Verification
- Backend tests for form phone snapshot, profile fallback, walk-in mapping, invalid request phones and cross-owner access; existing booking regressions.
- Frontend tests for request phone transmission, owner mapping, exact copied contents (leading zeros/date/time), empty phone, clipboard failure and template actions.
- Production build and read-only local server checks. No database/schema changes, Git pushes or real bookings/messages during verification.

## Result
- Added optional validated `customerPhone` to customer booking requests and stored the trimmed contact snapshot using the existing phone column. Existing request constructors remain compatible. Legacy online history uses profile phone when a snapshot is unavailable.
- Added the reusable owner contact component to the active appointment list, calendar cards and new-booking notifications. Both copy actions use the local clipboard, retain leading zeros and report success only when copying succeeds. Summary includes customer, phone, service and exact appointment date/minute in Vietnam time. Missing numbers are labeled and the phone-only button is disabled.
- Customer phone input is labeled, accepts formatted phone numbers and is sent in the booking request. No profile mutation or external messaging was introduced.
- Verification passed: 72 backend booking/security/working-hours tests, 25 focused frontend tests and production build. Frontend peer review found no actionable issue. FE owner appointments and BE ping both returned HTTP 200 locally.
- No database migration or data writes were required for this change. Servers remain running for local testing; no Git push was performed.
