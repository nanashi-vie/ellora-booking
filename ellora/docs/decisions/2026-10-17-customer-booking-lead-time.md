# Customer-selected booking time and one-hour notice

## Plan and scope
- Let customers enter a start time to the minute, rather than restricting them to half-hour buttons. Keep optional half-hour suggestions for convenience.
- Customer bookings must start at least one hour after the current instant, using Asia/Ho_Chi_Minh business time. Round the earliest selectable minute upward; apply the same rule across midnight and month/year boundaries.
- Require the entire service to fit within the salon's hours and preserve dated/weekly closures and staff-conflict checks.
- Frontend recomputes the current time on date/time interaction, advancing to confirmation, and submission. Backend enforces the minimum after acquiring the salon lock, including direct API requests and stale pages.
- Owner walk-ins retain their current immediate booking workflow and half-hour validation; this request changes customer booking only.

## Verification
- Backend fixed-clock tests: past/too-soon/exact boundary/arbitrary minute/Vietnam date rollover, existing availability/security/email regressions.
- Frontend tests: custom minute, minimum/maximum time, future dates, rollover, stale confirmation, closures and full service duration.
- Production build; keep both local servers running so the user can test. No schema changes or real booking creation during checks.

## Result
- Updated the customer booking component/template/styles and hour-selection tests; added backend lead-time validation with a fixed-clock test constructor and updated dated availability/email test fixtures.
- Passed 57 focused backend tests, 11 frontend booking tests, and 2 supplementary real-template tests covering the custom input and stale selections. Production frontend build passed.
- Peer review approved frontend behavior; backend review confirmed Vietnam instant comparison after the salon lock, minute precision, and preserved walk-in behavior.
- Local frontend and backend both respond HTTP 200 after the update. No database/schema changes or real booking writes were performed.
