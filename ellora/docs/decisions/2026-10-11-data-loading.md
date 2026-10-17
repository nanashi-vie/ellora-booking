# 2026-10-11 - Reduce avoidable data-loading waits

**Context:** Every backend request currently waits for a Cognito token, including
public salon reads. Supplying a token runs revocation and user database lookups
in SecurityConfig. Salon detail also waits for five independent responses before
showing any content. These are code findings; production timing is unverified.

**Plan:** Bypass automatic token lookup for GET requests in the existing public
/customer/salons namespace and /ping only. Preserve authentication elsewhere.
Render salon detail sections as their parallel requests finish, reset all section
state on navigation, and ignore responses from an older route or destroyed page.
Verify protected request headers, URL boundaries, progressive rendering, errors
and stale-response handling with focused tests, then build the frontend.

**Decision:** No persistent data or role cache, database schema changes, new
dependencies, infrastructure changes, or production URL changes. Keep route
authorization guards and all booking/owner/admin API checks intact.

**Additional owner scope:** Dashboard currently loads salon/summary, up to ten
booking pages, services/reviews, then revenue in sequential stages. Publish the
summary immediately, and run independent services, reviews and revenue requests
alongside the existing booking pagination. Keep pagination limits and calculations
unchanged. Test that delayed booking pages do not block summary or other requests.

**Production check:** The frontend domain's /api/ping currently returns the HTML
application shell. The Render backend URL in api.config.ts returns JSON pong.
One warm measurement returned ping in 489 ms and salon list (size=1) in 668 ms;
these are single observations, not a latency baseline or a post-deploy comparison.

**Impact:** Public reads avoid unnecessary auth/database work for signed-in
customers. Salon details no longer wait for reviews or nearby recommendations to
display the salon itself. Errors remain visible while successfully loaded sections
stay available. Hosting and database latency require production measurement.
