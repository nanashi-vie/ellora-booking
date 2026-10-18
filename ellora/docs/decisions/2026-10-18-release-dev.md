# Publish the completed booking and workspace updates to dev

## Release scope and plan
- The user requested pushing the completed work and merging it into `dev`. Include the owner schedule/calendar/walk-in changes, customer booking lead time and contact/copy details, completion confirmation/admin dispute handling, consistent admin layout, revenue periods and dashboard phones/portraits, together with their tests, documentation and additive SQL scripts.
- Preserve the earlier exclusion of localhost-only setup: leave frontend `angular.json` and `2026-10-11-local-dev-hosts.md` local. Keep the active Render backend URL from `origin/dev` in the merged result; retain the current local checkout/API configuration for local testing.
- Fetch current remote refs, stage only reviewed application source/tests/docs, check the staged diff and commit on `dev_V2`. Push the feature branch, create a real merge commit using Git's three-way merge tree from the fetched `origin/dev`, and push the resulting fast-forward update to `dev`.
- Do not reset/rebase published history, interrupt running local services, or change the separate checkout that currently owns the local `dev` branch. If a merge conflict occurs, resolve it in isolation and verify before pushing.

## Verification evidence
- Feature implementation checks already passed: backend 130 tests, frontend confirmation/calendar/admin regressions, admin routing/layout 38 tests, dashboard contact/photos 13 tests and production browser/server builds. Peer release audits found no blocking issue or sensitive/config/build artifact to publish.
- Verify the merge parents include both fetched `dev` and the new feature commit; verify deployed API configuration, excluded local files, required feature files and SQL scripts from the merge tree. Confirm remote `dev_V2`/`dev` commit hashes after pushing.

## Additional guest booking, maps and public search release
- The user corrected the new release target from `main` to `dev` before any push. The unpublished main trial merge was aborted; main must remain unchanged.
- Include the reviewed reminder/guest booking, moderated owner location, admin approval navigation, public salon location layout and functional search/nearby source, tests and documentation committed on `dev_V2`. Continue excluding both localhost-only files and all environment/generated/fixture files.
- Integrate with current `origin/dev` in a managed checkout, preserving its production API endpoint and homepage/reveal fixes. Keep the running local checkout and the user's separate dev checkout untouched. Verify the integrated frontend where those existing dev fixes differ from the previously tested source, then push both branches without force.
- Existing feature evidence: backend 297 regression cases and 11 read-only PostgreSQL cases passed; frontend 115-case joint suite plus the final 10-case Search regression run and production build passed. The configured Supabase guest-email migration is already applied; this Git operation does not change database records or run migrations.

## Additional release integration verification
- The conflict-free integration retained the existing DEV production API endpoint, homepage overflow behavior and reveal-on-scroll fixes. Backend and dependency files are identical to reviewed dev_V2.
- On the integrated tree, 23 frontend tests across reveal, Home, Header, Search and the shared form passed; the production browser/server build also passed. The temporary test configuration was removed and generated outputs remain ignored.
- Independent merge audit approved the exact origin/dev and dev_V2 parents, source differences and local-only exclusions. Publication targets only dev_V2 and dev; main is unchanged.
