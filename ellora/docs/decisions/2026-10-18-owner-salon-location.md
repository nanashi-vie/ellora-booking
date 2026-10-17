# Owner salon location with OpenStreetMap

## Implementation plan and scope
- Let owners select their salon location in the existing profile form, using a map click, a draggable pin or accessible coordinate inputs. The user chose OpenStreetMap without an API key or billing account. Preserve the existing Ellora layout; the local design skill excludes dashboard/product forms.
- Use bundled Leaflet 1.9.4, dynamically imported only after the owner opens the map in a browser. This dependency is approved as the small established map implementation needed for the chosen provider. Bundle its CSS locally and draw the pink pin with a CSS DivIcon; no CDN SDK, external marker asset, Google configuration, geolocation or geocoder is needed.
- Load only visible interactive tiles from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, show linked OpenStreetMap attribution and use normal browser caching/referrer behavior. No offline downloads, bulk fetching or tile prefetch. The public tile service is best effort; a higher-volume deployment may need a dedicated tile provider.
- Reuse the existing nullable `salons.latitude` / `longitude` columns and existing profile-change JSON. Add optional coordinates to `SalonRequest`, owner types and approval previews. No database migration or new endpoint is needed.
- Validate coordinates as a complete finite pair within latitude [-90,90] and longitude [-180,180]. Values of zero are valid. Omitted/null pairs preserve existing coordinates for older clients and old pending requests. Explicit pin removal is outside this task.
- Owner profile submissions remain pending until admin approval. Submitting or rejecting a request does not change the live pin. Coordinate-only changes are valid proposals; old pending JSON must not clear an existing pin on approval. Keep owner/role guards unchanged.
- The form keeps its selected coordinates separate from the map viewport. Changing address/city/district invalidates an existing selection and requires a new selection before submission. An existing salon without a pin can still edit other profile fields. Loading, retry and manual-coordinate fallback must remain usable when map tiles cannot load.
- Add only the tile hostname to SSR image CSP. Retain existing script/connect/frame policies and disabled geolocation. No public customer map is added in this owner-first task.

## Verification plan
- Backend unit/MVC tests: coordinate validation and boundaries, zero, legacy constructors/JSON, coordinate-only pending changes, approve/reject behavior, no-op detection, ownership/roles and registration compatibility. Run the backend suite with the local backend stopped, then restart with its existing mail configuration.
- Frontend tests: nullable coordinate loading, map selection/drag, address invalidation, pending/save/reset behavior, preview zero values and SSR/lifecycle cleanup. Run relevant existing booking/guard tests and a production browser/server build.
- Inspect the real owner form/picker in a local isolated fixture on mobile and desktop if authentication prevents read-only inspection. Do not create real profile proposals or change a real salon just for verification. Verify actual Leaflet tiles and attribution in the browser.
- Independent peer review and verification follow the user's earlier authorization to use Codex in the repository workflow. Preserve all earlier uncommitted mail/guest-booking work and local-only host settings. No push or deployment is requested for this task.

## References
- https://leafletjs.com/download.html
- https://leafletjs.com/reference.html
- https://operations.osmfoundation.org/policies/tiles/

## Verification results
- Backend full Maven suite passed: 261 tests, zero failures/errors/skips, including 32 new location cases. Independent backend review approved the validation, authorization and legacy JSON behavior.
- Restarted local backend with its existing Supabase/mail configuration. Both backend `/api/ping` and frontend returned HTTP 200. No schema change or real salon/profile proposal was needed.
- Frontend verification passed 69 tests across eight spec files (picker/lifecycle/SSR, real loader interop, profile/preview, moderation and existing booking/guards). Production browser/server build passed. Leaflet is a separate lazy chunk; its stable CommonJS package emits a nonblocking build warning.
- Browser inspection caught a real bundled-module interop error that mocked picker tests could not catch. The loader now unwraps Leaflet's default export, with a regression test that calls the real loader against a default-only module.
- Browser checks with actual Angular profile/picker templates, stubbed owner API and real OSM tiles verified click selection, pin dragging, manual fallback and address invalidation. Layout fits 320px, 390px and 1440px viewports without horizontal overflow; attribution remains visible. Screenshots are saved outside Git in the task visualization directory. No real profile change was submitted.
- Rebuilt the isolated fixture directly from final sources, then clean-reloaded and opened the map: 12 real OSM tiles loaded, marker/attribution appeared and no map error was reported. Temporary fixture sources/configuration were removed and browser viewport settings restored.
- Built SSR server served its local CSS with HTTP 200; its actual CSP permits the canonical tile image host and retains the existing script/frame protections. The temporary SSR verification process was stopped afterwards. BE/FE local remain available; changes have not been pushed or deployed.
- Independent final verification approved the completed implementation after the real-browser loader fix and final fixture check.

## Follow-up: viewing while editing is locked
- The owner reported that the map-open button was disabled. The current pending/saving input disabled map viewing along with editing, leaving no explanation next to the location section.
- Plan: allow opening, panning and zooming the map while profile editing is locked. Keep coordinate selection, pin dragging, manual application and profile submission locked. Show the actual pending/saving reason beside the map and use a view-only button label. Preserve the existing approval workflow and database data.
- Verify with picker/profile regression tests and production build; inspect the view-only state in the browser without submitting a real profile change.
- Read-only diagnosis confirmed that the reported salon had a pending COVER proposal and no saved pin. No record was modified. Map-open now remains available; pending/saving explanations are shown next to the map while selection, dragging, manual inputs and submission stay locked.
- Focused picker/profile/loader verification passed 28 tests and production browser/server build passed. An actual pending-COVER fixture opened successfully with 12 real tiles; the marker was not draggable, the canvas was not inert, and manual inputs/submission remained disabled. The missing admin navigation to process that proposal is tracked separately in `2026-10-18-admin-salon-change-navigation.md`.
