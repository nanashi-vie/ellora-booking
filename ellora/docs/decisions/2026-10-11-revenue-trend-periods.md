# Owner dashboard revenue trend periods

## Plan
- Connect the existing Day/Week/Month controls to `OwnerApiService.revenue(from, to, groupBy)` without changing the backend contract.
- Day and Week compare the current month through today against the previous calendar month. Month compares the current year through today against the previous calendar year.
- Align daily buckets by day of month, weekly buckets by their order within the requested month (backend weeks start Monday), and monthly buckets by month of year. Leave future or nonexistent buckets empty rather than inventing zero revenue.
- Load the trend independently of booking pagination. Show loading/error states, allow retry, and ignore obsolete responses after a filter change or component destruction.
- Preserve the existing dashboard design and the monthly summary cards. Keep the local-only host configuration out of this change.

## Verification
- Focused dashboard tests for period ranges, aligned values, January rollover, stale responses, loading, and retry.
- Production frontend build and diff review. No new dependencies or backend changes.

## Result
- Eight focused dashboard tests passed, including period changes, leap-year/January boundaries, retry, and obsolete responses.
- Production frontend build passed. This follow-up remains local; the earlier workspace/email/loading bundle was pushed and merged into dev separately.
