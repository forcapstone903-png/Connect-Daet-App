# Social Features and Realtime Optimization — Phase 9

## Scope and baseline

Reviewed Realtime subscriptions, notification refresh behavior, reactions,
comments, share/repost counts, pinned-message updates, messaging, and activity
tracking. The worktree already contained changes from earlier phases and user
work; those changes were preserved.

A static source inventory found 11 `.channel()` creation sites and 18
`useRealtimeRefresh` call sites (19 text matches including the hook
definition). These are source locations, not the number of active channels at
runtime; subscriptions depend on mounted routes and component state. No live
subscription count, browser Network trace, database timing, or offline/reconnect
browser test was collected, so no measured performance gain is claimed.

## Changes made

- Narrowed eight Postgres-change bindings to the exact content type and ID or
  conversation ID: reactions, comments, shares, reposts, tourist-spot
  reactions, and pinned-message activity. This prevents unrelated rows from
  reaching subscribers before client-side filtering. Kept defensive payload
  checks.
- Made reaction loading check Supabase query errors before updating state. A
  failed read now preserves the last successful counts instead of replacing
  them with empty values.
- Coalesced notification INSERT/UPDATE/DELETE refreshes arriving within 150 ms
  into one notification-list request. Incoming notification IDs are retained
  across the batch so the unread sound still plays when any incoming item is
  unread.
- Kept the notifications page's 30-second fallback refresh only while the
  Realtime channel is disconnected, the page is visible, and the browser is
  online.
- Fixed notifications-page cleanup to remove the actual `online` handler and
  cancel the queued Realtime refresh. In-flight notification loads also avoid
  setting state after the page unmounts.

No endpoint URLs, API response formats, authorization checks, database
objects, or migrations were changed.

## Findings and remaining risks

- The notifications page and the user navigation shell both subscribe to
  `info_notifications`. The page now suppresses its periodic list fetch while
  connected, but the two subscription responsibilities are not yet unified.
- The navigation shell's 30-second reconciliation still requests notification
  data to compute badges; the browser's real request reduction was not
  measured.
- The conversation page subscribes to all visible `direct_messages` changes
  and filters to the active pair in its callback. Tight server-side filtering
  needs care for both message directions and DELETE payload semantics; this
  remains a follow-up.
- Conversation loading still retrieves the full conversation without a
  cursor. Adding pagination requires a compatible history-loading UI/API plan.
- `RealtimeStatus` currently returns `null`, so tracked offline/reconnecting
  states are not presented to users by that component.
- Activity tracking remains fire-and-forget. Its endpoint inserts an activity
  row per request without a client idempotency key; reliable retry deduplication
  needs a schema/API design and migration-history reconciliation. No activity
  schema was changed.
- The notification activity endpoint checks existing notifications by
  recipient and link before inserting, but that check is not an atomic
  idempotency guarantee across concurrent requests.

## Files changed

- `src/app/(subsystems)/info/components/user/Comments.js`
- `src/app/(subsystems)/info/components/user/Reactions.js`
- `src/app/(subsystems)/info/components/user/ShareRepost.js`
- `src/app/(subsystems)/info/user/messaging/[id]/page.js`
- `src/app/(subsystems)/info/user/messaging/[id]/pinned/page.js`
- `src/app/(subsystems)/info/user/notifications/page.js`
- `src/app/(subsystems)/info/visitor/tourist-spots/[id]/page.js` (also contains
  Phase 8 changes)
- `SOCIAL_REALTIME_OPTIMIZATION_REPORT.md`

No files were removed. No database or production data was changed.

## Verification

- `npm.cmd test`: 270 passed, 0 failed.
- Targeted ESLint on changed application files: 0 errors, 29 warnings,
  primarily `<img>` and React hook dependency warnings.
- `npm.cmd run build`: passed.
- `git diff --check`: passed.
- No authenticated messaging or notification workflow was exercised in the
  browser; live Supabase Realtime behavior remains unverified.

## Recommended next steps

1. In staging, verify filtered change events for create, update, and delete
   across reactions, comments, shares, reposts, and pinned messages.
2. Measure the duplicate notification subscriptions and badge/list requests
   before consolidating them behind a shared user-shell subscription.
3. Design cursor pagination for long conversations with a backward-compatible
   loading flow.
4. Propose an idempotency key and unique constraint for activity logging only
   after migration history has been reconciled and staging-tested.
