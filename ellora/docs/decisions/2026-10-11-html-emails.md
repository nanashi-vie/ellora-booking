# 2026-10-11 - Ellora HTML notification emails

**Plan:** Keep existing notification content, recipients and transactional queue.
Render all three kinds (new booking, confirmation, admin billing reminder) in a
shared pink HTML layout at delivery. Send UTF-8 multipart alternative with the
original plain text. Escape all dynamic content. Preserve SMTP retry handling.
Verify MIME alternatives, escaping, routing and retry tests, then inspect the diff.

**Decision:** Use table layout and inline CSS for email clients, without external
assets or dependencies. Existing queued plain-text messages also receive the layout.
Billing reminders remain initiated by admin and retain amount, rate, deadline and
transfer instructions. No automatic reminder schedule or payment logic is added.

**Impact:** BookingEmailService delivery and notification tests change; no schema
or API change. The user authorized Codex to handle the implementation workflow.
