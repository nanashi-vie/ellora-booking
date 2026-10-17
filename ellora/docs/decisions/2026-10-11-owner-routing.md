# 2026-10-11 - Keep owners in the management workspace

**Plan:** Reuse nonOwnerGuard on main-layout children and authentication pages.
Redirect signed-in SALON_OWNER users to /owner/dashboard, including history and
direct navigation. Preserve anonymous browsing and OAuth callback handling.
Mark booking and business registration customer-only. Skip client authentication
on SSR. Update routing regression tests and run focused tests and frontend build.

**Decision:** Apply Angular route guards instead of manipulating browser history.
Owners can browse public pages after signing out. Existing backend role checks
remain the security boundary. Admin routes stay accessible to admins.

**Impact:** Route configuration and role guard tests only; no UI or API redesign.
