# Auth primary button press effect

- Apply the requested “don't push me” effect only to submit buttons in login, registration/email confirmation and password reset. Google, resend, back and password visibility controls keep their existing styles and behavior.
- Share a single Sass mixin in `features/auth/_primary-button.scss`. Keep existing typography, button dimensions and corner radii. Use an inset border rather than adding border width so the existing button height is preserved; reserve 6px below the button for its raised base.
- Replace the login overlay, registration shimmer and scale effect with a hard 6px base, 3px hover translation and 6px active translation. Transitions last 175ms; fine-pointer devices get hover feedback and touch devices retain active feedback.
- Use white text with the rose palette: face `#c04a76`, hover `#ad4168`, base `#81334f`. The face is a lighter rose guided by the requested `#ffb8c6`; the reference color itself is too pale for readable white text (1.62:1 contrast), while the selected face keeps 4.68:1 contrast. Success retains a green face and white text; disabled/loading do not animate. Keyboard focus has a visible outline. Reduced motion removes transitions and translation while retaining color/shadow state feedback.
- No auth service, API, form submission logic, dependencies or buttons outside auth change.

## Verification

- Run the existing auth specs using the temporary tsconfig/isolation setup documented in the typography decision; the standard suite's unrelated stale-spec blockers remain unchanged.
- Production build and browser checks cover desktop/mobile dimensions, white text, raised/hover/pressed geometry, keyboard focus and absence of the old overlay/shimmer. Review loading/disabled/success selectors against existing auth state bindings.
- Local preview: `http://127.0.0.1:4300`; verification logs and screenshots are saved outside Git under `/tmp/ellora-auth-button-*.log` and `/tmp/ellora-auth-buttons/`.
- Final results: production build passed (existing Leaflet CommonJS warning only); all 17 auth tests passed across three files. Browser checks at 320px/390px/1440px showed white text, preserved 54px login/register and 50px reset button heights, 6px reserved base space and no horizontal overflow. Actual pointer hover produced a 3px translation, held Space produced 6px, and keyboard navigation exposed the focus outline. Old pseudo-element content is absent. Loading/disabled/success and reduced-motion rules were reviewed statically against the existing bindings; no live password reset or account operation was performed. Independent code review approved with no remaining findings.
