# Owner dashboard customer phones and employee photos

## Plan
- Show the existing `BookingItem.customerPhone` below the customer's name in Recent transactions. Preserve the phone as text, trim only surrounding spaces and label a missing number honestly.
- Load the existing owner employee directory independently for real `avatarUrl` values, without delaying the dashboard summary, charts or transactions. Missing/unavailable/broken portraits use employee initials in the same circular space.
- Group and track employee performance by employee id, not name, so two employees with the same name retain their separate totals and correct portraits. Include inactive employees with completed bookings and retain a single unassigned bucket.
- Use existing booking and employee APIs; no backend, database, ranking-period or financial-calculation changes. Preserve the current dashboard design and keep the transaction table within a horizontal scroll wrapper.

## Verification
- Check phone snapshots/leading zero/missing values, same-name employee identities and photos, unavailable/late/broken photo responses and component destruction.
- Run the existing dashboard trend regressions, focused data/template checks and production build; peer-review and verify local availability. No real data edits, push or deployment.

## Result
- Recent transaction rows now show the trimmed customer phone below the name, retaining leading zeros and displaying `Chưa có SĐT` when unavailable. The existing seven-column table stays within a horizontal scroll wrapper.
- Employee portraits load independently into a reactive id-to-avatar map; an unavailable directory cannot block booking data. Performance rows now group/track by employee id, preserving separate totals/portraits for identical names and using one unassigned bucket. Empty or failed portraits display initials in the same 40px circle; outdated image errors cannot remove a newer URL.
- Added five focused data/template tests and retained the eight dashboard loading/trend regressions: 13 tests passed. Production browser/server build passed, peer review approved and the local owner dashboard returned HTTP 200.
- No API/schema, business data, employee photo uploads, Git remote or deployment changes. Temporary test configuration removed; local FE/BE remain running.
