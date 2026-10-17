# Unified owner schedule editor

## Plan and behavior
- Merge the two working-hours / unexpected-days-off cards into one schedule card with a month calendar and selected-day editor.
- Selecting a date shows its recurring weekday hours and its date-specific closure. Label hour edits explicitly as applying to every matching weekday; retain the existing seven-day save API and separate closure save API.
- Keep apply-to-week and all weekday controls in a compact disclosure within the same card. Mark recurring days off separately from dated closures, including accessible labels.
- Preserve the selected date and unsaved hour edits when saving/removing a dated closure. Removing an exception restores the weekly schedule, which may still be closed.
- Preserve the user's existing rule: new closures must be scheduled from tomorrow onward in Vietnam time, with affected appointments handled by the backend. No API/schema changes or real appointment edits during verification.

## Verification
- Read-only peer review of UX/API scope completed before implementation.
- Focused component tests for selected weekday mapping, weekly saves, exceptions, date boundaries, failure/retry, and one-card calendar rendering; frontend production build and local layout inspection.
- Retain the established Ellora styling; the repository's design-taste skill excludes dashboard/product editors.

## Result
- Updated the schedule component, its template/styles, and focused component tests; no backend or database changes were needed.
- Twelve focused component tests passed. Production frontend build passed and `/owner/profile` remains accessible locally.
- Peer review approved the implementation. Added the cancellation consequence beside the recurring-closure checkbox so it is visible before saving.
- Rendered an actual Angular component preview with mocked API data and verified the combined calendar, hours and dated-closure controls. Browser surfaces were unavailable, so screenshot-based desktop/mobile validation could not be completed; responsive layout was reviewed in source.
