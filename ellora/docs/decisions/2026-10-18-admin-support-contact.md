# Admin-managed support contact

## Plan

Connect the Owner sidebar Help action to a responsive contact dialog. Store one platform-wide contact record in the backend, expose only a public read endpoint for rendering the dialog, and protect the update endpoint for Admin. Add an Admin settings page for email, phone, and Facebook URL; validate values and include an additive SQL migration because Supabase runs with `ddl-auto: none`.

## Acceptance checks

- Admin can read and update the three contact fields.
- Owner can open and close a dialog and activate `mailto:`, `tel:`, and Facebook links for configured values.
- No hard-coded contact details; an empty configuration has clear fallback copy.

## Verification

- Angular development build completed successfully.
- `git diff --check` completed successfully.
- Backend compilation could not be run in this workspace: neither Java/Maven nor a Maven wrapper is installed.
- Apply `code/backend/src/main/resources/db/platform-support-contact.sql` in Supabase before deploying; local `ddl-auto:update` creates the table automatically.
