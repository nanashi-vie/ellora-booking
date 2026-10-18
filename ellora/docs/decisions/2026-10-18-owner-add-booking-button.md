# Owner sidebar “Thêm đặt lịch mới”

## Plan

The sidebar button currently has no action. Connect it to the existing walk-in booking form: navigate to `/owner/bookings` with a one-time query marker, let the booking page open its existing modal, then remove the marker from the URL. This works from any owner page and when the booking page is already active, without duplicating booking UI or changing the backend contract.

## Verification

- Confirm the sidebar button navigates with the marker.
- Confirm the booking page opens the existing walk-in dialog and clears the marker.
- Check that Angular subscriptions follow the component lifecycle and no unrelated/local configuration is included.
