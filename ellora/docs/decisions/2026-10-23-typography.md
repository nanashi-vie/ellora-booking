# Typography consistency

- Use Minion Pro for headings and Inter for body text, controls, buttons, prices and metrics. CSS variables `--font-serif` and `--font-sans` in `src/styles.css` are shared by component styles and Tailwind utilities.
- Reuse the existing Minion Pro assets, including their real italic weights. Bundle Inter 5.3.0 Latin, Latin Extended and Vietnamese variable fonts (normal and italic) from `@fontsource-variable/inter`, licensed OFL-1.1; retain its license in `public/fonts/inter/LICENSE`. Fonts use `font-display: swap`. No runtime dependency or external Google Fonts stylesheet is needed.
- Chart.js canvas labels need explicit Inter defaults in the existing owner/admin chart providers because canvas does not inherit CSS fonts.
- Override Leaflet's container font so map popups, addresses and attribution use Inter too; preserve the library's zoom-control symbol fonts.
- Authentication forms use 600 weight for labels/actions and enough line height for Vietnamese accents. Remove text shadows that doubled letter edges. At the existing mobile breakpoint, set form-panel flex basis to 100% so the intended full-width layout also works with Inter; allow login metadata to wrap.
- Keep colors, routes, APIs and business behavior unchanged.

## Verification

- Browser font styles and snapshots checked on login, registration, password reset, home, search, business landing and the empty booking screen at 390px/1440px; auth forms also checked at 320px. No document horizontal overflow. Inter Vietnamese and Minion Pro assets are observed by the browser; no font warnings/errors were recorded. Screenshots and audit output: `/tmp/ellora-font-audit/`.
- Salon detail content and authenticated customer/owner/admin screens cannot be verified end to end in this session: the API is unavailable and no authenticated session is present. Their typography declarations are covered by the shared rules and source review.
- Production build passed. The existing Leaflet CommonJS optimization warning remains.
- The standard frontend test command is blocked during compilation by existing stale tests: `features/bookings/my-bookings/my-bookings.component.spec.ts` imports a missing component, and `services/profile-management.spec.ts` references removed Profile members. Keep these unrelated tests unchanged. The focused run uses an ignored temporary tsconfig excluding those two files and includes auth, shared components/directives and owner dashboard specs.
- Focused tests passed: **70/70 across 12 files** with an ignored Vitest runner config enabling `test.isolate: true`. Without isolation, the existing salon-card spec defines a non-configurable `IntersectionObserver`, making seven reveal-on-scroll tests fail depending on execution order. Preserve that failed run in `focused-tests-shared-globals.log`; the passing run is `focused-tests.log`, both in `/tmp/ellora-font-audit/`.
- Independent static review approved after fixing chart and Leaflet font coverage. End-to-end verification remains limited as described above.
