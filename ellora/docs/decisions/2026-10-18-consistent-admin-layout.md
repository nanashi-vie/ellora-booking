# Consistent administration layout

## Plan and scope
- The six admin pages currently use full viewport, 1100px and 1024px containers, different padding/title sizes and repeated navigation in different positions. Replace these conflicting page frames with one persistent AdminLayout.
- Keep every existing `/admin/...` URL, lazy feature component and API/business action. Put the admin branch alongside OwnerLayout/MainLayout, protected by ADMIN roleGuard on entry and child navigation. Reuse the existing Ellora site header and account controls; use normal document scrolling and omit the public decorative footer/reveal surface in the management workspace.
- AdminLayout owns one centered frame (max-width 1280px with 16px mobile, 24px tablet and 32px desktop gutters), the stable admin navigation and routed content. Navigation keeps one line and scrolls horizontally on narrow screens. Use min-width:0 and local table/grid scrolling so content cannot expand the viewport.
- Normalize feature roots to `.admin-page`, with one `.admin-page-header`, consistent heading/body/control/card styling in a shared admin stylesheet. Remove local max-width/padding overrides and duplicated navigation. Keep owner-only styles and non-admin layouts unchanged.
- Preserve the dispute page's useful responsive list/detail layout and actions. Clamp content photo grids on small screens and retain tables within scroll wrappers. No new dependency, backend or data changes.

## Verification
- Router integration verifies the real admin guard, persistent shell/navigation across child switches, active menu state and existing deep links. Existing admin dispute and salon-approval tests verify actions continue to work.
- Check responsive frame/gutters, heading/control consistency and nested scroll/overflow; inspect browser screenshots if an enabled browser is available, otherwise state that limitation and use Angular fixture render/source inspection.
- Run focused frontend checks and production build, confirm local routes respond, peer-review final changes and remove temporary test artifacts. No Git push or deployment.

## Result
- Added the guarded admin branch and persistent AdminLayout with the existing Header, one navigation row, 1280px frame, responsive gutters and normal document scrolling. All six URLs remain the same. Feature pages no longer render duplicate navigation or conflicting widths/padding; admin-only shared styles unify headings, forms, cards, buttons and tables.
- Added `html:has(app-admin-layout)` stable scrollbar gutter to prevent width shifts between short and long admin pages; other workspaces retain their existing styles. Capped admin canvas width and clamped the content photo grid to prevent small-screen overflow.
- Browser visual QA used actual rendered Angular feature/layout fixtures with clearly labeled sample data because the checking browser was signed out. At 320px all six pages had the same 16px content left edge, 24px headings and no document horizontal overflow. At 1440px all six had identical 1216px inner content width, 28px headings and admin navigation top at 136px, with no horizontal overflow.
- Desktop/mobile screenshots were saved as visual artifacts. The isolated fixture exporter and temporary test configurations were removed, preview server stopped and temporary viewport reset; production FE/BE remain running.
- Verification passed: 38 focused tests covering real route guards, persistent frame/navigation, all deep links, role revocation, dispute actions and salon-change approval, plus production browser/server build. All six local admin pages and backend ping returned HTTP 200. Source and final style reviews were approved; no API, database, business action or Git remote changes.
