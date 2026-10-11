# 2026-10-11 - Public Render ping endpoint

**Context:** Render backend needs a lightweight endpoint for external periodic requests.

**Plan:** Add GET /ping under the existing /api context path, permit anonymous GET only,
reuse ApiResponse, disable response caching, and avoid database calls or new dependencies.
Verify anonymous access and that protected routes still require authentication.
The user authorized Codex to perform planning, review and verification instead of Hermes.

**Decision:** GET /api/ping returns HTTP 200 with success=true and message=pong.
This indicates HTTP responsiveness only, not database or dependency health.

**Reason:** External requests can reach the service even when no browser is open.
A timer inside the backend cannot run while the backend is asleep.

**Impact and setup:** Deploy the backend, then configure an external HTTP scheduler
to GET https://<your-service>.onrender.com/api/ping every 5 minutes without an
Authorization header. Expect HTTP 200. No scheduler has been configured by this change.
Render Health Check Path may also use /api/ping, but that setting does not replace
external scheduled requests. Free-plan quotas and restarts still apply; this is not
an uptime guarantee. See https://render.com/docs/free.
