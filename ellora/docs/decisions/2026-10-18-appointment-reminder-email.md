# Customer email reminder before an appointment

## Plan and acceptance criteria
- The customer receives one automatic reminder around one hour before a confirmed online appointment, using Vietnam time and the existing Ellora HTML/plain-text mail queue. Include salon, service, appointment time, address and salon phone when available.
- Scan existing and new appointments every minute in the interval `(now, now + 1 hour]`. Only `CONFIRMED` bookings with a customer/email qualify. A delayed/restarted backend catches up while the appointment is still upcoming; it never sends reminders after the appointment starts.
- Fetch at most 100 candidates with already-queued reminders excluded before pagination. Enqueue using PostgreSQL `ON CONFLICT (booking_id, kind) DO NOTHING` and the existing unique constraint, in a short transaction separate from delivery. No new schema, dependencies, public API or frontend changes.
- Recheck current booking status/time/customer immediately before each reminder send/retry. Discard permanently invalid or expired unsent reminders; defer a future rescheduled appointment to its new reminder time. Never label discarded mail as sent. Refresh contact/details from the current booking. Do not add booking write locks after queue locks: booking flows already have their own lock ordering.
- Preserve normal mail enablement, 10-second delivery worker, retry/backoff and existing notification kinds. The existing SMTP at-least-once crash window remains; a cancellation concurrent with an SMTP send cannot retract an accepted message. Sleep/network failures can delay delivery.

## Verification plan
- Fixed-clock tests: exact one-hour boundary, future/past exclusion, Vietnam midnight/year boundaries, status/customer/email exclusions, repeated/conflicting enqueue, skipped cancelled/started/expired mail, expiry during a batch/retry, current recipient/content and UTF-8 HTML/plain-text output.
- Run backend regression tests with mocked SMTP/database, inspect PostgreSQL query plans without executing inserts against the configured database, peer-review and restart local backend with mail enabled. Do not create test bookings or send synthetic emails to real recipients.

## Workflow
- Codex handles planning/implementation with peer review and verification under the user's earlier authorization to use the Codex workflow in this repository.

## Results
- Added the one-minute candidate scanner, atomic outbox insertion, reminder template title and current-state checks/defer/discard logic in delivery. Existing mail types retain their behavior; no database migration or frontend change is required.
- Peer source/test review found no blocker. Backend `mvn test` passed all 180 tests (21 new reminder tests), with zero failures/errors/skips. The first sandboxed run stalled in Java/Mockito on Windows; the rerun outside that sandbox passed.
- Read-only PostgreSQL `EXPLAIN` verified the actual native insert query and its unique conflict arbiter, and the equivalent candidate selection query. No inserts were executed for diagnostics and no synthetic booking/email was created.
- Local Supabase-profile backend restarted successfully with mail enabled; backend `/api/ping` and frontend returned HTTP 200. This task has not been committed/pushed/deployed.
