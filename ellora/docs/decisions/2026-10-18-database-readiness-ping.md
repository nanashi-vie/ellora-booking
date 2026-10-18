# Database readiness ping

## Implementation plan
- The user authorized a database-aware UptimeRobot check. Read the project AI context, conventions, workflows, architect/implementation prompts and backend/API guidelines. Use the previously authorized Codex substitute for Hermes, followed by independent review and verification.
- Preserve `GET /api/ping` as database-independent liveness. Add only exact public `GET /api/ping/db`; all other HTTP methods and protected routes keep current authorization.
- A small service borrows one connection from the existing configured DataSource and executes only `SELECT 1`. Set JDBC statement query timeout to **3 seconds** and validate the returned value. Close ResultSet, Statement and Connection with try-with-resources on success and every failure path.
- Reuse the existing Hikari pool, whose Supabase configuration has a **30-second connection acquisition timeout**. Do not change pool settings, create a second pool or executor, or claim a three-second total HTTP deadline. Query timeout and acquisition timeout are separate; JDBC/network cancellation may add driver-dependent time.
- Use an immediate `tryLock` single-flight guard: at most one database probe per backend instance; concurrent probes return 503 immediately without borrowing another connection or queueing work. Always release the guard. There is no response cache or scheduler.
- Return the existing API envelope with 200/`success=true` and `{status:'UP',latencyMs}` after a successful query; return generic 503/`success=false` and `{status:'DOWN',latencyMs}` for connection/query/driver errors, invalid results or a busy probe. Both responses use `Cache-Control: no-store`. Never expose or log SQL exception messages, database URLs, credentials or internal pool state.
- Keep controller transport handling separate from the probe service; leave the existing liveness controller and business services untouched. No dependency, schema, business-data write, mail/payment change, global timeout change or deployment is included.

## Verification
- Focused service tests: correct query/timeout, healthy/invalid results, acquisition/query/statement/read/close failures, resource cleanup, retry after failures and concurrent probe rejection/recovery.
- MVC/security tests: anonymous exact GET success/failure/no-store/generic body, unchanged liveness without a readiness invocation, other methods and unrelated routes remain protected.
- Coordinate stopping the existing local backend before Maven compilation. Run focused tests and the relevant full regression suite, restore the unchanged local launcher, then make a small read-only real readiness/liveness probe. Independent review/strict verification must pass before completion.
- Point UptimeRobot's HTTP monitor at `/api/ping/db` when database readiness is intended. A 503 includes busy/timeout/failure; `/api/ping` remains the lighter process-only check. This adds monitoring, not an assurance that every business query succeeds or a guarantee against provider suspension.

## Results
- Implemented the separate readiness service/controller and exact anonymous GET permission; the existing liveness controller is unchanged. Independent source review passed with no actionable findings.
- All 17 focused ping tests passed, covering resource cleanup, timeout setup, failure recovery, concurrent-probe rejection and HTTP/security behavior. The full backend regression suite passed **373 tests, zero failures/errors/skips**, including 13 read-only PostgreSQL search fixtures.
- Restored the existing local backend with the unchanged `run-supabase.ps1` configuration. Two real anonymous `/api/ping/db` requests returned HTTP 200, `Cache-Control: no-store`, `success=true`, `status=UP`, and measured query/probe latency of 77 ms and 71 ms. `/api/ping` still returned HTTP 200, `no-store` and `pong`.
- The live probes executed only `SELECT 1`; failure and concurrency behavior were verified with isolated tests rather than disrupting the configured database. No schema or business-data writes, mail changes, commit, push or deployment were performed for this change. Final independent verification is recorded separately.
