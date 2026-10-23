# Shared primary button palette

## Implementation plan

Use the supplied header login sample as the palette reference: face `#f9a8b6`, hover `#f493a4`, base `#df8297`, white foreground. This supersedes the darker auth palette and the previous CTA color guideline. Keep dimensions, typography, business logic and existing auth press behavior. Secondary, utility, destructive and green success states keep their roles.

Define CSS tokens once and expose them through Tailwind primary colors. Apply them to shared Button, auth, public search/booking/business actions, customer review/security, owner actions and shared owner/admin primary styles. Remove promotion-banner custom classes that override its primary variant with a white background and dark foreground.

## Review and verification

The header login sample has no white overlay: browser computed styles show white text, opacity 1, no pseudo-element content, no ancestor opacity/filter and the button as the top element at its center. Pastel pink itself has low contrast with white; preserving the user's requested palette does not make this combination WCAG AA compliant.

Hermes review identified a missed shared owner style and conflicting confirmation icon classes; both were corrected. No API or submission handler changes.

Verification logs: `/tmp/ellora-primary-palette-build.log`, `/tmp/ellora-primary-palette-tests.log`. Screenshots: `/tmp/ellora-primary-palette/`. Auth suite: 17 tests passed. Authenticated owner/admin screens are checked in source because no authenticated session is available.
