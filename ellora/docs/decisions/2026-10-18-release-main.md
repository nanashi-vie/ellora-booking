# Release accumulated booking and public search work to main

## Authorized scope and plan
- The user explicitly requested pushing the completed code and merging it into `main`. Include the pending reminder/guest booking, moderated owner location, admin approval navigation, public salon layout and functional search/nearby work, together with the previously completed owner/booking/admin commits on `dev_V2`.
- Preserve the user's earlier localhost-only exclusion: do not stage `code/frontend/angular.json` or `decisions/2026-10-11-local-dev-hosts.md`. Keep secrets, environment files, generated files and browser fixtures out of Git.
- Fetch remote refs, commit reviewed source on `dev_V2`, then integrate that branch with current `origin/main` in a separate managed checkout. Preserve existing main changes, including the production API endpoint and homepage fixes. Do not reset or switch the running local checkout or the user's existing dev worktree.
- Review merge conflicts if any and verify the integrated tree before publishing. Push the feature branch and the resulting main merge without force; if the remote advances, fetch and reconcile again. Respect remote branch protection rather than bypassing it.

## Existing verification and deployment prerequisites
- Feature decision notes record the independent reviews, backend regression/readonly PostgreSQL checks, frontend suites, final production build and real-browser QA. Repeat checks on the integrated tree when main changes or conflict resolutions affect the tested source.
- Supabase uses ddl-auto:none. The guest-email addition in `code/backend/src/main/resources/db/guest-self-booking.sql` has already been applied to the configured shared database. Prior booking confirmation and owner schedule migration scripts remain in the release. Do not run migrations or create business records as part of this Git operation.
- No deployment result is assumed from a successful Git push; report verified remote branches/commits and any material remaining limitation.
