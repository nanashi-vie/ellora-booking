# Publish the completed booking and workspace updates to dev

## Release scope and plan
- The user requested pushing the completed work and merging it into `dev`. Include the owner schedule/calendar/walk-in changes, customer booking lead time and contact/copy details, completion confirmation/admin dispute handling, consistent admin layout, revenue periods and dashboard phones/portraits, together with their tests, documentation and additive SQL scripts.
- Preserve the earlier exclusion of localhost-only setup: leave frontend `angular.json` and `2026-10-11-local-dev-hosts.md` local. Keep the active Render backend URL from `origin/dev` in the merged result; retain the current local checkout/API configuration for local testing.
- Fetch current remote refs, stage only reviewed application source/tests/docs, check the staged diff and commit on `dev_V2`. Push the feature branch, create a real merge commit using Git's three-way merge tree from the fetched `origin/dev`, and push the resulting fast-forward update to `dev`.
- Do not reset/rebase published history, interrupt running local services, or change the separate checkout that currently owns the local `dev` branch. If a merge conflict occurs, resolve it in isolation and verify before pushing.

## Verification evidence
- Feature implementation checks already passed: backend 130 tests, frontend confirmation/calendar/admin regressions, admin routing/layout 38 tests, dashboard contact/photos 13 tests and production browser/server builds. Peer release audits found no blocking issue or sensitive/config/build artifact to publish.
- Verify the merge parents include both fetched `dev` and the new feature commit; verify deployed API configuration, excluded local files, required feature files and SQL scripts from the merge tree. Confirm remote `dev_V2`/`dev` commit hashes after pushing.
