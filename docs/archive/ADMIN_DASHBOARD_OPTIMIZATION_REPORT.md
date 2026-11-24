# Admin Dashboard Optimization — Phase 7

## Baseline before changes

The shared browser page was unavailable (`chrome-error://chromewebdata/`), so no
authenticated admin load timing, Network-panel capture, or Core Web Vitals
measurement could be collected.

Static inspection found two owners fetching the same staff unread count:

- `StaffNotificationWidget` in `src/app/(subsystems)/info/admin/layout.js`
  loads `/info/api/notifications?scope=staff`, obtains `unread_count`, and
  already refreshes it on Realtime events and every 30 seconds.
- `AdminSidebar` separately requests
  `/info/api/notifications?count_only=true&scope=staff` on mount and every 30
  seconds when the current role has `moderation.manage`.

Both use the same staff notification scope for the signed-in user. The sidebar
needs only the count; it does not need its own refresh loop.

## Optimization implemented

`StaffNotificationWidget` now publishes each successful unread-count update
through a window event. `AdminSidebar` still performs its initial count-only
load as a fallback, then listens to that event instead of polling independently.
The sidebar's existing `moderation.manage` permission gate is unchanged; the
widget retains its toast UI, full notification fetch, Realtime subscription,
and 30-second reconciliation loop. No route, authorization rule, or response
shape changed.

Source-level effect: while the sidebar remains mounted, this removes its
additional two count-only requests per minute after the initial fallback.
This estimate follows the configured 30-second interval; it is not a measured
latency or network-panel result.

## Validation

- `npm test`: 270 passed, 0 failed.
- Targeted ESLint on `AdminSidebar.js` and `StaffNotificationWidget.js` passed.
- `npm run build`: succeeded; all routes compiled and 133 static pages were
  generated.
- `git diff --check` passed.
- No authenticated runtime check or before/after browser measurement was
  possible because the shared localhost page was unavailable.
