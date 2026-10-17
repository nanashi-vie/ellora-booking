# Restore access to salon profile and image approval

## Problem and plan
- The owner could not select a location because an existing cover-image proposal is pending. The user then reported that admin could not find the approval screen. Read-only inspection confirmed that `SalonChangesComponent` already handles PROFILE/COVER/GALLERY review, but no production route or template references it. The existing approvals page lists only new salon registrations.
- Add an ADMIN-guarded child route `/admin/salon-changes` that lazy-loads the existing review component. Add a clearly named admin navigation item for profile/image updates and clarify the separate registration approval label.
- Give the restored page the existing `admin-page` / `admin-page-header` styling and one h1, retaining the shared admin layout. Preserve its existing pending list, before/after preview, pagination, approve/reject calls and messages. No backend, database, permissions, approval decisions or pending records are changed.
- Preserve all current map, mail, guest-booking work and local host settings. Follow the user's prior Codex planning/review authorization. The local design skill excludes dashboard/product UI; keep the established admin layout.

## Verification plan
- Exercise the real admin navigation and production route with stubbed API data containing a pending COVER request. Verify access to the preview and mocked approve/reject actions, along with unchanged registration route and ADMIN guards.
- Run relevant route/navigation/approval tests and the production browser/server build. Inspect the actual admin navigation and restored review page on desktop/mobile with local fixtures; do not approve or reject real proposals as a diagnostic.

## Results
- Restored the guarded route and explicit `Duyệt cập nhật` menu item. The original approvals route remains available as `Duyệt đăng ký`. The existing queue now uses the shared admin page/header styles and a clear page title; its API and decision logic are unchanged.
- Added integration coverage that uses the production lazy route, real admin navigation/layout and real review component. Pending COVER previews, immutable request IDs for mocked approve/reject calls, separate registration review and signed-out/customer/owner/child-guard restrictions are verified.
- Joint navigation, moderation, shared layout and role verification passed 31 tests across four spec files. Production browser/server build passed. The related view-only owner-map follow-up separately passed 28 tests and build verification.
- Browser checks used actual production routes, Header, AdminLayout/navigation and review templates with local mock APIs. On desktop, clicking `Duyệt đăng ký` then `Duyệt cập nhật` reached the correct pages and active menu states. Pending image before/after previews loaded and both decision buttons were visible. Mobile 390px and desktop 1440px layouts had no horizontal page overflow; mobile navigation keeps its existing horizontal scrolling behavior.
- Screenshots were saved outside Git as `admin-salon-changes-mobile.png` and `admin-salon-changes-desktop.png`. No real request was approved or rejected, and no real profile/image/database row was changed. Temporary fixture sources/configuration were removed; changes remain local and are not pushed/deployed.
- Independent final verification approved the completed fixes. Temporary fixture servers were stopped; the main frontend on 4200 and backend on 8080 still return HTTP 200.
