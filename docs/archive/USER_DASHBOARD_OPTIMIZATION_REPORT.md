# User Dashboard Optimization — Phase 6

## Baseline before changes

Static inspection of `src/app/(subsystems)/info/user/dashboard/page.js` found a
dashboard effect that:

- fetched the full `/info/api/notifications` response on mount;
- repeated that request every 30 seconds, when the page became visible, and
  when the browser came online;
- created a separate `info_notifications` Realtime channel; and
- stored the unread count in `unreadAlerts`, which was only written and never
  read or rendered by the dashboard.

The user shell already loads notification/message counts in `MobileNav`, and
`UserTopHeader` consumes the shell's `daet-unread-counts` event. The dashboard
also renders `UserTopHeader`, so its additional notification polling and
subscription were redundant.

The shared browser page at `localhost:3010` returned a Chrome error page during
baseline inspection. No authenticated dashboard timing, Network-panel capture,
Core Web Vitals, or bundle-size baseline was available. No runtime improvement
is claimed from an unmeasured browser session.

## Optimization implemented

Removed the unused dashboard unread-notification state and its fetch/polling,
event listeners, and dedicated Realtime channel. Notification counts and
notifications remain handled by the existing user-shell navigation. Feed,
profile, interaction, messaging, and notification API contracts were not
changed.

Source-level effect: the dashboard no longer adds its own notification request
on mount or approximately two scheduled requests per continuously visible
minute, plus online/visibility refreshes; it also no longer opens its dedicated
notification channel. These are counts inferred from the removed code, not
measured network or latency results.

## Other bottlenecks reviewed but not changed

- The dashboard combines locally fetched blog, event, forum, and tourist-spot
  rows (up to 40 per category) with the feed API's capped post/repost results,
  then initially displays only the first 10 items. This is client-side
  presentation paging, not cursor paging. Server pagination needs a stable
  cursor across the merged/ranked content types and contract tests first.
- The dashboard Realtime hook watches multiple content tables and invokes a
  whole-dashboard refresh when matching changes arrive. It already debounces
  bursts; replacing that behavior with per-section updates needs race and
  visibility tests.
- Messaging endpoints still return large message collections, including up to
  1,000 rows from the main messages endpoint. Conversation pagination and
  unread aggregation require an API compatibility plan.
- Navigation owns the notification/message badges. The dashboard-specific
  redundant notification work was removed, but the shell's separate header and
  mobile navigation polling paths were not refactored in this slice.

## Validation

- `npm test`: 270 passed, 0 failed.
- `npm run build`: succeeded; all routes compiled and 133 static pages were
  generated.
- `git diff --check`: passed.
- Targeted ESLint reports one pre-existing
  `react-hooks/set-state-in-effect` error and seven warnings in this large
  dashboard file. Running the same lint against the pre-change `HEAD` version
  produced the same error and warning counts; those unrelated findings were
  left unchanged.
- Browser timing, Network-panel, Core Web Vitals, and bundle measurements
  could not be collected because the shared localhost page was unavailable.
