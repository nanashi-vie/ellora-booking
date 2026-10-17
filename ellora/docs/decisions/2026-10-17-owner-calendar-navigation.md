# Owner appointment day and week navigation

## Plan
- Fix the calendar header controls, which currently have no event handlers, and replace the hardcoded today filter with a selected Vietnam calendar date.
- Keep the day view grouped by employee. Add native date selection, previous/next day, Today and an accessible Day/Week toggle. In Week mode, navigation moves seven days and the header states the Monday–Sunday range.
- Render a real seven-day weekly agenda with appointments ordered by start time and employee names on each card. Chronological cards avoid obscuring appointments for simultaneous bookings with different employees. Each day header opens that day. Retain the existing contact/copy and status actions.
- Filter the active appointment action list to the selected day/week so its contents agree with the calendar. Continue using the existing complete paginated owner booking collection; no API/database changes or new dependencies.
- Notification focus must select the appointment's actual date before scrolling/highlighting it, including a booking loaded after the notification selection. Keep DOM operations browser-only and clear scheduled work on component teardown.
- Preserve Ellora styling, use wrapping header controls and horizontally scrollable calendar columns on small screens, and state empty days explicitly. Keep the existing active-booking status scope.

## Verification
- Focused component tests for day/week navigation, date picker, Monday/Sunday and month/year boundaries, selected-period filtering/order, actual template toggle/navigation, contact/status actions and notification focus.
- Run related contact and booking-service regressions plus production build; verify running FE/BE local without creating real appointments.
- Peer review the final component, template and tests. No database edits, push or merge.

## Result
- Connected day/week tabs, previous/next controls, direct date selection and Today to the selected Vietnam date. Day mode keeps employee timelines; Week mode shows seven chronological day agendas with employee names and clickable day headers. Both the action list and calendar now agree on the selected period.
- Reused booking card details, phone/summary copy and status controls across both calendar modes. New walk-ins open their actual scheduled date.
- Notification focus waits for booking/employee data, switches to the target date before scrolling and releases timers on teardown. Stale completed/cancelled notification targets are cleared so later polling cannot force the owner back to that date.
- Verification: 23 tests across calendar (10), contact clipboard, booking-service integration and walk-in form passed. Actual template navigation, status buttons and contact actions are exercised. Production browser/server build passed; FE `/owner/bookings` and BE `/api/ping` returned HTTP 200 locally.
- Peer code review approved after the stale-notification correction. Responsive/sticky styles were reviewed and the Angular template was rendered in fixture tests; no enabled browser surface was available for screenshot QA.
- Changes are confined to the owner calendar component/template/styles, its new spec and this note. No API, database, deployment or Git remote changes.
