# 2026-10-11 - Show the owner's business name

**Plan and decision:** Replace the sidebar placeholder with salon.name from the
owner salon response already loaded by BookingService. Share that value through a
signal; reset it when the owner session stops and update it on existing refreshes.
Show loading/error text until the name is available and wrap long names. Preserve
the existing sidebar design and avoid an additional API call. The repository's
design-taste-frontend skill excludes dashboards, so no redesign is applied.

**Verification:** Existing booking integration tests cover loading and session
cleanup; Angular development server must compile the template successfully.

**Follow-up:** Remove the embedded revenue/fee report and monthly billing panels
from Dashboard, including their unused component imports. The dedicated analytics
and billing routes retain those panels. Dashboard summary metrics and charts stay.
This also avoids the embedded panels' duplicate data requests.

**Sidebar follow-up:** Add decorative inline SVG icons for dashboard, salon profile
and billing, matching existing 20px stroke icons and inheriting active-link color.
